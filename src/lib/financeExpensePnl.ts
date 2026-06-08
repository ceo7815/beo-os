import type { FinanceExpense, FinanceIncome } from '../types'
import { isTaxReceiptIncome } from './financeIncomeDocument'
import { incomePaymentDate } from './financeIncomePayment'

function formatNisLocal(amount: number): string {
  return `₪${Math.round(amount).toLocaleString('he-IL')}`
}

export function incomeYm(inc: FinanceIncome): string {
  if (isTaxReceiptIncome(inc)) return incomePaymentDate(inc).slice(0, 7)
  return inc.invoiceDate.slice(0, 7)
}

export function projectIncomesForExpense(
  incomes: FinanceIncome[],
  projectId: string,
): FinanceIncome[] {
  return incomes
    .filter((i) => i.projectId === projectId)
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))
}

/**
 * עסקה לשיוך: מעדיף הכנסה מחודש לפני התשלום (צבירה),
 * כדי שתשלום במאי ייספר לעסקת אפריל של אותו פרויקט.
 */
export function suggestLinkedIncome(
  incomes: FinanceIncome[],
  projectId: string,
  billingMonth: string,
): FinanceIncome | undefined {
  const list = projectIncomesForExpense(incomes, projectId)
  if (list.length === 0) return undefined
  if (list.length === 1) return list[0]

  const payYm = billingMonth.slice(0, 7)
  const strictlyBefore = list.filter((i) => incomeYm(i) < payYm)
  if (strictlyBefore.length > 0) return strictlyBefore[0]

  const sameMonth = list.find((i) => incomeYm(i) === payYm)
  if (sameMonth) return sameMonth

  return list[list.length - 1]
}

export function pnlMonthFromIncome(inc: FinanceIncome): string {
  return incomeYm(inc)
}

export function resolveLinkedIncome(
  exp: FinanceExpense,
  incomes: FinanceIncome[],
): FinanceIncome | undefined {
  if (!exp.projectId?.trim()) return undefined
  if (exp.linkedIncomeId) {
    const linked = incomes.find((i) => i.id === exp.linkedIncomeId)
    if (linked?.projectId === exp.projectId) return linked
  }
  return suggestLinkedIncome(
    incomes,
    exp.projectId,
    exp.billingMonth.slice(0, 7),
  )
}

/** חודש שבו ההוצאה נספרת ברווח והפסד */
export function deriveExpensePnlMonth(
  exp: FinanceExpense,
  incomes: FinanceIncome[],
): string {
  if (exp.pnlMonth?.trim()) return exp.pnlMonth.slice(0, 7)
  if (!exp.projectId?.trim()) return exp.billingMonth.slice(0, 7)

  const linked = resolveLinkedIncome(exp, incomes)
  return linked ? pnlMonthFromIncome(linked) : exp.billingMonth.slice(0, 7)
}

export function expenseReportMonth(
  exp: FinanceExpense,
  incomes: FinanceIncome[] = [],
): string {
  return deriveExpensePnlMonth(exp, incomes)
}

export function expensePaymentMonth(exp: FinanceExpense): string {
  return (exp.sourceBillingMonth ?? exp.billingMonth).slice(0, 7)
}

export function expenseUsesPnlAttribution(
  exp: FinanceExpense,
  incomes: FinanceIncome[] = [],
): boolean {
  if (!exp.projectId?.trim()) return false
  return deriveExpensePnlMonth(exp, incomes) !== expensePaymentMonth(exp)
}

export function incomeLinkLabel(inc: FinanceIncome): string {
  const parts = [incomeYm(inc)]
  if (inc.invoiceNumber?.trim()) parts.push(`#${inc.invoiceNumber.trim()}`)
  parts.push(formatNisLocal(inc.amount))
  return parts.join(' · ')
}

export function resolveExpensePnlFields(
  projectId: string | undefined,
  linkedIncomeId: string | undefined,
  billingMonth: string,
  incomes: FinanceIncome[],
): { linkedIncomeId?: string; pnlMonth?: string } {
  if (!projectId?.trim()) return {}

  const pid = projectId.trim()
  if (linkedIncomeId?.trim()) {
    const linked = incomes.find((i) => i.id === linkedIncomeId.trim())
    if (linked?.projectId === pid) {
      return {
        linkedIncomeId: linked.id,
        pnlMonth: pnlMonthFromIncome(linked),
      }
    }
  }

  const suggested = suggestLinkedIncome(incomes, pid, billingMonth.slice(0, 7))
  if (!suggested) return {}
  return {
    linkedIncomeId: suggested.id,
    pnlMonth: pnlMonthFromIncome(suggested),
  }
}
