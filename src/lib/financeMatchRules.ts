/**
 * כללי ההתאמה בין תנועת בנק/אשראי לבין מסמך.
 *
 * העיקרון: התאמה נקבעת רק כשהיא ודאית. סכום זהה עד אגורה, בתוך 45 יום.
 * כל דבר אחר אינו "כמעט התאמה" אלא פריט שממתין לבדיקה — כי מספר רווח
 * שמסתמך על התאמות משוערות אינו מספר שאפשר לסמוך עליו.
 */

export const MATCH_MAX_DAYS = 45

/** סף העיגול — סכומים נחשבים זהים כשהם שווים ברמת האגורה */
const AGORA_EPSILON = 0.005

export type MatchVerdict = 'match' | 'review'

export type MatchEvaluation = {
  verdict: MatchVerdict
  /** הסיבה בעברית — מוצגת למשתמש כשנדרשת בדיקה */
  reason: string
}

export function amountsIdentical(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  if (a <= 0 || b <= 0) return false
  return Math.abs(a - b) < AGORA_EPSILON
}

export function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a.slice(0, 10)}T12:00:00Z`)
  const db = Date.parse(`${b.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(da) || Number.isNaN(db)) return Number.POSITIVE_INFINITY
  return Math.abs(da - db) / (24 * 60 * 60 * 1000)
}

export function withinMatchWindow(a: string, b: string): boolean {
  return daysBetween(a, b) <= MATCH_MAX_DAYS
}

export type MatchCandidate = {
  /** סכום בשקלים */
  amount: number
  /** YYYY-MM-DD */
  date: string
  /** מטבע המסמך; כל דבר שאינו ILS נחשב מטבע חוץ */
  currency?: string
}

/**
 * מכריע אם צמד מהווה התאמה ודאית.
 *
 * מסמך במטבע חוץ לעולם אינו מתאים בסכום — החשבונית ב-20 דולר והחיוב
 * בשקלים אחרי המרה. לכן צמד כזה מוצע לבדיקה, והסכום השקלי הקובע הוא
 * זה של שורת האשראי.
 */
export function evaluateMatch(
  bank: MatchCandidate,
  document: MatchCandidate,
): MatchEvaluation {
  if (isForeignCurrency(document)) {
    if (!withinMatchWindow(bank.date, document.date)) {
      return { verdict: 'review', reason: 'מסמך במטבע חוץ מחוץ לחלון 45 הימים' }
    }
    return {
      verdict: 'review',
      reason: 'מסמך במטבע חוץ — יש לאשר שהסכום השקלי הוא זה שבשורת האשראי',
    }
  }

  if (!amountsIdentical(bank.amount, document.amount)) {
    return { verdict: 'review', reason: 'הסכומים אינם זהים' }
  }

  const days = daysBetween(bank.date, document.date)
  if (days > MATCH_MAX_DAYS) {
    return {
      verdict: 'review',
      reason: `הפרש של ${Math.round(days)} ימים — מעל חלון ${MATCH_MAX_DAYS} הימים`,
    }
  }

  return { verdict: 'match', reason: '' }
}

export function isForeignCurrency(c: Pick<MatchCandidate, 'currency'>): boolean {
  const cur = c.currency?.trim().toUpperCase()
  return Boolean(cur) && cur !== 'ILS'
}

/**
 * מדד הכיסוי — איזה חלק מכסף ההוצאות מגובה בהתאמה ודאית.
 * נמדד בכסף ולא בשורות, כי שורה של ₪12 ושורה של ₪12,000 אינן שוות
 * במשמעותן לאמינות מספר הרווח.
 */
export type CoverageStats = {
  /** סכום כל ההוצאות שנספרות */
  totalAmount: number
  /** מתוכן — מגובות בהתאמה ודאית */
  matchedAmount: number
  /** ממתינות לבדיקה או חסרות מסמך */
  unmatchedAmount: number
  totalRows: number
  matchedRows: number
  /** אחוז מהכסף שמגובה בהתאמה, 0–100 */
  percent: number
}

export function emptyCoverage(): CoverageStats {
  return {
    totalAmount: 0,
    matchedAmount: 0,
    unmatchedAmount: 0,
    totalRows: 0,
    matchedRows: 0,
    percent: 100,
  }
}

export function computeCoverage(
  rows: { amount: number; matched: boolean }[],
): CoverageStats {
  if (rows.length === 0) return emptyCoverage()

  let totalAmount = 0
  let matchedAmount = 0
  let matchedRows = 0

  for (const r of rows) {
    const amt = Math.abs(r.amount)
    totalAmount += amt
    if (r.matched) {
      matchedAmount += amt
      matchedRows += 1
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100
  totalAmount = round2(totalAmount)
  matchedAmount = round2(matchedAmount)

  return {
    totalAmount,
    matchedAmount,
    unmatchedAmount: round2(totalAmount - matchedAmount),
    totalRows: rows.length,
    matchedRows,
    percent:
      totalAmount > 0 ? Math.round((matchedAmount / totalAmount) * 1000) / 10 : 100,
  }
}
