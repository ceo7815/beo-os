import { useMemo, useState } from 'react'
import { EmptyState } from '../components/shared/EmptyState'
import { ExportExcelButton } from '../components/shared/ExportExcelButton'
import {
  ClientFinanceCardModal,
  type ClientFinanceTarget,
} from '../components/finance/ClientFinanceCardModal'
import { CollectionGiTable } from '../components/finance/CollectionGiTable'
import {
  FinanceKpiCard,
  FinanceMiniStat,
} from '../components/finance/FinanceKpi'
import {
  FinanceKpiDetailModal,
  type FinanceMetricId,
} from '../components/finance/FinanceKpiDetailModal'
import { FinancePeriodFilter } from '../components/finance/FinancePeriodFilter'
import { FinanceTabs } from '../components/finance/FinanceTabs'
import { GreenInvoiceBadge } from '../components/finance/GreenInvoiceBadge'
import { useFinanceAttention } from '../hooks/useFinanceAttention'
import { useFinancePeriodFilter } from '../hooks/useFinancePeriodFilter'
import { useClients } from '../hooks/useClients'
import { useFinanceIncomes } from '../hooks/useFinanceIncomes'
import { useProjects } from '../hooks/useProjects'
import {
  computeCollectionBalance,
  computeSummary,
  filterCollectionIncomes,
  formatNis,
  withDisplayOverdueIncomes,
} from '../lib/financeCalc'
import { isOpenTransactionAccount } from '../lib/financeIncomeDocument'
import { incomeOutstandingAmount } from '../lib/financeIncomePayment'
import { exportCollectionsToExcel } from '../lib/excelTableExports'

export function Collections() {
  const { clients } = useClients()
  const { projects } = useProjects()
  const { incomes, loading } = useFinanceIncomes()
  const attention = useFinanceAttention()
  const period = useFinancePeriodFilter()
  const [filterProjectId, setFilterProjectId] = useState('')
  const [filterClientId, setFilterClientId] = useState('')
  const [detailMetric, setDetailMetric] = useState<FinanceMetricId | null>(null)
  const [clientCard, setClientCard] = useState<ClientFinanceTarget | null>(null)

  const projectIdsForClient = useMemo(() => {
    if (!filterClientId) return new Set<string>()
    return new Set(
      projects.filter((p) => p.clientId === filterClientId).map((p) => p.id),
    )
  }, [projects, filterClientId])

  const filters = useMemo(
    () => ({
      ymFrom: period.filterYmFrom,
      ymTo: period.filterYmTo,
      projectId: filterProjectId,
      clientId: filterClientId,
    }),
    [period.filterYmFrom, period.filterYmTo, filterProjectId, filterClientId],
  )

  const collectionBalance = useMemo(
    () =>
      computeCollectionBalance(
        incomes,
        { projectId: filterProjectId, clientId: filterClientId },
        projectIdsForClient,
      ),
    [incomes, filterProjectId, filterClientId, projectIdsForClient],
  )

  const summary = useMemo(
    () =>
      computeSummary(incomes, [], filters, projectIdsForClient, []),
    [incomes, filters, projectIdsForClient],
  )

  const allOpenCollection = useMemo(() => {
    return incomes.filter((row) => {
      if (!isOpenTransactionAccount(row)) return false
      if (filterProjectId && row.projectId !== filterProjectId) return false
      if (filterClientId) {
        const matchClient =
          row.clientId === filterClientId ||
          (row.projectId && projectIdsForClient.has(row.projectId))
        if (!matchClient) return false
      }
      return true
    })
  }, [incomes, filterProjectId, filterClientId, projectIdsForClient])

  const filteredRows = useMemo(
    () =>
      withDisplayOverdueIncomes(
        [...filterCollectionIncomes(incomes, filters)].sort((a, b) =>
          b.invoiceDate.localeCompare(a.invoiceDate),
        ),
      ),
    [incomes, filters],
  )

  const openTotal = useMemo(
    () =>
      filteredRows.reduce((s, r) => s + incomeOutstandingAmount(r), 0),
    [filteredRows],
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

  const overdueCount = useMemo(
    () =>
      filteredRows.filter((r) => {
        const days =
          (Date.now() - new Date(r.invoiceDate.slice(0, 10)).getTime()) /
          86400000
        return days > 30 && incomeOutstandingAmount(r) > 0
      }).length,
    [filteredRows],
  )

  return (
    <div className="mx-auto min-w-0 w-full max-w-[1400px] space-y-5 px-4 py-6 sm:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between text-right">
        <div>
          <h1 className="text-[22px] font-extrabold leading-tight text-[var(--text-dark)] md:text-[26px]">
            גבייה
          </h1>
          <p className="text-[12px] leading-relaxed text-[var(--text-mid)] md:text-[13px]">
            חשבונות עסקה פתוחים · יתרות לגבייה · מסונכרן מחשבונית ירוקה
          </p>
        </div>
        <ExportExcelButton
          onClick={() =>
            exportCollectionsToExcel({
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

      <button
        type="button"
        onClick={() => setDetailMetric('collection')}
        aria-label="יתרה לגבייה — לחצו לפירוט"
        className="group w-full rounded-2xl border border-[#FDE68A] bg-gradient-to-l from-[#FFFBEB] to-[var(--dash-panel-bg)] p-4 text-right shadow-[0_1px_8px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:border-[#FBBF24] hover:shadow-[0_6px_18px_rgba(217,119,6,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--orange)] sm:p-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="text-[11px] font-bold text-[#B45309]">
                יתרה לגבייה · תמיד פעילה
              </span>
              <span className="rounded-md bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-bold text-[#B45309] opacity-80 transition group-hover:opacity-100">
                לחצו לפירוט ⓘ
              </span>
            </div>
            <div className="mt-1 text-[15px] font-extrabold text-[var(--text-dark)]">
              חשבונות עסקה פתוחים
            </div>
            <div className="mt-1 text-[11px] leading-snug text-[var(--text-mid)]">
              מסמכי 300 מחשבונית ירוקה — לא מושפע מפילטר תאריך
            </div>
          </div>
          <div className="text-[30px] font-extrabold tabular-nums leading-none text-[#D97706]">
            {formatNis(collectionBalance)}
          </div>
        </div>
      </button>

      <section aria-label="סיכום לטווח" className="space-y-3">
        <div className="text-right">
          <h2 className="text-base font-extrabold text-[var(--text-dark)]">
            סיכום לטווח
          </h2>
          <p className="mt-0.5 text-[11px] text-[var(--text-mid)]">
            לפי פילטר התקופה · {period.filterRangeLabel}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          <FinanceKpiCard
            index={1}
            seq={0}
            label="יתרה בטווח"
            value={formatNis(openTotal)}
            valueClass="text-[#D97706]"
            hint={period.filterRangeLabel}
          />
          <FinanceKpiCard
            index={2}
            seq={1}
            label="מסמכים בטווח"
            value={String(filteredRows.length)}
            hint="חשבונות עסקה"
          />
          <FinanceKpiCard
            index={3}
            seq={2}
            label="באיחור (+30 יום)"
            value={String(overdueCount)}
            valueClass={overdueCount > 0 ? 'text-[#DC2626]' : undefined}
            hint="יתרה פתוחה מעל 30 יום"
          />
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--dash-panel-bg)] p-2 shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 sm:divide-x sm:divide-[var(--border)] sm:[direction:rtl]">
            <FinanceMiniStat
              label="יתרה כוללת"
              value={formatNis(collectionBalance)}
              valueClass="text-[#D97706]"
              onClick={() => setDetailMetric('collection')}
            />
            <FinanceMiniStat
              label="יתרה בטווח"
              value={formatNis(openTotal)}
              valueClass="text-[#D97706]"
            />
            <FinanceMiniStat
              label="מסמכים פתוחים (הכל)"
              value={String(allOpenCollection.length)}
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--dash-panel-bg)] p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-right">
            <h2 className="text-base font-extrabold text-[var(--text-dark)]">
              חשבונות עסקה
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--text-mid)]">
              מסוננים לפי התקופה למעלה · יתרה פתוחה אחרי תשלומים חלקיים
            </p>
          </div>
          <GreenInvoiceBadge />
        </div>
        {loading ? (
          <p className="py-6 text-center text-sm text-[var(--text-mid)]">
            טוען…
          </p>
        ) : filteredRows.length === 0 ? (
          <EmptyState
            title="אין חשבונות עסקה בטווח הנבחר"
            description={period.filterRangeLabel}
          />
        ) : (
          <CollectionGiTable
            rows={filteredRows}
            clientNameById={clientNameById}
            projectNameById={projectNameById}
            onClientClick={setClientCard}
          />
        )}
      </section>

      <FinanceKpiDetailModal
        metric={detailMetric}
        onClose={() => setDetailMetric(null)}
        summary={summary}
        incomes={[]}
        expenses={[]}
        collectionIncomes={allOpenCollection}
        expenseTypes={[]}
        clientNameById={clientNameById}
        projectNameById={projectNameById}
        periodLabel={period.filterRangeLabel}
        onClientClick={setClientCard}
      />

      <ClientFinanceCardModal
        target={clientCard}
        onClose={() => setClientCard(null)}
        clientNameById={clientNameById}
      />
    </div>
  )
}
