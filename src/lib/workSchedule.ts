import type { AttendanceLog } from '../types'
import { minutesOverlappingCalendarDay } from './dates'

/** סבלנות כניסה אחרי שעת התחלה המוגדרת (דקות) */
export const SCHEDULE_ENTRY_GRACE_MINUTES = 7
/** סבלנות יציאה לפני שעת הסיום (דקות) — יציאה עד X דק׳ לפני הסיום עדיין נחשבת מוקדמת */
export const SCHEDULE_EXIT_EARLY_GRACE_MINUTES = 1

export type UserDaySchedule = {
  dayStart: string
  dayEnd: string
  breakMinutes: number
}

export type SchedulePunchKind = 'ok' | 'late' | 'early' | 'open' | 'unknown' | 'na'

export type DayScheduleCompliance = {
  hasSchedule: boolean
  /** דקות עבודה נטו צפויות: מקטע היום פחות הפסקה */
  expectedNetMinutes: number
  firstStartIso: string | null
  /** כשנכנסה דרך משמרת שפתחה יום קודם */
  entryContinuedFromPriorDay: boolean
  lastEndIso: string | null
  openSession: boolean
  entry: SchedulePunchKind
  exit: SchedulePunchKind
  entryLateMinutes?: number
  exitEarlyMinutes?: number
}

/** YYYY-MM-DD מקומי מתאריך ISO */
export function isoToLocalYmd(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function minutesSinceLocalMidnight(iso: string): number {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return NaN
  return d.getHours() * 60 + d.getMinutes()
}

/** מחרוזת HH:mm (כמו מ־input type=time) לדקות מהחצות */
export function parseHmToMinutes(hm: string | null | undefined): number | null {
  if (hm == null || typeof hm !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim())
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h > 23 || mi > 59) return null
  return h * 60 + mi
}

export function formatMinutesAsHm(totalMin: number): string {
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function firstStartOnDay(logs: AttendanceLog[], uid: string, ymd: string) {
  const sameDay = logs
    .filter((l) => l.userId === uid && isoToLocalYmd(l.startAt) === ymd)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
  if (sameDay.length > 0) {
    return { startAt: sameDay[0].startAt, continued: false as const }
  }
  const overlapPrior = logs.some(
    (l) =>
      l.userId === uid &&
      isoToLocalYmd(l.startAt) !== ymd &&
      minutesOverlappingCalendarDay(l.startAt, l.endAt, ymd) > 0,
  )
  if (overlapPrior) return { startAt: null as string | null, continued: true as const }
  return { startAt: null as string | null, continued: false as const }
}

/** הלוג נוגע ביום הקלנדרי — גם כשאין חפיפת דקות (למשל משמרת פתוחה או endAt שבור) */
function logTouchesCalendarDay(
  l: AttendanceLog,
  ymd: string,
  nowMs: number,
): boolean {
  if (minutesOverlappingCalendarDay(l.startAt, l.endAt, ymd, nowMs) > 0) return true
  if (isoToLocalYmd(l.startAt) === ymd) return true
  if (l.endAt && String(l.endAt).trim() && isoToLocalYmd(l.endAt) === ymd) return true
  return false
}

function lastEndOnDay(logs: AttendanceLog[], uid: string, ymd: string, nowMs: number) {
  let openSession = false
  let bestTs = 0
  let bestIso: string | null = null
  for (const l of logs) {
    if (l.userId !== uid) continue
    if (!logTouchesCalendarDay(l, ymd, nowMs)) continue
    const endRaw = l.endAt
    const endTs = endRaw ? new Date(endRaw).getTime() : NaN
    const hasValidEnd = Boolean(endRaw && String(endRaw).trim() && Number.isFinite(endTs))
    if (!hasValidEnd) {
      openSession = true
      continue
    }
    if (endTs > bestTs) {
      bestTs = endTs
      bestIso = endRaw!
    }
  }
  return { endAt: bestIso, openSession }
}

/** זמני כניסה/יציאה לפי לוגים ביום קלנדרי (בלי תלות במועד משרד מוגדר) */
export function getDayPunchSummary(
  logs: AttendanceLog[],
  uid: string,
  ymd: string,
  nowMs: number = Date.now(),
): {
  firstStartIso: string | null
  continuedFromPriorDay: boolean
  lastEndIso: string | null
  openSession: boolean
} {
  const fs = firstStartOnDay(logs, uid, ymd)
  const le = lastEndOnDay(logs, uid, ymd, nowMs)
  return {
    firstStartIso: fs.startAt,
    continuedFromPriorDay: fs.continued,
    lastEndIso: le.endAt,
    openSession: le.openSession,
  }
}

export function computeDayScheduleCompliance(
  logs: AttendanceLog[],
  uid: string,
  ymd: string,
  schedule: UserDaySchedule | null | undefined,
  nowMs: number = Date.now(),
): DayScheduleCompliance {
  if (!schedule?.dayStart?.trim() || !schedule.dayEnd?.trim()) {
    return {
      hasSchedule: false,
      expectedNetMinutes: 0,
      firstStartIso: null,
      entryContinuedFromPriorDay: false,
      lastEndIso: null,
      openSession: false,
      entry: 'na',
      exit: 'na',
    }
  }

  const startMin = parseHmToMinutes(schedule.dayStart)
  const endMin = parseHmToMinutes(schedule.dayEnd)
  const br = typeof schedule.breakMinutes === 'number' && Number.isFinite(schedule.breakMinutes) ? schedule.breakMinutes : 0
  if (startMin == null || endMin == null || endMin <= startMin) {
    return {
      hasSchedule: false,
      expectedNetMinutes: 0,
      firstStartIso: null,
      entryContinuedFromPriorDay: false,
      lastEndIso: null,
      openSession: false,
      entry: 'na',
      exit: 'na',
    }
  }

  const expectedNetMinutes = Math.max(0, endMin - startMin - Math.max(0, br))

  const { startAt: firstStartIso, continued: entryContinuedFromPriorDay } = firstStartOnDay(logs, uid, ymd)
  const { endAt: lastEndIso, openSession } = lastEndOnDay(logs, uid, ymd, nowMs)

  let entry: SchedulePunchKind = 'unknown'
  let entryLateMinutes: number | undefined
  if (entryContinuedFromPriorDay) {
    entry = 'na'
  } else if (!firstStartIso) {
    entry = logs.some(
      (l) => l.userId === uid && minutesOverlappingCalendarDay(l.startAt, l.endAt, ymd, nowMs) > 0,
    )
      ? 'unknown'
      : 'na'
  } else {
    const actualStart = minutesSinceLocalMidnight(firstStartIso)
    if (!Number.isFinite(actualStart)) entry = 'unknown'
    else if (actualStart <= startMin + SCHEDULE_ENTRY_GRACE_MINUTES) entry = 'ok'
    else {
      entry = 'late'
      entryLateMinutes = Math.max(0, actualStart - startMin)
    }
  }

  let exit: SchedulePunchKind = 'unknown'
  let exitEarlyMinutes: number | undefined
  if (openSession) {
    exit = 'open'
  } else if (!lastEndIso) {
    exit = logs.some(
      (l) => l.userId === uid && minutesOverlappingCalendarDay(l.startAt, l.endAt, ymd, nowMs) > 0,
    )
      ? 'unknown'
      : 'na'
  } else {
    const actualEnd = minutesSinceLocalMidnight(lastEndIso)
    if (!Number.isFinite(actualEnd)) exit = 'unknown'
    else if (actualEnd >= endMin - SCHEDULE_EXIT_EARLY_GRACE_MINUTES) exit = 'ok'
    else {
      exit = 'early'
      exitEarlyMinutes = Math.max(0, endMin - actualEnd)
    }
  }

  return {
    hasSchedule: true,
    expectedNetMinutes,
    firstStartIso,
    entryContinuedFromPriorDay,
    lastEndIso,
    openSession,
    entry,
    exit,
    entryLateMinutes,
    exitEarlyMinutes,
  }
}

export function schedulePunchLabelHe(kind: SchedulePunchKind): string {
  switch (kind) {
    case 'ok':
      return 'בזמן'
    case 'late':
      return 'איחור'
    case 'early':
      return 'יציאה מוקדמת'
    case 'open':
      return 'משמרת פתוחה'
    case 'unknown':
      return 'לא נקבע'
    case 'na':
      return '—'
    default:
      return '—'
  }
}

export function teamMemberToDaySchedule(m: {
  scheduleDayStart?: string | null
  scheduleDayEnd?: string | null
  scheduleBreakMinutes?: number | null
}): UserDaySchedule | null {
  const a = m.scheduleDayStart?.trim()
  const b = m.scheduleDayEnd?.trim()
  if (!a || !b) return null
  if (parseHmToMinutes(a) == null || parseHmToMinutes(b) == null) return null
  const br =
    m.scheduleBreakMinutes != null && Number.isFinite(m.scheduleBreakMinutes)
      ? Math.max(0, m.scheduleBreakMinutes)
      : 0
  return { dayStart: a, dayEnd: b, breakMinutes: br }
}
