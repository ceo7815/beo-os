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
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { docToHostingRecord } from '../lib/firestoreMappers'
import { db } from '../lib/firebase'
import { stripUndefined } from '../lib/stripUndefined'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { HostingRecord } from '../types'

type HostingContextValue = {
  records: HostingRecord[]
  loading: boolean
  error: Error | null
  addRecord: (
    data: Omit<HostingRecord, 'id' | 'createdAt'>,
  ) => Promise<string | null>
  updateRecord: (
    id: string,
    data: Partial<Omit<HostingRecord, 'id' | 'createdAt'>>,
  ) => Promise<void>
  deleteRecord: (id: string) => Promise<void>
}

const HostingContext = createContext<HostingContextValue | null>(null)

function buildFirestorePayload(
  data: Partial<Omit<HostingRecord, 'id' | 'createdAt'>>,
): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  if (data.clientId !== undefined) o.clientId = data.clientId
  if (data.domain !== undefined) o.domain = data.domain
  if (data.server !== undefined) o.server = data.server
  if (data.serverLocation !== undefined) o.serverLocation = data.serverLocation
  if (data.controlPanel !== undefined) o.controlPanel = data.controlPanel
  if (data.username !== undefined) o.username = data.username
  if (data.ipAddress !== undefined) o.ipAddress = data.ipAddress
  if (data.sslExpiry !== undefined) o.sslExpiry = data.sslExpiry
  if (data.domainExpiry !== undefined) o.domainExpiry = data.domainExpiry
  if (data.platform !== undefined) o.platform = data.platform
  if (data.phpVersion !== undefined) o.phpVersion = data.phpVersion
  if (data.notes !== undefined) o.notes = data.notes
  return o
}

export function HostingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [records, setRecords] = useState<HostingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!user) {
      setRecords([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    const unsub = onSnapshot(
      collection(db, 'hostingRecords'),
      (snap) => {
        setRecords(snap.docs.map((d) => docToHostingRecord(d)))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('hostingRecords snapshot', err)
        toastFsError('שגיאה בטעינת מאגר אחסון', err, 'hostingRecords snapshot')
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      },
    )

    return () => unsub()
  }, [user])

  const addRecord = useCallback(
    async (data: Omit<HostingRecord, 'id' | 'createdAt'>) => {
      try {
        const ref = await addDoc(collection(db, 'hostingRecords'), {
          ...buildFirestorePayload(data),
          createdAt: serverTimestamp(),
        })
        toastFsSuccess('האתר נוסף למאגר')
        return ref.id
      } catch (e) {
        toastFsError('שגיאה בשמירה', e, 'addHostingRecord')
        return null
      }
    },
    [],
  )

  const updateRecord = useCallback(
    async (id: string, data: Partial<Omit<HostingRecord, 'id' | 'createdAt'>>) => {
      try {
        await updateDoc(
          doc(db, 'hostingRecords', id),
          stripUndefined(buildFirestorePayload(data)),
        )
        toastFsSuccess('הרשומה עודכנה')
      } catch (e) {
        toastFsError('שגיאה בעדכון', e, 'updateHostingRecord')
      }
    },
    [],
  )

  const deleteRecord = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'hostingRecords', id))
      toastFsSuccess('הרשומה נמחקה')
    } catch (e) {
      toastFsError('שגיאה במחיקה', e, 'deleteHostingRecord')
    }
  }, [])

  const value = useMemo(
    () => ({
      records,
      loading,
      error,
      addRecord,
      updateRecord,
      deleteRecord,
    }),
    [records, loading, error, addRecord, updateRecord, deleteRecord],
  )

  return (
    <HostingContext.Provider value={value}>{children}</HostingContext.Provider>
  )
}

export function useHosting(): HostingContextValue {
  const ctx = useContext(HostingContext)
  if (!ctx) throw new Error('useHosting חייב להיות בתוך HostingProvider')
  return ctx
}
