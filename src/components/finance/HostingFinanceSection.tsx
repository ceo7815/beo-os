import { Fragment, useMemo, useState } from 'react'
import { computeHostingFinance } from '../../lib/financeHosting'
import type { HostingFinanceOptions } from '../../lib/financeHosting'
import { HOSTING_TYPE_LABEL } from '../../lib/financeHostingTypes'
import type { FinanceHostingType } from '../../types'
import { formatNis, monthLabelHe } from '../../lib/financeCalc'
import {
  expenseDisplayName,
  expenseTypeMap,
  resolveExpenseType,
} from '../../lib/financeExpenseTypes'
import { resolveExpenseRowVat } from '../../lib/israeliVat'
import { useClients } from '../../hooks/useClients'
import { useFinanceIncomes } from '../../hooks/useFinanceIncomes'
import { useFinanceExpenses } from '../../hooks/useFinanceExpenses'
import { useFinanceExpenseTypes } from '../../hooks/useFinanceExpenseTypes'
import { FinanceHeroCard, FinanceMiniStat } from './FinanceKpi'
import { IncomeDocumentsTable } from './IncomeDocumentsTable'
import { hubSectionClass } from '../../lib/hubSectionBorder'

type HostingFinanceSectionProps = {
  /** סינון סוגי אחסון (למשל פורטל בלבד) */
  filterTypes?: FinanceHostingType[]
  /** האם לכלול הוצאות אחסון (ברירת מחדל: true) */
  includeExpenses?: boolean
  /** מילה לתצוגה: "אחסון" / "פורטל" */
  noun?: string
}

export function HostingFinanceSection({
  filterTypes,
  includeExpenses = true,
  noun = 'אחסון',
}: HostingFinanceSectionProps = {}) {
  const { clients } = useClients()
  const { incomes } = useFinanceIncomes()
  const { expenses } = useFinanceExpenses()
  const { types: expenseTypes } = useFinanceExpenseTypes()

  const typeMap = useMemo(() => expenseTypeMap(expenseTypes), [expenseTypes])
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null)

  const options = useMemo<HostingFinanceOptions>(
    () => ({ types: filterTypes, includeExpenses }),
    [filterTypes, includeExpenses],
  )
  const h = useMemo(
    () => computeHostingFinance(incomes, expenses, options),
    [incomes, expenses, options],
  )

  const visibleTypes = useMemo<FinanceHostingType[]>(
    () => filterTypes ?? ['monthly', 'yearly', 'portal_monthly'],
    [filterTypes],
  )
  const showMonthly = visibleTypes.includes('monthly')
  const showYearly = visibleTypes.includes('yearly')
  const showPortal = visibleTypes.includes('portal_monthly')
  // לקוח + עמודות סוג גלויות + MRR + סה״כ + אחרון
  const clientColCount =
    1 + visibleTypes.length + 3

  const incomeRowsByClient = useMemo(() => {
    const m = new Map<string, typeof h.incomeRows>()
    for (const row of h.incomeRows) {
      const key = row.clientId || ''
      const arr = m.get(key) ?? []
      arr.push(row)
      m.set(key, arr)
    }
    return m
  }, [h.incomeRows])

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>()
    clients.forEach((c) => m.set(c.id, c.name))
    return m
  }, [clients])
  const projectNameById = useMemo(() => new Map<string, string>(), [])

  const round2 = (n: number) => Math.round(n * 100) / 100

  const sortedExpenses = useMemo(
    () =>
      [...h.expenseRows].sort((a, b) =>
        b.billingMonth.localeCompare(a.billingMonth),
      ),
    [h.expenseRows],
  )

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <FinanceHeroCard
          tone="income"
          label={`הכנסות ${noun} (כולל מע"מ)`}
          value={formatNis(h.incomeGross)}
          hint={`כל מסמכי ה${noun} בפועל`}
        />
        {includeExpenses ? (
          <FinanceHeroCard
            tone="expense"
            label={`הוצאות ${noun} (כולל מע"מ)`}
            value={formatNis(h.expenseGross)}
            hint="שרתים, דומיינים ועלויות מתויגות"
          />
        ) : (
          <FinanceHeroCard
            tone="neutral"
            label="הכנסה שנתית חוזרת (ARR)"
            value={formatNis(h.arr)}
            hint="הערכה לפי run-rate"
          />
        )}
        <FinanceHeroCard
          emphasis
          tone={
            includeExpenses
              ? h.trueNetProfit >= 0
                ? 'profit'
                : 'expense'
              : 'income'
          }
          label={includeExpenses ? `רווח ${noun} נקי` : 'נטו (לפני מע"מ)'}
          value={formatNis(includeExpenses ? h.trueNetProfit : h.incomeNet)}
          hint={includeExpenses ? 'אחרי קיזוז מע״מ לתשלום' : 'הכנסות ללא מע״מ'}
        />
        <FinanceHeroCard
          tone="neutral"
          label="הכנסה חודשית חוזרת (MRR)"
          value={formatNis(h.mrr)}
          hint={`שנתי (ARR): ${formatNis(h.arr)} · ${h.activeClients} לקוחות`}
        />
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/40 px-2 py-3">
        <div className="grid grid-cols-2 divide-x divide-[var(--border)] [direction:rtl] sm:grid-cols-5">
          {visibleTypes.map((t) => (
            <FinanceMiniStat
              key={t}
              label={HOSTING_TYPE_LABEL[t]}
              value={formatNis(h.byType[t])}
              valueClass="text-[#10B981]"
            />
          ))}
          <FinanceMiniStat
            label="מע״מ (הכנסות)"
            value={formatNis(h.incomeVat)}
            valueClass="text-[#6366F1]"
          />
          {includeExpenses ? (
            <>
              <FinanceMiniStat
                label="מע״מ לתשלום"
                value={formatNis(h.vatPayable)}
                valueClass="text-[#F59E0B]"
              />
              <FinanceMiniStat
                label="רווח גולמי"
                value={formatNis(h.grossProfit)}
                valueClass="text-[#10B981]"
              />
            </>
          ) : (
            <FinanceMiniStat
              label="לקוחות פעילים"
              value={String(h.activeClients)}
              valueClass="text-[#6366F1]"
            />
          )}
        </div>
      </div>

      {h.clients.length > 0 ? (
        <section className={`rounded-2xl ${hubSectionClass(0)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]`}>
          <h3 className="mb-3 text-[14px] font-extrabold text-[var(--text-dark)]">
            לקוחות {noun} ({h.clients.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-bold text-[var(--text-mid)]">
                  <th className="px-2 py-2 text-right">לקוח</th>
                  {showMonthly ? <th className="px-2 py-2 text-right">חודשי</th> : null}
                  {showYearly ? <th className="px-2 py-2 text-right">שנתי</th> : null}
                  {showPortal ? <th className="px-2 py-2 text-right">פורטל</th> : null}
                  <th className="px-2 py-2 text-right">MRR</th>
                  <th className="px-2 py-2 text-right">סה״כ שולם</th>
                  <th className="px-2 py-2 text-right">אחרון</th>
                </tr>
              </thead>
              <tbody>
                {h.clients.map((c) => {
                  const key = c.clientId || '__none'
                  const isOpen = expandedClientId === (c.clientId || '__none')
                  const clientDocs = incomeRowsByClient.get(c.clientId || '') ?? []
                  return (
                    <Fragment key={key}>
                      <tr
                        onClick={() =>
                          setExpandedClientId((prev) =>
                            prev === key ? null : key,
                          )
                        }
                        className="cursor-pointer border-b border-[var(--border)] transition hover:bg-[var(--surface-muted)]"
                      >
                        <td className="px-2 py-2.5 font-semibold text-[var(--text-dark)]">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className={`text-[var(--text-light)] transition-transform ${isOpen ? 'rotate-90' : ''}`}
                            >
                              ▸
                            </span>
                            {c.clientId
                              ? clientNameById.get(c.clientId) ?? 'לקוח לא ידוע'
                              : 'ללא התאמת לקוח'}
                          </span>
                        </td>
                        {showMonthly ? (
                          <td className="px-2 py-2.5 tabular-nums">
                            {c.monthlyGross ? formatNis(c.monthlyGross) : '—'}
                          </td>
                        ) : null}
                        {showYearly ? (
                          <td className="px-2 py-2.5 tabular-nums">
                            {c.yearlyGross ? formatNis(c.yearlyGross) : '—'}
                          </td>
                        ) : null}
                        {showPortal ? (
                          <td className="px-2 py-2.5 tabular-nums">
                            {c.portalGross ? formatNis(c.portalGross) : '—'}
                          </td>
                        ) : null}
                        <td className="px-2 py-2.5 tabular-nums font-bold text-[#6366F1]">
                          {formatNis(c.mrr)}
                        </td>
                        <td className="px-2 py-2.5 tabular-nums font-bold text-[#10B981]">
                          {formatNis(c.gross)}
                        </td>
                        <td className="px-2 py-2.5 tabular-nums text-[var(--text-mid)]">
                          {c.lastDate || '—'}
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className="bg-[var(--surface-muted)]/40">
                          <td colSpan={clientColCount} className="px-2 py-3">
                            <div className="mb-2 text-[11px] font-bold text-[var(--text-mid)]">
                              מסמכי {noun} של{' '}
                              {c.clientId
                                ? clientNameById.get(c.clientId) ?? 'לקוח'
                                : 'ללא התאמת לקוח'}{' '}
                              ({clientDocs.length})
                            </div>
                            <IncomeDocumentsTable
                              rows={[...clientDocs].sort((a, b) =>
                                b.invoiceDate.localeCompare(a.invoiceDate),
                              )}
                              clientNameById={clientNameById}
                              projectNameById={projectNameById}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className={`rounded-2xl ${hubSectionClass(1)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]`}>
        <h3 className="mb-3 text-[14px] font-extrabold text-[var(--text-dark)]">
          מסמכי הכנסה — {noun} ({h.incomeRows.length})
        </h3>
        {h.incomeRows.length === 0 ? (
          <p className="text-sm text-[var(--text-mid)]">אין הכנסות {noun}</p>
        ) : (
          <IncomeDocumentsTable
            rows={[...h.incomeRows].sort((a, b) =>
              b.invoiceDate.localeCompare(a.invoiceDate),
            )}
            clientNameById={clientNameById}
            projectNameById={projectNameById}
          />
        )}
      </section>

      {includeExpenses ? (
      <section className={`rounded-2xl ${hubSectionClass(2)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]`}>
        <h3 className="mb-3 text-[14px] font-extrabold text-[var(--text-dark)]">
          הוצאות אחסון ({h.expenseRows.length})
        </h3>
        {sortedExpenses.length === 0 ? (
          <p className="text-sm text-[var(--text-mid)]">
            אין הוצאות מתויגות כאחסון. סמנו הוצאה כ״הוצאת אחסון״ בייבוא או בעריכה.
          </p>
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
              <tfoot>
                <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-muted)]/60 text-[13px] font-extrabold text-[var(--text-dark)]">
                  <td className="px-2 py-3" colSpan={3}>
                    סה״כ
                  </td>
                  <td className="px-2 py-3 tabular-nums">
                    {formatNis(round2(h.expenseGross))}
                  </td>
                  <td className="px-2 py-3 tabular-nums text-[#6366F1]">
                    {formatNis(round2(h.expenseInputVat))}
                  </td>
                  <td className="px-2 py-3 tabular-nums">
                    {formatNis(round2(h.expenseNet))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
      ) : null}
    </div>
  )
}
