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
import { deriveExpensePnlMonth } from '../lib/financeExpensePnl'
import {
  resolveExpenseVatClass,
  vatClassToLiable,
} from '../lib/financeExpenseVat'
import {
  isOpenReconciliationRow,
  listInvoiceWorkflowRows,
  reconciliationRowDate,
} from '../lib/expenseReconciliation'
import {
  buildBankReconciliationReport,
  printBankReconciliationReport,
} from '../lib/bankReconciliationReport'
import {
  formatForeignAmount,
  resolveExpenseForeign,
} from '../lib/foreignCurrency'
import { formatNis, monthLabelHe } from '../lib/financeCalc'
import { formatDateIL } from '../lib/dates'
import { sortByKey, useTableSort } from '../lib/financeTableSort'
import { FinanceClickable } from '../components/finance/FinanceClickable'
import { SortableTh } from '../components/finance/SortableTh'
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
  /** סינון מהיר בלחיצה על שם ספק — UX בלבד */
  const [nameQuickFilter, setNameQuickFilter] = useState('')
  const { sort: reconSort, toggle: toggleReconSort } = useTableSort<
    'date' | 'amount'
  >('date', 'desc')
  const [attaching, setAttaching] = useState<FinanceExpense | null>(null)

  const typeById = useMemo(() => expenseTypeMap(expenseTypes), [expenseTypes])

  /** בלי משכורת / מיסים / עמלות — רק תשלומים שדורשים חשבונית */
  const rows = useMemo(
    () =>
      listInvoiceWorkflowRows(
        expenses,
        period.filterYmFrom,
        period.filterYmTo,
        typeById,
      ),
    [expenses, period.filterYmFrom, period.filterYmTo, typeById],
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
    let list =
      statusFilter === 'all'
        ? rows
        : rows.filter(
            (r) =>
              isOpenReconciliationRow(r) === (statusFilter === 'open'),
          )
    const term = nameQuickFilter.trim().toLowerCase()
    if (term) {
      list = list.filter((r) =>
        merchantLabel(r.expense).toLowerCase().includes(term),
      )
    }
    return sortByKey(list, reconSort, (row, key) =>
      key === 'amount'
        ? row.expense.amount
        : reconciliationRowDate(row.expense),
    )
  }, [rows, statusFilter, nameQuickFilter, reconSort])

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
            תשלום מול חשבונית ספק — משכורת, מיסים ועמלות לא מוצגים כאן
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
          <div className="flex flex-wrap items-center gap-2">
            {nameQuickFilter.trim() ? (
              <button
                type="button"
                onClick={() => setNameQuickFilter('')}
                className="rounded-[8px] border border-[var(--orange)] bg-[var(--orange-light)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--orange)]"
                title="נקה סינון שם"
              >
                שם: {nameQuickFilter} ×
              </button>
            ) : null}
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
                  <SortableTh
                    label="תאריך"
                    columnKey="date"
                    sort={reconSort}
                    onSort={toggleReconSort}
                  />
                  <th className="px-2.5 py-2.5 text-right">ספק / תיאור</th>
                  <SortableTh
                    label="סכום"
                    columnKey="amount"
                    sort={reconSort}
                    onSort={toggleReconSort}
                  />
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
                  const paymentDate =
                    exp.paidDate?.trim() || reconciliationRowDate(exp)
                  const invoiceDate = exp.documentDate?.trim() || ''
                  const reportMonth = deriveExpensePnlMonth(exp)
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
                        <div
                          className="font-semibold text-[var(--text-dark)]"
                          title="חודש לפי תאריך החשבונית"
                        >
                          {monthLabelHe(reportMonth)}
                        </div>
                        <div className="mt-0.5 space-y-0.5 text-[10px] font-semibold text-[var(--text-mid)]">
                          {paymentDate ? (
                            <div>תשלום {formatDateIL(paymentDate)}</div>
                          ) : null}
                          {exp.chargeDate &&
                          exp.chargeDate !== exp.paidDate ? (
                            <div>חיוב {formatDateIL(exp.chargeDate)}</div>
                          ) : null}
                          {invoiceDate ? (
                            <div>חשבונית {formatDateIL(invoiceDate)}</div>
                          ) : (
                            <div className="text-[var(--text-light)]">
                              חשבונית —
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-2.5 py-3 align-top">
                        <FinanceClickable
                          title="סנן לפי ספק"
                          onClick={() => setNameQuickFilter(merchantLabel(exp))}
                        >
                          {merchantLabel(exp)}
                        </FinanceClickable>
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
                        {(() => {
                          const fx = resolveExpenseForeign(exp)
                          if (!fx) return null
                          return (
                            <span className="mt-0.5 block text-[10px] font-bold text-[#3730A3]">
                              {formatForeignAmount(fx.amount, fx.currency)}
                            </span>
                          )
                        })()}
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
                          {exp.expenseNote?.trim() ? (
                            <div className="max-w-[220px] rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-2 py-1 text-[11px] font-bold leading-snug text-[#DC2626]">
                              הערה: {exp.expenseNote.trim()}
                            </div>
                          ) : null}
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
