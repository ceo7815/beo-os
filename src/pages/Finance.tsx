import { useMemo, useState } from 'react'
import { MorningSyncPanel } from '../components/MorningSyncPanel'
import {
  FinanceHeroCard,
  FinanceMiniStat,
} from '../components/finance/FinanceKpi'
import {
  FinanceKpiDetailModal,
  type FinanceMetricId,
} from '../components/finance/FinanceKpiDetailModal'
import { FinancePeriodFilter } from '../components/finance/FinancePeriodFilter'
import { useFinancePeriodFilter } from '../hooks/useFinancePeriodFilter'
import { useClients } from '../hooks/useClients'
import { useFinanceExpenseTypes } from '../hooks/useFinanceExpenseTypes'
import { useFinanceExpenses } from '../hooks/useFinanceExpenses'
import { useFinanceIncomes } from '../hooks/useFinanceIncomes'
import { useProjects } from '../hooks/useProjects'
import {
  computeBreakEven,
  computeProfitLossRows,
  computeSummary,
  filterActualIncomes,
  filterExpensesByClient,
  formatNis,
} from '../lib/financeCalc'
import { hubSectionClass } from '../lib/hubSectionBorder'

export function Finance() {
  const { clients } = useClients()
  const { projects } = useProjects()
  const { incomes, loading: incomesLoading } = useFinanceIncomes()
  const { expenses, loading: expensesLoading } = useFinanceExpenses()
  const { types: expenseTypes } = useFinanceExpenseTypes()

  const period = useFinancePeriodFilter()
  const [filterProjectId, setFilterProjectId] = useState('')
  const [filterClientId, setFilterClientId] = useState('')
  const [detailMetric, setDetailMetric] = useState<FinanceMetricId | null>(null)

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

  const summary = useMemo(
    () =>
      computeSummary(
        incomes,
        expenses,
        filters,
        projectIdsForClient,
        expenseTypes,
      ),
    [incomes, expenses, filters, projectIdsForClient, expenseTypes],
  )

  const breakEven = useMemo(() => computeBreakEven(summary), [summary])

  const pnlRows = useMemo(
    () => computeProfitLossRows(incomes, expenses, expenseTypes),
    [incomes, expenses, expenseTypes],
  )

  const detailIncomes = useMemo(
    () => filterActualIncomes(incomes, filters),
    [incomes, filters],
  )

  const detailExpenses = useMemo(
    () =>
      filterExpensesByClient(
        expenses,
        filters,
        projectIdsForClient,
        expenseTypes,
        incomes,
      ),
    [expenses, filters, projectIdsForClient, expenseTypes, incomes],
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

  const loading = incomesLoading || expensesLoading

  return (
    <div className="mx-auto min-w-0 w-full max-w-[1400px] space-y-6 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div className="min-w-0 text-right md:order-2 md:flex-1">
          <h1 className="text-[22px] font-extrabold leading-tight text-[var(--text-dark)] md:text-[26px]">
            סקירה פיננסית
          </h1>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-mid)] md:text-[13px]">
            רווח והפסד, מע״מ ויתרה לגבייה — אדמין בלבד
          </p>
        </div>
      </header>

      <MorningSyncPanel />

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

      {filterClientId &&
      (clients.find((c) => c.id === filterClientId)?.financeBalance ?? 0) > 0 ? (
        <div className="rounded-xl border border-[#F59E0B] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]">
          <span className="font-bold">יתרת לקוח: </span>
          {formatNis(
            clients.find((c) => c.id === filterClientId)?.financeBalance ?? 0,
          )}
          <span className="text-[12px]"> — חוב פתוח מתשלומים חלקיים</span>
        </div>
      ) : null}

      <section
        className={`rounded-2xl ${hubSectionClass(1)} border-2 border-[#F59E0B] p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:p-5`}
        aria-label="יתרה לגבייה"
      >
        <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[#92400E]">
          תמיד בראש · לא מושפע מפילטר תאריך
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <div className="text-[14px] font-extrabold text-[#92400E]">
              יתרה לגבייה
            </div>
            <div className="mt-2 text-[11px] leading-snug text-[var(--text-mid)]">
              חשבונות עסקה (300) מחשבונית ירוקה — לא נספר כהכנסה
            </div>
          </div>
          <div className="text-[32px] font-extrabold tabular-nums leading-none text-[#F59E0B]">
            {formatNis(summary.collectionBalance)}
          </div>
        </div>
      </section>

      <section aria-label="סיכום פיננסי" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-extrabold text-[var(--text-dark)]">
            סיכום פיננסי
          </h2>
          <span className="text-[11px] text-[var(--text-mid)]">
            {period.filterRangeLabel}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <FinanceHeroCard
            tone="income"
            label='הכנסות (כולל מע"מ)'
            value={formatNis(summary.incomeGross)}
            hint="חשבונית מס קבלה + חשבונית מס − זיכוי"
            onClick={() => setDetailMetric('income')}
          />
          <FinanceHeroCard
            tone="expense"
            label='הוצאות (כולל מע"מ)'
            value={formatNis(
              summary.expenseVatLiableGross + summary.expenseNonVatTotal,
            )}
            hint="חשבוניות ספקים + הוצאות ללא מע״מ"
            onClick={() => setDetailMetric('expense')}
          />
          <FinanceHeroCard
            emphasis
            tone={summary.trueNetProfit >= 0 ? 'profit' : 'expense'}
            label="רווח נקי אמיתי"
            value={formatNis(summary.trueNetProfit)}
            hint="רווח גולמי פחות מע״מ לתשלום"
            onClick={() => setDetailMetric('profit')}
            footer={
              <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg bg-black/[0.04] px-2 py-1 text-[10.5px] font-semibold text-[var(--text-mid)]">
                <span>נקודת איזון:</span>
                <span className="font-extrabold tabular-nums text-[var(--text-dark)]">
                  {formatNis(breakEven.breakEvenGross)}
                </span>
                <span className="text-[var(--text-light)]">·</span>
                {breakEven.reached ? (
                  <span className="font-bold text-[#10B981]">
                    עברת את האיזון ✓
                  </span>
                ) : (
                  <span className="font-bold text-[#F59E0B]">
                    חסר {formatNis(breakEven.remainingGross)}
                  </span>
                )}
              </span>
            }
          />
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/40 px-2 py-3">
          <div className="grid grid-cols-2 divide-x divide-[var(--border)] [direction:rtl] sm:grid-cols-5">
            <FinanceMiniStat
              label='מע"מ עסקאות'
              value={formatNis(summary.incomeVat)}
              valueClass="text-[#6366F1]"
              onClick={() => setDetailMetric('incomeVat')}
            />
            <FinanceMiniStat
              label='מע"מ תשומות'
              value={formatNis(summary.expenseInputVat)}
              valueClass="text-[#8B5CF6]"
              onClick={() => setDetailMetric('expenseInputVat')}
            />
            <FinanceMiniStat
              label='מע"מ לתשלום'
              value={formatNis(summary.vatPayable)}
              valueClass="text-[#6366F1]"
              onClick={() => setDetailMetric('vatPayable')}
            />
            <FinanceMiniStat
              label="הוצאות ללא מע״מ"
              value={formatNis(summary.expenseNonVatTotal)}
              valueClass="text-[#64748B]"
              onClick={() => setDetailMetric('expenseNonVat')}
            />
            <FinanceMiniStat
              label="רווח גולמי"
              value={formatNis(summary.grossProfit)}
              valueClass={
                summary.grossProfit >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
              }
              onClick={() => setDetailMetric('grossProfit')}
            />
          </div>
        </div>
      </section>

      <section className={`rounded-2xl ${hubSectionClass(5)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:p-5`}>
        <h2 className="mb-4 text-lg font-extrabold text-[var(--text-dark)]">
          דוח רווח והפסד לפי חודש
        </h2>
        {loading ? (
          <p className="text-sm text-[var(--text-mid)]">טוען…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-bold text-[var(--text-mid)]">
                  <th className="px-2 py-2 text-right">חודש</th>
                  <th className="px-2 py-2 text-right">הכנסות (כולל מע״מ)</th>
                  <th className="px-2 py-2 text-right">הוצאות (כולל מע״מ)</th>
                  <th className="px-2 py-2 text-right">מע״מ לתשלום</th>
                  <th className="px-2 py-2 text-right">רווח נקי</th>
                </tr>
              </thead>
              <tbody>
                {pnlRows.map((row) => {
                  const rowBg =
                    row.trueNetProfit > 0
                      ? 'rgba(16,185,129,0.08)'
                      : row.trueNetProfit < 0
                        ? 'rgba(239,68,68,0.08)'
                        : undefined
                  return (
                    <tr
                      key={row.ym}
                      className="border-b border-[var(--border)] transition hover:brightness-[0.98]"
                      style={{ backgroundColor: rowBg }}
                    >
                      <td className="px-2 py-2.5 font-semibold">{row.label}</td>
                      <td className="px-2 py-2.5 tabular-nums text-[#10B981]">
                        {formatNis(row.incomeGross)}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums text-[#EF4444]">
                        {formatNis(row.expenseGross)}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums text-[#6366F1]">
                        {formatNis(row.vatPayable)}
                      </td>
                      <td
                        className={`px-2 py-2.5 tabular-nums font-bold ${
                          row.trueNetProfit >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
                        }`}
                      >
                        {formatNis(row.trueNetProfit)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-muted)]/60 text-[13px] font-extrabold text-[var(--text-dark)]">
                  <td className="px-2 py-3">סה״כ</td>
                  <td className="px-2 py-3 tabular-nums text-[#10B981]">
                    {formatNis(
                      pnlRows.reduce((s, r) => s + r.incomeGross, 0),
                    )}
                  </td>
                  <td className="px-2 py-3 tabular-nums text-[#EF4444]">
                    {formatNis(
                      pnlRows.reduce((s, r) => s + r.expenseGross, 0),
                    )}
                  </td>
                  <td className="px-2 py-3 tabular-nums text-[#6366F1]">
                    {formatNis(
                      pnlRows.reduce((s, r) => s + r.vatPayable, 0),
                    )}
                  </td>
                  <td className="px-2 py-3 tabular-nums text-[#10B981]">
                    {formatNis(
                      pnlRows.reduce((s, r) => s + r.trueNetProfit, 0),
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <FinanceKpiDetailModal
        metric={detailMetric}
        onClose={() => setDetailMetric(null)}
        summary={summary}
        incomes={detailIncomes}
        expenses={detailExpenses}
        expenseTypes={expenseTypes}
        clientNameById={clientNameById}
        projectNameById={projectNameById}
        periodLabel={period.filterRangeLabel}
      />
    </div>
  )
}
