import { useMemo } from 'react'
import {
  computeProfitLossRows,
  computeSummary,
  formatNis,
  monthLabelHe,
} from '../../lib/financeCalc'
import {
  expenseDisplayName,
  expenseTypeMap,
  resolveExpenseType,
} from '../../lib/financeExpenseTypes'
import { resolveExpenseRowVat } from '../../lib/israeliVat'
import { useFinanceIncomes } from '../../hooks/useFinanceIncomes'
import { useFinanceExpenses } from '../../hooks/useFinanceExpenses'
import { useFinanceExpenseTypes } from '../../hooks/useFinanceExpenseTypes'
import { ProgressBar } from '../shared/ProgressBar'
import { FinanceHeroCard, FinanceMiniStat } from './FinanceKpi'
import { IncomeDocumentsTable } from './IncomeDocumentsTable'
import type { ClientFinanceTarget } from './ClientFinanceCardModal'
import { hubSectionClass } from '../../lib/hubSectionBorder'
import type { Client, Project } from '../../types'

type Props = {
  project: Project
  client?: Client
  onClientClick?: (target: ClientFinanceTarget) => void
}

export function ProjectFinanceSection({
  project,
  client,
  onClientClick,
}: Props) {
  const { incomes } = useFinanceIncomes()
  const { expenses } = useFinanceExpenses()
  const { types: expenseTypes } = useFinanceExpenseTypes()

  const typeMap = useMemo(() => expenseTypeMap(expenseTypes), [expenseTypes])

  const filters = useMemo(
    () => ({ ymFrom: '', ymTo: '', projectId: project.id, clientId: '' }),
    [project.id],
  )

  const summary = useMemo(
    () => computeSummary(incomes, expenses, filters, new Set<string>(), expenseTypes),
    [incomes, expenses, filters, expenseTypes],
  )

  const projectIncomes = useMemo(
    () => incomes.filter((i) => i.projectId === project.id),
    [incomes, project.id],
  )
  const projectExpenses = useMemo(
    () => expenses.filter((e) => e.projectId === project.id),
    [expenses, project.id],
  )

  // טבלת רווח-והפסד חודשית לפרויקט — לאורך כל השנים שיש בהן פעילות
  const plRows = useMemo(() => {
    const years = new Set<number>()
    for (const i of projectIncomes) {
      const y = Number(i.invoiceDate.slice(0, 4))
      if (y) years.add(y)
    }
    for (const e of projectExpenses) {
      const y = Number(e.billingMonth.slice(0, 4))
      if (y) years.add(y)
    }
    if (years.size === 0) return []
    const sorted = [...years].sort((a, b) => b - a)
    const out = []
    for (const y of sorted) {
      out.push(...computeProfitLossRows(projectIncomes, projectExpenses, expenseTypes, y))
    }
    return out
  }, [projectIncomes, projectExpenses, expenseTypes])

  const plTotals = useMemo(
    () =>
      plRows.reduce(
        (acc, r) => {
          acc.incomeGross += r.incomeGross
          acc.expenseGross += r.expenseGross
          acc.vatPayable += r.vatPayable
          acc.trueNetProfit += r.trueNetProfit
          return acc
        },
        { incomeGross: 0, expenseGross: 0, vatPayable: 0, trueNetProfit: 0 },
      ),
    [plRows],
  )

  const expenseGross = summary.expenseVatLiableGross + summary.expenseNonVatTotal

  const budgetTotal = project.budgetTotal ?? 0
  const usedPercent =
    budgetTotal > 0
      ? Math.min(100, Math.round((expenseGross / budgetTotal) * 100))
      : 0

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>()
    if (client) m.set(client.id, client.name)
    return m
  }, [client])
  const projectNameById = useMemo(
    () => new Map<string, string>([[project.id, project.name]]),
    [project.id, project.name],
  )

  const sortedExpenses = useMemo(
    () =>
      [...projectExpenses].sort((a, b) =>
        b.billingMonth.localeCompare(a.billingMonth),
      ),
    [projectExpenses],
  )

  const round2 = (n: number) => Math.round(n * 100) / 100

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <FinanceHeroCard
          tone="income"
          label='הכנסות (כולל מע"מ)'
          value={formatNis(summary.incomeGross)}
          hint="חשבונית מס קבלה + חשבונית מס − זיכוי"
        />
        <FinanceHeroCard
          tone="expense"
          label='הוצאות (כולל מע"מ)'
          value={formatNis(expenseGross)}
          hint="כל ההוצאות המשויכות לפרויקט"
        />
        <FinanceHeroCard
          emphasis
          tone={summary.trueNetProfit >= 0 ? 'profit' : 'expense'}
          label="רווח נקי אמיתי"
          value={formatNis(summary.trueNetProfit)}
          hint="רווח גולמי פחות מע״מ לתשלום"
        />
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/40 px-2 py-3">
        <div className="grid grid-cols-2 divide-x divide-[var(--border)] [direction:rtl] sm:grid-cols-5">
          <FinanceMiniStat
            label='מע"מ עסקאות'
            value={formatNis(summary.incomeVat)}
            valueClass="text-[#6366F1]"
          />
          <FinanceMiniStat
            label="מע״מ תשומות"
            value={formatNis(summary.expenseInputVat)}
            valueClass="text-[#6366F1]"
          />
          <FinanceMiniStat
            label="מע״מ לתשלום"
            value={formatNis(summary.vatPayable)}
            valueClass="text-[#F59E0B]"
          />
          <FinanceMiniStat
            label="יתרה לגבייה"
            value={formatNis(summary.collectionBalance)}
            valueClass="text-[#EF4444]"
          />
          <FinanceMiniStat
            label="רווח גולמי"
            value={formatNis(summary.grossProfit)}
            valueClass="text-[#10B981]"
          />
        </div>
      </div>

      {budgetTotal > 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--dash-panel-bg)] p-4">
          <div className="mb-2 flex items-center justify-between text-[12px] font-bold text-[var(--text-mid)]">
            <span>ניצול תקציב</span>
            <span className="tabular-nums">
              {formatNis(expenseGross)} / {formatNis(budgetTotal)} · {usedPercent}%
            </span>
          </div>
          <ProgressBar
            done={usedPercent}
            total={100}
            color={usedPercent > 90 ? '#EF4444' : '#5828A0'}
            manualPercent={usedPercent}
          />
        </div>
      ) : null}

      {plRows.length > 0 ? (
        <section className={`rounded-2xl ${hubSectionClass(0)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]`}>
          <h3 className="mb-3 text-[14px] font-extrabold text-[var(--text-dark)]">
            רווח והפסד חודשי
          </h3>
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
                {plRows.map((r) => (
                  <tr
                    key={r.ym}
                    className="border-b border-[var(--border)] transition hover:bg-[var(--surface-muted)]"
                  >
                    <td className="px-2 py-2.5 font-semibold text-[var(--text-dark)]">
                      {monthLabelHe(r.ym)}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums text-[#10B981]">
                      {formatNis(r.incomeGross)}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums text-[#EF4444]">
                      {formatNis(r.expenseGross)}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums text-[#F59E0B]">
                      {formatNis(r.vatPayable)}
                    </td>
                    <td
                      className={`px-2 py-2.5 tabular-nums font-bold ${
                        r.trueNetProfit >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
                      }`}
                    >
                      {formatNis(r.trueNetProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-muted)]/60 text-[13px] font-extrabold text-[var(--text-dark)]">
                  <td className="px-2 py-3">סה״כ</td>
                  <td className="px-2 py-3 tabular-nums text-[#10B981]">
                    {formatNis(round2(plTotals.incomeGross))}
                  </td>
                  <td className="px-2 py-3 tabular-nums text-[#EF4444]">
                    {formatNis(round2(plTotals.expenseGross))}
                  </td>
                  <td className="px-2 py-3 tabular-nums text-[#F59E0B]">
                    {formatNis(round2(plTotals.vatPayable))}
                  </td>
                  <td
                    className={`px-2 py-3 tabular-nums ${
                      plTotals.trueNetProfit >= 0
                        ? 'text-[#10B981]'
                        : 'text-[#EF4444]'
                    }`}
                  >
                    {formatNis(round2(plTotals.trueNetProfit))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      ) : null}

      <section className={`rounded-2xl ${hubSectionClass(1)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]`}>
        <h3 className="mb-3 text-[14px] font-extrabold text-[var(--text-dark)]">
          מסמכי הכנסה ({projectIncomes.length})
        </h3>
        {projectIncomes.length === 0 ? (
          <p className="text-sm text-[var(--text-mid)]">אין הכנסות מקושרות לפרויקט</p>
        ) : (
          <IncomeDocumentsTable
            rows={[...projectIncomes].sort((a, b) =>
              b.invoiceDate.localeCompare(a.invoiceDate),
            )}
            clientNameById={clientNameById}
            projectNameById={projectNameById}
            onClientClick={onClientClick}
          />
        )}
      </section>

      <section className={`rounded-2xl ${hubSectionClass(2)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]`}>
        <h3 className="mb-3 text-[14px] font-extrabold text-[var(--text-dark)]">
          הוצאות ({projectExpenses.length})
        </h3>
        {sortedExpenses.length === 0 ? (
          <p className="text-sm text-[var(--text-mid)]">אין הוצאות מקושרות לפרויקט</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-bold text-[var(--text-mid)]">
                  <th className="px-2 py-2 text-right">סוג</th>
                  <th className="px-2 py-2 text-right">שם</th>
                  <th className="px-2 py-2 text-right">חודש</th>
                  <th className="px-2 py-2 text-right">ברוטו</th>
                  <th className="px-2 py-2 text-right">מע״מ</th>
                  <th className="px-2 py-2 text-right">נטו</th>
                </tr>
              </thead>
              <tbody>
                {sortedExpenses.map((row) => {
                  const def = resolveExpenseType(row.type, typeMap)
                  const vat = resolveExpenseRowVat(row)
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--border)] transition hover:bg-[var(--surface-muted)]"
                    >
                      <td className="px-2 py-2.5">
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                          style={{ backgroundColor: def.color }}
                        >
                          {def.label}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 font-semibold text-[var(--text-dark)]">
                        {expenseDisplayName(row, def)}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums text-[var(--text-mid)]">
                        {monthLabelHe(row.billingMonth)}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums font-bold">
                        {formatNis(vat.gross)}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums text-[#6366F1]">
                        {formatNis(vat.vat)}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums">
                        {formatNis(vat.net)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
