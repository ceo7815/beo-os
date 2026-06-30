import { useMemo, useState } from 'react'
import { EmptyState } from '../components/shared/EmptyState'
import { CollectionGiTable } from '../components/finance/CollectionGiTable'
import { FinanceKpiCard } from '../components/finance/FinanceKpi'
import { FinancePeriodFilter } from '../components/finance/FinancePeriodFilter'
import { GreenInvoiceBadge } from '../components/finance/GreenInvoiceBadge'
import { useFinancePeriodFilter } from '../hooks/useFinancePeriodFilter'
import { useClients } from '../hooks/useClients'
import { useFinanceIncomes } from '../hooks/useFinanceIncomes'
import { useProjects } from '../hooks/useProjects'
import {
  computeCollectionBalance,
  filterCollectionIncomes,
  formatNis,
} from '../lib/financeCalc'
import { incomeOutstandingAmount } from '../lib/financeIncomePayment'
import { hubSectionClass } from '../lib/hubSectionBorder'

export function Collections() {
  const { clients } = useClients()
  const { projects } = useProjects()
  const { incomes, loading } = useFinanceIncomes()
  const period = useFinancePeriodFilter()
  const [filterProjectId, setFilterProjectId] = useState('')
  const [filterClientId, setFilterClientId] = useState('')

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

  const filteredRows = useMemo(
    () =>
      [...filterCollectionIncomes(incomes, filters)].sort((a, b) =>
        b.invoiceDate.localeCompare(a.invoiceDate),
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
    <div className="mx-auto min-w-0 w-full max-w-[1400px] space-y-6 px-4 py-8 sm:px-8">
      <header>
        <h1 className="text-[22px] font-extrabold text-[var(--text-dark)] md:text-[26px]">
          גבייה
        </h1>
        <p className="mt-1.5 text-[12px] text-[var(--text-mid)] md:text-[13px]">
          חשבונות עסקה (300) מחשבונית ירוקה — יתרות פתוחות לגבייה
        </p>
      </header>

      <section
        className={`rounded-2xl ${hubSectionClass(1)} border-2 border-[#F59E0B] p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:p-5`}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[14px] font-extrabold text-[#92400E]">
              יתרה לגבייה (כל התקופות)
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-mid)]">
              לא מושפע מפילטר תאריך
            </div>
          </div>
          <div className="text-[32px] font-extrabold tabular-nums text-[#F59E0B]">
            {formatNis(collectionBalance)}
          </div>
        </div>
      </section>

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

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FinanceKpiCard
          index={1}
          seq={0}
          label="יתרה בטווח"
          value={formatNis(openTotal)}
          valueClass="text-[#F59E0B]"
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
          valueClass={overdueCount > 0 ? 'text-[#EF4444]' : undefined}
          hint="יתרה פתוחה"
        />
      </section>

      <section className={`rounded-2xl ${hubSectionClass(5)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:p-5`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-[var(--text-dark)]">
            חשבונות עסקה
          </h2>
          <GreenInvoiceBadge />
        </div>
        {loading ? (
          <p className="text-sm text-[var(--text-mid)]">טוען…</p>
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
          />
        )}
      </section>
    </div>
  )
}
