import type { FinanceExpense, FinanceIncome } from '../types'
import { formatNis } from './financeCalc'
import {
  expenseAccrualMonth,
  isAccrualExpense,
  isSalaryExpense,
} from './financeSalaryMonth'
import { isTaxReceiptIncome } from './financeIncomeDocument'
import { incomePaymentDate } from './financeIncomePayment'

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

/**
 * חודש שבו ההוצאה נספרת ברווח והפסד.
 * חוק: תאריך החשבונית (documentDate) קובע — לא תאריך התשלום.
 * משכורת/מסים — חודש הצבירה שעבורו שולמו.
 */
export function deriveExpensePnlMonth(exp: FinanceExpense): string {
  if (isAccrualExpense(exp)) return expenseAccrualMonth(exp)
  if (exp.documentDate?.trim()) return exp.documentDate.trim().slice(0, 7)
  if (exp.pnlMonth?.trim()) return exp.pnlMonth.slice(0, 7)
  return exp.billingMonth.slice(0, 7)
}

export function expenseReportMonth(exp: FinanceExpense): string {
  return deriveExpensePnlMonth(exp)
}

export function expensePaymentMonth(exp: FinanceExpense): string {
  if ((isSalaryExpense(exp) || isAccrualExpense(exp)) && exp.paidDate?.trim()) {
    return exp.paidDate.trim().slice(0, 7)
  }
  return (exp.sourceBillingMonth ?? exp.billingMonth).slice(0, 7)
}

export function expenseUsesPnlAttribution(exp: FinanceExpense): boolean {
  if (isAccrualExpense(exp)) {
    const pay = exp.paidDate?.trim().slice(0, 7)
    return !!pay && pay !== expenseAccrualMonth(exp)
  }
  return deriveExpensePnlMonth(exp) !== expensePaymentMonth(exp)
}

export function incomeLinkLabel(inc: FinanceIncome): string {
  const parts = [incomeYm(inc)]
  if (inc.invoiceNumber?.trim()) parts.push(`#${inc.invoiceNumber.trim()}`)
  parts.push(formatNis(inc.amount))
  return parts.join(' · ')
}

/**
 * קישור ההוצאה לעסקה — לצורכי רווחיות פרויקט בלבד.
 * הקישור אינו קובע את חודש הרווח וההפסד: ההוצאה נספרת בחודש שלה.
 */
export function resolveExpensePnlFields(
  projectId: string | undefined,
  linkedIncomeId: string | undefined,
  incomes: FinanceIncome[],
): { linkedIncomeId?: string } {
  if (!projectId?.trim()) return {}
  if (!linkedIncomeId?.trim()) return {}

  const linked = incomes.find((i) => i.id === linkedIncomeId.trim())
  if (linked?.projectId !== projectId.trim()) return {}
  return { linkedIncomeId: linked.id }
}
