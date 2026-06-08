import { useMemo, type ReactNode } from 'react'
import { formatDateIL } from '../../lib/dates'
import { monthLabelHe, formatNis, computeCollectionBalance, INCOME_STATUS_LABEL, INCOME_STATUS_STYLE } from '../../lib/financeCalc'
import {
  FINANCE_INCOME_DOCUMENT_SHORT,
  incomeDocumentKind,
  isTaxReceiptIncome,
} from '../../lib/financeIncomeDocument'
import { incomePaymentDate } from '../../lib/financeIncomePayment'
import {
  expenseTypeMap,
  expenseTypeStyle,
  expenseDisplayName,
  expensePaymentMonth,
  expenseUsesPnlAttribution,
  isRecurringExpense,
  resolveExpenseType,
} from '../../lib/financeExpenseTypes'
import {
  deriveExpensePnlMonth,
} from '../../lib/financeExpensePnl'
import { useFinanceExpenseTypes } from '../../hooks/useFinanceExpenseTypes'
import { ProgressBar } from '../shared/ProgressBar'
import type {
  Client,
  FinanceExpense,
  FinanceIncome,
  Project,
} from '../../types'

type Props = {
  project: Project
  client?: Client
  incomes: FinanceIncome[]
  expenses: FinanceExpense[]
  onClose: () => void
}

export function ProjectFinancePanel({
  project,
  client,
  incomes,
  expenses,
  onClose,
}: Props) {
  const { types: expenseTypes } = useFinanceExpenseTypes()
  const typeMap = useMemo(() => expenseTypeMap(expenseTypes), [expenseTypes])

  const projectIncomes = useMemo(
    () =>
      incomes
        .filter((i) => i.projectId === project.id)
        .sort((a, b) => {
          const da = isTaxReceiptIncome(a)
            ? incomePaymentDate(a)
            : a.invoiceDate
          const db = isTaxReceiptIncome(b)
            ? incomePaymentDate(b)
            : b.invoiceDate
          return db.localeCompare(da)
        }),
    [incomes, project.id],
  )

  const projectExpenses = useMemo(
    () =>
      expenses
        .filter((e) => e.projectId === project.id)
        .sort((a, b) => b.billingMonth.localeCompare(a.billingMonth)),
    [expenses, project.id],
  )

  const totalInvoiced = projectIncomes.reduce((s, i) => s + i.amount, 0)
  const totalTaxReceipts = projectIncomes
    .filter((i) => isTaxReceiptIncome(i))
    .reduce((s, i) => s + i.amount, 0)
  const collectionBalance = useMemo(
    () =>
      computeCollectionBalance(incomes, { projectId: project.id, clientId: '' }, new Set()),
    [incomes, project.id],
  )
  const totalSpent = projectExpenses.reduce((s, e) => s + e.amount, 0)
  const budgetTotal = project.budgetTotal ?? 0
  const balanceRemaining = budgetTotal - totalSpent
  const usedPercent =
    budgetTotal > 0
      ? Math.min(100, Math.round((totalSpent / budgetTotal) * 100))
      : project.budgetUsedPercent ?? 0

  return (
    <>
      <div
        className="fixed inset-0 z-[80] bg-[rgba(15,23,42,0.45)] backdrop-blur-[2px]"
        role="presentation"
        onMouseDown={onClose}
      />
      <aside
        className="fixed inset-y-0 start-0 z-[81] flex w-full max-w-md flex-col border-e border-[var(--border)] bg-[var(--dash-panel-bg)] shadow-[0_0_40px_rgba(0,0,0,0.15)]"
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-label="פיננסים לפרויקט"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(249,115,22,0.25)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-[var(--text-dark)]">
              {project.name}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-mid)]">
              {client?.name ?? 'ללא לקוח'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-light)] transition hover:bg-[var(--orange-light)] hover:text-[var(--text-dark)]"
            aria-label="סגור"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="תקציב כולל" value={formatNis(budgetTotal)} />
            <StatCard label="מס קבלה (בפועל)" value={formatNis(totalTaxReceipts)} />
            <StatCard label="יתרה לגבייה" value={formatNis(collectionBalance)} />
            <StatCard label="סה״כ מסמכים" value={formatNis(totalInvoiced)} />
            <StatCard label="סה״כ הוצאות" value={formatNis(totalSpent)} />
            <StatCard
              label="יתרה לניצול"
              value={formatNis(balanceRemaining)}
              tone={balanceRemaining < 0 ? 'danger' : 'ok'}
            />
          </div>

          <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-4">
            <div className="mb-2 text-xs font-bold text-[var(--text-mid)]">
              ניצול תקציב
            </div>
            <ProgressBar
              done={usedPercent}
              total={100}
              color={usedPercent > 90 ? '#EF4444' : '#F97316'}
              manualPercent={usedPercent}
            />
          </div>

          <Section title="הכנסות לפרויקט">
            {projectIncomes.length === 0 ? (
              <p className="text-sm text-[var(--text-light)]">אין הכנסות מקושרות</p>
            ) : (
              <ul className="space-y-2">
                {projectIncomes.map((row) => {
                  const badge = INCOME_STATUS_STYLE[row.status]
                  return (
                    <li
                      key={row.id}
                      className="rounded-lg border border-[var(--border)] bg-white px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-bold text-[var(--text-mid)]">
                            {FINANCE_INCOME_DOCUMENT_SHORT[incomeDocumentKind(row)]}
                          </div>
                          <div className="font-semibold text-[var(--text-dark)]">
                            {row.invoiceNumber || '—'}
                            {row.monthlyRetainer ? (
                              <span className="ms-1" title="ריטיינר חודשי">
                                🔁
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-[var(--text-mid)]">
                            {formatDateIL(
                              isTaxReceiptIncome(row)
                                ? incomePaymentDate(row)
                                : row.invoiceDate,
                            )}
                          </div>
                        </div>
                        <div className="text-left">
                          <div className="font-bold tabular-nums text-[var(--text-dark)]">
                            {formatNis(row.amount)}
                          </div>
                          <span
                            className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{
                              backgroundColor: badge.bg,
                              color: badge.color,
                            }}
                          >
                            {INCOME_STATUS_LABEL[row.status]}
                          </span>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          <Section title="הוצאות לפרויקט">
            {projectExpenses.length === 0 ? (
              <p className="text-sm text-[var(--text-light)]">אין הוצאות מקושרות</p>
            ) : (
              <ul className="space-y-2">
                {projectExpenses.map((row) => {
                  const typeDef = resolveExpenseType(row.type, typeMap)
                  const badge = expenseTypeStyle(typeDef)
                  const recurring = isRecurringExpense(row, typeDef)
                  const payMonth = expensePaymentMonth(row)
                  const reportMonth = deriveExpensePnlMonth(row, incomes)
                  const pnlAttributed = expenseUsesPnlAttribution(row, incomes)
                  return (
                    <li
                      key={row.id}
                      className="rounded-lg border border-[var(--border)] bg-white px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold"
                              style={{
                                backgroundColor: badge.bg,
                                color: badge.color,
                              }}
                            >
                              {typeDef.label}
                            </span>
                            {recurring ? (
                              <span title="חוזר כל חודש">🔁</span>
                            ) : null}
                            {!row.supplierInvoiceReceived ? (
                              <span className="inline-block rounded-full bg-[#F59E0B] px-2 py-0.5 text-[10px] font-bold text-white">
                                ממתין לחשבונית
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 text-sm font-semibold text-[var(--text-dark)]">
                            {expenseDisplayName(row, typeDef)}
                          </div>
                          {row.name && row.description ? (
                            <div className="text-xs text-[var(--text-mid)]">
                              {row.description}
                            </div>
                          ) : null}
                          <div className="text-xs text-[var(--text-mid)]">
                            {pnlAttributed ? (
                              <>
                                תשלום: {monthLabelHe(payMonth)}
                                <span className="mx-1">·</span>
                                <span className="font-semibold text-[#1D4ED8]">
                                  רווח והפסד: {monthLabelHe(reportMonth)}
                                </span>
                              </>
                            ) : (
                              <>
                                מ-{monthLabelHe(row.billingMonth)}
                                {recurring ? ' · חודשי' : ''}
                              </>
                            )}
                          </div>
                        </div>
                        <div className="font-bold tabular-nums text-[var(--text-dark)]">
                          {formatNis(row.amount)}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>
        </div>
      </aside>
    </>
  )
}

function StatCard(props: {
  label: string
  value: string
  tone?: 'ok' | 'danger'
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-3">
      <div className="text-[11px] font-bold text-[var(--text-mid)]">
        {props.label}
      </div>
      <div
        className={`mt-1 text-lg font-extrabold tabular-nums ${
          props.tone === 'danger'
            ? 'text-[#EF4444]'
            : props.tone === 'ok'
              ? 'text-[#10B981]'
              : 'text-[var(--text-dark)]'
        }`}
      >
        {props.value}
      </div>
    </div>
  )
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="mb-3 text-sm font-extrabold text-[var(--text-dark)]">
        {props.title}
      </h3>
      {props.children}
    </div>
  )
}
