import { useMemo, useState } from 'react'
import { Modal } from '../shared/Modal'
import { IncomeDocumentsTable } from './IncomeDocumentsTable'
import { formatDateIL } from '../../lib/dates'
import {
  computeSummary,
  currentYm,
  formatNis,
  ymFromDate,
} from '../../lib/financeCalc'
import {
  isActualIncome,
  isOpenTransactionAccount,
} from '../../lib/financeIncomeDocument'
import { incomeOutstandingAmount } from '../../lib/financeIncomePayment'
import {
  expenseDisplayName,
  expenseTypeMap,
  resolveExpenseType,
} from '../../lib/financeExpenseTypes'
import { resolveExpenseRowVat } from '../../lib/israeliVat'
import { useFinanceExpenseTypes } from '../../hooks/useFinanceExpenseTypes'
import { useFinanceExpenses } from '../../hooks/useFinanceExpenses'
import { useFinanceIncomes } from '../../hooks/useFinanceIncomes'
import { useProjects } from '../../hooks/useProjects'
import type { FinanceExpense, FinanceIncome } from '../../types'

export type ClientFinanceTarget = {
  /** מזהה לקוח במערכת — או ריק ללקוח אורח מחשבונית ירוקה */
  clientId?: string
  /** שם לתצוגה */
  clientName: string
  /** שם אורח מ־GI כשאין clientId ממופה */
  guestName?: string
}

type TabId = 'income' | 'expense' | 'collection'

const TABS: { id: TabId; label: string }[] = [
  { id: 'income', label: 'הכנסות' },
  { id: 'expense', label: 'הוצאות' },
  { id: 'collection', label: 'גבייה פתוחה' },
]

function rowYm(inc: FinanceIncome): string {
  return ymFromDate(inc.invoiceDate || inc.paidDate || currentYm())
}

function expenseYm(exp: FinanceExpense): string {
  return (
    exp.pnlMonth?.slice(0, 7) ||
    exp.billingMonth?.slice(0, 7) ||
    (exp.paidDate ? ymFromDate(exp.paidDate) : currentYm())
  )
}

/**
 * כרטיס פיננסי ללקוח — היסטוריה מלאה.
 * משתמש ב־computeSummary הקיים על נתונים מסוננים; לא משנה נוסחאות.
 */
export function ClientFinanceCardModal({
  target,
  onClose,
  clientNameById,
}: {
  target: ClientFinanceTarget | null
  onClose: () => void
  clientNameById: Map<string, string>
}) {
  const { incomes } = useFinanceIncomes()
  const { expenses } = useFinanceExpenses()
  const { projects } = useProjects()
  const { types: expenseTypes } = useFinanceExpenseTypes()
  const [tab, setTab] = useState<TabId>('income')

  const open = target != null

  const projectIdsForClient = useMemo(() => {
    const id = target?.clientId?.trim()
    if (!id) return new Set<string>()
    return new Set(
      projects.filter((p) => p.clientId === id).map((p) => p.id),
    )
  }, [projects, target?.clientId])

  const projectNameById = useMemo(() => {
    const m = new Map<string, string>()
    projects.forEach((p) => m.set(p.id, p.name))
    return m
  }, [projects])

  const typeById = useMemo(() => expenseTypeMap(expenseTypes), [expenseTypes])

  const clientIncomes = useMemo(() => {
    if (!target) return [] as FinanceIncome[]
    const cid = target.clientId?.trim()
    const guest = (target.guestName ?? target.clientName).trim()
    return incomes
      .filter((inc) => {
        if (cid && inc.clientId === cid) return true
        if (!cid && guest) {
          const name =
            clientNameById.get(inc.clientId) ??
            inc.greenInvoiceClientName ??
            ''
          return name.trim() === guest
        }
        if (cid && guest) {
          return (
            inc.greenInvoiceClientName?.trim() === guest &&
            (!inc.clientId || inc.clientId === cid)
          )
        }
        return false
      })
      .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))
  }, [target, incomes, clientNameById])

  const clientExpenses = useMemo(() => {
    if (!target) return [] as FinanceExpense[]
    const cid = target.clientId?.trim()
    if (!cid) return []
    return expenses
      .filter((exp) => {
        if (exp.clientId === cid) return true
        if (exp.projectId && projectIdsForClient.has(exp.projectId)) return true
        return false
      })
      .sort((a, b) => expenseYm(b).localeCompare(expenseYm(a)))
  }, [target, expenses, projectIdsForClient])

  const openCollections = useMemo(
    () =>
      clientIncomes.filter(
        (inc) =>
          isOpenTransactionAccount(inc) && incomeOutstandingAmount(inc) > 0,
      ),
    [clientIncomes],
  )

  const summary = useMemo(() => {
    if (!target) return null
    const yms = [
      ...clientIncomes.map(rowYm),
      ...clientExpenses.map(expenseYm),
    ].filter((ym) => /^\d{4}-\d{2}$/.test(ym))
    const ymFrom = yms.length ? yms.reduce((a, b) => (a < b ? a : b)) : currentYm()
    const ymTo = yms.length ? yms.reduce((a, b) => (a > b ? a : b)) : currentYm()

    // מעבירים רק את נתוני הלקוח — אותה נוסחת computeSummary, בלי פילטר clientId כפול
    return computeSummary(
      clientIncomes,
      clientExpenses,
      { ymFrom, ymTo, projectId: '', clientId: '' },
      new Set<string>(),
      expenseTypes,
    )
  }, [target, clientIncomes, clientExpenses, expenseTypes])

  if (!open || !target || !summary) return null

  const incomeDocs = clientIncomes.filter(isActualIncome)

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`כרטיס פיננסי · ${target.clientName}`}
      size="xl"
      bodyClassName="max-h-none"
    >
      <div className="space-y-4 text-right" dir="rtl">
        <p className="text-[12px] leading-relaxed text-[var(--text-mid)]">
          כל ההיסטוריה הפיננסית של הלקוח במערכת — הכנסות, הוצאות משויכות ויתרות
          גבייה. הסיכומים מחושבים באותן נוסחאות כמו בסקירה הכללית.
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Kpi
            label="הכנסות ברוטו"
            value={formatNis(summary.incomeGross)}
            tone="good"
          />
          <Kpi
            label="הוצאות"
            value={formatNis(
              summary.expenseVatLiableGross + summary.expenseNonVatTotal,
            )}
            tone="bad"
          />
          <Kpi
            label="רווח נקי"
            value={formatNis(summary.trueNetProfit)}
            tone={summary.trueNetProfit >= 0 ? 'good' : 'bad'}
          />
          <Kpi
            label="יתרה לגבייה"
            value={formatNis(summary.collectionBalance)}
            tone="warn"
          />
          <Kpi
            label='מע״מ לתשלום'
            value={formatNis(summary.vatPayable)}
            tone="neutral"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => {
            const count =
              t.id === 'income'
                ? incomeDocs.length
                : t.id === 'expense'
                  ? clientExpenses.length
                  : openCollections.length
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={
                  tab === t.id
                    ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-3 py-1.5 text-[11px] font-bold text-white'
                    : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                }
              >
                {t.label} ({count})
              </button>
            )
          })}
        </div>

        {tab === 'income' ? (
          <IncomeDocumentsTable
            rows={clientIncomes}
            clientNameById={clientNameById}
            projectNameById={projectNameById}
          />
        ) : null}

        {tab === 'expense' ? (
          clientExpenses.length === 0 ? (
            <p className="text-sm text-[var(--text-mid)]">
              אין הוצאות משויכות ללקוח זה
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]/80 text-[11px] font-bold text-[var(--text-mid)]">
                    <th className="px-2.5 py-2.5 text-right">חודש</th>
                    <th className="px-2.5 py-2.5 text-right">שם</th>
                    <th className="px-2.5 py-2.5 text-right">פרויקט</th>
                    <th className="px-2.5 py-2.5 text-right">ברוטו</th>
                    <th className="px-2.5 py-2.5 text-right">נטו</th>
                  </tr>
                </thead>
                <tbody>
                  {clientExpenses.map((exp) => {
                    const vat = resolveExpenseRowVat(exp)
                    const typeDef = resolveExpenseType(exp.type, typeById)
                    return (
                      <tr
                        key={exp.id}
                        className="border-b border-[var(--border)]/80"
                      >
                        <td className="px-2.5 py-2.5 tabular-nums">
                          {expenseYm(exp)}
                        </td>
                        <td className="px-2.5 py-2.5 font-semibold">
                          {expenseDisplayName(exp, typeDef)}
                        </td>
                        <td className="px-2.5 py-2.5 text-[var(--text-mid)]">
                          {exp.projectId
                            ? (projectNameById.get(exp.projectId) ?? '—')
                            : '—'}
                        </td>
                        <td className="px-2.5 py-2.5 tabular-nums font-bold">
                          {formatNis(vat.gross)}
                        </td>
                        <td className="px-2.5 py-2.5 tabular-nums">
                          {formatNis(vat.net)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {tab === 'collection' ? (
          openCollections.length === 0 ? (
            <p className="text-sm text-[var(--text-mid)]">
              אין יתרות פתוחות לגבייה
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]/80 text-[11px] font-bold text-[var(--text-mid)]">
                    <th className="px-2.5 py-2.5 text-right">תאריך</th>
                    <th className="px-2.5 py-2.5 text-right">מספר</th>
                    <th className="px-2.5 py-2.5 text-right">סכום</th>
                    <th className="px-2.5 py-2.5 text-right">יתרה</th>
                  </tr>
                </thead>
                <tbody>
                  {openCollections.map((inc) => (
                    <tr
                      key={inc.id}
                      className="border-b border-[var(--border)]/80"
                    >
                      <td className="px-2.5 py-2.5 tabular-nums">
                        {formatDateIL(inc.invoiceDate)}
                      </td>
                      <td className="px-2.5 py-2.5 tabular-nums text-[11px]">
                        #
                        {inc.invoiceNumber ||
                          inc.greenInvoiceNumber ||
                          '—'}
                      </td>
                      <td className="px-2.5 py-2.5 tabular-nums font-bold">
                        {formatNis(inc.amount)}
                      </td>
                      <td className="px-2.5 py-2.5 tabular-nums font-extrabold text-[#D97706]">
                        {formatNis(incomeOutstandingAmount(inc))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>
    </Modal>
  )
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'good' | 'bad' | 'warn' | 'neutral'
}) {
  const color =
    tone === 'good'
      ? 'text-[#059669]'
      : tone === 'bad'
        ? 'text-[#DC2626]'
        : tone === 'warn'
          ? 'text-[#D97706]'
          : 'text-[var(--text-dark)]'
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 px-3 py-2.5">
      <div className="text-[10px] font-bold text-[var(--text-mid)]">{label}</div>
      <div className={`mt-1 text-[15px] font-extrabold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  )
}
