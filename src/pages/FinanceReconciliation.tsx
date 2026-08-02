import { useMemo, useState } from 'react'
import { FinanceTabs } from '../components/finance/FinanceTabs'
import { FinancePeriodFilter } from '../components/finance/FinancePeriodFilter'
import { AttachInvoiceModal } from '../components/finance/AttachInvoiceModal'
import { ExpenseReconciliationBadge } from '../components/finance/ExpenseReconciliationPanel'
import { ExpenseVatClassChip } from '../components/finance/ExpenseVatClassChip'
import { RefundMatchPanel } from '../components/finance/RefundMatchPanel'
import { EmptyState } from '../components/shared/EmptyState'
import { useFinancePeriodFilter } from '../hooks/useFinancePeriodFilter'
import { useFinanceAttention } from '../hooks/useFinanceAttention'
import { useFinanceExpenses } from '../hooks/useFinanceExpenses'
import { useFinanceExpenseTypes } from '../hooks/useFinanceExpenseTypes'
import { expenseTypeMap, resolveExpenseType } from '../lib/financeExpenseTypes'
import {
  resolveExpenseVatClass,
  vatClassToLiable,
} from '../lib/financeExpenseVat'
import {
  isOpenReconciliationRow,
  listReconciliationRows,
  reconciliationRowDate,
} from '../lib/expenseReconciliation'
import {
  buildBankReconciliationReport,
  printBankReconciliationReport,
} from '../lib/bankReconciliationReport'
import {
  formatForeignAmount,
  isForeignCurrencyCode,
} from '../lib/foreignCurrency'
import { formatNis, monthLabelHe } from '../lib/financeCalc'
import { formatDateIL } from '../lib/dates'
import type { FinanceExpense } from '../types'

type StatusFilter = 'open' | 'closed' | 'all'

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
  const { expenses, loading, updateExpense } = useFinanceExpenses()
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
    <div className="mx-auto min-w-0 w-full max-w-[1400px] space-y-5 px-4 py-6 sm:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 text-right">
          <h1 className="text-[22px] font-extrabold leading-tight text-[var(--text-dark)] md:text-[26px]">
            התאמות בנקים
          </h1>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-mid)] md:text-[13px]">
            תשלום מהבנק מול חשבונית — שורה ירוקה = סגורה · צהובה = ממתינה
          </p>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          disabled={rows.length === 0}
          className="rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-2 text-sm font-semibold text-[var(--orange)] transition hover:bg-[var(--orange-light)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          דוח PDF
        </button>
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

      <section
        aria-label="סיכום התאמות"
        className="grid grid-cols-2 gap-2.5 lg:grid-cols-4"
      >
        <StatCard
          label="סה״כ תשלומים"
          value={formatNis(totals.total)}
          sub={`${rows.length} שורות`}
        />
        <StatCard
          label="סגורות"
          value={formatNis(totals.closedAmount)}
          sub={`${totals.closedCount} שורות`}
          tone="good"
        />
        <StatCard
          label="ממתינות לחשבונית"
          value={formatNis(totals.openAmount)}
          sub={`${totals.openCount} שורות`}
          tone={totals.openCount > 0 ? 'alert' : 'neutral'}
        />
        <StatCard
          label="אחוז כיסוי"
          value={`${totals.percent}%`}
          sub="מתוך סכום התשלומים"
          tone={
            totals.percent >= 95
              ? 'good'
              : totals.percent >= 80
                ? 'warn'
                : 'alert'
          }
        />
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--dash-panel-bg)] p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] sm:p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-[var(--text-dark)]">
              רשימת התאמות
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--text-mid)]">
              {period.filterRangeLabel}
              {totals.openCount > 0
                ? ` · ${totals.openCount} ממתינות לחשבונית`
                : ' · הכל סגור'}
            </p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-1">
            {(
              [
                ['open', `ממתינות (${totals.openCount})`],
                ['closed', `סגורות (${totals.closedCount})`],
                ['all', `הכל (${rows.length})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className={
                  statusFilter === id
                    ? id === 'closed'
                      ? 'rounded-[8px] bg-[#DCFCE7] px-2.5 py-1.5 text-[11px] font-bold text-[#166534]'
                      : id === 'open'
                        ? 'rounded-[8px] bg-[#FEF3C7] px-2.5 py-1.5 text-[11px] font-bold text-[#92400E]'
                        : 'rounded-[8px] bg-[var(--orange)] px-2.5 py-1.5 text-[11px] font-bold text-white'
                    : 'rounded-[8px] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-mid)] hover:bg-black/[0.03]'
                }
              >
                {label}
              </button>
            ))}
          </div>
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
                : statusFilter === 'closed'
                  ? 'אין שורות סגורות בסינון'
                  : 'אין שורות להצגה'
            }
            description={
              statusFilter === 'open'
                ? 'כל התשלומים בתקופה הזו מגובים בחשבונית.'
                : 'נסו לשנות את התקופה או את הסינון.'
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-[1]">
                <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]/80 text-[11px] font-bold text-[var(--text-mid)] backdrop-blur-sm">
                  <th className="px-2.5 py-2.5 text-right">תאריך</th>
                  <th className="px-2.5 py-2.5 text-right">ספק / תיאור</th>
                  <th className="px-2.5 py-2.5 text-right">סכום</th>
                  <th className="px-2.5 py-2.5 text-right">אמצעי</th>
                  <th className="px-2.5 py-2.5 text-right">סטטוס · חשבונית</th>
                  <th className="px-2.5 py-2.5 text-right" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const exp = row.expense
                  const open = isOpenReconciliationRow(row)
                  const typeDef = resolveExpenseType(exp.type, typeById)
                  const vatClass = resolveExpenseVatClass(exp)
                  const rowDate = reconciliationRowDate(exp)
                  const billingYm = rowDate.slice(0, 7)
                  return (
                    <tr
                      key={exp.id}
                      className={`border-b border-[var(--border)]/80 transition ${
                        open
                          ? 'bg-[#FFFBEB]/55 hover:bg-[#FEF3C7]/50'
                          : 'bg-[#DCFCE7] hover:bg-[#BBF7D0]'
                      }`}
                    >
                      <td className="whitespace-nowrap px-2.5 py-3 align-top tabular-nums">
                        <div className="font-semibold text-[var(--text-dark)]">
                          {monthLabelHe(billingYm)}
                        </div>
                        <div className="mt-0.5 text-[10px] font-semibold text-[var(--text-mid)]">
                          {exp.paymentMethod === 'credit_card' ? 'עסקה' : 'ירד'}{' '}
                          {formatDateIL(rowDate)}
                          {exp.chargeDate &&
                          exp.chargeDate !== exp.paidDate ? (
                            <span className="block">
                              חיוב {formatDateIL(exp.chargeDate)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2.5 py-3 align-top">
                        <div className="font-semibold text-[var(--text-dark)]">
                          {merchantLabel(exp)}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-[var(--text-mid)]">
                          <span>{typeDef?.label ?? exp.type}</span>
                          <span aria-hidden>·</span>
                          <ExpenseVatClassChip
                            value={vatClass}
                            onChange={(next) => {
                              void updateExpense(exp.id, {
                                vatClass: next,
                                vatLiable: vatClassToLiable(next),
                              })
                            }}
                          />
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-3 align-top tabular-nums font-bold text-[var(--text-dark)]">
                        {formatNis(exp.amount)}
                        {isForeignCurrencyCode(exp.currency) &&
                        exp.originalAmount ? (
                          <span className="mt-0.5 block text-[10px] font-bold text-[#3730A3]">
                            {formatForeignAmount(
                              exp.originalAmount,
                              exp.currency,
                            )}
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-3 align-top text-[11px] font-semibold text-[var(--text-mid)]">
                        {exp.paymentMethod === 'credit_card'
                          ? 'כרטיס אשראי'
                          : 'עובר ושב'}
                      </td>
                      <td className="px-2.5 py-3 align-top">
                        <div className="flex min-w-[140px] flex-col items-start gap-1.5">
                          <ExpenseReconciliationBadge
                            status={row.status}
                            linkedGi={row.linkedGi}
                            expense={exp}
                          />
                          {exp.documentUrl ? (
                            <a
                              href={exp.documentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] font-bold text-[var(--orange)] underline decoration-[var(--orange)]/40 underline-offset-2"
                            >
                              {exp.invoiceNumber?.trim()
                                ? `#${exp.invoiceNumber.trim()}`
                                : 'צפייה במסמך'}
                            </a>
                          ) : exp.invoiceNumber?.trim() ? (
                            <span className="text-[10px] font-semibold text-[var(--text-mid)]">
                              #{exp.invoiceNumber.trim()}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-3 align-top">
                        <button
                          type="button"
                          onClick={() => setAttaching(exp)}
                          className={
                            open
                              ? 'inline-flex h-8 items-center justify-center rounded-[10px] bg-[var(--orange)] px-3 text-[11px] font-bold text-white transition hover:brightness-95'
                              : 'inline-flex h-8 items-center justify-center rounded-[10px] border border-[var(--border)] px-3 text-[11px] font-semibold text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)]'
                          }
                        >
                          {open ? 'צרף חשבונית' : 'החלף'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-muted)]/70 text-[13px] font-extrabold text-[var(--text-dark)]">
                  <td className="px-2.5 py-3" colSpan={2}>
                    סה״כ ({visibleRows.length})
                  </td>
                  <td className="px-2.5 py-3 tabular-nums">
                    {formatNis(
                      visibleRows.reduce((s, r) => s + r.expense.amount, 0),
                    )}
                  </td>
                  <td className="px-2.5 py-3" colSpan={3} />
                </tr>
              </tfoot>
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
    <div className={`rounded-xl border p-3.5 ${toneClass}`}>
      <div className="text-[11px] font-bold text-[var(--text-mid)]">{label}</div>
      <div className="mt-2 text-[22px] font-extrabold tabular-nums leading-none text-[var(--text-dark)]">
        {value}
      </div>
      <div className="mt-1.5 text-[10px] text-[var(--text-mid)]">{sub}</div>
    </div>
  )
}
