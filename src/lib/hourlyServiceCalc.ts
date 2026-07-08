import type { HourlyServiceEntry } from '../types'

/** סכום שעות מרשימת רשומות */
export function sumHours(entries: HourlyServiceEntry[]): number {
  return entries.reduce((acc, e) => acc + (e.hours || 0), 0)
}

/** סכום שעות לחיוב בלבד */
export function sumBillableHours(entries: HourlyServiceEntry[]): number {
  return entries
    .filter((e) => e.billable)
    .reduce((acc, e) => acc + (e.hours || 0), 0)
}

/** YYYY-MM מתאריך YYYY-MM-DD */
export function monthKeyFromYmd(ymd: string): string {
  return ymd.slice(0, 7)
}

/** תצוגת חודש בעברית מ־YYYY-MM */
export function formatMonthKeyHe(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  return new Date(y, m - 1, 1).toLocaleDateString('he-IL', {
    month: 'long',
    year: 'numeric',
  })
}

/** חודש נוכחי YYYY-MM */
export function currentMonthKey(): string {
  return monthKeyFromYmd(new Date().toISOString())
}

export function filterEntriesByMonth(
  entries: HourlyServiceEntry[],
  monthKey: string,
): HourlyServiceEntry[] {
  return entries.filter((e) => monthKeyFromYmd(e.workDate) === monthKey)
}

export function filterEntriesByService(
  entries: HourlyServiceEntry[],
  serviceId: string,
): HourlyServiceEntry[] {
  return entries.filter((e) => e.serviceId === serviceId)
}

/** אחוז ניצול חבילת שעות */
export function hoursPackagePercent(
  usedHours: number,
  packageTotal: number,
): number | null {
  if (packageTotal <= 0) return null
  return Math.round((usedHours / packageTotal) * 100)
}

/** שעות שנותרו בחבילה */
export function hoursRemaining(
  packageTotal: number,
  usedHours: number,
): number {
  return Math.round((packageTotal - usedHours) * 100) / 100
}

/** @deprecated — שם ישן */
export function hoursBudgetPercent(
  usedHours: number,
  budgetHours?: number,
): number | null {
  if (budgetHours == null || budgetHours <= 0) return null
  return hoursPackagePercent(usedHours, budgetHours)
}

/** חישוב שעות מטווח HH:mm (אותו יום) */
export function hoursFromTimeRange(start: string, end: string): number | null {
  const parse = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
    if (!m) return null
    const h = Number(m[1])
    const min = Number(m[2])
    if (h < 0 || h > 23 || min < 0 || min > 59) return null
    return h * 60 + min
  }
  const s = parse(start)
  const e = parse(end)
  if (s == null || e == null || e <= s) return null
  return Math.round(((e - s) / 60) * 100) / 100
}

export function parseFreeHoursInput(raw: string): number | null {
  const t = raw.trim().replace(',', '.')
  if (!t) return null
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(t)
  if (timeMatch) {
    const h = Number(timeMatch[1])
    const m = Number(timeMatch[2])
    if (m < 0 || m >= 60) return null
    const total = h + m / 60
    return total > 0 ? Math.round(total * 100) / 100 : null
  }
  const n = Number.parseFloat(t)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

/**
 * שדה חופשי בדקות: מספר שלם = דקות (20, 1000),
 * עשרוני = שעות (1.5), 1:30 = שעה וחצי.
 */
export function parseFreeMinutesInput(raw: string): number | null {
  const t = raw.trim().replace(',', '.')
  if (!t) return null
  const timeMatch = /^(\d{1,3}):(\d{2})$/.exec(t)
  if (timeMatch) {
    const h = Number(timeMatch[1])
    const m = Number(timeMatch[2])
    if (m < 0 || m >= 60) return null
    const total = h + m / 60
    return total > 0 ? Math.round(total * 100) / 100 : null
  }
  if (/^\d+$/.test(t)) {
    const minutes = Number.parseInt(t, 10)
    if (minutes <= 0) return null
    return Math.round((minutes / 60) * 100) / 100
  }
  const n = Number.parseFloat(t)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

/** תצוגת דקות בשדה החופשי לפי ערך שעות שמור */
export function hoursToFreeMinutesDisplay(hours: number): string {
  return String(Math.round(hours * 60))
}

export function formatHours(h: number): string {
  if (!Number.isFinite(h)) return '0'
  const rounded = Math.round(h * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

/** דקות שלמות משעות */
export function hoursToMinutes(h: number): number {
  if (!Number.isFinite(h)) return 0
  return Math.round(h * 60)
}

/** תצוגה משולבת: שעות + דקות */
export function formatHoursWithMinutes(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return '0 שע׳ (0 דק׳)'
  return `${formatHours(h)} שע׳ (${hoursToMinutes(h)} דק׳)`
}

export function amountFromHours(hours: number, rate?: number): number | null {
  if (rate == null || !Number.isFinite(rate)) return null
  return Math.round(hours * rate * 100) / 100
}
