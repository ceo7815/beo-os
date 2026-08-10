import { useMemo, useState } from 'react'
import { EmptyState } from '../components/shared/EmptyState'
import { ExportExcelButton } from '../components/shared/ExportExcelButton'
import { FinanceKpiCard } from '../components/finance/FinanceKpi'
import { GreenInvoiceBadge } from '../components/finance/GreenInvoiceBadge'
import {
  ClientFinanceCardModal,
  type ClientFinanceTarget,
} from '../components/finance/ClientFinanceCardModal'
import { FinanceTabs } from '../components/finance/FinanceTabs'
import { FinanceClickable } from '../components/finance/FinanceClickable'
import { SortableTh } from '../components/finance/SortableTh'
import { useFinanceCashflow } from '../hooks/useFinanceCashflow'
import { useFinanceAttention } from '../hooks/useFinanceAttention'
import { useClients } from '../hooks/useClients'
import { formatDateIL } from '../lib/dates'
import { formatNis } from '../lib/financeCalc'
import { sortByKey, useTableSort } from '../lib/financeTableSort'
import {
  formatStandingOrderInterval,
  giRecurringStatusLabel,
  isGiRecurringActive,
} from '../lib/giRecurringDisplay'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { exportGiStandingOrdersToExcel } from '../lib/excelTableExports'
import type { FinanceGiRecurringPayment } from '../types'

type SortKey = 'client' | 'amount' | 'interval' | 'next' | 'status'

function monthlyEquivalent(amount: number, intervalMonths: number): number {
  if (intervalMonths <= 0) return amount
  return Math.round((amount / intervalMonths) * 100) / 100
}

export function FinanceStandingOrders() {
  const { giRecurring, loading } = useFinanceCashflow()
  const { clients } = useClients()
  const attention = useFinanceAttention()
  const [clientCard, setClientCard] = useState<ClientFinanceTarget | null>(null)
  const { sort, toggle } = useTableSort<SortKey>('next', 'asc')

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>()
    clients.forEach((c) => m.set(c.id, c.name))
    return m
  }, [clients])

  const rows = useMemo(
    () => giRecurring.filter(isGiRecurringActive),
    [giRecurring],
  )

  const sortedRows = useMemo(() => {
    return sortByKey(rows, sort, (row, key) => {
      switch (key) {
        case 'client':
          return (
            (row.clientId && clientNameById.get(row.clientId)) ||
            row.clientName
          ).toLowerCase()
        case 'amount':
          return row.amount
        case 'interval':
          return row.intervalMonths
        case 'next':
          return row.nextChargeDate ?? '9999-99-99'
        case 'status':
          return giRecurringStatusLabel(row.status)
        default:
          return row.clientName
      }
    })
  }, [rows, sort, clientNameById])

  const totalMonthly = useMemo(
    () =>
      rows.reduce(
        (s, r) => s + monthlyEquivalent(r.amount, r.intervalMonths),
        0,
      ),
    [rows],
  )

  const openClient = (row: FinanceGiRecurringPayment) => {
    if (!row.clientId) return
    const name =
      clientNameById.get(row.clientId) || row.clientName || 'לקוח'
    setClientCard({ clientId: row.clientId, clientName: name })
  }

  return (
    <div className="mx-auto min-w-0 w-full max-w-[1400px] space-y-6 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-[var(--text-dark)] md:text-[26px]">
            הוראות קבע
          </h1>
          <p className="mt-1.5 text-[12px] text-[var(--text-mid)] md:text-[13px]">
            הוראות קבע פעילות מחשבונית ירוקה · מתעדכן בכל סנכרון הכנסות
          </p>
        </div>
        <ExportExcelButton
          onClick={() =>
            exportGiStandingOrdersToExcel({ rows, clientNameById })
          }
          disabled={rows.length === 0}
        />
      </header>

      <FinanceTabs badges={attention} />

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/40 p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-extrabold text-[var(--text-dark)]">
            סיכום
          </h2>
          <GreenInvoiceBadge />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FinanceKpiCard
            index={1}
            seq={0}
            label="הוראות קבע פעילות"
            value={String(rows.length)}
            hint="רק סטטוס פעיל ב-GI"
          />
          <FinanceKpiCard
            index={2}
            seq={1}
            label="סה״כ חודשי משוער"
            value={formatNis(totalMonthly)}
            valueClass="text-[#10B981]"
            hint="סכום לחיוב ÷ תדירות"
          />
        </div>
      </section>

      <section
        className={`rounded-2xl ${hubSectionClass(5)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:p-5`}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-[var(--text-dark)]">
            רשימת הוראות קבע
          </h2>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--text-mid)]">טוען…</p>
        ) : sortedRows.length === 0 ? (
          <EmptyState
            title="אין הוראות קבע פעילות"
            description="סנכרנו הכנסות מחשבונית ירוקה בסקירה הפיננסית — הוראות קבע פעילות יופיעו כאן."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-right text-[12px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-bold text-[var(--text-mid)]">
                  <SortableTh
                    label="לקוח"
                    columnKey="client"
                    sort={sort}
                    onSort={toggle}
                    defaultDir="asc"
                  />
                  <SortableTh
                    label="סכום לחיוב"
                    columnKey="amount"
                    sort={sort}
                    onSort={toggle}
                  />
                  <SortableTh
                    label="תדירות"
                    columnKey="interval"
                    sort={sort}
                    onSort={toggle}
                  />
                  <SortableTh
                    label="חיוב הבא"
                    columnKey="next"
                    sort={sort}
                    onSort={toggle}
                    defaultDir="asc"
                  />
                  <SortableTh
                    label="סטטוס"
                    columnKey="status"
                    sort={sort}
                    onSort={toggle}
                  />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const clientLabel =
                    (row.clientId && clientNameById.get(row.clientId)) ||
                    row.clientName
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--border)]/60 hover:bg-black/[0.02]"
                    >
                      <td className="px-2.5 py-2.5">
                        {row.clientId ? (
                          <FinanceClickable onClick={() => openClient(row)}>
                            {clientLabel}
                          </FinanceClickable>
                        ) : (
                          clientLabel
                        )}
                      </td>
                      <td className="px-2.5 py-2.5 font-bold text-[var(--text-dark)]">
                        {formatNis(row.amount)}
                      </td>
                      <td className="px-2.5 py-2.5 text-[var(--text-mid)]">
                        {formatStandingOrderInterval(row.intervalMonths)}
                      </td>
                      <td className="px-2.5 py-2.5">
                        {row.nextChargeDate
                          ? formatDateIL(row.nextChargeDate)
                          : '—'}
                      </td>
                      <td className="px-2.5 py-2.5">
                        <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-bold text-[#047857]">
                          {giRecurringStatusLabel(row.status)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {clientCard ? (
        <ClientFinanceCardModal
          target={clientCard}
          onClose={() => setClientCard(null)}
          clientNameById={clientNameById}
        />
      ) : null}
    </div>
  )
}
