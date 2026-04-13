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
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { docToClient } from '../lib/firestoreMappers'
import { deleteTasksAndDocsForProject } from '../lib/firestoreCascades'
import { getDb } from '../lib/firebase'
import { stripUndefined } from '../lib/stripUndefined'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
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

  useEffect(() => {
    if (!user) {
      setClients([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    const db = getDb()
    const unsub = onSnapshot(
      collection(db, 'clients'),
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
  }, [user])

  const addClient = useCallback(async (data: Omit<Client, 'id' | 'createdAt'>) => {
    try {
      const db = getDb()
      await addDoc(
        collection(db, 'clients'),
        stripUndefined({
          ...data,
          createdAt: serverTimestamp(),
        } as Record<string, unknown>),
      )
      toastFsSuccess('הלקוח נוסף בהצלחה')
    } catch (e) {
      toastFsError('שגיאה בשמירת הלקוח', e, 'addClient')
    }
  }, [])

  const updateClient = useCallback(async (id: string, data: Partial<Client>) => {
    try {
      const db = getDb()
      await updateDoc(
        doc(db, 'clients', id),
        stripUndefined(data as Record<string, unknown>),
      )
      toastFsSuccess('פרטי הלקוח עודכנו')
    } catch (e) {
      toastFsError('שגיאה בעדכון הלקוח', e, 'updateClient')
    }
  }, [])

  const deleteClient = useCallback(async (id: string) => {
    try {
      const db = getDb()
      const pSnap = await getDocs(
        query(collection(db, 'projects'), where('clientId', '==', id)),
      )
      for (const p of pSnap.docs) {
        await deleteTasksAndDocsForProject(p.id)
        await deleteDoc(p.ref)
      }
      await deleteDoc(doc(db, 'clients', id))
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
