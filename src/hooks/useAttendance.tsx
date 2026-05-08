import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '../contexts/AuthContext'
import { timestampToIso } from '../lib/firestoreMappers'
import { db, functionsClient } from '../lib/firebase'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { AttendanceLog, AttendancePresence, AttendanceStatus } from '../types'
import type { AttendanceAnomaly } from '../types'
import type { AttendanceCheckIn } from '../types'
import type { AttendancePolicy } from '../types'

/**
 * טעינת מסמכים מה־Firestore לתצוגה באפליקציה.
 * מקור האמת לשכר: המסמכים ב־`attendanceLogs` (ו־`checkIns`) נשמרים בשרת ולא נמחקים אוטומטית —
 * גם מעבר לחלון הזה הם עדיין בדאטהבייס; כאן רק מגבילים כמות קריאה ללקוח.
 */
const ATTENDANCE_LOG_RANGE_DAYS = 730

const DEFAULT_POLICY: AttendancePolicy = {
  id: 'default',
  autoDeductUnverified: false,
  checkInMinMinutes: 50,
  checkInMaxMinutes: 70,
  checkInGraceMinutes: 5,
}

function docToPresence(id: string, x: Record<string, unknown>): AttendancePresence {
  return {
    userId: id,
    status:
      x.status === 'active' || x.status === 'paused_idle' || x.status === 'suspected_inactive'
        ? (x.status as AttendanceStatus)
        : 'offline',
    activeLogId: typeof x.activeLogId === 'string' && x.activeLogId.trim() ? x.activeLogId : undefined,
    activeProjectId:
      typeof x.activeProjectId === 'string' && x.activeProjectId.trim()
        ? x.activeProjectId
        : undefined,
    activeClientId:
      typeof x.activeClientId === 'string' && x.activeClientId.trim()
        ? x.activeClientId
        : undefined,
    activeTaskId:
      typeof x.activeTaskId === 'string' && x.activeTaskId.trim()
        ? x.activeTaskId
        : undefined,
    shiftStartedAt:
      typeof x.shiftStartedAt === 'string' && x.shiftStartedAt.trim()
        ? x.shiftStartedAt
        : undefined,
    shiftEndedAt:
      typeof x.shiftEndedAt === 'string' && x.shiftEndedAt.trim()
        ? x.shiftEndedAt
        : undefined,
    lastHeartbeatAt:
      typeof x.lastHeartbeatAt === 'string' && x.lastHeartbeatAt.trim()
        ? x.lastHeartbeatAt
        : undefined,
    lastActivityAt:
      typeof x.lastActivityAt === 'string' && x.lastActivityAt.trim()
        ? x.lastActivityAt
        : undefined,
    lastCheckInAt:
      typeof x.lastCheckInAt === 'string' && x.lastCheckInAt.trim()
        ? x.lastCheckInAt
        : undefined,
    lastVerifiedAt:
      typeof x.lastVerifiedAt === 'string' && x.lastVerifiedAt.trim()
        ? x.lastVerifiedAt
        : undefined,
    nextCheckInDueAt:
      typeof x.nextCheckInDueAt === 'string' && x.nextCheckInDueAt.trim()
        ? x.nextCheckInDueAt
        : undefined,
    unverifiedMinutes:
      typeof x.unverifiedMinutes === 'number' && Number.isFinite(x.unverifiedMinutes)
        ? x.unverifiedMinutes
        : 0,
    missedCheckIns:
      typeof x.missedCheckIns === 'number' && Number.isFinite(x.missedCheckIns) ? x.missedCheckIns : 0,
    updatedAt: timestampToIso(x.updatedAt),
  }
}

function attendanceEndAtFromDoc(endAt: unknown): string | undefined {
  if (endAt == null) return undefined
  if (endAt instanceof Timestamp) {
    return endAt.toDate().toISOString()
  }
  if (typeof endAt === 'string' && endAt.trim()) {
    const t = new Date(endAt).getTime()
    return Number.isFinite(t) ? endAt.trim() : undefined
  }
  return undefined
}

function docToAttendanceLog(id: string, x: Record<string, unknown>): AttendanceLog {
  return {
    id,
    userId: String(x.userId ?? ''),
    startAt: timestampToIso(x.startAt),
    endAt: x.endAt ? attendanceEndAtFromDoc(x.endAt) : undefined,
    projectId:
      typeof x.projectId === 'string' && x.projectId.trim() ? x.projectId : undefined,
    clientId:
      typeof x.clientId === 'string' && x.clientId.trim() ? x.clientId : undefined,
    taskId: typeof x.taskId === 'string' && x.taskId.trim() ? x.taskId : undefined,
    note: typeof x.note === 'string' && x.note.trim() ? x.note.trim() : undefined,
    endReason: x.endReason === 'idle_auto' ? 'idle_auto' : x.endReason === 'manual' ? 'manual' : undefined,
  }
}

function docToAttendanceAnomaly(id: string, x: Record<string, unknown>): AttendanceAnomaly {
  return {
    id,
    userId: String(x.userId ?? ''),
    type: x.type === 'missing_heartbeat' ? 'missing_heartbeat' : 'missing_activity',
    statusBefore:
      x.statusBefore === 'active' || x.statusBefore === 'paused_idle' ? x.statusBefore : 'offline',
    hbLagMinutes:
      typeof x.hbLagMinutes === 'number' && Number.isFinite(x.hbLagMinutes)
        ? x.hbLagMinutes
        : undefined,
    idleLagMinutes:
      typeof x.idleLagMinutes === 'number' && Number.isFinite(x.idleLagMinutes)
        ? x.idleLagMinutes
        : undefined,
    note: typeof x.note === 'string' && x.note.trim() ? x.note.trim() : undefined,
    enforcedAt: timestampToIso(x.enforcedAt),
  }
}

function docToAttendancePolicy(id: string, x: Record<string, unknown>): AttendancePolicy {
  const min = typeof x.checkInMinMinutes === 'number' && Number.isFinite(x.checkInMinMinutes) ? x.checkInMinMinutes : 50
  const max = typeof x.checkInMaxMinutes === 'number' && Number.isFinite(x.checkInMaxMinutes) ? x.checkInMaxMinutes : 70
  return {
    id,
    autoDeductUnverified: x.autoDeductUnverified !== false,
    checkInMinMinutes: Math.max(30, Math.min(min, 120)),
    checkInMaxMinutes: Math.max(min, Math.min(max, 180)),
    checkInGraceMinutes:
      typeof x.checkInGraceMinutes === 'number' && Number.isFinite(x.checkInGraceMinutes)
        ? Math.max(1, Math.min(x.checkInGraceMinutes, 15))
        : 5,
  }
}

function docToAttendanceCheckIn(id: string, x: Record<string, unknown>): AttendanceCheckIn {
  return {
    id,
    userId: String(x.userId ?? ''),
    sessionId: typeof x.sessionId === 'string' && x.sessionId.trim() ? x.sessionId : undefined,
    text: String(x.text ?? '').trim(),
    responseMs: typeof x.responseMs === 'number' && Number.isFinite(x.responseMs) ? x.responseMs : 0,
    suspiciousFast: x.suspiciousFast === true,
    isLate: x.isLate === true,
    createdAt: timestampToIso(x.createdAt),
  }
}

type AttendanceContextValue = {
  presences: AttendancePresence[]
  logs: AttendanceLog[]
  anomalies: AttendanceAnomaly[]
  checkIns: AttendanceCheckIn[]
  policy: AttendancePolicy
  myPresence: AttendancePresence | null
  loading: boolean
  startShift: (ctx?: {
    projectId?: string
    clientId?: string
    taskId?: string
    note?: string
  }) => Promise<void>
  stopShift: (reason?: 'manual' | 'idle_auto') => Promise<void>
  heartbeat: () => Promise<void>
  submitProgressCheckIn: (input: { text: string; responseMs: number }) => Promise<void>
  setAutoDeductUnverified: (next: boolean) => Promise<void>
}

const AttendanceContext = createContext<AttendanceContextValue | null>(null)

export function AttendanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [presences, setPresences] = useState<AttendancePresence[]>([])
  const [logs, setLogs] = useState<AttendanceLog[]>([])
  const [anomalies, setAnomalies] = useState<AttendanceAnomaly[]>([])
  const [checkIns, setCheckIns] = useState<AttendanceCheckIn[]>([])
  const [policy, setPolicy] = useState<AttendancePolicy>(DEFAULT_POLICY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setPresences([])
      setLogs([])
      setAnomalies([])
      setCheckIns([])
      setLoading(false)
      return
    }
    setLoading(true)
    const unsubPresence = onSnapshot(collection(db, 'attendancePresence'), (snap) => {
      setPresences(snap.docs.map((d) => docToPresence(d.id, d.data() as Record<string, unknown>)))
      setLoading(false)
    })
    const rangeStart = new Date()
    rangeStart.setHours(0, 0, 0, 0)
    rangeStart.setDate(rangeStart.getDate() - ATTENDANCE_LOG_RANGE_DAYS)
    const logsQ = query(collection(db, 'attendanceLogs'), where('startAt', '>=', rangeStart))
    const unsubLogs = onSnapshot(logsQ, (snap) => {
      setLogs(snap.docs.map((d) => docToAttendanceLog(d.id, d.data() as Record<string, unknown>)))
    })
    const anomaliesQ = query(collection(db, 'attendanceAnomalies'), where('enforcedAt', '>=', rangeStart))
    const unsubAnomalies = onSnapshot(anomaliesQ, (snap) => {
      setAnomalies(
        snap.docs.map((d) => docToAttendanceAnomaly(d.id, d.data() as Record<string, unknown>)),
      )
    })
    const checkInsQ = query(
      collection(db, 'checkIns'),
      where('createdAt', '>=', rangeStart),
      orderBy('createdAt', 'desc'),
      limit(200),
    )
    const unsubCheckIns = onSnapshot(checkInsQ, (snap) => {
      setCheckIns(snap.docs.map((d) => docToAttendanceCheckIn(d.id, d.data() as Record<string, unknown>)))
    })
    const policyUnsub = onSnapshot(doc(db, 'attendanceConfig', 'default'), (snap) => {
      if (!snap.exists()) {
        setPolicy(DEFAULT_POLICY)
        return
      }
      setPolicy(docToAttendancePolicy(snap.id, snap.data() as Record<string, unknown>))
    })
    return () => {
      unsubPresence()
      unsubLogs()
      unsubAnomalies()
      unsubCheckIns()
      policyUnsub()
    }
  }, [user])

  const myPresence = useMemo(
    () => (user ? presences.find((p) => p.userId === user.uid) ?? null : null),
    [presences, user],
  )

  const startShift = useCallback(async (ctx?: {
    projectId?: string
    clientId?: string
    taskId?: string
    note?: string
  }) => {
    if (!user) return
    try {
      const logRef = await addDoc(collection(db, 'attendanceLogs'), {
        userId: user.uid,
        startAt: serverTimestamp(),
        ...(ctx?.projectId ? { projectId: ctx.projectId } : {}),
        ...(ctx?.clientId ? { clientId: ctx.clientId } : {}),
        ...(ctx?.taskId ? { taskId: ctx.taskId } : {}),
        ...(ctx?.note?.trim() ? { note: ctx.note.trim() } : {}),
      })
      await setDoc(doc(db, 'attendancePresence', user.uid), {
        status: 'active',
        activeLogId: logRef.id,
        activeProjectId: ctx?.projectId ?? null,
        activeClientId: ctx?.clientId ?? null,
        activeTaskId: ctx?.taskId ?? null,
        shiftStartedAt: new Date().toISOString(),
        shiftEndedAt: null,
        lastHeartbeatAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        lastCheckInAt: new Date().toISOString(),
        lastVerifiedAt: new Date().toISOString(),
        nextCheckInDueAt: new Date(
          Date.now() + (Math.floor(Math.random() * 21) + 50) * 60_000,
        ).toISOString(),
        unverifiedMinutes: 0,
        missedCheckIns: 0,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      toastFsSuccess('הנוכחות הופעלה')
    } catch (e) {
      toastFsError('שגיאה בהפעלת נוכחות', e, 'startShift')
    }
  }, [user])

  const stopShift = useCallback(
    async (reason: 'manual' | 'idle_auto' = 'manual') => {
      if (!user) return
      try {
        const p = presences.find((x) => x.userId === user.uid)
        if (p?.activeLogId) {
          await updateDoc(doc(db, 'attendanceLogs', p.activeLogId), {
            endAt: serverTimestamp(),
            endReason: reason,
          })
        }
        await updateDoc(doc(db, 'attendancePresence', user.uid), {
          status: reason === 'idle_auto' ? 'suspected_inactive' : 'offline',
          activeLogId: null,
          activeProjectId: null,
          activeClientId: null,
          activeTaskId: null,
          shiftEndedAt: new Date().toISOString(),
          updatedAt: serverTimestamp(),
        })
        if (reason === 'manual') toastFsSuccess('הנוכחות הופסקה')
      } catch (e) {
        toastFsError('שגיאה בעצירת נוכחות', e, 'stopShift')
      }
    },
    [user, presences],
  )

  const heartbeat = useCallback(async () => {
    if (!user) return
    try {
      await updateDoc(doc(db, 'attendancePresence', user.uid), {
        lastHeartbeatAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      })
    } catch {
      // silent heartbeat failures
    }
  }, [user])

  const submitProgressCheckIn = useCallback(async (input: { text: string; responseMs: number }) => {
    if (!user) return
    try {
      const fn = httpsCallable(functionsClient, 'submitProgressCheckIn')
      await fn({
        text: input.text,
        responseMs: input.responseMs,
      })
      toastFsSuccess('Check-in אושר')
    } catch (e) {
      toastFsError('שגיאה ב-check-in', e, 'submitProgressCheckIn')
    }
  }, [user])

  const setAutoDeductUnverified = useCallback(async (next: boolean) => {
    if (!user) return
    try {
      await setDoc(
        doc(db, 'attendanceConfig', 'default'),
        {
          autoDeductUnverified: next,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true },
      )
      toastFsSuccess('מדיניות קיזוז עודכנה')
    } catch (e) {
      toastFsError('שגיאה בעדכון מדיניות', e, 'setAutoDeductUnverified')
    }
  }, [user])

  const value = useMemo(
    () => ({
      presences,
      logs,
      anomalies,
      checkIns,
      policy,
      myPresence,
      loading,
      startShift,
      stopShift,
      heartbeat,
      submitProgressCheckIn,
      setAutoDeductUnverified,
    }),
    [
      presences,
      logs,
      anomalies,
      checkIns,
      policy,
      myPresence,
      loading,
      startShift,
      stopShift,
      heartbeat,
      submitProgressCheckIn,
      setAutoDeductUnverified,
    ],
  )

  return <AttendanceContext.Provider value={value}>{children}</AttendanceContext.Provider>
}

export function useAttendance(): AttendanceContextValue {
  const ctx = useContext(AttendanceContext)
  if (!ctx) throw new Error('useAttendance חייב להיות בתוך AttendanceProvider')
  return ctx
}

