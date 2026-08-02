import { merchantKey } from './bankImport/matching'
import { daysBetween } from './financeMatchRules'
import {
  isForeignCurrencyCode,
  normalizeCurrencyCode,
} from './foreignCurrency'
import type { FinanceExpense } from '../types'

/**
 * שיוך זיכוי להוצאה שביטל.
 *
 * זיכוי נשמר כהוצאה שלילית ולא מוחק את החיוב המקורי — שתי התנועות ירדו
 * בפועל בכרטיס, ומחיקה של אחת מהן הייתה מנתקת את הספרים מהבנק. במקום זה
 * הן נקשרות זו לזו, כך שרואים שהחיוב בוטל ושהצמד מתאפס.
 */

/** חלון הזמן שבו זיכוי עדיין נחשב קשור לחיוב המקורי */
export const REFUND_MAX_DAYS = 120

const AGORA = 0.005

/**
 * סטייה מותרת בין החיוב לזיכוי.
 *
 * ספק שגובה במטבע חוץ (Wise, Google, PayPal) ממיר פעמיים — פעם בחיוב
 * ופעם בהחזר — ובין שתי ההמרות השער זז. התוצאה היא הפרש של כמה שקלים
 * על אותה עסקה בדיוק, ולעיתים הזיכוי אף גדול מהחיוב. השוואה נוקשה הייתה
 * מסתירה בדיוק את הזיכויים שהכי חשוב לשייך.
 */
const RATE_DRIFT_PERCENT = 0.02
const RATE_DRIFT_MIN = 5

function driftAllowance(amount: number): number {
  return Math.max(RATE_DRIFT_MIN, Math.abs(amount) * RATE_DRIFT_PERCENT)
}

export function isRefundExpense(exp: FinanceExpense): boolean {
  return exp.amount < 0
}

export function isChargeExpense(exp: FinanceExpense): boolean {
  return exp.amount > 0
}

export function refundAmount(exp: FinanceExpense): number {
  return Math.abs(exp.amount)
}

function expenseDate(exp: FinanceExpense): string {
  return exp.paidDate ?? exp.documentDate ?? `${exp.billingMonth}-01`
}

function nameOf(exp: FinanceExpense): string {
  return exp.name ?? exp.supplierName ?? exp.description ?? ''
}

/** מסיר את הקידומת שהייבוא מוסיף לזיכוי, כדי להשוות שם מול שם */
function merchantOf(exp: FinanceExpense): string {
  return merchantKey(nameOf(exp).replace(/^זיכוי\s*—\s*/, ''))
}

export type RefundStatus = {
  /** סכום הזיכויים שכבר שויכו לחיוב */
  refunded: number
  /** מה שנותר כהוצאה בפועל */
  remaining: number
  fully: boolean
  partially: boolean
}

export function refundStatusFor(
  charge: FinanceExpense,
  all: FinanceExpense[],
): RefundStatus {
  const refunded = all
    .filter((e) => e.refundForExpenseId === charge.id)
    .reduce((sum, e) => sum + refundAmount(e), 0)
  const remaining = Math.round((charge.amount - refunded) * 100) / 100
  // יתרה בגובה הפרשי שער אינה חוב פתוח — העסקה בוטלה במלואה
  const settled = Math.abs(remaining) <= driftAllowance(charge.amount)
  return {
    refunded,
    remaining,
    fully: refunded > 0 && settled,
    partially: refunded > 0 && !settled,
  }
}

/** חיובים שזוכו במלואם — נסגרים מכוח הזיכוי ולא מכוח חשבונית */
export function fullyRefundedChargeIds(
  expenses: FinanceExpense[],
): Set<string> {
  const refundedByCharge = new Map<string, number>()
  for (const exp of expenses) {
    const target = exp.refundForExpenseId?.trim()
    if (!target || exp.amount >= 0) continue
    refundedByCharge.set(target, (refundedByCharge.get(target) ?? 0) + refundAmount(exp))
  }
  const out = new Set<string>()
  for (const exp of expenses) {
    const refunded = refundedByCharge.get(exp.id)
    if (refunded == null) continue
    if (Math.abs(exp.amount - refunded) <= driftAllowance(exp.amount)) {
      out.add(exp.id)
    }
  }
  return out
}

export type RefundLink = {
  /** התפקיד של הרשומה בצמד */
  role: 'charge' | 'refund'
  /** הרשומות שממול — לחיוב אחד יכולים להיות כמה זיכויים */
  counterparts: FinanceExpense[]
  /** סך הזיכוי ששויך לחיוב */
  refunded: number
  /** מה שנותר כהוצאה בפועל אחרי הזיכוי */
  remaining: number
  /** העסקה בוטלה במלואה ואין מה לגבות בחשבונית */
  fully: boolean
}

/**
 * שני צדי ההתאמה בין זיכוי לחיוב, לפי מזהה רשומה.
 *
 * הצמד נשמר כשתי תנועות נפרדות כדי שהספרים יישארו זהים לדף הבנק, ולכן
 * בלי סימון מפורש שתי השורות נראות כמו הוצאות שאין ביניהן קשר.
 */
export function refundLinkMap(
  expenses: FinanceExpense[],
): Map<string, RefundLink> {
  const byId = new Map(expenses.map((e) => [e.id, e]))
  const refundsByCharge = new Map<string, FinanceExpense[]>()
  for (const exp of expenses) {
    const target = exp.refundForExpenseId?.trim()
    if (!target || !isRefundExpense(exp)) continue
    const list = refundsByCharge.get(target) ?? []
    list.push(exp)
    refundsByCharge.set(target, list)
  }

  const out = new Map<string, RefundLink>()
  for (const [chargeId, refunds] of refundsByCharge) {
    const charge = byId.get(chargeId)
    if (!charge) continue
    const refunded = refunds.reduce((sum, r) => sum + refundAmount(r), 0)
    const remaining = Math.round((charge.amount - refunded) * 100) / 100
    const fully = Math.abs(remaining) <= driftAllowance(charge.amount)

    out.set(chargeId, {
      role: 'charge',
      counterparts: refunds,
      refunded,
      remaining,
      fully,
    })
    for (const refund of refunds) {
      out.set(refund.id, {
        role: 'refund',
        counterparts: [charge],
        refunded,
        remaining,
        fully,
      })
    }
  }
  return out
}

export function listUnlinkedRefunds(
  expenses: FinanceExpense[],
): FinanceExpense[] {
  return expenses
    .filter((e) => isRefundExpense(e) && !e.refundForExpenseId?.trim())
    .sort((a, b) => expenseDate(b).localeCompare(expenseDate(a)))
}

export type RefundCandidate = {
  charge: FinanceExpense
  /** ככל שגבוה יותר, ההתאמה בטוחה יותר */
  score: number
  sameMerchant: boolean
  exactAmount: boolean
  /** הסכומים קרובים אך אינם זהים — הפרשי שער בעסקת מט״ח */
  nearAmount: boolean
  /** הפרש הסכומים בשקלים; חיובי כשהזיכוי גדול מהחיוב */
  gap: number
  days: number
}

/** אותו סכום בדיוק במטבע שבו העסקה בוצעה בפועל */
function amountsAgree(
  charge: FinanceExpense,
  refund: FinanceExpense,
): { exact: boolean; near: boolean; gap: number } {
  const chargeIls = Math.abs(charge.amount)
  const refundIls = refundAmount(refund)
  const gap = Math.round((refundIls - chargeIls) * 100) / 100

  if (Math.abs(gap) < AGORA) return { exact: true, near: false, gap: 0 }

  const sameForeign =
    isForeignCurrencyCode(charge.currency) &&
    normalizeCurrencyCode(charge.currency) ===
      normalizeCurrencyCode(refund.currency) &&
    charge.originalAmount != null &&
    refund.originalAmount != null
  if (
    sameForeign &&
    Math.abs(Math.abs(refund.originalAmount!) - Math.abs(charge.originalAmount!)) <
      AGORA
  ) {
    return { exact: true, near: false, gap }
  }

  return { exact: false, near: Math.abs(gap) <= driftAllowance(chargeIls), gap }
}

/**
 * חיובים שיכולים להתאים לזיכוי.
 *
 * הסינון מוותר במכוון על התאמה לפי סכום זהה בלבד: זיכוי חלקי הוא מקרה
 * אמיתי, ולכן מותר גם חיוב גדול יותר — הוא רק מדורג נמוך יותר.
 */
export function refundCandidates(
  refund: FinanceExpense,
  expenses: FinanceExpense[],
): RefundCandidate[] {
  if (!isRefundExpense(refund)) return []
  const amount = refundAmount(refund)
  const refundDate = expenseDate(refund)
  const refundMerchant = merchantOf(refund)

  const out: RefundCandidate[] = []
  for (const charge of expenses) {
    if (charge.id === refund.id || !isChargeExpense(charge)) continue
    if (charge.paymentMethod !== refund.paymentMethod) continue

    const chargeDate = expenseDate(charge)
    // זיכוי אינו יכול להקדים את החיוב שהוא מבטל
    if (chargeDate > refundDate) continue
    const days = daysBetween(chargeDate, refundDate)
    if (days > REFUND_MAX_DAYS) continue

    // זיכוי אינו יכול לעלות על מה שנותר בחיוב, פרט לסטיית שער
    const status = refundStatusFor(charge, expenses)
    if (status.remaining + driftAllowance(charge.amount) < amount) continue

    const { exact, near, gap } = amountsAgree(charge, refund)
    const chargeMerchant = merchantOf(charge)
    const sameMerchant =
      chargeMerchant.length > 0 && chargeMerchant === refundMerchant

    let score = 0
    if (sameMerchant) score += 100
    if (exact) score += 60
    else if (near) score += 35
    score += Math.max(0, REFUND_MAX_DAYS - days) / REFUND_MAX_DAYS * 20

    out.push({
      charge,
      score,
      sameMerchant,
      exactAmount: exact,
      nearAmount: near,
      gap,
      days,
    })
  }

  return out.sort(
    (a, b) => b.score - a.score || a.days - b.days,
  )
}

/**
 * ההתאמה שבטוח לסמן מראש: אותו ספק, סכום זהה או בטווח סטיית שער,
 * ואין חיוב אחר שעונה על אותם תנאים.
 */
export function suggestedRefundMatch(
  refund: FinanceExpense,
  expenses: FinanceExpense[],
): RefundCandidate | null {
  const confident = refundCandidates(refund, expenses).filter(
    (c) => c.sameMerchant && (c.exactAmount || c.nearAmount),
  )
  return confident.length === 1 ? confident[0]! : null
}
