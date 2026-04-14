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
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    setLoading(true)
    let cancelled = false
    const q = query(collection(db, 'clients'))

    const load = async () => {
      try {
        const snap = await getDocsFromServer(q)
        if (cancelled) return
        console.log('useClients snapshot:', snap.docs.length)
        setClients(snap.docs.map((d) => docToClient(d)))
        setLoading(false)
        setError(null)
      } catch (err) {
        if (cancelled) return
        console.error('clients snapshot', err)
        toastFsError('שגיאה בטעינת לקוחות', err, 'clients snapshot')
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

  const addClient = useCallback(async (data: Omit<Client, 'id' | 'createdAt'>) => {
    try {
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
      const pSnap = await getDocsFromServer(
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
