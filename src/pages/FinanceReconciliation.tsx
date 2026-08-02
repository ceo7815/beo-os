import { useMemo, useState } from 'react'
import { FinanceTabs } from '../components/finance/FinanceTabs'
import { FinancePeriodFilter } from '../components/finance/FinancePeriodFilter'
import { AttachInvoiceModal } from '../components/finance/AttachInvoiceModal'
import { RefundMatchPanel } from '../components/finance/RefundMatchPanel'
import { EmptyState } from '../components/shared/EmptyState'
import { useFinancePeriodFilter } from '../hooks/useFinancePeriodFilter'
import { useFinanceAttention } from '../hooks/useFinanceAttention'
import { useFinanceExpenses } from '../hooks/useFinanceExpenses'
import { useFinanceExpenseTypes } from '../hooks/useFinanceExpenseTypes'
import { expenseTypeMap, resolveExpenseType } from '../lib/financeExpenseTypes'
import {
  isOpenReconciliationRow,
  listReconciliationRows,
  RECONCILIATION_STATUS_LABEL,
  reconciliationBadgeClass,
  reconciliationRowDate,
} from '../lib/expenseReconciliation'
import {
  buildBankReconciliationReport,
  printBankReconciliationReport,
} from '../lib/bankReconciliationReport'
import { formatNis } from '../lib/financeCalc'
import { formatDateIL } from '../lib/dates'
import { hubSectionClass } from '../lib/hubSectionBorder'
import type { FinanceExpense } from '../types'

type StatusFilter = 'open' | 'closed' | 'all'

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: 'open', label: 'ממתין לחשבונית' },
  { id: 'closed', label: 'מגובה בחשבונית' },
  { id: 'all', label: 'הכל' },
]

function merchantLabel(exp: FinanceExpense): string {
  return (
    exp.supplierName?.trim() ||
    exp.name?.trim() ||
    exp.employeeName?.trim() ||
    exp.description?.trim() ||
    '—'
  )
}

export function FinanceReconciliation() {
  const { expenses, loading } = useFinanceExpenses()
  const { types: expenseTypes } = useFinanceExpenseTypes()
  const period = useFinancePeriodFilter()
  const attention = useFinanceAttention(period.filterYmFrom, period.filterYmTo)

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [attaching, setAttaching] = useState<FinanceExpense | null>(null)

  const typeById = useMemo(() => expenseTypeMap(expenseTypes), [expenseTypes])

  const rows = useMemo(
    () => listReconciliationRows(expenses, period.filterYmFrom, period.filterYmTo),
    [expenses, period.filterYmFrom, period.filterYmTo],
  )

  const totals = useMemo(() => {
    let openCount = 0
    let openAmount = 0
    let closedCount = 0
    let closedAmount = 0
    for (const row of rows) {
      if (isOpenReconciliationRow(row)) {
        openCount += 1
        openAmount += row.expense.amount
      } else {
        closedCount += 1
        closedAmount += row.expense.amount
      }
    }
    const total = openAmount + closedAmount
    return {
      openCount,
      openAmount,
      closedCount,
      closedAmount,
      total,
      percent: total > 0 ? Math.round((closedAmount / total) * 1000) / 10 : 100,
    }
  }, [rows])

  const visibleRows = useMemo(() => {
    if (statusFilter === 'all') return rows
    const wantOpen = statusFilter === 'open'
    return rows.filter((r) => isOpenReconciliationRow(r) === wantOpen)
  }, [rows, statusFilter])

  function handlePrint() {
    printBankReconciliationReport(
      buildBankReconciliationReport(
        expenses,
        period.filterYmFrom,
        period.filterYmTo,
        { typeById },
      ),
    )
  }

  return (
    <div className="mx-auto min-w-0 w-full max-w-[1400px] space-y-6 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div className="min-w-0 text-right md:order-2 md:flex-1">
          <h1 className="text-[22px] font-extrabold leading-tight text-[var(--text-dark)] md:text-[26px]">
            התאמות בנקים
          </h1>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-mid)] md:text-[13px]">
            כל תשלום שירד מהחשבון, ומולו החשבונית שמגבה אותו
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 md:order-1">
          <button
            type="button"
            onClick={handlePrint}
            disabled={rows.length === 0}
            className="rounded-xl border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-sm font-bold text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            דוח PDF
          </button>
        </div>
      </header>

      <FinanceTabs badges={attention} />

      <FinancePeriodFilter
        periodMode={period.periodMode}
        setPeriodMode={period.setPeriodMode}
        monthPreset={period.monthPreset}
        setMonthPreset={period.setMonthPreset}
        filterYmFrom={period.filterYmFrom}
        filterYmTo={period.filterYmTo}
        setFilterYmFrom={period.setFilterYmFrom}
        setFilterYmTo={period.setFilterYmTo}
        filterRangeLabel={period.filterRangeLabel}
        applyMonthPreset={period.applyMonthPreset}
        applySingleMonth={period.applySingleMonth}
        monthOptions={period.monthOptions}
      />

      <RefundMatchPanel
        ymFrom={period.filterYmFrom}
        ymTo={period.filterYmTo}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="סה״כ תשלומים"
          value={formatNis(totals.total)}
          sub={`${rows.length} שורות`}
        />
        <StatCard
          label="מגובה בחשבונית"
          value={formatNis(totals.closedAmount)}
          sub={`${totals.closedCount} שורות`}
          tone="good"
        />
        <StatCard
          label="ממתין לחשבונית"
          value={formatNis(totals.openAmount)}
          sub={`${totals.openCount} שורות`}
          tone={totals.openCount > 0 ? 'alert' : 'neutral'}
        />
        <StatCard
          label="אחוז כיסוי"
          value={`${totals.percent}%`}
          sub="מתוך סכום התשלומים"
          tone={totals.percent >= 95 ? 'good' : totals.percent >= 80 ? 'warn' : 'alert'}
        />
      </section>

      <section
        className={`min-w-0 rounded-2xl ${hubSectionClass(4)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]`}
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
          {STATUS_TABS.map((tab) => {
            const count =
              tab.id === 'open'
                ? totals.openCount
                : tab.id === 'closed'
                  ? totals.closedCount
                  : rows.length
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={
                  statusFilter === tab.id
                    ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-3 py-1.5 text-[11px] font-bold text-white'
                    : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                }
              >
                {tab.label} ({count})
              </button>
            )
          })}
        </div>

        {loading ? (
          <p className="py-8 text-center text-[13px] text-[var(--text-mid)]">
            טוען…
          </p>
        ) : visibleRows.length === 0 ? (
          <EmptyState
            title={
              statusFilter === 'open'
                ? 'אין תשלומים שממתינים לחשבונית'
                : 'אין שורות להצגה'
            }
            description={
              statusFilter === 'open'
                ? 'כל התשלומים בתקופה הזו מגובים בחשבונית.'
                : 'נסו לשנות את התקופה או את הסינון.'
            }
          />
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[900px] text-[12px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-bold text-[var(--text-mid)]">
                  <th className="px-3 py-2 text-right">תאריך</th>
                  <th className="px-3 py-2 text-right">ספק / תיאור</th>
                  <th className="px-3 py-2 text-right">סוג</th>
                  <th className="px-3 py-2 text-right">סכום</th>
                  <th className="px-3 py-2 text-right">אמצעי</th>
                  <th className="px-3 py-2 text-right">מצב</th>
                  <th className="px-3 py-2 text-right">חשבונית</th>
                  <th className="px-3 py-2 text-right">פעולה</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const exp = row.expense
                  const open = isOpenReconciliationRow(row)
                  const typeDef = resolveExpenseType(exp.type, typeById)
                  return (
                    <tr
                      key={exp.id}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-[var(--text-mid)]">
                        {formatDateIL(reconciliationRowDate(exp))}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-[var(--text-dark)]">
                        {merchantLabel(exp)}
                      </td>
                      <td className="px-3 py-2.5 text-[var(--text-mid)]">
                        {typeDef?.label ?? exp.type}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-bold tabular-nums text-[var(--text-dark)]">
                        {formatNis(exp.amount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[var(--text-mid)]">
                        {exp.paymentMethod === 'credit_card'
                          ? 'כרטיס אשראי'
                          : 'עובר ושב'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${reconciliationBadgeClass(row.status)}`}
                        >
                          {RECONCILIATION_STATUS_LABEL[row.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[var(--text-mid)]">
                        {exp.documentUrl ? (
                          <a
                            href={exp.documentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-[var(--orange)] underline"
                          >
                            {exp.invoiceNumber?.trim() || 'צפייה'}
                          </a>
                        ) : (
                          exp.invoiceNumber?.trim() || '—'
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => setAttaching(exp)}
                          className={
                            open
                              ? 'rounded-lg bg-[var(--orange)] px-3 py-1.5 text-[11px] font-bold text-white transition hover:brightness-95'
                              : 'rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)]'
                          }
                        >
                          {open ? 'הצמד חשבונית' : 'החלף'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AttachInvoiceModal expense={attaching} onClose={() => setAttaching(null)} />
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string
  value: string
  sub: string
  tone?: 'neutral' | 'good' | 'warn' | 'alert'
}) {
  const toneClass =
    tone === 'good'
      ? 'border-[#BBF7D0] bg-[#F0FDF4]'
      : tone === 'warn'
        ? 'border-[#FDE68A] bg-[#FFFBEB]'
        : tone === 'alert'
          ? 'border-[#FECACA] bg-[#FEF2F2]'
          : 'border-[var(--border)] bg-[var(--dash-panel-bg)]'

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="text-[11px] font-bold text-[var(--text-mid)]">{label}</div>
      <div className="mt-1 text-[20px] font-extrabold tabular-nums text-[var(--text-dark)]">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-[var(--text-mid)]">{sub}</div>
    </div>
  )
}
