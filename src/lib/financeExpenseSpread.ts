import type { FinanceExpense } from '../types'
import { addMonths, compareYm } from './financeMonthRange'

/**
 * פריסת תשלום מראש על פני חודשים.
 *
 * תשלום שנתי נשאר שורה אחת אחת בלבד — כי מול הבנק ירדה תנועה אחת,
 * וההתאמה חייבת להיות אחד לאחד. הפריסה היא תכונה של אותה שורה,
 * והיא באה לידי ביטוי רק בשכבת התצוגה של הרווח וההפסד.
 */

export const MAX_SPREAD_MONTHS = 60

export function spreadLength(exp: Pick<FinanceExpense, 'spreadMonths'>): number {
  const n = exp.spreadMonths
  if (typeof n !== 'number' || !Number.isFinite(n)) return 1
  const rounded = Math.floor(n)
  if (rounded < 2) return 1
  return Math.min(rounded, MAX_SPREAD_MONTHS)
}

export function isSpreadExpense(exp: Pick<FinanceExpense, 'spreadMonths'>): boolean {
  return spreadLength(exp) > 1
}

export function spreadStart(
  exp: Pick<FinanceExpense, 'spreadStartMonth' | 'billingMonth'>,
): string {
  const explicit = exp.spreadStartMonth?.trim().slice(0, 7)
  if (explicit) return explicit
  return exp.billingMonth.slice(0, 7)
}

export function spreadMonthList(
  exp: Pick<FinanceExpense, 'spreadMonths' | 'spreadStartMonth' | 'billingMonth'>,
): string[] {
  const n = spreadLength(exp)
  const start = spreadStart(exp)
  return Array.from({ length: n }, (_, i) => addMonths(start, i))
}

export function spreadIndexOf(
  exp: Pick<FinanceExpense, 'spreadMonths' | 'spreadStartMonth' | 'billingMonth'>,
  ym: string,
): number {
  const start = spreadStart(exp)
  const target = ym.slice(0, 7)
  if (compareYm(target, start) < 0) return -1
  const n = spreadLength(exp)
  for (let i = 0; i < n; i += 1) {
    if (addMonths(start, i) === target) return i
  }
  return -1
}

/**
 * החלק של חודש מסוים מתוך סכום פרוס.
 * החודש האחרון סופג את שארית העיגול, כך שסכום כל החודשים שווה בדיוק
 * לסכום שירד מהבנק — בלי הפרש של אגורות שיפיל את ההתאמה.
 */
export function spreadPortion(total: number, months: number, index: number): number {
  if (months <= 1) return Math.round(total * 100) / 100
  if (index < 0 || index >= months) return 0
  const totalAgorot = Math.round(total * 100)
  const baseAgorot = Math.floor(totalAgorot / months)
  if (index < months - 1) return baseAgorot / 100
  return (totalAgorot - baseAgorot * (months - 1)) / 100
}

/**
 * הצגת השורה כפי שהיא נספרת בחודש נתון.
 * כשאין פריסה מוחזרת השורה עצמה; כשיש, מוחזר עותק עם החלק החודשי.
 */
export function expenseRowForMonth(
  exp: FinanceExpense,
  ym: string,
): FinanceExpense | null {
  if (!isSpreadExpense(exp)) {
    return exp.billingMonth.slice(0, 7) === ym.slice(0, 7) ? exp : null
  }

  const months = spreadLength(exp)
  const index = spreadIndexOf(exp, ym)
  if (index < 0) return null

  const ratio = spreadPortion(exp.amount, months, index) / exp.amount
  const portion = spreadPortion(exp.amount, months, index)

  return {
    ...exp,
    amount: portion,
    ...(typeof exp.vatAmount === 'number'
      ? { vatAmount: Math.round(exp.vatAmount * ratio * 100) / 100 }
      : {}),
    ...(typeof exp.amountBeforeVat === 'number'
      ? { amountBeforeVat: Math.round(exp.amountBeforeVat * ratio * 100) / 100 }
      : {}),
    billingMonth: ym.slice(0, 7),
    sourceBillingMonth: exp.billingMonth,
    isSpreadOccurrence: true,
    spreadIndex: index,
  }
}
