import { useCallback, useEffect, useState } from 'react'
import {
  buildDayDetailsFromEntries,
  findClockifyUserIdByEmail,
  getAllUsersReport,
  getUserTimeEntries,
  getWorkspaceProjectsMap,
  getWorkspaceUsers,
  normalizeClockifyEmail,
  projectHoursFromEntries,
  type AllUsersReportRow,
  type ClockifyTimeEntry,
  getActiveTimer,
  weekDailyHours,
} from '../lib/clockifyService'
import { todayYmd, weekStartSundayYmd, ymdFirstOfMonth } from '../lib/dates'
import type { TeamMember } from '../types'

export type MergedAdminAttendanceRow = {
  member: TeamMember
  clockifyUserId: string | null
  hoursToday: number
  hoursWeek: number
  hoursMonth: number
  hoursInRange: number
  active: boolean
}

export function mergeAdminAttendance(users: TeamMember[], report: AllUsersReportRow[]): MergedAdminAttendanceRow[] {
  return users
    .filter((m) => m.active !== false)
    .map((member) => {
      const em = normalizeClockifyEmail(member.email)
      const hit = em ? report.find((r) => normalizeClockifyEmail(r.email) === em) : undefined
      return {
        member,
        clockifyUserId: hit?.clockifyUserId ?? null,
        hoursToday: hit?.hoursToday ?? 0,
        hoursWeek: hit?.hoursWeek ?? 0,
        hoursMonth: hit?.hoursMonth ?? 0,
        hoursInRange: hit?.hoursInRange ?? 0,
        active: hit?.active ?? false,
      }
    })
    .sort((a, b) => a.member.name.localeCompare(b.member.name, 'he'))
}

export function useClockifyAdminAttendance(opts: {
  workspaceId: string
  enabled: boolean
  filterStart: string
  filterEnd: string
}) {
  const { workspaceId, enabled, filterStart, filterEnd } = opts
  const [report, setReport] = useState<AllUsersReportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!enabled || !workspaceId.trim()) {
      setReport([])
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const r = await getAllUsersReport(workspaceId.trim(), filterStart, filterEnd)
      setReport(r)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setReport([])
    } finally {
      setLoading(false)
    }
  }, [workspaceId, enabled, filterStart, filterEnd])

  useEffect(() => {
    void load()
  }, [load])

  return { report, loading, error, refresh: load }
}

export type EmployeeAttendanceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'no_workspace' }
  | { status: 'no_clockify_user' }
  | { status: 'error'; message: string }
  | {
      status: 'ok'
      monthHours: number
      weekBars: ReturnType<typeof weekDailyHours>
      dayDetails: ReturnType<typeof buildDayDetailsFromEntries>
      projectRows: Array<{ name: string; hours: number }>
      active: boolean
      entries: ClockifyTimeEntry[]
    }

export function useClockifyEmployeeAttendance(opts: {
  workspaceId: string
  userEmail: string
  enabled: boolean
}) {
  const { workspaceId, userEmail, enabled } = opts
  const [state, setState] = useState<EmployeeAttendanceState>({ status: 'idle' })

  const load = useCallback(async () => {
    if (!enabled) {
      setState({ status: 'idle' })
      return
    }
    if (!workspaceId.trim()) {
      setState({ status: 'no_workspace' })
      return
    }
    const email = userEmail.trim()
    if (!email) {
      setState({ status: 'no_clockify_user' })
      return
    }
    setState({ status: 'loading' })
    try {
      const ws = workspaceId.trim()
      const cUsers = await getWorkspaceUsers(ws)
      const uid = findClockifyUserIdByEmail(cUsers, email)
      if (!uid) {
        setState({ status: 'no_clockify_user' })
        return
      }
      const today = todayYmd()
      const weekStart = weekStartSundayYmd(today)
      const monthStart = ymdFirstOfMonth(today)
      const fetchStart = weekStart < monthStart ? weekStart : monthStart

      const [entries, projectMap, activeEntry] = await Promise.all([
        getUserTimeEntries(ws, uid, fetchStart, today),
        getWorkspaceProjectsMap(ws),
        getActiveTimer(ws, uid),
      ])

      const mStartMs = new Date(`${monthStart}T00:00:00`).getTime()
      const mEndMs = new Date(`${today}T23:59:59.999`).getTime()
      let monthHours = 0
      for (const e of entries) {
        const s = new Date(e.timeInterval.start).getTime()
        const endRaw =
          e.timeInterval.end != null && String(e.timeInterval.end).trim() !== ''
            ? new Date(String(e.timeInterval.end)).getTime()
            : Date.now()
        const en = Number.isFinite(endRaw) ? endRaw : Date.now()
        const a = Math.max(s, mStartMs)
        const b = Math.min(en, mEndMs)
        if (b > a) monthHours += (b - a) / 3600000
      }

      const weekBars = weekDailyHours(entries, weekStart)
      const dayDetails = buildDayDetailsFromEntries(entries, projectMap, monthStart, today).filter(
        (d) => d.totalHours > 0.001 || d.entries.length > 0,
      )
      const projectRows = projectHoursFromEntries(entries, projectMap)

      setState({
        status: 'ok',
        monthHours,
        weekBars,
        dayDetails,
        projectRows,
        active: activeEntry != null,
        entries,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setState({ status: 'error', message: msg })
    }
  }, [workspaceId, userEmail, enabled])

  useEffect(() => {
    void load()
  }, [load])

  return { state, refresh: load }
}

export function useClockifyUserDetail(opts: {
  workspaceId: string
  clockifyUserId: string | null
  filterStart: string
  filterEnd: string
  open: boolean
}) {
  const { workspaceId, clockifyUserId, filterStart, filterEnd, open } = opts
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState<ReturnType<typeof buildDayDetailsFromEntries>>([])

  const load = useCallback(async () => {
    if (!open || !clockifyUserId || !workspaceId.trim()) {
      setDays([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const ws = workspaceId.trim()
      const [entries, projectMap] = await Promise.all([
        getUserTimeEntries(ws, clockifyUserId, filterStart, filterEnd),
        getWorkspaceProjectsMap(ws),
      ])
      setDays(buildDayDetailsFromEntries(entries, projectMap, filterStart, filterEnd))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setDays([])
    } finally {
      setLoading(false)
    }
  }, [workspaceId, clockifyUserId, filterStart, filterEnd, open])

  useEffect(() => {
    void load()
  }, [load])

  return { days, loading, error, refresh: load }
}
