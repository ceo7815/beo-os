// נעילת תקופה — עותק השרת.
//
// חודש נסגר בתאריך דיווח המע״מ (ה-19 בחודש העוקב). השיוך נקבע ונשמר
// ברגע ההגשה ולא מחושב מחדש בקריאה, כי רשומה שנספרה בחודש שכבר דווח
// לרשויות חייבת להישאר בו.
//
// הלוגיקה זהה ל-src/lib/financePeriodLock.ts. בדיקת הזהות
// src/lib/__tests__/financePeriodLockParity.test.ts משווה בין השתיים
// ותיכשל אם אחת מהן תשתנה בלי השנייה.

export const VAT_REPORT_DAY = 19

function parseYm(ym: string): { y: number; m: number } | null {
  const [ys, ms] = ym.split('-')
  const y = Number(ys)
  const m = Number(ms)
  if (!y || !m || m < 1 || m > 12) return null
  return { y, m }
}

export function addMonths(ym: string, delta: number): string {
  const p = parseYm(ym)
  if (!p) return ym
  let { y, m } = p
  m += delta
  while (m > 12) {
    m -= 12
    y += 1
  }
  while (m < 1) {
    m += 12
    y -= 1
  }
  return `${y}-${String(m).padStart(2, '0')}`
}

export function monthLockDate(ym: string): string {
  return `${addMonths(ym.slice(0, 7), 1)}-${String(VAT_REPORT_DAY).padStart(2, '0')}`
}

export function isMonthLocked(ym: string, today: string): boolean {
  return today > monthLockDate(ym)
}

export function openMonth(today: string): string {
  const currentYm = today.slice(0, 7)
  const day = Number(today.slice(8, 10))
  return day > VAT_REPORT_DAY ? currentYm : addMonths(currentYm, -1)
}

export type AttributionOutcome = {
  month: string
  late: boolean
  documentMonth: string
}

export function resolveAttributionMonth(
  documentDateYmd: string,
  today: string,
): AttributionOutcome {
  const documentMonth = documentDateYmd.slice(0, 7)
  if (!isMonthLocked(documentMonth, today)) {
    return { month: documentMonth, late: false, documentMonth }
  }
  return { month: openMonth(today), late: true, documentMonth }
}
