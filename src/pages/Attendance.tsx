import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/shared/Modal'
import { useAttendance } from '../hooks/useAttendance'
import { useClients } from '../hooks/useClients'
import { useProjects } from '../hooks/useProjects'
import { useTasks } from '../hooks/useTasks'
import { useUsers } from '../hooks/useUsers'
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import {
  addDaysYmd,
  formatDateIL,
  formatDateTimeIL,
  formatWeekdayShortIL,
  minutesOverlappingCalendarDay,
  todayYmd,
  weekStartSundayYmd,
} from '../lib/dates'
import {
  SCHEDULE_ENTRY_GRACE_MINUTES,
  computeDayScheduleCompliance,
  getDayPunchSummary,
  schedulePunchLabelHe,
  teamMemberToDaySchedule,
} from '../lib/workSchedule'
import type { AttendanceCheckIn, AttendanceLog } from '../types'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { db } from '../lib/firebase'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'

const HEARTBEAT_MS = 45 * 1000
/** חלון לענות על צ'ק־אין לפני סגירת המודאל — לא לנתק את העובדת אם נעדרה רגע */
const CHECKIN_RESPONSE_WINDOW_MS = 15 * 60 * 1000

function endReasonHe(reason?: string): string {
  if (reason === 'idle_auto') return 'עצירה אוטומטית'
  if (reason === 'manual') return 'יציאה ידנית'
  return reason ? reason : '—'
}

/** לוח שנה + שעה מקומית (כמו בדוח) → מילישניות */
function localYmdAndHmToMs(ymd: string, hm: string): number {
  const [y, mo, d] = ymd.split('-').map(Number)
  const [hh, mm] = hm.split(':').map((x) => parseInt(x, 10))
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return NaN
  const dt = new Date(y, mo - 1, d, hh || 0, mm || 0, 0, 0)
  return dt.getTime()
}

function toDateTimeLocalValue(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${mo}-${day}T${h}:${mi}`
}

function dateTimeLocalToIso(v: string): string {
  const d = new Date(v)
  return d.toISOString()
}

/** צ'ק-אינים הקשורים לסשן — לפי sessionId, או לפי חלון זמן (תאימות לאחור) */
function checkInsForAttendanceLog(log: AttendanceLog, checkIns: AttendanceCheckIn[]): AttendanceCheckIn[] {
  const bySession = checkIns.filter((c) => c.sessionId === log.id)
  if (bySession.length > 0) {
    return [...bySession].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
  }
  const start = new Date(log.startAt).getTime()
  const end = log.endAt ? new Date(log.endAt).getTime() : Date.now()
  return checkIns
    .filter((c) => {
      if (c.userId !== log.userId) return false
      const t = new Date(c.createdAt).getTime()
      return t >= start && t <= end
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}

function SessionCheckInsCell({ items }: { items: AttendanceCheckIn[] }) {
  if (items.length === 0) {
    return <span className="text-[11px] text-[var(--text-light)]">אין צ׳ק־אין בסשן</span>
  }
  return (
    <ul className="max-w-[min(300px,100%)] space-y-1.5 text-[11px] leading-snug">
      {items.map((c) => (
        <li key={c.id} className="rounded-md bg-[#F8FAFC] px-2 py-1.5">
          <div className="font-semibold text-[var(--text-dark)]">{formatDateTimeIL(c.createdAt)}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px]">
            {c.isLate ? <span className="font-medium text-[var(--danger)]">מאוחר</span> : null}
            {c.suspiciousFast ? <span className="font-medium text-[#B45309]">מענה מהיר</span> : null}
          </div>
          <p className="mt-1 line-clamp-3 text-[var(--text-mid)]">{c.text}</p>
        </li>
      ))}
    </ul>
  )
}

export function Attendance() {
  const { user } = useAuth()
  const { users } = useUsers()
  const { clients } = useClients()
  const { projects } = useProjects()
  const { tasks } = useTasks()
  const {
    presences,
    myPresence,
    startShift,
    stopShift,
    heartbeat,
    submitProgressCheckIn,
    logs,
    anomalies,
    checkIns,
  } = useAttendance()
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [checkInText, setCheckInText] = useState('')
  const [checkInError, setCheckInError] = useState('')
  const [responseMs, setResponseMs] = useState(0)
  const [countdownMs, setCountdownMs] = useState(0)
  const [projectId, setProjectId] = useState('')
  const [taskId, setTaskId] = useState('')
  const [workNote, setWorkNote] = useState('')
  const promptOpenedAtRef = useRef<number | null>(null)

  const [manualUserId, setManualUserId] = useState('')
  const [manualStartHm, setManualStartHm] = useState('09:00')
  const [manualEndHm, setManualEndHm] = useState('17:00')
  const [manualProjectId, setManualProjectId] = useState('')
  const [manualNote, setManualNote] = useState('')
  const [manualSaving, setManualSaving] = useState(false)

  const [editLog, setEditLog] = useState<AttendanceLog | null>(null)
  const [editStartLocal, setEditStartLocal] = useState('')
  const [editEndLocal, setEditEndLocal] = useState('')
  const [editProjectId, setEditProjectId] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const myRole = users.find((u) => u.id === user?.uid)?.role ?? 'employee'
  const isManager = myRole === 'admin' || myRole === 'superadmin'

  const [reportDayYmd, setReportDayYmd] = useState(() => todayYmd())
  const [adminFilterUserId, setAdminFilterUserId] = useState('')

  const weekDays = useMemo(() => {
    const start = weekStartSundayYmd(reportDayYmd)
    return Array.from({ length: 7 }, (_, i) => addDaysYmd(start, i))
  }, [reportDayYmd])

  const realToday = todayYmd()

  const userNameById = useMemo(() => {
    const m = new Map<string, string>()
    users.forEach((u) => m.set(u.id, u.name))
    return m
  }, [users])

  const projectById = useMemo(() => {
    const m = new Map<string, string>()
    projects.forEach((p) => m.set(p.id, p.name))
    return m
  }, [projects])

  const clientById = useMemo(() => {
    const m = new Map<string, string>()
    clients.forEach((c) => m.set(c.id, c.name))
    return m
  }, [clients])

  const openEditAttendanceLog = useCallback((l: AttendanceLog) => {
    setEditLog(l)
    setEditStartLocal(toDateTimeLocalValue(l.startAt))
    setEditEndLocal(l.endAt ? toDateTimeLocalValue(l.endAt) : toDateTimeLocalValue(new Date().toISOString()))
    setEditProjectId(l.projectId ?? '')
    setEditNote(l.note ?? '')
  }, [])

  const saveManualShift = useCallback(async () => {
    if (!user || !isManager) return
    if (!manualUserId.trim()) {
      toastFsError('יש לבחור עובד', new Error('validation'))
      return
    }
    const startMs = localYmdAndHmToMs(reportDayYmd, manualStartHm)
    const endMs = localYmdAndHmToMs(reportDayYmd, manualEndHm)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      toastFsError('שעת סיום חייבת להיות אחרי שעת ההתחלה', new Error('validation'))
      return
    }
    setManualSaving(true)
    try {
      await addDoc(collection(db, 'attendanceLogs'), {
        userId: manualUserId.trim(),
        startAt: Timestamp.fromMillis(startMs),
        endAt: Timestamp.fromMillis(endMs),
        endReason: 'manual',
        ...(manualProjectId.trim() ? { projectId: manualProjectId.trim() } : {}),
        ...(manualNote.trim() ? { note: manualNote.trim() } : {}),
        adminAdjustedAt: serverTimestamp(),
        adminAdjustedBy: user.uid,
      })
      toastFsSuccess('המשמרת נשמרה בדוח')
      setManualNote('')
    } catch (e) {
      toastFsError('שמירת משמרת נכשלה', e, 'saveManualShift')
    } finally {
      setManualSaving(false)
    }
  }, [
    user,
    isManager,
    reportDayYmd,
    manualUserId,
    manualStartHm,
    manualEndHm,
    manualProjectId,
    manualNote,
  ])

  const saveEditedLog = useCallback(async () => {
    if (!user || !isManager || !editLog) return
    if (!editStartLocal.trim() || !editEndLocal.trim()) {
      toastFsError('יש למלא תאריך ושעת התחלה וסיום', new Error('validation'))
      return
    }
    const startMs = new Date(dateTimeLocalToIso(editStartLocal)).getTime()
    const endMs = new Date(dateTimeLocalToIso(editEndLocal)).getTime()
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      toastFsError('שעת סיום חייבת להיות אחרי התחלה', new Error('validation'))
      return
    }
    setEditSaving(true)
    try {
      await updateDoc(doc(db, 'attendanceLogs', editLog.id), {
        startAt: Timestamp.fromMillis(startMs),
        endAt: Timestamp.fromMillis(endMs),
        endReason: 'manual',
        ...(editProjectId.trim() ? { projectId: editProjectId.trim() } : { projectId: deleteField() }),
        ...(editNote.trim() ? { note: editNote.trim() } : { note: deleteField() }),
        adminAdjustedAt: serverTimestamp(),
        adminAdjustedBy: user.uid,
      })
      toastFsSuccess('המשמרת עודכנה')
      setEditLog(null)
    } catch (e) {
      toastFsError('עדכון נכשל', e, 'saveEditedLog')
    } finally {
      setEditSaving(false)
    }
  }, [user, isManager, editLog, editStartLocal, editEndLocal, editProjectId, editNote])

  const deleteEditedLog = useCallback(async () => {
    if (!isManager || !editLog) return
    if (!window.confirm('למחוק את רשומת המשמרת מהדוח?')) return
    setEditSaving(true)
    try {
      await deleteDoc(doc(db, 'attendanceLogs', editLog.id))
      toastFsSuccess('הרשומה נמחקה')
      setEditLog(null)
    } catch (e) {
      toastFsError('מחיקה נכשלה', e, 'deleteEditedLog')
    } finally {
      setEditSaving(false)
    }
  }, [isManager, editLog])

  const linkHoursForEmployee = useCallback((uid: string) => {
    setAdminFilterUserId(uid)
    setManualUserId(uid)
    window.setTimeout(() => {
      document.getElementById('attendance-manual-shift')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }, [])

  useEffect(() => {
    if (!myPresence || myPresence.status !== 'active') return
    const timer = window.setInterval(() => {
      void heartbeat()
    }, HEARTBEAT_MS)
    return () => window.clearInterval(timer)
  }, [myPresence, heartbeat])

  /** כשחוזרים לטאב / למסך — heartbeat מיידי (הטיימר מתעכב ברקע) */
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === 'visible') void heartbeat()
    }
    const onFocus = () => {
      void heartbeat()
    }
    const onOnline = () => {
      void heartbeat()
    }
    document.addEventListener('visibilitychange', ping)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', ping)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
    }
  }, [myPresence?.status, heartbeat])

  useEffect(() => {
    if (!myPresence || myPresence.status !== 'active' || !myPresence.nextCheckInDueAt) {
      setCountdownMs(0)
      return
    }
    const tick = () => {
      const dueMs = new Date(myPresence.nextCheckInDueAt ?? '').getTime()
      if (!Number.isFinite(dueMs)) {
        setCountdownMs(0)
        return
      }
      const delta = dueMs - Date.now()
      setCountdownMs(Math.max(0, delta))
      if (delta <= 0 && !checkInOpen) {
        setCheckInOpen(true)
        setCheckInError('')
        setCheckInText('')
        promptOpenedAtRef.current = Date.now()
      }
      if (checkInOpen && promptOpenedAtRef.current) {
        const elapsed = Date.now() - promptOpenedAtRef.current
        setResponseMs(elapsed)
        if (elapsed > CHECKIN_RESPONSE_WINDOW_MS) {
          setCheckInOpen(false)
          promptOpenedAtRef.current = null
        }
      }
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [myPresence, checkInOpen])

  const myTodayLiveMinutes = useMemo(() => {
    if (!user) return 0
    return logs
      .filter((l) => l.userId === user.uid)
      .reduce((sum, l) => sum + minutesOverlappingCalendarDay(l.startAt, l.endAt, realToday), 0)
  }, [logs, user, realToday])

  const myMinutesOnReportDay = useMemo(() => {
    if (!user) return 0
    return logs
      .filter((l) => l.userId === user.uid)
      .reduce((sum, l) => sum + minutesOverlappingCalendarDay(l.startAt, l.endAt, reportDayYmd), 0)
  }, [logs, user, reportDayYmd])

  const mySessionsOnReportDay = useMemo(() => {
    if (!user) return []
    return logs
      .filter(
        (l) =>
          l.userId === user.uid &&
          minutesOverlappingCalendarDay(l.startAt, l.endAt, reportDayYmd) > 0,
      )
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
  }, [logs, user, reportDayYmd])

  const myCheckInsOnReportDay = useMemo(() => {
    if (!user) return []
    const day = reportDayYmd
    return checkIns.filter((c) => c.userId === user.uid && c.createdAt.slice(0, 10) === day)
  }, [checkIns, user, reportDayYmd])

  const myWeekMinutesByDay = useMemo(() => {
    if (!user) return new Map<string, number>()
    const m = new Map<string, number>()
    for (const ymd of weekDays) {
      let total = 0
      for (const l of logs) {
        if (l.userId !== user.uid) continue
        total += minutesOverlappingCalendarDay(l.startAt, l.endAt, ymd)
      }
      m.set(ymd, total)
    }
    return m
  }, [logs, user, weekDays])

  const managerWeekMinutesByDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const ymd of weekDays) {
      let total = 0
      for (const l of logs) {
        if (adminFilterUserId && l.userId !== adminFilterUserId) continue
        total += minutesOverlappingCalendarDay(l.startAt, l.endAt, ymd)
      }
      m.set(ymd, total)
    }
    return m
  }, [logs, weekDays, adminFilterUserId])

  const adminDayRows = useMemo(() => {
    let ids = users.filter((u) => u.active !== false).map((u) => u.id)
    if (adminFilterUserId) ids = ids.filter((id) => id === adminFilterUserId)
    return ids
      .map((uid) => {
        let mins = 0
        let sessions = 0
        for (const l of logs) {
          if (l.userId !== uid) continue
          const mm = minutesOverlappingCalendarDay(l.startAt, l.endAt, reportDayYmd)
          if (mm > 0) {
            mins += mm
            sessions += 1
          }
        }
        const member = users.find((u) => u.id === uid)
        const sched = member ? teamMemberToDaySchedule(member) : null
        const compliance = sched ? computeDayScheduleCompliance(logs, uid, reportDayYmd, sched) : null
        const scheduleLabel =
          member?.scheduleDayStart && member?.scheduleDayEnd
            ? `${member.scheduleDayStart}–${member.scheduleDayEnd} (הפסקה ${member.scheduleBreakMinutes ?? 0} דק׳)`
            : null
        return {
          uid,
          name: userNameById.get(uid) ?? uid,
          mins,
          sessions,
          scheduleLabel,
          compliance,
        }
      })
      .sort((a, b) => b.mins - a.mins || a.name.localeCompare(b.name, 'he'))
  }, [logs, users, reportDayYmd, userNameById, adminFilterUserId])

  const myTeamMember = useMemo(() => users.find((m) => m.id === user?.uid), [users, user?.uid])
  const myDaySchedule = useMemo(() => teamMemberToDaySchedule(myTeamMember ?? {}), [myTeamMember])
  const myScheduleCompliance = useMemo(() => {
    if (!user || !myDaySchedule) return null
    return computeDayScheduleCompliance(logs, user.uid, reportDayYmd, myDaySchedule)
  }, [logs, user, reportDayYmd, myDaySchedule])

  const myTodayPunchSummary = useMemo(() => {
    if (!user) return null
    return getDayPunchSummary(logs, user.uid, realToday)
  }, [logs, user, realToday])

  const myActiveLog = useMemo(
    () => (myPresence?.activeLogId ? logs.find((l) => l.id === myPresence.activeLogId) : undefined),
    [logs, myPresence?.activeLogId],
  )

  const projectTimeSummaryForDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const l of logs) {
      if (adminFilterUserId && l.userId !== adminFilterUserId) continue
      if (!l.projectId) continue
      const mins = minutesOverlappingCalendarDay(l.startAt, l.endAt, reportDayYmd)
      if (mins <= 0) continue
      map.set(l.projectId, (map.get(l.projectId) ?? 0) + mins)
    }
    return [...map.entries()]
      .map(([pid, mins]) => ({ pid, mins, name: projectById.get(pid) ?? pid }))
      .sort((a, b) => b.mins - a.mins)
      .slice(0, 15)
  }, [logs, reportDayYmd, adminFilterUserId, projectById])

  const clientTimeSummaryForDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const l of logs) {
      if (adminFilterUserId && l.userId !== adminFilterUserId) continue
      if (!l.clientId) continue
      const mins = minutesOverlappingCalendarDay(l.startAt, l.endAt, reportDayYmd)
      if (mins <= 0) continue
      map.set(l.clientId, (map.get(l.clientId) ?? 0) + mins)
    }
    return [...map.entries()]
      .map(([cid, mins]) => ({ cid, mins, name: clientById.get(cid) ?? cid }))
      .sort((a, b) => b.mins - a.mins)
      .slice(0, 15)
  }, [logs, reportDayYmd, adminFilterUserId, clientById])

  const anomaliesForReportDay = useMemo(
    () =>
      anomalies.filter((a) => {
        if (a.enforcedAt.slice(0, 10) !== reportDayYmd) return false
        if (adminFilterUserId && a.userId !== adminFilterUserId) return false
        return true
      }),
    [anomalies, reportDayYmd, adminFilterUserId],
  )

  const managerAnomaliesForReportDay = useMemo(
    () =>
      [...anomaliesForReportDay]
        .sort((a, b) => new Date(b.enforcedAt).getTime() - new Date(a.enforcedAt).getTime())
        .map((a) => ({
          ...a,
          userName: userNameById.get(a.userId) ?? a.userId,
        })),
    [anomaliesForReportDay, userNameById],
  )

  const managerSessionsOnReportDay = useMemo(() => {
    let list: AttendanceLog[] = []
    for (const l of logs) {
      if (adminFilterUserId && l.userId !== adminFilterUserId) continue
      if (minutesOverlappingCalendarDay(l.startAt, l.endAt, reportDayYmd) <= 0) continue
      list.push(l)
    }
    list = list.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
    return list.slice(0, 80)
  }, [logs, reportDayYmd, adminFilterUserId])

  const managerRows = useMemo(() => {
    const now = Date.now()
    return presences
      .map((p) => {
        const hbLag = p.lastHeartbeatAt ? Math.round((now - new Date(p.lastHeartbeatAt).getTime()) / 60000) : 999
        const checkinLag = p.lastCheckInAt ? Math.round((now - new Date(p.lastCheckInAt).getTime()) / 60000) : 999
        const anomaly =
          p.status === 'active' && (hbLag > 40 || checkinLag > 120)
            ? hbLag > 40
              ? 'אין heartbeat'
              : 'נדרש check-in'
            : null
        return {
          ...p,
          userName: userNameById.get(p.userId) ?? p.userId,
          hbLag,
          checkinLag,
          anomaly,
        }
      })
      .sort((a, b) => a.userName.localeCompare(b.userName, 'he'))
  }, [presences, userNameById])

  const checkInsByUser = useMemo(() => {
    const map = new Map<string, typeof checkIns>()
    for (const ci of checkIns) {
      const arr = map.get(ci.userId) ?? []
      arr.push(ci)
      map.set(ci.userId, arr)
    }
    return map
  }, [checkIns])

  const tasksForShiftSelect = useMemo(() => {
    if (!user?.uid) return []
    const mine = tasks.filter((t) => t.assigneeId === user.uid && t.status !== 'done')
    if (projectId) return mine.filter((t) => t.projectId === projectId)
    return [...mine].sort((a, b) => {
      const pa = a.projectId ? projectById.get(a.projectId) ?? '' : ''
      const pb = b.projectId ? projectById.get(b.projectId) ?? '' : ''
      if (pa !== pb) return pa.localeCompare(pb, 'he')
      return a.title.localeCompare(b.title, 'he')
    })
  }, [tasks, user?.uid, projectId, projectById])

  const selectedTask = useMemo(
    () => (taskId ? tasks.find((t) => t.id === taskId) : undefined),
    [tasks, taskId],
  )

  /** התאמת שיוך ללוג: משימה יכולה לספק פרויקט/לקוח גם כשלא נבחר פרויקט ידנית */
  const shiftContext = useMemo(() => {
    const fromProject = projectId ? projects.find((p) => p.id === projectId) : undefined
    const taskProjId = selectedTask?.projectId
    const taskProject = taskProjId ? projects.find((p) => p.id === taskProjId) : undefined
    const effectiveProjectId = projectId || taskProjId || undefined
    const effectiveClientId =
      fromProject?.clientId?.trim() ||
      taskProject?.clientId?.trim() ||
      selectedTask?.clientId?.trim() ||
      undefined
    return {
      projectId: effectiveProjectId,
      clientId: effectiveClientId,
      taskId: taskId || undefined,
    }
  }, [projectId, projects, selectedTask, taskId])

  const reliabilityRows = useMemo(
    () =>
      managerRows.map((r) => {
        const myCheckIns = checkInsByUser.get(r.userId) ?? []
        const onTimeCount = myCheckIns.filter((c) => !c.isLate).length
        const fastCount = myCheckIns.filter((c) => c.suspiciousFast).length
        const uniqueRatio =
          myCheckIns.length === 0
            ? 1
            : new Set(myCheckIns.map((c) => c.text.toLowerCase().trim())).size / myCheckIns.length
        const onTimeRate = myCheckIns.length === 0 ? 1 : onTimeCount / myCheckIns.length
        const score = Math.max(
          0,
          Math.min(
            100,
            Math.round(
              onTimeRate * 55 +
                uniqueRatio * 30 +
                Math.max(0, 1 - fastCount / Math.max(1, myCheckIns.length)) * 15,
            ),
          ),
        )
        return {
          ...r,
          checkInsCount: myCheckIns.length,
          onTimeRate,
          uniqueRatio,
          score,
          unverifiedMinutes: r.unverifiedMinutes ?? 0,
        }
      }),
    [managerRows, checkInsByUser],
  )

  const countdownLabel = useMemo(() => {
    const totalSec = Math.max(0, Math.floor(countdownMs / 1000))
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0')
    const ss = String(totalSec % 60).padStart(2, '0')
    return `${mm}:${ss}`
  }, [countdownMs])

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-8 py-8">
      <header>
        <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">נוכחות עובדים</h1>
        <p className="mt-1 text-[13px] text-[var(--text-mid)]">
          {isManager ? 'ניטור ודוחות למנהל מערכת' : 'דיווח נוכחות לעובד'}
        </p>
      </header>

      <section className={`rounded-2xl ${hubSectionClass(0)} p-4`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[var(--text-dark)]">לוח שבוע ותאריך דוח</h2>
            <p className="mt-0.5 text-xs text-[var(--text-mid)]">
              בוחרים יום — הסיכומים והטבלאות למטה מסוננים לפי אותו יום קלנדרי (כולל סשנים שחוצים חצות).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="hub-btn-secondary text-xs"
              onClick={() => setReportDayYmd(addDaysYmd(weekStartSundayYmd(reportDayYmd), -7))}
            >
              שבוע קודם
            </button>
            <button
              type="button"
              className="hub-btn-secondary text-xs"
              onClick={() => setReportDayYmd(addDaysYmd(weekStartSundayYmd(reportDayYmd), 7))}
            >
              שבוע הבא
            </button>
            <button type="button" className="hub-btn-primary text-xs" onClick={() => setReportDayYmd(todayYmd())}>
              היום
            </button>
            <label className="flex items-center gap-2 text-[11px] font-bold text-[var(--text-mid)]">
              תאריך
              <input
                type="date"
                value={reportDayYmd}
                onChange={(e) => {
                  if (e.target.value) setReportDayYmd(e.target.value)
                }}
                className="rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-[13px] text-[var(--text-dark)]"
              />
            </label>
          </div>
        </div>
        <p className="mt-3 text-sm font-semibold text-[var(--text-dark)]">
          {formatDateIL(reportDayYmd)} · {formatWeekdayShortIL(reportDayYmd)}
          {reportDayYmd === realToday ? (
            <span className="mr-2 inline-block rounded-full bg-[#E0E7FF] px-2 py-0.5 text-[11px] font-bold text-[var(--blue-dark)]">
              היום
            </span>
          ) : null}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {weekDays.map((ymd) => {
            const mins = isManager
              ? (managerWeekMinutesByDay.get(ymd) ?? 0)
              : (myWeekMinutesByDay.get(ymd) ?? 0)
            const sel = ymd === reportDayYmd
            return (
              <button
                key={ymd}
                type="button"
                onClick={() => setReportDayYmd(ymd)}
                className={`min-w-[92px] rounded-xl border px-3 py-2 text-right text-xs transition ${
                  sel
                    ? 'border-[var(--blue-dark)] bg-[#EEF2FF] font-bold text-[var(--blue-dark)]'
                    : 'border-[var(--border)] bg-white text-[var(--text-dark)] hover:bg-[#F8FAFC]'
                }`}
              >
                <div className="font-semibold">{formatWeekdayShortIL(ymd)}</div>
                <div className="text-[var(--text-mid)]">
                  {ymd.slice(8, 10)}.{ymd.slice(5, 7)}
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--text-mid)]">{mins} דק&apos;</div>
              </button>
            )
          })}
        </div>
        {isManager ? (
          <div className="mt-4 max-w-md">
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              סינון דוח לפי עובד (אופציונלי)
            </label>
            <select
              value={adminFilterUserId}
              onChange={(e) => setAdminFilterUserId(e.target.value)}
              className="w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
            >
              <option value="">כל העובדים בדוח</option>
              {users
                .filter((u) => u.active !== false)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </div>
        ) : null}
      </section>

      {isManager ? (
        <section className={`rounded-2xl ${hubSectionClass(1)} p-4`}>
          <h2 className="mb-3 text-lg font-bold text-[var(--text-dark)]">ניטור מנהל מערכת</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-right text-[11px] font-bold text-[var(--text-light)]">
                  <th className="px-3 py-2">עובד</th>
                  <th className="px-3 py-2">סטטוס</th>
                  <th className="px-3 py-2">נכנס/ה</th>
                  <th className="px-3 py-2">יצא/ה</th>
                  <th className="px-3 py-2">Heartbeat אחרון</th>
                  <th className="px-3 py-2">Check-in אחרון</th>
                  <th className="px-3 py-2">חריגה</th>
                </tr>
              </thead>
              <tbody>
                {managerRows.map((r) => (
                  <tr key={r.userId} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 font-semibold text-[var(--text-dark)]">{r.userName}</td>
                    <td className="px-3 py-2 text-[var(--text-mid)]">{r.status}</td>
                    <td className="px-3 py-2 text-[11px] text-[var(--text-mid)] whitespace-nowrap">
                      {r.shiftStartedAt ? formatDateTimeIL(r.shiftStartedAt) : '—'}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-[var(--text-mid)] whitespace-nowrap">
                      {r.status === 'active' ? (
                        <span className="font-medium text-[var(--blue-dark)]">במשמרת</span>
                      ) : r.shiftEndedAt ? (
                        formatDateTimeIL(r.shiftEndedAt)
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-mid)]">
                      {r.lastHeartbeatAt ? `${formatDateTimeIL(r.lastHeartbeatAt)} (${r.hbLag} דק')` : '—'}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-mid)]">
                      {r.lastCheckInAt ? `${formatDateTimeIL(r.lastCheckInAt)} (${r.checkinLag} דק')` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {r.anomaly ? <span className="text-xs font-bold text-[var(--danger)]">{r.anomaly}</span> : 'תקין'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className={`space-y-4 rounded-2xl ${hubSectionClass(2)} p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text-dark)]">
                סטטוס נוכחי:{' '}
                <span className="text-[var(--blue-dark)]">
                  {myPresence?.status === 'active'
                    ? 'פעיל'
                    : myPresence?.status === 'suspected_inactive'
                      ? 'חשוד כחוסר פעילות'
                    : myPresence?.status === 'paused_idle'
                      ? 'הושהה (חוסר פעילות)'
                      : 'לא פעיל'}
                </span>
              </p>
              <p className="text-xs text-[var(--text-mid)]">סה״כ היום (לוח שנה מקומי): {myTodayLiveMinutes} דקות</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-light)]">
                כניסה בבוקר + פרויקט, יציאה בסוף היום. במהלך היום יופיע צ׳ק־אין קצר — ענו בזמן כדי לעדכן על מה עובדים. ניתוק אוטומטי מהמערכת קורה רק אחרי כ־50 דק׳ בלי אות מהדפדפן (טאב סגור / מחשב במצב שינה).
              </p>
              {myTodayPunchSummary ? (
                <div className="mt-2 space-y-1 rounded-lg border border-[var(--border)] bg-[#F8FAFC] px-3 py-2 text-[12px]">
                  <p className="text-[var(--text-dark)]">
                    <span className="font-bold">נכנס/ה: </span>
                    {myTodayPunchSummary.continuedFromPriorDay ? (
                      <span className="font-semibold text-[var(--blue-dark)]">
                        {myActiveLog?.startAt
                          ? formatDateTimeIL(myActiveLog.startAt)
                          : myPresence?.shiftStartedAt
                            ? formatDateTimeIL(myPresence.shiftStartedAt)
                            : 'המשך משמרת'}
                        <span className="mr-1 block text-[10px] font-normal text-[var(--text-mid)]">
                          (משמרת רציפה; הכניסה למערכת ביום קודם)
                        </span>
                      </span>
                    ) : myTodayPunchSummary.firstStartIso ? (
                      <span className="font-semibold text-[var(--blue-dark)]">
                        {formatDateTimeIL(myTodayPunchSummary.firstStartIso)}
                      </span>
                    ) : (
                      <span className="text-[var(--text-light)]">עדיין לא נרשמה כניסה היום</span>
                    )}
                  </p>
                  <p className="text-[var(--text-dark)]">
                    <span className="font-bold">יצא/ה: </span>
                    {myTodayPunchSummary.openSession ? (
                      <span className="font-semibold text-[var(--blue-dark)]">עדיין במשמרת (לא נרשמה יציאה)</span>
                    ) : myTodayPunchSummary.lastEndIso ? (
                      <span className="font-semibold text-[var(--blue-dark)]">
                        {formatDateTimeIL(myTodayPunchSummary.lastEndIso)}
                      </span>
                    ) : myTodayPunchSummary.firstStartIso || myTodayPunchSummary.continuedFromPriorDay ? (
                      <span className="text-[var(--text-light)]">—</span>
                    ) : (
                      <span className="text-[var(--text-light)]">—</span>
                    )}
                  </p>
                </div>
              ) : null}
              {myPresence?.status === 'active' ? (
                <p className="mt-1 text-xs font-semibold text-[var(--text-mid)]">
                  צ'ק-אין הבא בעוד: <span className="text-[var(--blue-dark)]">{countdownLabel}</span>
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              {myPresence?.status === 'active' ? (
                <button className="hub-btn-danger text-sm" onClick={() => void stopShift('manual')}>
                  יציאה / עצירה
                </button>
              ) : (
                <button
                  className="hub-btn-primary text-sm"
                  onClick={() =>
                    void startShift({
                      projectId: shiftContext.projectId,
                      clientId: shiftContext.clientId,
                      taskId: shiftContext.taskId,
                      note: workNote.trim() || undefined,
                    })
                  }
                >
                  כניסה / התחלת נוכחות
                </button>
              )}
              <button className="hub-btn-secondary text-sm" onClick={() => setCheckInOpen(true)}>
                Check-in התקדמות
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2.5">
            <p className="text-[12px] font-semibold text-[var(--text-dark)]">עבודה בלי פרויקט במערכת</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-mid)]">
              אפשר להשאיר &quot;ללא פרויקט&quot; ולתאר בחופשיות למטה על מה מתחילים (פיתוח כללי, לימוד,
              תחזוקה וכו&apos;). אופציונלי: לבחור משימה פתוחה מהרשימה — גם בלי לבחור פרויקט קודם.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              דיווח חופשי — על מה אני מתחיל/ה עכשיו?
            </label>
            <textarea
              rows={3}
              value={workNote}
              onChange={(e) => setWorkNote(e.target.value)}
              placeholder="לדוגמה: תיקון באג ב־API של לקוח X / למידת Tailwind / סידור סביבת פיתוח…"
              className="w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text-dark)] placeholder:text-[var(--text-light)]"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">שיוך לפרויקט (אופציונלי)</label>
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value)
                  setTaskId('')
                }}
                className="w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
              >
                <option value="">ללא פרויקט</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                משימה מהמערכת (אופציונלי)
              </label>
              <select
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                className="w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
              >
                <option value="">ללא משימה ספציפית</option>
                {tasksForShiftSelect.map((t) => {
                  const pName = t.projectId ? projectById.get(t.projectId) : null
                  const label = pName ? `${pName} · ${t.title}` : t.title
                  return (
                    <option key={t.id} value={t.id}>
                      {label}
                    </option>
                  )
                })}
              </select>
            </div>
          </div>
        </section>
      )}

      {!isManager ? (
        <section className={`space-y-4 rounded-2xl ${hubSectionClass(3)} p-4`}>
          <h2 className="text-base font-bold text-[var(--text-dark)]">
            דוח יום נבחר · {formatDateIL(reportDayYmd)} ({formatWeekdayShortIL(reportDayYmd)})
          </h2>
          {myScheduleCompliance?.hasSchedule ? (
            <div className="rounded-lg border border-[#A7F3D0] bg-[#F0FDF4] px-3 py-3">
              <h3 className="text-sm font-bold text-[#065F46]">מועדי יום העבודה שלך</h3>
              <p className="mt-1 text-[12px] text-[#047857]">
                מוגדר: {myTeamMember?.scheduleDayStart}–{myTeamMember?.scheduleDayEnd}, הפסקה{' '}
                {myTeamMember?.scheduleBreakMinutes ?? 0} דק׳. יעד נטו ביום:{' '}
                <strong>{myScheduleCompliance.expectedNetMinutes} דק׳</strong> עבודה (אחרי הפסקה).
              </p>
              <p className="mt-1 text-[10px] text-[#059669]">
                כניסה בזמן: עד {SCHEDULE_ENTRY_GRACE_MINUTES} דק׳ אחרי שעת ההתחלה. יציאה: לא לפני שעת
                הסיום המוגדרת.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-[#D1FAE5] bg-white px-3 py-2">
                  <p className="text-[10px] font-bold text-[var(--text-mid)]">נכנס/ה (ביום הדוח)</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text-dark)]">
                    <span className="text-[var(--text-mid)]">שעה: </span>
                    {myScheduleCompliance.entryContinuedFromPriorDay
                      ? 'המשך משמרת מאתמול'
                      : myScheduleCompliance.firstStartIso
                        ? formatDateTimeIL(myScheduleCompliance.firstStartIso)
                        : myScheduleCompliance.entry === 'na'
                          ? 'אין משמרת ביום זה'
                          : '—'}
                  </p>
                  <p
                    className={`mt-1 text-xs font-bold ${
                      myScheduleCompliance.entry === 'ok'
                        ? 'text-[#059669]'
                        : myScheduleCompliance.entry === 'late'
                          ? 'text-[var(--danger)]'
                          : 'text-[var(--text-mid)]'
                    }`}
                  >
                    {schedulePunchLabelHe(myScheduleCompliance.entry)}
                    {myScheduleCompliance.entryLateMinutes != null
                      ? ` · +${myScheduleCompliance.entryLateMinutes} דק׳ איחור`
                      : null}
                  </p>
                </div>
                <div className="rounded-md border border-[#D1FAE5] bg-white px-3 py-2">
                  <p className="text-[10px] font-bold text-[var(--text-mid)]">יצא/ה (ביום הדוח)</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text-dark)]">
                    <span className="text-[var(--text-mid)]">שעה: </span>
                    {myScheduleCompliance.openSession
                      ? 'עדיין במשמרת (אין יציאה)'
                      : myScheduleCompliance.lastEndIso
                        ? formatDateTimeIL(myScheduleCompliance.lastEndIso)
                        : myScheduleCompliance.exit === 'na'
                          ? 'אין משמרת ביום זה'
                          : '—'}
                  </p>
                  <p
                    className={`mt-1 text-xs font-bold ${
                      myScheduleCompliance.exit === 'ok'
                        ? 'text-[#059669]'
                        : myScheduleCompliance.exit === 'early'
                          ? 'text-[var(--danger)]'
                          : myScheduleCompliance.exit === 'open'
                            ? 'text-[var(--blue-dark)]'
                            : 'text-[var(--text-mid)]'
                    }`}
                  >
                    {schedulePunchLabelHe(myScheduleCompliance.exit)}
                    {myScheduleCompliance.exitEarlyMinutes != null
                      ? ` · ${myScheduleCompliance.exitEarlyMinutes} דק׳ לפני שעת הסיום`
                      : null}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--border)] bg-[#F8FAFC] px-3 py-2.5">
              <p className="text-[11px] font-bold text-[var(--text-mid)]">דקות בעבודה (ביום זה)</p>
              <p className="mt-1 text-xl font-extrabold text-[var(--blue-dark)]">{myMinutesOnReportDay}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[#F8FAFC] px-3 py-2.5">
              <p className="text-[11px] font-bold text-[var(--text-mid)]">מספר סשנים</p>
              <p className="mt-1 text-xl font-extrabold text-[var(--text-dark)]">{mySessionsOnReportDay.length}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[#F8FAFC] px-3 py-2.5">
              <p className="text-[11px] font-bold text-[var(--text-mid)]">צ׳ק־אינים ביום</p>
              <p className="mt-1 text-xl font-extrabold text-[var(--text-dark)]">{myCheckInsOnReportDay.length}</p>
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-bold text-[var(--text-dark)]">סשני עבודה</h3>
            <p className="mb-2 text-[11px] text-[var(--text-mid)]">
              כל שורה: <strong>כניסה</strong> למשמרת, כל ה־<strong>צ׳ק־אינים</strong> שבוצעו בתוך אותה משמרת, ו־<strong>יציאה</strong>.
            </p>
            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="bg-[#F8FAFC]">
                  <tr className="text-right text-[11px] font-bold text-[var(--text-light)]">
                    <th className="px-3 py-2">נכנס/ה</th>
                    <th className="px-3 py-2">צ׳ק־אינים במשמרת</th>
                    <th className="px-3 py-2">יצא/ה</th>
                    <th className="px-3 py-2">דקות ביום</th>
                    <th className="px-3 py-2">פרויקט</th>
                    <th className="px-3 py-2">סיבת יציאה</th>
                    <th className="px-3 py-2">הערה</th>
                  </tr>
                </thead>
                <tbody>
                  {mySessionsOnReportDay.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-[var(--text-mid)]">
                        אין סשנים רשומים ליום זה
                      </td>
                    </tr>
                  ) : (
                    mySessionsOnReportDay.map((l) => {
                      const dayMins = minutesOverlappingCalendarDay(l.startAt, l.endAt, reportDayYmd)
                      const pName = l.projectId ? projectById.get(l.projectId) : null
                      const sessionCheckIns = checkInsForAttendanceLog(l, checkIns)
                      return (
                        <tr key={l.id} className="border-t border-[var(--border)] align-top">
                          <td className="px-3 py-2 text-[var(--text-mid)] whitespace-nowrap">
                            {formatDateTimeIL(l.startAt)}
                          </td>
                          <td className="px-3 py-2">
                            <SessionCheckInsCell items={sessionCheckIns} />
                          </td>
                          <td className="px-3 py-2 text-[var(--text-mid)] whitespace-nowrap">
                            {l.endAt ? (
                              formatDateTimeIL(l.endAt)
                            ) : (
                              <span className="font-semibold text-[var(--blue-dark)]">משמרת פתוחה</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-bold text-[var(--blue-dark)]">{dayMins}</td>
                          <td className="px-3 py-2 text-[var(--text-mid)]">{pName ?? '—'}</td>
                          <td className="px-3 py-2 text-[var(--text-mid)]">{endReasonHe(l.endReason)}</td>
                          <td className="px-3 py-2 text-[var(--text-mid)]">{l.note?.trim() ? l.note : '—'}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {myCheckInsOnReportDay.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-bold text-[var(--text-dark)]">צ׳ק־אינים ביום הנבחר</h3>
              <ul className="space-y-2 text-sm">
                {myCheckInsOnReportDay.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-lg border border-[var(--border)] bg-[#F8FAFC] px-3 py-2 text-[var(--text-dark)]"
                  >
                    <span className="text-[11px] text-[var(--text-mid)]">{formatDateTimeIL(c.createdAt)}</span>
                    <p className="mt-1">{c.text}</p>
                    {c.isLate ? (
                      <p className="mt-1 text-[11px] font-semibold text-[var(--danger)]">מאוחר</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {isManager ? (
        <section className={`rounded-2xl ${hubSectionClass(4)} p-4`}>
          <h2 className="mb-1 text-lg font-bold text-[var(--text-dark)]">
            סיכום עובדים ליום {formatDateIL(reportDayYmd)}
          </h2>
          <p className="mb-3 text-xs text-[var(--text-mid)]">
            דקות מחושבות לפי חפיפה עם היום הנבחר (סשן שמתחיל אתמול ונמשך היום נספר חלקית). בעמודה «שיוך /
            עריכה» — מסננים את העובד וגוללים לטופס הזנה ידנית; מתחתיו טבלת סשנים לעריכת שעות קיימות.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-right text-[11px] font-bold text-[var(--text-light)]">
                  <th className="px-3 py-2">עובד</th>
                  <th className="px-3 py-2">יעד יום</th>
                  <th className="px-3 py-2">דקות ביום</th>
                  <th className="px-3 py-2">סשנים</th>
                  <th className="px-3 py-2">נכנס/ה</th>
                  <th className="px-3 py-2">סטטוס כניסה</th>
                  <th className="px-3 py-2">יצא/ה</th>
                  <th className="px-3 py-2">סטטוס יציאה</th>
                  <th className="px-3 py-2 w-[1%] whitespace-nowrap">שעות</th>
                </tr>
              </thead>
              <tbody>
                {adminDayRows.map((r) => {
                  const c = r.compliance
                  return (
                    <tr key={r.uid} className="border-t border-[var(--border)] align-top">
                      <td className="px-3 py-2 font-semibold text-[var(--text-dark)]">{r.name}</td>
                      <td className="px-3 py-2 text-[11px] text-[var(--text-mid)]">
                        {r.scheduleLabel ?? '—'}
                      </td>
                      <td className="px-3 py-2 font-bold text-[var(--blue-dark)]">{r.mins}</td>
                      <td className="px-3 py-2 text-[var(--text-mid)]">{r.sessions}</td>
                      <td className="px-3 py-2 text-[11px] text-[var(--text-mid)] whitespace-nowrap">
                        {c?.entryContinuedFromPriorDay
                          ? 'המשך'
                          : c?.firstStartIso
                            ? formatDateTimeIL(c.firstStartIso)
                            : '—'}
                      </td>
                      <td className="px-3 py-2 text-[11px]">
                        {c?.hasSchedule ? (
                          <span
                            className={
                              c.entry === 'ok'
                                ? 'font-bold text-[#059669]'
                                : c.entry === 'late'
                                  ? 'font-bold text-[var(--danger)]'
                                  : 'text-[var(--text-mid)]'
                            }
                          >
                            {schedulePunchLabelHe(c.entry)}
                            {c.entryLateMinutes != null ? ` (+${c.entryLateMinutes})` : null}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-[var(--text-mid)]">
                        {c?.openSession ? (
                          <span className="font-semibold text-[var(--blue-dark)]">
                            במשמרת — עדיין לא נרשמה יציאה
                          </span>
                        ) : c?.lastEndIso ? (
                          <span className="whitespace-nowrap">{formatDateTimeIL(c.lastEndIso)}</span>
                        ) : c?.firstStartIso || c?.entryContinuedFromPriorDay ? (
                          <span className="text-[var(--text-light)]">לא נרשמה יציאה ביום זה</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2 text-[11px]">
                        {c?.hasSchedule ? (
                          <span
                            className={
                              c.exit === 'ok'
                                ? 'font-bold text-[#059669]'
                                : c.exit === 'early'
                                  ? 'font-bold text-[var(--danger)]'
                                  : c.exit === 'open'
                                    ? 'font-bold text-[var(--blue-dark)]'
                                    : 'text-[var(--text-mid)]'
                            }
                          >
                            {schedulePunchLabelHe(c.exit)}
                            {c.exitEarlyMinutes != null ? ` (−${c.exitEarlyMinutes})` : null}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-[11px] font-semibold text-[var(--blue-dark)] hover:bg-[#EEF2FF]"
                          onClick={() => linkHoursForEmployee(r.uid)}
                        >
                          שיוך / עריכה
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {isManager ? (
        <section id="attendance-manual-shift" className={`rounded-2xl ${hubSectionClass(11)} p-4`}>
          <h2 className="mb-1 text-lg font-bold text-[var(--text-dark)]">הזנת משמרת ידנית ליום הדוח</h2>
          <p className="mb-3 text-xs text-[var(--text-mid)]">
            יום {formatDateIL(reportDayYmd)} — השעות נשמרות לפי שעון המחשב שלך (כמו בשאר הדוחות). מתחת
            מופיעה טבלת סשנים — שם אפשר לערוך משמרות קיימות.
          </p>
          <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">עובד</span>
              <select
                value={manualUserId}
                onChange={(e) => setManualUserId(e.target.value)}
                className="w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
              >
                <option value="">בחר עובד…</option>
                {users
                  .filter((u) => u.active !== false)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">התחלה</span>
              <input
                type="time"
                value={manualStartHm}
                onChange={(e) => setManualStartHm(e.target.value)}
                className="w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">סיום</span>
              <input
                type="time"
                value={manualEndHm}
                onChange={(e) => setManualEndHm(e.target.value)}
                className="w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">פרויקט (אופציונלי)</span>
              <select
                value={manualProjectId}
                onChange={(e) => setManualProjectId(e.target.value)}
                className="w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
              >
                <option value="">ללא</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">הערה (אופציונלי)</span>
              <input
                type="text"
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                placeholder="למשל: תיקון שעות ידני"
                className="w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <button
                type="button"
                disabled={manualSaving}
                className="hub-btn-primary text-sm disabled:opacity-50"
                onClick={() => void saveManualShift()}
              >
                {manualSaving ? 'שומר…' : 'שמור משמרת ליום זה'}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {isManager ? (
        <section id="attendance-manager-sessions" className={`rounded-2xl ${hubSectionClass(5)} p-4`}>
          <h2 className="mb-1 text-lg font-bold text-[var(--text-dark)]">סשנים ביום הנבחר</h2>
          <p className="mb-3 text-xs text-[var(--text-mid)]">
            עד 80 רשומות אחרונות לפי זמן התחלה. לכל סשן: כניסה, צ׳ק־אינים במשמרת, יציאה.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-right text-[11px] font-bold text-[var(--text-light)]">
                  <th className="px-3 py-2">עובד</th>
                  <th className="px-3 py-2">נכנס/ה</th>
                  <th className="px-3 py-2">צ׳ק־אינים</th>
                  <th className="px-3 py-2">יצא/ה</th>
                  <th className="px-3 py-2">דקות ביום</th>
                  <th className="px-3 py-2">פרויקט</th>
                  <th className="px-3 py-2">סיבת יציאה</th>
                  <th className="px-3 py-2">הערה</th>
                  <th className="px-3 py-2 w-[1%] whitespace-nowrap">עריכה</th>
                </tr>
              </thead>
              <tbody>
                {managerSessionsOnReportDay.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-[var(--text-mid)]">
                      אין סשנים ביום זה (או לפי הסינון)
                    </td>
                  </tr>
                ) : (
                  managerSessionsOnReportDay.map((l) => {
                    const dayMins = minutesOverlappingCalendarDay(l.startAt, l.endAt, reportDayYmd)
                    const pName = l.projectId ? projectById.get(l.projectId) : null
                    const sessionCheckIns = checkInsForAttendanceLog(l, checkIns)
                    return (
                      <tr key={l.id} className="border-t border-[var(--border)] align-top">
                        <td className="px-3 py-2 font-semibold text-[var(--text-dark)] whitespace-nowrap">
                          {userNameById.get(l.userId) ?? l.userId}
                        </td>
                        <td className="px-3 py-2 text-[var(--text-mid)] whitespace-nowrap">
                          {formatDateTimeIL(l.startAt)}
                        </td>
                        <td className="px-3 py-2">
                          <SessionCheckInsCell items={sessionCheckIns} />
                        </td>
                        <td className="px-3 py-2 text-[var(--text-mid)] whitespace-nowrap">
                          {l.endAt ? (
                            formatDateTimeIL(l.endAt)
                          ) : (
                            <span className="font-semibold text-[var(--blue-dark)]">פתוח</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-bold text-[var(--blue-dark)]">{dayMins}</td>
                        <td className="px-3 py-2 text-[var(--text-mid)]">{pName ?? '—'}</td>
                        <td className="px-3 py-2 text-[var(--text-mid)]">{endReasonHe(l.endReason)}</td>
                        <td className="px-3 py-2 text-[var(--text-mid)]">{l.note?.trim() ? l.note : '—'}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-[11px] font-semibold text-[var(--text-dark)] hover:bg-[#F8FAFC]"
                            onClick={() => openEditAttendanceLog(l)}
                          >
                            ערוך
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {isManager ? (
        <section className={`rounded-2xl ${hubSectionClass(6)} p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[var(--text-dark)]">מדיניות זמן לא מאומת</h3>
              <p className="text-xs text-[var(--text-mid)]">
                אין קיזוז אוטומטי. הזמן הלא מאומת מוצג למעקב בלבד, וקיזוז מתבצע ידנית לפי החלטת מנהל.
              </p>
            </div>
            <span className="rounded-full border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-1 text-xs font-semibold text-[var(--text-mid)]">
              מצב: קיזוז ידני בלבד
            </span>
          </div>
        </section>
      ) : null}

      {isManager ? (
        <section className="grid gap-4 md:grid-cols-2">
          <div className={`rounded-2xl ${hubSectionClass(7)} p-4`}>
            <h3 className="mb-1 text-base font-bold text-[var(--text-dark)]">זמן לפי פרויקט</h3>
            <p className="mb-2 text-[11px] text-[var(--text-mid)]">
              יום {formatDateIL(reportDayYmd)}
              {adminFilterUserId ? ` · ${userNameById.get(adminFilterUserId) ?? ''}` : ''}
            </p>
            <ul className="space-y-1 text-sm">
              {projectTimeSummaryForDay.length === 0 ? (
                <li className="text-[var(--text-mid)]">אין נתונים</li>
              ) : (
                projectTimeSummaryForDay.map((r) => (
                  <li key={r.pid} className="flex items-center justify-between">
                    <span>{r.name}</span>
                    <span className="font-bold text-[var(--blue-dark)]">{r.mins} דק'</span>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className={`rounded-2xl ${hubSectionClass(8)} p-4`}>
            <h3 className="mb-1 text-base font-bold text-[var(--text-dark)]">זמן לפי לקוח</h3>
            <p className="mb-2 text-[11px] text-[var(--text-mid)]">
              יום {formatDateIL(reportDayYmd)}
              {adminFilterUserId ? ` · ${userNameById.get(adminFilterUserId) ?? ''}` : ''}
            </p>
            <ul className="space-y-1 text-sm">
              {clientTimeSummaryForDay.length === 0 ? (
                <li className="text-[var(--text-mid)]">אין נתונים</li>
              ) : (
                clientTimeSummaryForDay.map((r) => (
                  <li key={r.cid} className="flex items-center justify-between">
                    <span>{r.name}</span>
                    <span className="font-bold text-[var(--blue-dark)]">{r.mins} דק'</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>
      ) : null}

      {isManager ? (
        <section className={`rounded-2xl ${hubSectionClass(9)} p-4`}>
          <h3 className="mb-2 text-base font-bold text-[var(--text-dark)]">Reliability Dashboard</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-right text-[11px] font-bold text-[var(--text-light)]">
                  <th className="px-3 py-2">עובד</th>
                  <th className="px-3 py-2">ציון אמינות</th>
                  <th className="px-3 py-2">צ'ק-אין בזמן</th>
                  <th className="px-3 py-2">טקסט ייחודי</th>
                  <th className="px-3 py-2">זמן לא מאומת</th>
                  <th className="px-3 py-2">התאמה לתוצרים</th>
                </tr>
              </thead>
              <tbody>
                {reliabilityRows.map((r) => (
                  <tr key={r.userId} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 font-semibold text-[var(--text-dark)]">{r.userName}</td>
                    <td className="px-3 py-2 font-bold text-[var(--blue-dark)]">{r.score}</td>
                    <td className="px-3 py-2 text-[var(--text-mid)]">{Math.round(r.onTimeRate * 100)}%</td>
                    <td className="px-3 py-2 text-[var(--text-mid)]">{Math.round(r.uniqueRatio * 100)}%</td>
                    <td className="px-3 py-2 text-[var(--text-mid)]">{r.unverifiedMinutes} דק'</td>
                    <td className="px-3 py-2 text-[var(--text-mid)]">
                      {r.checkInsCount > 0 ? 'נדרש אימות מנהל מול משימות/קומיטים' : 'אין מספיק נתונים'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {isManager ? (
        <section className={`rounded-2xl ${hubSectionClass(10)} p-4`}>
          <h3 className="mb-1 text-base font-bold text-[var(--text-dark)]">דוח חריגות אכיפה אוטומטית</h3>
          <p className="mb-2 text-xs text-[var(--text-mid)]">מסונן לפי יום הנבחר בלוח: {formatDateIL(reportDayYmd)}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-right text-[11px] font-bold text-[var(--text-light)]">
                  <th className="px-3 py-2">עובד</th>
                  <th className="px-3 py-2">סוג חריגה</th>
                  <th className="px-3 py-2">פירוט</th>
                  <th className="px-3 py-2">נאכף בתאריך</th>
                </tr>
              </thead>
              <tbody>
                {managerAnomaliesForReportDay.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-[var(--text-mid)]">
                      אין חריגות ביום זה
                    </td>
                  </tr>
                ) : (
                  managerAnomaliesForReportDay.map((a) => (
                    <tr key={a.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 font-semibold text-[var(--text-dark)]">{a.userName}</td>
                      <td className="px-3 py-2 text-[var(--text-mid)]">
                        {a.type === 'missing_heartbeat' ? 'אין heartbeat' : 'אין פעילות משתמש'}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-mid)]">
                        {a.type === 'missing_heartbeat'
                          ? `איחור heartbeat: ${a.hbLagMinutes ?? 0} דק'`
                          : `חוסר פעילות: ${a.idleLagMinutes ?? 0} דק'`}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-mid)]">{formatDateTimeIL(a.enforcedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <Modal
        isOpen={isManager && editLog != null}
        onClose={() => {
          if (!editSaving) setEditLog(null)
        }}
        title={
          editLog
            ? `עריכת משמרת · ${userNameById.get(editLog.userId) ?? editLog.userId}`
            : 'עריכת משמרת'
        }
        size="lg"
      >
        {editLog ? (
          <div className="space-y-3">
            <p className="text-xs text-[var(--text-mid)]">
              שינוי שעות נשמר ב־Firestore. לפסקה באמצע היום אפשר ליצור שתי משמרות נפרדות (למשל עד 15:30 ואז מ־16:00).
            </p>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">התחלה</span>
              <input
                type="datetime-local"
                value={editStartLocal}
                onChange={(e) => setEditStartLocal(e.target.value)}
                className="w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">סיום</span>
              <input
                type="datetime-local"
                value={editEndLocal}
                onChange={(e) => setEditEndLocal(e.target.value)}
                className="w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">פרויקט</span>
              <select
                value={editProjectId}
                onChange={(e) => setEditProjectId(e.target.value)}
                className="w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
              >
                <option value="">ללא</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">הערה</span>
              <input
                type="text"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                className="w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
              />
            </label>
            <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-3">
              <button
                type="button"
                className="hub-btn-secondary text-sm"
                disabled={editSaving}
                onClick={() => setEditLog(null)}
              >
                ביטול
              </button>
              <button
                type="button"
                className="rounded-md border border-[var(--danger)] bg-white px-3 py-2 text-sm font-semibold text-[var(--danger)] hover:bg-red-50 disabled:opacity-50"
                disabled={editSaving}
                onClick={() => void deleteEditedLog()}
              >
                מחיקה
              </button>
              <button
                type="button"
                className="hub-btn-primary text-sm disabled:opacity-50"
                disabled={editSaving}
                onClick={() => void saveEditedLog()}
              >
                {editSaving ? 'שומר…' : 'שמירה'}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={!isManager && checkInOpen}
        onClose={() => {
          setCheckInOpen(false)
          setCheckInText('')
          setCheckInError('')
          promptOpenedAtRef.current = null
        }}
        title="Check-in מבוסס התקדמות"
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-mid)]">
            יש להזין סיכום התקדמות קצר (לפחות 20 תווים) תוך 5 דקות.
          </p>
          <textarea
            rows={3}
            value={checkInText}
            onChange={(e) => {
              setCheckInText(e.target.value)
              setCheckInError('')
            }}
            placeholder="לדוגמה: סיימתי התאמת Header מובייל + תיקון תפריט צד"
          />
          <p className="text-xs text-[var(--text-mid)]">
            זמן תגובה: {Math.floor(responseMs / 1000)} שניות
          </p>
          {checkInError ? <p className="text-xs font-bold text-[var(--danger)]">{checkInError}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              className="hub-btn-secondary text-sm"
              onClick={() => {
                setCheckInOpen(false)
                setCheckInText('')
                setCheckInError('')
                promptOpenedAtRef.current = null
              }}
            >
              סגירה
            </button>
            <button
              className="hub-btn-primary text-sm"
              onClick={async () => {
                const text = checkInText.trim()
                if (text.length < 20) {
                  setCheckInError('נדרש סיכום של לפחות 20 תווים')
                  return
                }
                const elapsed = promptOpenedAtRef.current
                  ? Date.now() - promptOpenedAtRef.current
                  : responseMs
                await submitProgressCheckIn({
                  text,
                  responseMs: Math.max(0, elapsed),
                })
                setCheckInOpen(false)
                setCheckInText('')
                setCheckInError('')
                promptOpenedAtRef.current = null
              }}
            >
              שליחת Check-in
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

