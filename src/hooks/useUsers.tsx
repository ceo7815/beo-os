import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { collection, onSnapshot, query } from 'firebase/firestore'
import { docToTeamMember } from '../lib/firestoreMappers'
import { canUseLegacyFirestore, db } from '../lib/firebase'
import { isSupabaseConfigured } from '../lib/backend'
import { requireSupabase, supabase } from '../lib/supabase'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { TeamMember } from '../types'

function profileRowToTeamMember(row: Record<string, unknown>): TeamMember {
  const name = String(row.name ?? row.email ?? 'משתמש')
  const roleRaw = String(row.role ?? 'employee').toLowerCase()
  return {
    id: String(row.id),
    name,
    email: typeof row.email === 'string' ? row.email : undefined,
    avatar: String(row.avatar || name.slice(0, 2)),
    color: String(row.color || '#5828A0'),
    role: roleRaw === 'admin' || roleRaw === 'superadmin' ? 'admin' : 'employee',
    active: row.active !== false,
    isAgent: Boolean(row.is_agent),
    agentCommissionPercent:
      typeof row.agent_commission_percent === 'number'
        ? row.agent_commission_percent
        : undefined,
    monthlyWorkHours:
      typeof row.monthly_work_hours === 'number' ? row.monthly_work_hours : null,
  }
}

type TeamRole = 'admin' | 'employee'

type UsersContextValue = {
  users: TeamMember[]
  loading: boolean
  error: Error | null
  updateUserRole: (uid: string, role: TeamRole) => Promise<void>
  toggleUserActive: (uid: string, active: boolean) => Promise<void>
  updateUserProfile: (
    uid: string,
    patch: { name?: string; avatar?: string; color?: string },
  ) => Promise<void>
  updateUserMonthlyWorkHours: (uid: string, hours: number | null) => Promise<void>
  updateUserDaySchedule: (
    uid: string,
    schedule: { dayStart: string; dayEnd: string; breakMinutes: number } | null,
  ) => Promise<void>
  updateUserIsAgent: (uid: string, isAgent: boolean) => Promise<void>
  /** עדכון מסמך users — role (admin/employee) + דגל סוכן בקריאה אחת */
  setUserRoleAndAgent: (uid: string, role: TeamRole, isAgent: boolean) => Promise<void>
  /** אחוז עמלה לחישובי כספים בפורטל הסוכן (0–100). null = ברירת מחדל מהמערכת */
  updateUserAgentCommissionPercent: (uid: string, percent: number | null) => Promise<void>
}

const UsersContext = createContext<UsersContextValue | null>(null)

async function patchProfile(uid: string, patch: Record<string, unknown>) {
  const sb = requireSupabase()
  const { error } = await sb.from('profiles').update(patch).eq('id', uid)
  if (error) throw error
}

export function UsersProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (isSupabaseConfigured() && supabase) {
      const sb = supabase
      let cancelled = false
      const load = async () => {
        const { data, error: qErr } = await sb.from('profiles').select('*')
        if (cancelled) return
        if (qErr) {
          console.error('profiles', qErr)
          setError(qErr)
          setLoading(false)
          return
        }
        setUsers((data ?? []).map((row) => profileRowToTeamMember(row as Record<string, unknown>)))
        setLoading(false)
        setError(null)
      }
      void load()
      const channel = sb
        .channel('profiles-live')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'profiles' },
          () => {
            void load()
          },
        )
        .subscribe()
      return () => {
        cancelled = true
        void sb.removeChannel(channel)
      }
    }
    if (!canUseLegacyFirestore()) {
      setUsers([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    const q = query(collection(db, 'users'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setUsers(snap.docs.map((d) => docToTeamMember(d)))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('users snapshot', err)
        toastFsError('שגיאה בטעינת משתמשים', err, 'users snapshot')
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      },
    )

    return () => unsub()
  }, [])

  const updateUserRole = useCallback(async (uid: string, role: TeamRole) => {
    try {
      await patchProfile(uid, { role: role === 'admin' ? 'admin' : 'employee' })
      toastFsSuccess('התפקיד עודכן')
    } catch (e) {
      toastFsError('שגיאה בעדכון התפקיד', e, 'updateUserRole')
    }
  }, [])

  const toggleUserActive = useCallback(async (uid: string, active: boolean) => {
    try {
      await patchProfile(uid, { active })
      toastFsSuccess('סטטוס המשתמש עודכן')
    } catch (e) {
      toastFsError('שגיאה בעדכון הסטטוס', e, 'toggleUserActive')
    }
  }, [])

  const updateUserProfile = useCallback(
    async (
      uid: string,
      patch: { name?: string; avatar?: string; color?: string },
    ) => {
      const next: Record<string, unknown> = {}
      if (typeof patch.name === 'string') {
        next.name = patch.name.trim()
      }
      if (typeof patch.avatar === 'string') {
        next.avatar = patch.avatar.trim().slice(0, 2)
      }
      if (typeof patch.color === 'string') {
        next.color = patch.color
      }
      if (Object.keys(next).length === 0) return
      try {
        await patchProfile(uid, next)
        toastFsSuccess('פרטי המשתמש עודכנו')
      } catch (e) {
        toastFsError('שגיאה בעדכון פרטי משתמש', e, 'updateUserProfile')
      }
    },
    [],
  )

  const updateUserDaySchedule = useCallback(
    async (
      uid: string,
      schedule: { dayStart: string; dayEnd: string; breakMinutes: number } | null,
    ) => {
      try {
        if (schedule == null) {
          await patchProfile(uid, {
            schedule_day_start: null,
            schedule_day_end: null,
            schedule_break_minutes: null,
          })
        } else {
          const normalizeHm = (s: string): string | null => {
            const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
            if (!m) return null
            const h = Number(m[1])
            const mi = Number(m[2])
            if (!Number.isFinite(h) || !Number.isFinite(mi) || h > 23 || mi > 59) return null
            return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
          }
          const a = normalizeHm(schedule.dayStart)
          const b = normalizeHm(schedule.dayEnd)
          if (!a || !b) {
            toastFsError('פורמט שעה לא תקין', new Error('schedule'), 'updateUserDaySchedule')
            return
          }
          const [ah, am] = a.split(':').map(Number)
          const [bh, bm] = b.split(':').map(Number)
          const startM = ah * 60 + am
          const endM = bh * 60 + bm
          if (endM <= startM) {
            toastFsError('שעת סיום חייבת להיות אחרי שעת התחלה', new Error('schedule'), 'updateUserDaySchedule')
            return
          }
          const br = Math.max(0, Math.min(180, Math.round(schedule.breakMinutes)))
          await patchProfile(uid, {
            schedule_day_start: a,
            schedule_day_end: b,
            schedule_break_minutes: br,
          })
        }
        toastFsSuccess('מועדי יום עבודה עודכנו')
      } catch (e) {
        toastFsError('שגיאה בעדכון מועדים', e, 'updateUserDaySchedule')
      }
    },
    [],
  )

  const updateUserMonthlyWorkHours = useCallback(async (uid: string, hours: number | null) => {
    try {
      if (hours == null) {
        await patchProfile(uid, { monthly_work_hours: null })
      } else {
        const n = Number(hours)
        if (!Number.isFinite(n) || n < 0 || n > 400) {
          toastFsError('ערך לא תקין', new Error('monthlyWorkHours'), 'updateUserMonthlyWorkHours')
          return
        }
        const rounded = Math.round(n * 10) / 10
        await patchProfile(uid, { monthly_work_hours: rounded })
      }
      toastFsSuccess('יעד שעות חודשי עודכן')
    } catch (e) {
      toastFsError('שגיאה בעדכון יעד שעות', e, 'updateUserMonthlyWorkHours')
    }
  }, [])

  const updateUserIsAgent = useCallback(async (uid: string, isAgent: boolean) => {
    try {
      await patchProfile(uid, { is_agent: isAgent })
      toastFsSuccess(isAgent ? 'המשתמש סומן כסוכן מכירות' : 'הוסר סימון סוכן מכירות')
    } catch (e) {
      toastFsError('שגיאה בעדכון סטטוס סוכן', e, 'updateUserIsAgent')
    }
  }, [])

  const setUserRoleAndAgent = useCallback(
    async (uid: string, role: TeamRole, isAgent: boolean) => {
      try {
        await patchProfile(uid, {
          role: role === 'admin' ? 'admin' : 'employee',
          is_agent: isAgent,
        })
        toastFsSuccess('התפקיד עודכן')
      } catch (e) {
        toastFsError('שגיאה בעדכון התפקיד', e, 'setUserRoleAndAgent')
      }
    },
    [],
  )

  const updateUserAgentCommissionPercent = useCallback(
    async (uid: string, percent: number | null) => {
      try {
        if (percent == null) {
          await patchProfile(uid, { agent_commission_percent: null })
        } else {
          const n = Math.round(Number(percent))
          if (!Number.isFinite(n) || n < 0 || n > 100) {
            toastFsError('אחוז עמלה חייב להיות בין 0 ל־100', new Error('agentCommissionPercent'), 'updateUserAgentCommissionPercent')
            return
          }
          await patchProfile(uid, { agent_commission_percent: n })
        }
        toastFsSuccess('אחוז עמלה לפורטל הסוכן עודכן')
      } catch (e) {
        toastFsError('שגיאה בעדכון אחוז עמלה', e, 'updateUserAgentCommissionPercent')
      }
    },
    [],
  )

  const value = useMemo(
    () => ({
      users,
      loading,
      error,
      updateUserRole,
      toggleUserActive,
      updateUserProfile,
      updateUserMonthlyWorkHours,
      updateUserDaySchedule,
      updateUserIsAgent,
      setUserRoleAndAgent,
      updateUserAgentCommissionPercent,
    }),
    [
      users,
      loading,
      error,
      updateUserRole,
      toggleUserActive,
      updateUserProfile,
      updateUserMonthlyWorkHours,
      updateUserDaySchedule,
      updateUserIsAgent,
      setUserRoleAndAgent,
      updateUserAgentCommissionPercent,
    ],
  )

  return (
    <UsersContext.Provider value={value}>{children}</UsersContext.Provider>
  )
}

export function useUsers(): UsersContextValue {
  const ctx = useContext(UsersContext)
  if (!ctx) throw new Error('useUsers חייב להיות בתוך UsersProvider')
  return ctx
}
