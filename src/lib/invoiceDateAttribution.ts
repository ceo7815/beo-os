import { amountsIdentical, daysBetween } from './financeMatchRules'
import { resolveAttributionMonth } from './financePeriodLock'
import { documentComparisonAmounts } from './foreignCurrency'
import type { FinanceExpense } from '../types'

/**
 * תאריך החשבונית קובע את חודש הרווח וההפסד.
 *
 * תשלום שיוצא ב-5 בחודש עבור חשבונית מסוף החודש הקודם הוא הוצאה של החודש
 * הקודם — כך העסק באמת עבד. מועד הכסף קובע רק את תזרים המזומנים.
 *
 * אם חודש החשבונית כבר ננעל למע״מ — ההוצאה עדיין נספרת שם, ומסומנת כמאחרת.
 */

export type InvoiceAttribution = {
  /** החודש שאליו ההוצאה תיספר */
  month: string
  /** החודש שאליו החשבונית שייכת כלכלית */
  documentMonth: string
  /** החשבונית הגיעה אחרי שחודשה נעל */
  late: boolean
  /** ההוצאה תזוז מהחודש שבו היא נמצאת כעת */
  moves: boolean
  /** החודש שבו ההוצאה נספרת לפני השינוי */
  currentMonth: string
}

export function expenseCurrentMonth(exp: FinanceExpense): string {
  return (exp.pnlMonth?.trim() || exp.billingMonth).slice(0, 7)
}

export function attributionForInvoiceDate(
  exp: FinanceExpense,
  invoiceDate: string,
  today?: string,
): InvoiceAttribution {
  const outcome = resolveAttributionMonth(invoiceDate, today)
  const currentMonth = expenseCurrentMonth(exp)
  return {
    month: outcome.month,
    documentMonth: outcome.documentMonth,
    late: outcome.late,
    moves: outcome.month !== currentMonth,
    currentMonth,
  }
}

/** חלון סביר בין תאריך החשבונית לתשלום בפועל */
export const INVOICE_PAYMENT_MAX_DAYS = 45

export type InvoiceDateCheck =
  | { status: 'ok' }
  | { status: 'future'; days: number }
  | { status: 'far'; days: number }

/**
 * בדיקת סבירות בין תאריך החשבונית למועד התשלום.
 *
 * חשבונית שמתוארכת אחרי התשלום, או רחוקה ממנו בחודשים, כמעט תמיד מעידה
 * על הצמדה לשורה הלא נכונה — וזו טעות שקשה לגלות אחר כך.
 */
export function checkInvoiceDate(
  invoiceDate: string,
  paymentDate: string,
): InvoiceDateCheck {
  if (!invoiceDate || !paymentDate) return { status: 'ok' }
  const days = Math.round(daysBetween(invoiceDate, paymentDate))
  if (invoiceDate > paymentDate) return { status: 'future', days }
  if (days > INVOICE_PAYMENT_MAX_DAYS) return { status: 'far', days }
  return { status: 'ok' }
}

/** האם הסכום שבחשבונית תואם את מה שירד בפועל */
export function invoiceAmountMatches(
  exp: Pick<FinanceExpense, 'amount' | 'currency' | 'originalAmount'>,
  documentAmount: number,
): boolean {
  return documentComparisonAmounts(exp).some((a) =>
    amountsIdentical(a, documentAmount),
  )
}
