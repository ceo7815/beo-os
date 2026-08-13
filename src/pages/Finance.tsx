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
import {
  ClientFinanceCardModal,
  type ClientFinanceTarget,
} from '../components/finance/ClientFinanceCardModal'
import {
  FinancePnlMonthDetailModal,
  type PnlMonthDetail,
} from '../components/finance/FinancePnlMonthDetailModal'
import { FinancePnlChart } from '../components/finance/FinancePnlChart'
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
import { isOpenTransactionAccount } from '../lib/financeIncomeDocument'
import { computeExpenseCoverage } from '../lib/expenseReconciliation'
import { FinanceTabs } from '../components/finance/FinanceTabs'
import { useFinanceAttention } from '../hooks/useFinanceAttention'

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
  const [pnlMonthDetail, setPnlMonthDetail] = useState<PnlMonthDetail | null>(
    null,
  )
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

  /** חשבונות עסקה פתוחים — אותה לוגיקה כמו יתרה לגבייה (ללא פילטר תאריך) */
  const detailCollectionIncomes = useMemo(() => {
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

  const detailExpenses = useMemo(
    () =>
      filterExpensesByClient(
        expenses,
        filters,
        projectIdsForClient,
        expenseTypes,
      ),
    [expenses, filters, projectIdsForClient, expenseTypes],
  )

  const attention = useFinanceAttention(filters.ymFrom, filters.ymTo)

  // אחוז ההוצאות שמצבן ידוע — מלווה את מספר הרווח כדי שיהיה ברור כמה לסמוך עליו
  const coverage = useMemo(
    () => computeExpenseCoverage(expenses, filters.ymFrom, filters.ymTo),
    [expenses, filters.ymFrom, filters.ymTo],
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
    <div className="beo-page space-y-5">
      <header className="flex flex-col gap-1 text-right">
        <h1 className="text-[22px] font-extrabold leading-tight text-[var(--text-dark)] md:text-[26px]">
          סקירה פיננסית
        </h1>
        <p className="text-[12px] leading-relaxed text-[var(--text-mid)] md:text-[13px]">
          רווח והפסד · מע״מ · יתרה לגבייה · סנכרון הכנסות
        </p>
      </header>

      <FinanceTabs badges={attention} />

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
        <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]">
          <span className="font-bold">יתרת לקוח: </span>
          {formatNis(
            clients.find((c) => c.id === filterClientId)?.financeBalance ?? 0,
          )}
          <span className="text-[12px]"> — חוב פתוח מתשלומים חלקיים</span>
        </div>
      ) : null}

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
              מסמכי 300 מחשבונית ירוקה — לא נספרים כהכנסה עד שמתקבל תשלום
            </div>
          </div>
          <div className="text-[30px] font-extrabold tabular-nums leading-none text-[#D97706]">
            {formatNis(summary.collectionBalance)}
          </div>
        </div>
      </button>

      <section aria-label="סיכום פיננסי" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="text-right">
            <h2 className="text-base font-extrabold text-[var(--text-dark)]">
              סיכום לתקופה
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--text-mid)]">
              לחצו על כרטיס לפירוט · {period.filterRangeLabel}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
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
            hint="הכנסות נטו − הוצאות נטו · בלי תשלום מע״מ לרשות"
            onClick={() => setDetailMetric('profit')}
            footer={
              <div className="flex flex-col gap-1">
                <span
                  className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg px-2 py-1 text-[10.5px] font-semibold ${
                    coverage.percent >= 100
                      ? 'bg-[#10B981]/15 text-[#047857]'
                      : coverage.percent >= 90
                        ? 'bg-[#F59E0B]/15 text-[#92400E]'
                        : 'bg-[#EF4444]/15 text-[#B91C1C]'
                  }`}
                  title="החלק מכסף ההוצאות שמצבו ידוע — מגובה במסמך או מסומן כלא דורש מסמך"
                >
                  <span>אמינות:</span>
                  <span className="font-extrabold tabular-nums">
                    {coverage.percent}% מההוצאות מותאמות
                  </span>
                  {coverage.unmatchedAmount > 0 ? (
                    <>
                      <span className="opacity-60">·</span>
                      <span className="font-bold tabular-nums">
                        {formatNis(coverage.unmatchedAmount)} ללא התאמה
                      </span>
                    </>
                  ) : null}
                </span>
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
              </div>
            }
          />
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--dash-panel-bg)] p-2 shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-5 sm:divide-x sm:divide-[var(--border)] sm:[direction:rtl]">
            <FinanceMiniStat
              label='מע"מ עסקאות'
              value={formatNis(summary.incomeVat)}
              valueClass="text-[#4F46E5]"
              onClick={() => setDetailMetric('incomeVat')}
            />
            <FinanceMiniStat
              label='מע"מ תשומות'
              value={formatNis(summary.expenseInputVat)}
              valueClass="text-[#7C3AED]"
              onClick={() => setDetailMetric('expenseInputVat')}
            />
            <FinanceMiniStat
              label='מע"מ לתשלום'
              value={formatNis(summary.vatPayable)}
              valueClass="text-[#4F46E5]"
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
                summary.grossProfit >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'
              }
              onClick={() => setDetailMetric('grossProfit')}
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--dash-panel-bg)] p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] sm:p-5">
        <div className="mb-4 text-right">
          <h2 className="text-base font-extrabold text-[var(--text-dark)]">
            רווח והפסד לפי חודש
          </h2>
          <p className="mt-0.5 text-[11px] text-[var(--text-mid)]">
            לחצו על הכנסות או הוצאות לפירוט השורות · ירוק = רווח · אדום = הפסד
          </p>
          <p className="mt-2 rounded-xl border border-[#DBEAFE] bg-[#EFF6FF] px-3 py-2 text-[11px] leading-relaxed text-[#1E40AF]">
            <span className="font-extrabold">הערה לחישוב הרווח: </span>
            תשלום מע״מ לרשות המסים שהוזן כהוצאה בבנק אינו נספר כאן ברווח הנקי
            ובהוצאות — כדי שלא ייגרע פעמיים. המע״מ כבר מטופל כך: הכנסות והוצאות
            נטו (בלי מע״מ) + עמודת «מע״מ לתשלום» (עסקאות − תשומות). התשלום בפועל
            לרשות הוא סילוק אותו חוב, לא עלות עסק נוספת.
            {summary.vatRemittanceExcluded > 0 ? (
              <>
                {' '}
                בתקופה המסוננת הוצאו מהרווח{' '}
                <span className="font-extrabold tabular-nums">
                  {formatNis(summary.vatRemittanceExcluded)}
                </span>{' '}
                של תשלומי מע״מ שנרשמו כהוצאה.
              </>
            ) : null}
          </p>
        </div>
        {loading ? (
          <p className="py-6 text-center text-sm text-[var(--text-mid)]">
            טוען…
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead className="sticky top-0 z-[1]">
                <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]/80 text-[11px] font-bold text-[var(--text-mid)] backdrop-blur-sm">
                  <th className="px-2.5 py-2.5 text-right">חודש</th>
                  <th className="px-2.5 py-2.5 text-right">הכנסות</th>
                  <th className="px-2.5 py-2.5 text-right">הוצאות</th>
                  <th className="px-2.5 py-2.5 text-right">מע״מ לתשלום</th>
                  <th className="px-2.5 py-2.5 text-right">רווח נקי</th>
                </tr>
              </thead>
              <tbody>
                {pnlRows.map((row) => (
                  <tr
                    key={row.ym}
                    className={`border-b border-[var(--border)]/80 transition ${
                      row.trueNetProfit > 0
                        ? 'bg-[#F0FDF4] hover:bg-[#DCFCE7]'
                        : row.trueNetProfit < 0
                          ? 'bg-[#FEF2F2] hover:bg-[#FEE2E2]'
                          : 'hover:bg-[var(--surface-muted)]/70'
                    }`}
                  >
                    <td className="px-2.5 py-3 font-semibold text-[var(--text-dark)]">
                      {row.label}
                    </td>
                    <td className="px-2.5 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          setPnlMonthDetail({
                            ym: row.ym,
                            label: row.label,
                            kind: 'income',
                          })
                        }
                        className="tabular-nums font-bold text-[#059669] underline-offset-2 hover:underline"
                        title="פירוט הכנסות"
                      >
                        {formatNis(row.incomeGross)}
                      </button>
                    </td>
                    <td className="px-2.5 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          setPnlMonthDetail({
                            ym: row.ym,
                            label: row.label,
                            kind: 'expense',
                          })
                        }
                        className="tabular-nums font-bold text-[#DC2626] underline-offset-2 hover:underline"
                        title="פירוט הוצאות"
                      >
                        {formatNis(row.expenseGross)}
                      </button>
                    </td>
                    <td className="px-2.5 py-3 tabular-nums text-[#4F46E5]">
                      {formatNis(row.vatPayable)}
                    </td>
                    <td
                      className={`px-2.5 py-3 tabular-nums font-extrabold ${
                        row.trueNetProfit >= 0
                          ? 'text-[#059669]'
                          : 'text-[#DC2626]'
                      }`}
                    >
                      {formatNis(row.trueNetProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-muted)]/70 text-[13px] font-extrabold text-[var(--text-dark)]">
                  <td className="px-2.5 py-3">סה״כ</td>
                  <td className="px-2.5 py-3 tabular-nums text-[#059669]">
                    {formatNis(
                      pnlRows.reduce((s, r) => s + r.incomeGross, 0),
                    )}
                  </td>
                  <td className="px-2.5 py-3 tabular-nums text-[#DC2626]">
                    {formatNis(
                      pnlRows.reduce((s, r) => s + r.expenseGross, 0),
                    )}
                  </td>
                  <td className="px-2.5 py-3 tabular-nums text-[#4F46E5]">
                    {formatNis(
                      pnlRows.reduce((s, r) => s + r.vatPayable, 0),
                    )}
                  </td>
                  <td className="px-2.5 py-3 tabular-nums text-[#059669]">
                    {formatNis(
                      pnlRows.reduce((s, r) => s + r.trueNetProfit, 0),
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {!loading && pnlRows.length > 0 ? (
          <div className="mt-4">
            <FinancePnlChart
              rows={pnlRows}
              onMonthClick={(row) =>
                setPnlMonthDetail({
                  ym: row.ym,
                  label: row.label,
                  kind: 'income',
                })
              }
            />
          </div>
        ) : null}
      </section>

      <FinanceKpiDetailModal
        metric={detailMetric}
        onClose={() => setDetailMetric(null)}
        summary={summary}
        incomes={detailIncomes}
        expenses={detailExpenses}
        collectionIncomes={detailCollectionIncomes}
        expenseTypes={expenseTypes}
        clientNameById={clientNameById}
        projectNameById={projectNameById}
        periodLabel={period.filterRangeLabel}
        onClientClick={setClientCard}
      />

      <FinancePnlMonthDetailModal
        detail={pnlMonthDetail}
        onClose={() => setPnlMonthDetail(null)}
        incomes={incomes}
        expenses={expenses}
        expenseTypes={expenseTypes}
        clientNameById={clientNameById}
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
