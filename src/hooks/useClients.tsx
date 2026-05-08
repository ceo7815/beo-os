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
  deleteDoc,
  doc,
  getDocsFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { docToClient } from '../lib/firestoreMappers'
import { deleteTasksAndDocsForProject } from '../lib/firestoreCascades'
import { db } from '../lib/firebase'
import { stripUndefined } from '../lib/stripUndefined'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import { useAuth } from '../contexts/AuthContext'
import { useHubStore } from '../store/useStore'
import type { Client } from '../types'

type ClientsContextValue = {
  clients: Client[]
  loading: boolean
  error: Error | null
  addClient: (data: Omit<Client, 'id' | 'createdAt'>) => Promise<void>
  updateClient: (id: string, data: Partial<Client>) => Promise<void>
  deleteClient: (id: string) => Promise<void>
}

const ClientsContext = createContext<ClientsContextValue | null>(null)

export function ClientsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const displayName = useCallback(() => {
    if (!user) return 'משתמש'
    return user.displayName?.trim() || user.email?.split('@')[0] || 'משתמש'
  }, [user])

  useEffect(() => {
    setLoading(true)
    const q = query(collection(db, 'clients'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setClients(snap.docs.map((d) => docToClient(d)))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('clients snapshot', err)
        toastFsError('שגיאה בטעינת לקוחות', err, 'clients snapshot')
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  const addClient = useCallback(
    async (data: Omit<Client, 'id' | 'createdAt'>) => {
      if (!user) {
        toastFsError('יש להתחבר להוספת לקוח', new Error('no user'), 'addClient')
        return
      }
      try {
        const uname = displayName()
        const ref = await addDoc(
          collection(db, 'clients'),
          stripUndefined({
            ...data,
            createdAt: serverTimestamp(),
            createdByUserId: user.uid,
            createdByUserName: uname,
            lastActorUserId: user.uid,
            lastActorUserName: uname,
          } as Record<string, unknown>),
        )
        const optimistic: Client = {
          id: ref.id,
          ...data,
          createdAt: new Date().toISOString(),
        }
        setClients((prev) => {
          if (prev.some((c) => c.id === optimistic.id)) return prev
          return [...prev, optimistic]
        })
        toastFsSuccess('הלקוח נוסף בהצלחה')
      } catch (e) {
        toastFsError('שגיאה בשמירת הלקוח', e, 'addClient')
      }
    },
    [user, displayName],
  )

  const updateClient = useCallback(
    async (id: string, data: Partial<Client>) => {
      if (!user) {
        toastFsError('יש להתחבר לעדכון לקוח', new Error('no user'), 'updateClient')
        return
      }
      try {
        const uname = displayName()
        await updateDoc(
          doc(db, 'clients', id),
          stripUndefined({
            ...data,
            lastActorUserId: user.uid,
            lastActorUserName: uname,
          } as Record<string, unknown>),
        )
        setClients((prev) =>
          prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  ...data,
                }
              : c,
          ),
        )
        toastFsSuccess('פרטי הלקוח עודכנו')
      } catch (e) {
        toastFsError('שגיאה בעדכון הלקוח', e, 'updateClient')
      }
    },
    [user, displayName],
  )

  const deleteClient = useCallback(async (id: string) => {
    try {
      const pSnap = await getDocsFromServer(
        query(collection(db, 'projects'), where('clientId', '==', id)),
      )
      for (const p of pSnap.docs) {
        await deleteTasksAndDocsForProject(p.id)
        await deleteDoc(p.ref)
      }
      await deleteDoc(doc(db, 'clients', id))
      setClients((prev) => prev.filter((c) => c.id !== id))
      const sel = useHubStore.getState().selectedClientId
      if (sel === id) useHubStore.getState().setSelectedClient(null)
      toastFsSuccess('הלקוח נמחק')
    } catch (e) {
      toastFsError('שגיאה במחיקת הלקוח', e, 'deleteClient')
    }
  }, [])

  const value = useMemo(
    () => ({
      clients,
      loading,
      error,
      addClient,
      updateClient,
      deleteClient,
    }),
    [clients, loading, error, addClient, updateClient, deleteClient],
  )

  return (
    <ClientsContext.Provider value={value}>{children}</ClientsContext.Provider>
  )
}

export function useClients(): ClientsContextValue {
  const ctx = useContext(ClientsContext)
  if (!ctx) throw new Error('useClients חייב להיות בתוך ClientsProvider')
  return ctx
}
