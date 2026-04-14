import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { collection, doc, getDocsFromServer, query, updateDoc } from 'firebase/firestore'
import { docToTeamMember } from '../lib/firestoreMappers'
import { db } from '../lib/firebase'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { TeamMember } from '../types'

type TeamRole = 'superadmin' | 'employee'

type UsersContextValue = {
  users: TeamMember[]
  loading: boolean
  error: Error | null
  updateUserRole: (uid: string, role: TeamRole) => Promise<void>
  toggleUserActive: (uid: string, active: boolean) => Promise<void>
}

const UsersContext = createContext<UsersContextValue | null>(null)

export function UsersProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    setLoading(true)
    let cancelled = false
    const q = query(collection(db, 'users'))

    const load = async () => {
      try {
        const snap = await getDocsFromServer(q)
        if (cancelled) return
        setUsers(snap.docs.map((d) => docToTeamMember(d)))
        setLoading(false)
        setError(null)
      } catch (err) {
        if (cancelled) return
        console.error('users snapshot', err)
        toastFsError('שגיאה בטעינת משתמשים', err, 'users snapshot')
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      }
    }

    void load()
    const timer = window.setInterval(() => {
      void load()
    }, 15000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const updateUserRole = useCallback(async (uid: string, role: TeamRole) => {
    try {
      await updateDoc(doc(db, 'users', uid), { role })
      toastFsSuccess('התפקיד עודכן')
    } catch (e) {
      toastFsError('שגיאה בעדכון התפקיד', e, 'updateUserRole')
    }
  }, [])

  const toggleUserActive = useCallback(async (uid: string, active: boolean) => {
    try {
      await updateDoc(doc(db, 'users', uid), { active })
      toastFsSuccess('סטטוס המשתמש עודכן')
    } catch (e) {
      toastFsError('שגיאה בעדכון הסטטוס', e, 'toggleUserActive')
    }
  }, [])

  const value = useMemo(
    () => ({
      users,
      loading,
      error,
      updateUserRole,
      toggleUserActive,
    }),
    [users, loading, error, updateUserRole, toggleUserActive],
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
