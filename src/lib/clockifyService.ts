import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functionsClient } from './firebase'
import { formatFirebaseErrorDetail } from './formatFirebaseError'
import {
  addDaysYmd,
  endOfDayMsFromYmd,
  startOfDayMsFromYmd,
  todayYmd,
  weekStartSundayYmd,
  ymdFirstOfMonth,
} from './dates'
import type { ClockifyIntegrationConfig, ClockifyPublicSettings } from '../types'

/** ברירת מחדל Clockify — לשמירה ב-Firestore (אופציונלי) */
export const CLOCKIFY_API_V1_DEFAULT = 'https://api.clockify.me/api/v1'

const CLOCKIFY_DOC = () => doc(db, 'attendanceConfig', 'clockify')
const SETTINGS_DOC = () => doc(db, 'attendanceConfig', 'settings')

/** Callable Gen2 — `httpsCallable` בלבד (לא fetch ישיר ל-URL). */
const clockifyProxyCallable = httpsCallable<
  { path: string; params?: Record<string, string> },
  { status: number; body: unknown }
>(functionsClient, 'clockifyProxy')

export function parseClockifyConfig(data: Record<string, unknown> | undefined): ClockifyIntegrationConfig {
  if (!data) return {}
  return {
    apiKey: typeof data.apiKey === 'string' ? data.apiKey : '',
    workspaceId: typeof data.workspaceId === 'string' ? data.workspaceId : '',
    apiBaseUrl: typeof data.apiBaseUrl === 'string' && data.apiBaseUrl.trim() ? data.apiBaseUrl.trim() : undefined,
  }
}

export function parseClockifyPublicSettings(
  data: Record<string, unknown> | undefined,
): ClockifyPublicSettings {
  if (!data) return {}
  return {
    workspaceId: typeof data.workspaceId === 'string' ? data.workspaceId : '',
  }
}

export async function saveClockifyConfigToFirestore(input: {
  apiKey: string
  workspaceId: string
  apiBaseUrl?: string
}): Promise<void> {
  const apiKey = input.apiKey.trim()
  const workspaceId = input.workspaceId.trim()
  const patch: Record<string, unknown> = {
    apiKey,
    workspaceId,
    updatedAt: serverTimestamp(),
  }
  if (input.apiBaseUrl?.trim()) {
    patch.apiBaseUrl = input.apiBaseUrl.trim()
  }
  await setDoc(CLOCKIFY_DOC(), patch, { merge: true })
  await setDoc(
    SETTINGS_DOC(),
    {
      workspaceId,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export function normalizeClockifyEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}

function clockifyCallableError(err: unknown): Error {
  const detail = formatFirebaseErrorDetail(err)
  return new Error(detail.trim() || 'שגיאה בקריאה ל-Clockify')
}

/** תגובת Clockify דרך Cloud Function (Gen2 Callable + httpsCallable) */
export async function clockifyProxyGet(path: string, params?: Record<string, string>): Promise<unknown> {
  try {
    const res = await clockifyProxyCallable({ path: path.replace(/^\/+/, ''), params })
    return res.data.body
  } catch (err) {
    throw clockifyCallableError(err)
  }
}

async function clockifyProxyWithStatus(
  path: string,
  params?: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  try {
    const res = await clockifyProxyCallable({ path: path.replace(/^\/+/, ''), params })
    return res.data
  } catch (err) {
    throw clockifyCallableError(err)
  }
}

/** בדיקת חיבור — משיכת רשימת משתמשי workspace (אדמין) */
export async function testClockifyConnection(workspaceId: string): Promise<{
  userCount: number
  sampleEmails: string[]
}> {
  const users = await getWorkspaceUsers(workspaceId.trim())
  return {
    userCount: users.length,
    sampleEmails: users.slice(0, 5).map((u) => u.email).filter(Boolean),
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const results = new Array<R>(items.length)
  let nextIndex = 0
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++
      results[i] = await fn(items[i]!)
    }
  }
  const workers = Math.min(Math.max(1, concurrency), items.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}

export interface ClockifyWorkspaceUser {
  id: string
  email: string
  name: string
  status?: string
}

export interface ClockifyTimeInterval {
  start: string
  end?: string | null
}

export interface ClockifyTimeEntry {
  id: string
  description?: string
  userId?: string
  projectId?: string | null
  projectName?: string | null
  timeInterval: ClockifyTimeInterval
}

export interface ClockifyProject {
  id: string
  name: string
}

function isoLocalStart(ymd: string): string {
  return new Date(startOfDayMsFromYmd(ymd)).toISOString()
}

function isoLocalEnd(ymd: string): string {
  return new Date(endOfDayMsFromYmd(ymd)).toISOString()
}

function hoursOverlapRange(entry: ClockifyTimeEntry, rangeStartMs: number, rangeEndMs: number, nowMs: number): number {
  const ti = entry.timeInterval
  if (!ti?.start) return 0
  const s = new Date(ti.start).getTime()
  const endRaw = ti.end != null && String(ti.end).trim() !== '' ? new Date(String(ti.end)).getTime() : nowMs
  const e = Number.isFinite(endRaw) ? endRaw : nowMs
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0
  const a = Math.max(s, rangeStartMs)
  const b = Math.min(e, rangeEndMs)
  if (b <= a) return 0
  return (b - a) / 3600000
}

export function formatHoursShort(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return '0'
  if (h < 10) return h.toFixed(1)
  return String(Math.round(h * 10) / 10)
}

export async function getWorkspaceUsers(workspaceId: string): Promise<ClockifyWorkspaceUser[]> {
  const body = await clockifyProxyGet(`workspaces/${workspaceId}/users`, {
    page: '1',
    'page-size': '500',
  })
  if (!Array.isArray(body)) return []
  return body
    .map((u) => {
      const o = u as Record<string, unknown>
      const id = typeof o.id === 'string' ? o.id : ''
      const email = typeof o.email === 'string' ? o.email : ''
      const name = typeof o.name === 'string' ? o.name : email || id
      return { id, email, name, status: typeof o.status === 'string' ? o.status : undefined }
    })
    .filter((u) => u.id)
}

export function findClockifyUserIdByEmail(
  clockifyUsers: ClockifyWorkspaceUser[],
  firebaseEmail: string,
): string | null {
  const want = normalizeClockifyEmail(firebaseEmail)
  if (!want) return null
  const hit = clockifyUsers.find((u) => normalizeClockifyEmail(u.email) === want)
  return hit?.id ?? null
}

async function fetchTimeEntriesPage(
  workspaceId: string,
  userId: string,
  startIso: string,
  endIso: string,
  page: number,
): Promise<ClockifyTimeEntry[]> {
  const body = await clockifyProxyGet(`workspaces/${workspaceId}/user/${userId}/time-entries`, {
    start: startIso,
    end: endIso,
    page: String(page),
    'page-size': '1000',
  })
  if (!Array.isArray(body)) return []
  return body as ClockifyTimeEntry[]
}

/** רשומות זמן בטווח תאריכים (YYYY-MM-DD) — שעות מקומיות */
export async function getUserTimeEntries(
  workspaceId: string,
  userId: string,
  startYmd: string,
  endYmd: string,
): Promise<ClockifyTimeEntry[]> {
  const startIso = isoLocalStart(startYmd)
  const endIso = isoLocalEnd(endYmd)
  const all: ClockifyTimeEntry[] = []
  for (let page = 1; page <= 50; page++) {
    const batch = await fetchTimeEntriesPage(workspaceId, userId, startIso, endIso, page)
    if (batch.length === 0) break
    all.push(...batch)
    if (batch.length < 1000) break
  }
  return all
}

export interface UserHoursSummary {
  hoursToday: number
  hoursWeek: number
  hoursMonth: number
}

export async function getUserSummary(
  workspaceId: string,
  userId: string,
  nowMs: number = Date.now(),
): Promise<UserHoursSummary> {
  const today = todayYmd()
  const weekStart = weekStartSundayYmd(today)
  const monthStart = ymdFirstOfMonth(today)
  const startYmd = monthStart < weekStart ? monthStart : weekStart
  const entries = await getUserTimeEntries(workspaceId, userId, startYmd, today)

  const dayStart = startOfDayMsFromYmd(today)
  const dayEnd = endOfDayMsFromYmd(today)
  const wStart = startOfDayMsFromYmd(weekStart)
  const wEnd = endOfDayMsFromYmd(today)
  const mStart = startOfDayMsFromYmd(monthStart)
  const mEnd = endOfDayMsFromYmd(today)

  let hoursToday = 0
  let hoursWeek = 0
  let hoursMonth = 0
  for (const e of entries) {
    hoursToday += hoursOverlapRange(e, dayStart, dayEnd, nowMs)
    hoursWeek += hoursOverlapRange(e, wStart, wEnd, nowMs)
    hoursMonth += hoursOverlapRange(e, mStart, mEnd, nowMs)
  }
  return { hoursToday, hoursWeek, hoursMonth }
}

export async function getActiveTimer(
  workspaceId: string,
  userId: string,
): Promise<ClockifyTimeEntry | null> {
  const { status, body } = await clockifyProxyWithStatus(
    `workspaces/${workspaceId}/user/${userId}/time-entries/in-progress`,
  )
  if (status === 404 || body == null) return null
  if (typeof body === 'object' && body && 'timeInterval' in body) {
    return body as ClockifyTimeEntry
  }
  return null
}

export interface AllUsersReportRow {
  clockifyUserId: string
  name: string
  email: string
  hoursInRange: number
  hoursToday: number
  hoursWeek: number
  hoursMonth: number
  active: boolean
}

export async function getAllUsersReport(
  workspaceId: string,
  startYmd: string,
  endYmd: string,
  nowMs: number = Date.now(),
): Promise<AllUsersReportRow[]> {
  const users = await getWorkspaceUsers(workspaceId)
  const today = todayYmd()
  const weekStart = weekStartSundayYmd(today)
  const monthStart = ymdFirstOfMonth(today)
  const fetchStart = [startYmd, weekStart, monthStart].sort()[0]
  const fetchEnd = endYmd > today ? endYmd : today

  const dayStart = startOfDayMsFromYmd(today)
  const dayEnd = endOfDayMsFromYmd(today)
  const wStart = startOfDayMsFromYmd(weekStart)
  const wEnd = endOfDayMsFromYmd(today)
  const mStart = startOfDayMsFromYmd(monthStart)
  const mEnd = endOfDayMsFromYmd(today)
  const rangeStart = startOfDayMsFromYmd(startYmd)
  const rangeEnd = endOfDayMsFromYmd(endYmd)

  const rows = await mapWithConcurrency(users, 4, async (u) => {
    if (!u.id) return null
    try {
      const [entries, activeEntry] = await Promise.all([
        getUserTimeEntries(workspaceId, u.id, fetchStart, fetchEnd),
        getActiveTimer(workspaceId, u.id),
      ])
      let hoursInRange = 0
      let hoursToday = 0
      let hoursWeek = 0
      let hoursMonth = 0
      for (const e of entries) {
        hoursInRange += hoursOverlapRange(e, rangeStart, rangeEnd, nowMs)
        hoursToday += hoursOverlapRange(e, dayStart, dayEnd, nowMs)
        hoursWeek += hoursOverlapRange(e, wStart, wEnd, nowMs)
        hoursMonth += hoursOverlapRange(e, mStart, mEnd, nowMs)
      }
      return {
        clockifyUserId: u.id,
        name: u.name,
        email: u.email,
        hoursInRange,
        hoursToday,
        hoursWeek,
        hoursMonth,
        active: activeEntry != null,
      }
    } catch (err) {
      console.warn('[clockify] דילוג על משתמש בגלל שגיאה', u.email, err)
      return {
        clockifyUserId: u.id,
        name: u.name,
        email: u.email,
        hoursInRange: 0,
        hoursToday: 0,
        hoursWeek: 0,
        hoursMonth: 0,
        active: false,
      }
    }
  })
  return rows
    .filter((r): r is AllUsersReportRow => r != null)
    .sort((a, b) => a.name.localeCompare(b.name, 'he'))
}

export async function getWorkspaceProjectsMap(workspaceId: string): Promise<Map<string, string>> {
  const body = await clockifyProxyGet(`workspaces/${workspaceId}/projects`, {
    page: '1',
    'page-size': '500',
  })
  const map = new Map<string, string>()
  if (!Array.isArray(body)) return map
  for (const p of body) {
    const o = p as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : ''
    const name = typeof o.name === 'string' ? o.name : id
    if (id) map.set(id, name)
  }
  return map
}

export interface DayAttendanceDetail {
  ymd: string
  totalHours: number
  entries: Array<{
    id: string
    start: string
    end: string | null
    projectName: string
    hours: number
  }>
}

function entryHoursOnDay(entry: ClockifyTimeEntry, ymd: string, nowMs: number): number {
  const ti = entry.timeInterval
  if (!ti?.start) return 0
  const dayStart = startOfDayMsFromYmd(ymd)
  const dayEnd = endOfDayMsFromYmd(ymd)
  return hoursOverlapRange(entry, dayStart, dayEnd, nowMs)
}

export function buildDayDetailsFromEntries(
  entries: ClockifyTimeEntry[],
  projectMap: Map<string, string>,
  startYmd: string,
  endYmd: string,
  nowMs: number = Date.now(),
): DayAttendanceDetail[] {
  const out: DayAttendanceDetail[] = []
  let y = startYmd
  const sorted = [...entries].sort(
    (a, b) => new Date(a.timeInterval.start).getTime() - new Date(b.timeInterval.start).getTime(),
  )
  while (y <= endYmd) {
    const dayEntries: DayAttendanceDetail['entries'] = []
    let total = 0
    for (const e of sorted) {
      const h = entryHoursOnDay(e, y, nowMs)
      if (h <= 0) continue
      total += h
      const pid = e.projectId ?? ''
      const projectName =
        (e.projectName && String(e.projectName)) || (pid ? projectMap.get(pid) ?? 'ללא פרויקט' : 'ללא פרויקט')
      const startMs = new Date(e.timeInterval.start).getTime()
      const endMs =
        e.timeInterval.end != null && String(e.timeInterval.end).trim() !== ''
          ? new Date(String(e.timeInterval.end)).getTime()
          : nowMs
      const dayStart = startOfDayMsFromYmd(y)
      const dayEnd = endOfDayMsFromYmd(y)
      const clipStart = Math.max(startMs, dayStart)
      const clipEnd = Math.min(endMs, dayEnd)
      dayEntries.push({
        id: e.id,
        start: new Date(clipStart).toISOString(),
        end: clipEnd >= dayEnd ? null : new Date(clipEnd).toISOString(),
        projectName,
        hours: h,
      })
    }
    out.push({ ymd: y, totalHours: total, entries: dayEntries })
    y = addDaysYmd(y, 1)
  }
  return out.reverse()
}

export interface WeekBarPoint {
  ymd: string
  hours: number
}

export function weekDailyHours(
  entries: ClockifyTimeEntry[],
  weekStartYmd: string,
  nowMs: number = Date.now(),
): WeekBarPoint[] {
  const pts: WeekBarPoint[] = []
  for (let i = 0; i < 7; i++) {
    const ymd = addDaysYmd(weekStartYmd, i)
    let h = 0
    for (const e of entries) {
      h += entryHoursOnDay(e, ymd, nowMs)
    }
    pts.push({ ymd, hours: h })
  }
  return pts
}

export function projectHoursFromEntries(
  entries: ClockifyTimeEntry[],
  projectMap: Map<string, string>,
  nowMs: number = Date.now(),
): Array<{ name: string; hours: number }> {
  const map = new Map<string, number>()
  const rangeStart = 0
  const rangeEnd = nowMs + 1
  for (const e of entries) {
    const pid = e.projectId ?? ''
    const name =
      (e.projectName && String(e.projectName)) || (pid ? projectMap.get(pid) ?? 'ללא פרויקט' : 'ללא פרויקט')
    const h = hoursOverlapRange(e, rangeStart, rangeEnd, nowMs)
    if (h <= 0) continue
    map.set(name, (map.get(name) ?? 0) + h)
  }
  return [...map.entries()]
    .map(([name, hours]) => ({ name, hours }))
    .sort((a, b) => b.hours - a.hours)
}
