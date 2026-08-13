import { useMemo, useState } from 'react'
import { EmptyState } from '../components/shared/EmptyState'
import { ExportExcelButton } from '../components/shared/ExportExcelButton'
import { Modal } from '../components/shared/Modal'
import { FinancePeriodFilter } from '../components/finance/FinancePeriodFilter'
import { FinanceKpiCard } from '../components/finance/FinanceKpi'
import { GreenInvoiceBadge } from '../components/finance/GreenInvoiceBadge'
import {
  ClientFinanceCardModal,
  type ClientFinanceTarget,
} from '../components/finance/ClientFinanceCardModal'
import {
  IncomeDocumentsTable,
  HOURLY_ASSIGN_PREFIX,
  HOSTING_ASSIGN_PREFIX,
} from '../components/finance/IncomeDocumentsTable'
import { useFinancePeriodFilter } from '../hooks/useFinancePeriodFilter'
import { useClients } from '../hooks/useClients'
import { useFinanceIncomes } from '../hooks/useFinanceIncomes'
import { useHourlyServices } from '../hooks/useHourlyServices'
import { useProjects } from '../hooks/useProjects'
import { parseHourlyAssignValue } from '../lib/financeProjectAssign'
import {
  filterIncomePageDocs,
  formatNis,
  formatYmRangeLabel,
} from '../lib/financeCalc'
import {
  FINANCE_INCOME_DOCUMENT_LABELS,
  INCOME_PAGE_KINDS,
  REVENUE_KINDS,
  incomeDocumentKind,
  type NormalizedIncomeDocumentKind,
} from '../lib/financeIncomeDocument'
import { resolveIncomeVat } from '../lib/israeliVat'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { exportIncomesToExcel } from '../lib/excelTableExports'
import { FinanceTabs } from '../components/finance/FinanceTabs'
import { useFinanceAttention } from '../hooks/useFinanceAttention'
import type { FinanceHostingType } from '../types'

export function Income() {
  const { clients } = useClients()
  const { projects } = useProjects()
  const { services: hourlyServices } = useHourlyServices()
  const { incomes, loading, updateIncome } = useFinanceIncomes()
  const attention = useFinanceAttention()
  const period = useFinancePeriodFilter()
  const [filterProjectId, setFilterProjectId] = useState('')
  const [filterClientId, setFilterClientId] = useState('')
  const [docKindFilter, setDocKindFilter] = useState<
    NormalizedIncomeDocumentKind | 'all'
  >('all')
  const [detailKind, setDetailKind] = useState<NormalizedIncomeDocumentKind | null>(
    null,
  )
  const [clientCard, setClientCard] = useState<ClientFinanceTarget | null>(null)

  const filters = useMemo(
    () => ({
      ymFrom: period.filterYmFrom,
      ymTo: period.filterYmTo,
      projectId: filterProjectId,
      clientId: filterClientId,
    }),
    [period.filterYmFrom, period.filterYmTo, filterProjectId, filterClientId],
  )

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>()
    clients.forEach((c) => m.set(c.id, c.name))
    return m
  }, [clients])

  const projectNameById = useMemo(() => {
    const m = new Map<string, string>()
    projects.forEach((p) => m.set(p.id, p.name))
    return m
  }, [projects])

  const filteredRows = useMemo(() => {
    let rows = filterIncomePageDocs(incomes, filters)
    if (docKindFilter !== 'all') {
      rows = rows.filter((r) => incomeDocumentKind(r) === docKindFilter)
    }
    return [...rows].sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))
  }, [incomes, filters, docKindFilter])

  const kindTotals = useMemo(() => {
    const totals: Partial<Record<NormalizedIncomeDocumentKind, number>> = {}
    for (const kind of INCOME_PAGE_KINDS) {
      totals[kind] = 0
    }
    for (const row of filterIncomePageDocs(incomes, filters)) {
      const k = incomeDocumentKind(row)
      totals[k] = (totals[k] ?? 0) + resolveIncomeVat(row).gross
    }
    return totals
  }, [incomes, filters])

  const projectFilterOptions = useMemo(
    () =>
      [...projects]
        .sort((a, b) => a.name.localeCompare(b.name, 'he'))
        .map((p) => ({ value: p.id, label: p.name })),
    [projects],
  )

  const clientFilterOptions = useMemo(
    () =>
      [...clients]
        .sort((a, b) => a.name.localeCompare(b.name, 'he'))
        .map((c) => ({ value: c.id, label: c.name })),
    [clients],
  )

  // סה״כ הכנסה = מסמכי הכנסה בלבד (מס קבלה + חשבונית מס + זיכוי). קבלה אינה נספרת.
  const totalGross = useMemo(
    () => REVENUE_KINDS.reduce((s, k) => s + (kindTotals[k] ?? 0), 0),
    [kindTotals],
  )

  const detailRows = useMemo(() => {
    if (!detailKind) return []
    return filterIncomePageDocs(incomes, filters)
      .filter((r) => incomeDocumentKind(r) === detailKind)
      .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))
  }, [incomes, filters, detailKind])

  return (
    <div className="beo-page space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-[var(--text-dark)] md:text-[26px]">
            הכנסות
          </h1>
          <p className="mt-1.5 text-[12px] text-[var(--text-mid)] md:text-[13px]">
            מסמכי הכנסה מחשבונית ירוקה · קבלה = תקבול לאותה עסקה (לא נספרת פעמיים)
          </p>
        </div>
        <ExportExcelButton
          onClick={() =>
            exportIncomesToExcel({
              rows: filteredRows,
              clientNameById,
              projectNameById,
            })
          }
          disabled={filteredRows.length === 0}
        />
      </header>

      <FinanceTabs badges={attention} />

      <FinancePeriodFilter
        {...period}
        projectFilter={{
          value: filterProjectId,
          onChange: setFilterProjectId,
          options: projectFilterOptions,
        }}
        clientFilter={{
          value: filterClientId,
          onChange: setFilterClientId,
          options: clientFilterOptions,
        }}
      />

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/40 p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-extrabold text-[var(--text-dark)]">
            סיכום לפי סוג — {formatYmRangeLabel(period.filterYmFrom, period.filterYmTo)}
          </h2>
          <GreenInvoiceBadge />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {INCOME_PAGE_KINDS.map((kind, i) => (
            <FinanceKpiCard
              key={kind}
              index={i + 1}
              seq={i}
              label={FINANCE_INCOME_DOCUMENT_LABELS[kind]}
              value={formatNis(kindTotals[kind] ?? 0)}
              valueClass={
                kind === 'receipt' ? 'text-[var(--text-mid)]' : 'text-[#10B981]'
              }
              hint={
                kind === 'receipt'
                  ? 'תקבול — לא נספר כהכנסה'
                  : 'ברוטו כולל מע״מ'
              }
              onClick={() => setDetailKind(kind)}
            />
          ))}
        </div>
        <div className="mt-3 text-right text-[13px] font-bold text-[var(--text-dark)]">
          סה״כ: {formatNis(totalGross)}
        </div>
      </section>

      <section className={`rounded-2xl ${hubSectionClass(5)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:p-5`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-[var(--text-dark)]">
            רשימת מסמכים
          </h2>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setDocKindFilter('all')}
              className={
                docKindFilter === 'all'
                  ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-3 py-1.5 text-[11px] font-bold text-white'
                  : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-mid)]'
              }
            >
              הכל
            </button>
            {INCOME_PAGE_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setDocKindFilter(kind)}
                className={
                  docKindFilter === kind
                    ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-3 py-1.5 text-[11px] font-bold text-white'
                    : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-mid)]'
                }
              >
                {FINANCE_INCOME_DOCUMENT_LABELS[kind]}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-[var(--text-mid)]">טוען…</p>
        ) : filteredRows.length === 0 ? (
          <EmptyState
            title="אין מסמכי הכנסה לטווח הנבחר"
            description={period.filterRangeLabel}
          />
        ) : (
          <IncomeDocumentsTable
            rows={filteredRows}
            clientNameById={clientNameById}
            projectNameById={projectNameById}
            projectsForAssign={projects}
            hourlyServicesForAssign={hourlyServices}
            onClientClick={setClientCard}
            onAssignProject={(incomeId, value) => {
              if (value.startsWith(HOSTING_ASSIGN_PREFIX)) {
                const hostingType = value.slice(
                  HOSTING_ASSIGN_PREFIX.length,
                ) as FinanceHostingType
                void updateIncome(incomeId, { hostingType })
              } else if (value.startsWith(HOURLY_ASSIGN_PREFIX)) {
                const hourlyServiceId = parseHourlyAssignValue(value)
                if (hourlyServiceId) {
                  void updateIncome(incomeId, { hourlyServiceId })
                }
              } else if (value === '') {
                void updateIncome(incomeId, {
                  hostingClient: false,
                  projectId: '',
                  hourlyServiceId: null,
                })
              } else {
                void updateIncome(incomeId, {
                  projectId: value,
                  hostingClient: false,
                  hourlyServiceId: null,
                })
              }
            }}
          />
        )}
      </section>

      <Modal
        isOpen={detailKind !== null}
        onClose={() => setDetailKind(null)}
        title={
          detailKind
            ? `${FINANCE_INCOME_DOCUMENT_LABELS[detailKind]} — ${formatYmRangeLabel(period.filterYmFrom, period.filterYmTo)}`
            : ''
        }
        size="xl"
      >
        {detailKind ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 px-4 py-3 text-[12px]">
              <span className="font-bold text-[var(--text-dark)]">
                {detailRows.length} מסמכים
              </span>
              <span className="ms-auto font-extrabold text-[#10B981]">
                סה״כ ברוטו: {formatNis(kindTotals[detailKind] ?? 0)}
              </span>
            </div>
            {detailKind === 'receipt' ? (
              <p className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2.5 text-[12px] text-[#92400E]">
                קבלות אלו הן תקבול בלבד ואינן נספרות כהכנסה (כדי למנוע כפל מול
                חשבונית מס קבלה).
              </p>
            ) : null}
            <IncomeDocumentsTable
              rows={detailRows}
              clientNameById={clientNameById}
              projectNameById={projectNameById}
              hourlyServicesForAssign={hourlyServices}
              onClientClick={setClientCard}
            />
          </div>
        ) : null}
      </Modal>

      <ClientFinanceCardModal
        target={clientCard}
        onClose={() => setClientCard(null)}
        clientNameById={clientNameById}
      />
    </div>
  )
}
