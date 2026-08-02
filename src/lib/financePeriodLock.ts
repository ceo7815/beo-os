import { todayYmd } from './dates'
import { addMonths, compareYm } from './financeMonthRange'

/**
 * נעילת תקופה.
 *
 * חודש נסגר בתאריך דיווח המע״מ — ה-19 בחודש העוקב. הנעילה מונעת עריכה
 * למפרע ומסמנת מסמכים מאחרים, אבל חודש הרווח וההפסד נקבע תמיד לפי
 * תאריך החשבונית (צבירה) — לא לפי מועד התשלום ולא לפי «החודש הפתוח».
 */
export const VAT_REPORT_DAY = 19

export function monthLockDate(ym: string): string {
  return `${addMonths(ym.slice(0, 7), 1)}-${String(VAT_REPORT_DAY).padStart(2, '0')}`
}

export function isMonthLocked(ym: string, today = todayYmd()): boolean {
  return today > monthLockDate(ym)
}

/** החודש המוקדם ביותר שעדיין פתוח לרישום */
export function openMonth(today = todayYmd()): string {
  const currentYm = today.slice(0, 7)
  const day = Number(today.slice(8, 10))
  return day > VAT_REPORT_DAY ? currentYm : addMonths(currentYm, -1)
}

export type AttributionOutcome = {
  /** החודש שבו הרשומה נספרת ברווח והפסד */
  month: string
  /** true כשהמסמך הגיע אחרי שהחודש שלו כבר נדווח */
  late: boolean
  /** החודש שאליו המסמך שייך כלכלית — נשמר לתיעוד גם כשהוא נעול */
  documentMonth: string
}

/**
 * קובע לאיזה חודש רשומה נכנסת ברווח והפסד — תמיד חודש תאריך החשבונית.
 * אם החודש כבר ננעל למע״מ, הרשומה עדיין נספרת שם ומסומנת כמאחרת.
 */
export function resolveAttributionMonth(
  documentDateYmd: string,
  today = todayYmd(),
): AttributionOutcome {
  const documentMonth = documentDateYmd.slice(0, 7)
  const late = isMonthLocked(documentMonth, today)
  return { month: documentMonth, late, documentMonth }
}

/** האם מותר לערוך רשומה שמשויכת לחודש הזה */
export function canEditMonth(ym: string, today = todayYmd()): boolean {
  return !isMonthLocked(ym, today)
}

/** רשימת החודשים הנעולים מתוך טווח — לסימון בממשק */
export function lockedMonthsIn(months: string[], today = todayYmd()): Set<string> {
  return new Set(months.filter((ym) => isMonthLocked(ym, today)))
}

export function isBeforeOpenMonth(ym: string, today = todayYmd()): boolean {
  return compareYm(ym, openMonth(today)) < 0
}
