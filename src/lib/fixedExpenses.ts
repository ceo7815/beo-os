import type { FinanceExpense, FinanceFixedExpenseCatalogItem } from '../types'
import { addMonths } from './financeMonthRange'

export function fixedExpenseLabel(exp: FinanceExpense): string {
  return (
    exp.name?.trim() ||
    exp.supplierName?.trim() ||
    exp.employeeName?.trim() ||
    exp.description?.trim() ||
    exp.type
  )
}

export function fixedExpenseKey(exp: FinanceExpense): string {
  return `${exp.type}::${fixedExpenseLabel(exp)}`
}

export type FixedExpenseGroup = {
  key: string
  template: FinanceExpense
  records: FinanceExpense[]
}

/** קיבוץ הוצאות עם recurring=true — תבנית = הרשומה העדכנית ביותר (כמו בתזרים) */
export function groupFixedExpenses(expenses: FinanceExpense[]): FixedExpenseGroup[] {
  const byKey = new Map<string, FinanceExpense[]>()
  for (const exp of expenses) {
    if (exp.recurring !== true) continue
    const key = fixedExpenseKey(exp)
    const list = byKey.get(key) ?? []
    list.push(exp)
    byKey.set(key, list)
  }
  const groups: FixedExpenseGroup[] = []
  for (const [key, records] of byKey) {
    records.sort((a, b) => b.billingMonth.localeCompare(a.billingMonth))
    groups.push({ key, template: records[0]!, records })
  }
  groups.sort((a, b) =>
    fixedExpenseLabel(a.template).localeCompare(fixedExpenseLabel(b.template), 'he'),
  )
  return groups
}

export function isCreditCardFixedExpense(exp: FinanceExpense): boolean {
  if (exp.paymentMethod === 'credit_card') return true
  const billingYm = exp.billingMonth?.slice(0, 7)
  const chargeYmd = exp.chargeDate?.trim().slice(0, 10)
  if (billingYm && chargeYmd && chargeYmd.slice(0, 7) > billingYm) return true
  return false
}

export function fixedExpenseDayOfMonth(exp: FinanceExpense): number {
  const raw =
    exp.chargeDate?.trim().slice(0, 10) ||
    exp.paidDate?.trim().slice(0, 10) ||
    `${exp.billingMonth}-01`
  const d = Number(raw.slice(8, 10))
  return d >= 1 && d <= 31 ? d : 1
}

export function chargeDateForExpenseMonth(billingMonth: string, day: number): string {
  const ym = billingMonth.slice(0, 7)
  const last = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate()
  const d = Math.min(Math.max(1, day), last)
  return `${ym}-${String(d).padStart(2, '0')}`
}

export function cashflowTimingHint(exp: FinanceExpense): string {
  if (isCreditCardFixedExpense(exp)) {
    return 'יוצא ב-2 לחודש שלאחר החיוב'
  }
  return `יום ${fixedExpenseDayOfMonth(exp)} בחודש החיוב`
}

export function catalogItemLabel(item: FinanceFixedExpenseCatalogItem): string {
  return item.name.trim() || item.type
}

export function isCreditCardCatalogItem(item: FinanceFixedExpenseCatalogItem): boolean {
  return item.paymentMethod === 'credit_card'
}

export function catalogItemCashflowDate(
  item: FinanceFixedExpenseCatalogItem,
  billingYm: string,
): string {
  if (isCreditCardCatalogItem(item)) {
    return `${addMonths(billingYm, 1)}-02`
  }
  return chargeDateForExpenseMonth(billingYm, item.dayOfMonth ?? 1)
}

export function catalogItemTimingHint(item: FinanceFixedExpenseCatalogItem): string {
  if (isCreditCardCatalogItem(item)) {
    return 'יוצא ב-2 לחודש שלאחר החיוב'
  }
  return `יום ${item.dayOfMonth ?? 1} בחודש החיוב`
}

/** המרת קבוצת הוצאות recurring לפריט קטלוג (לייבוא חד-פעמי) */
export function groupToCatalogItem(group: FixedExpenseGroup): FinanceFixedExpenseCatalogItem {
  const t = group.template
  const credit = isCreditCardFixedExpense(t)
  return {
    id: crypto.randomUUID(),
    type: t.type,
    name: fixedExpenseLabel(t),
    amount: t.amount,
    paymentMethod: credit ? 'credit_card' : 'bank_transfer',
    dayOfMonth: credit ? 1 : fixedExpenseDayOfMonth(t),
    amountIncludesVat: t.amountIncludesVat !== false,
  }
}
