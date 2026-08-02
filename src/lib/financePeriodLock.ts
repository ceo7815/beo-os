import { todayYmd } from './dates'
import { addMonths, compareYm } from './financeMonthRange'

/**
 * נעילת תקופה.
 *
 * חודש נסגר בתאריך דיווח המע״מ — ה-19 בחודש העוקב. מהרגע שדווח,
 * המספרים שלו קפואים: מסמך שמגיע אחר כך אינו יכול לשנות חודש שכבר דווח
 * לרשויות, ולכן הוא נספר בחודש הפתוח ומסומן כמאחר.
 *
 * זה הפתרון לחשבוניות שמשולמות כמה ימים אחרי סוף החודש: התאריך שקובע
 * הוא תאריך המסמך, אבל רק כל עוד החודש שלו פתוח.
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
 * קובע לאיזה חודש רשומה נכנסת, לפי תאריך המסמך שלה.
 * מסמך שחודשו עדיין פתוח נספר בחודש שלו. מסמך שהגיע אחרי הנעילה
 * נספר בחודש הפתוח ומסומן — כדי שתדע שהמספר החודשי כולל פריט מאחר.
 */
export function resolveAttributionMonth(
  documentDateYmd: string,
  today = todayYmd(),
): AttributionOutcome {
  const documentMonth = documentDateYmd.slice(0, 7)
  if (!isMonthLocked(documentMonth, today)) {
    return { month: documentMonth, late: false, documentMonth }
  }
  return { month: openMonth(today), late: true, documentMonth }
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
