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
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { docToCollectionTracking } from '../lib/firestoreMappers'
import { getDb } from '../lib/firebase'
import { todayYmd } from '../lib/dates'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { CollectionTracking } from '../types'

export type CollectionTrackingInput = {
  clientId: string
  lastRequestDate: string
  dueDate: string
  paidDate?: string
  note?: string
}

type CollectionTrackingContextValue = {
  entries: CollectionTracking[]
  loading: boolean
  error: Error | null
  upsertTracking: (data: CollectionTrackingInput) => Promise<void>
  removeFromTracking: (clientId: string) => Promise<void>
  markPaid: (clientId: string) => Promise<void>
  clearPaid: (clientId: string) => Promise<void>
}

const CollectionTrackingContext =
  createContext<CollectionTrackingContextValue | null>(null)

export function CollectionTrackingProvider({
  children,
}: {
  children: ReactNode
}) {
  const { user } = useAuth()
  const [entries, setEntries] = useState<CollectionTracking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!user) {
      setEntries([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    const db = getDb()
    const unsub = onSnapshot(
      collection(db, 'collectionTracking'),
      (snap) => {
        setEntries(snap.docs.map((d) => docToCollectionTracking(d)))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('collectionTracking snapshot', err)
        toastFsError('שגיאה בטעינת מעקב גבייה', err, 'collectionTracking')
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      },
    )
    return () => unsub()
  }, [user])

  const upsertTracking = useCallback(async (data: CollectionTrackingInput) => {
    try {
      const db = getDb()
      const ref = doc(db, 'collectionTracking', data.clientId)
      const snap = await getDoc(ref)
      const paidPatch =
        data.paidDate?.trim()
          ? { paidDate: data.paidDate.trim().slice(0, 10) }
          : { paidDate: deleteField() }
      const notePatch =
        data.note?.trim()
          ? { note: data.note.trim() }
          : { note: deleteField() }
      await setDoc(
        ref,
        {
          clientId: data.clientId,
          lastRequestDate: data.lastRequestDate.slice(0, 10),
          dueDate: data.dueDate.slice(0, 10),
          ...paidPatch,
          ...notePatch,
          updatedAt: serverTimestamp(),
          ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
        },
        { merge: true },
      )
      toastFsSuccess(snap.exists() ? 'המעקב עודכן' : 'הלקוח נוסף למעקב')
    } catch (e) {
      toastFsError('שגיאה בשמירת מעקב גבייה', e, 'upsertTracking')
    }
  }, [])

  const removeFromTracking = useCallback(async (clientId: string) => {
    try {
      const db = getDb()
      await deleteDoc(doc(db, 'collectionTracking', clientId))
      toastFsSuccess('הוסר ממעקב הגבייה')
    } catch (e) {
      toastFsError('שגיאה בהסרה ממעקב', e, 'removeFromTracking')
    }
  }, [])

  const markPaid = useCallback(async (clientId: string) => {
    try {
      const db = getDb()
      await updateDoc(doc(db, 'collectionTracking', clientId), {
        paidDate: todayYmd(),
        updatedAt: serverTimestamp(),
      })
      toastFsSuccess('סומן כשולם')
    } catch (e) {
      toastFsError('שגיאה בעדכון', e, 'markPaid tracking')
    }
  }, [])

  const clearPaid = useCallback(async (clientId: string) => {
    try {
      const db = getDb()
      await updateDoc(doc(db, 'collectionTracking', clientId), {
        paidDate: deleteField(),
        updatedAt: serverTimestamp(),
      })
      toastFsSuccess('תאריך תשלום הוסר — המעקב נשאר פתוח')
    } catch (e) {
      toastFsError('שגיאה בעדכון', e, 'clearPaid tracking')
    }
  }, [])

  const value = useMemo(
    () => ({
      entries,
      loading,
      error,
      upsertTracking,
      removeFromTracking,
      markPaid,
      clearPaid,
    }),
    [
      entries,
      loading,
      error,
      upsertTracking,
      removeFromTracking,
      markPaid,
      clearPaid,
    ],
  )

  return (
    <CollectionTrackingContext.Provider value={value}>
      {children}
    </CollectionTrackingContext.Provider>
  )
}

export function useCollectionTracking(): CollectionTrackingContextValue {
  const ctx = useContext(CollectionTrackingContext)
  if (!ctx) {
    throw new Error('useCollectionTracking חייב להיות בתוך CollectionTrackingProvider')
  }
  return ctx
}
