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
import { docToSupplier } from '../lib/firestoreMappers'
import { resetSuppliersToHub } from '../lib/hubSupplier'
import { getDb } from '../lib/firebase'
import { stripUndefined } from '../lib/stripUndefined'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { Supplier } from '../types'

type SuppliersContextValue = {
  suppliers: Supplier[]
  loading: boolean
  error: Error | null
  addSupplier: (data: Omit<Supplier, 'id' | 'createdAt'>) => Promise<string | null>
  updateSupplier: (id: string, data: Partial<Supplier>) => Promise<void>
  deleteSupplier: (id: string) => Promise<void>
}

const SuppliersContext = createContext<SuppliersContextValue | null>(null)

export function SuppliersProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!user) {
      setSuppliers([])
      setLoading(false)
      setError(null)
      return
    }
    void resetSuppliersToHub().catch((e) => {
      console.error('resetSuppliersToHub', e)
    })
    setLoading(true)
    const db = getDb()
    const unsub = onSnapshot(
      collection(db, 'suppliers'),
      (snap) => {
        setSuppliers(snap.docs.map((d) => docToSupplier(d)))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('suppliers snapshot', err)
        toastFsError('שגיאה בטעינת ספקים', err, 'suppliers snapshot')
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      },
    )
    return () => unsub()
  }, [user])

  const addSupplier = useCallback(async (data: Omit<Supplier, 'id' | 'createdAt'>) => {
    try {
      const db = getDb()
      const ref = await addDoc(collection(db, 'suppliers'), {
        ...data,
        createdAt: serverTimestamp(),
      })
      toastFsSuccess('הספק נוסף')
      return ref.id
    } catch (e) {
      toastFsError('שגיאה בשמירת ספק', e, 'addSupplier')
      return null
    }
  }, [])

  const updateSupplier = useCallback(async (id: string, data: Partial<Supplier>) => {
    try {
      const db = getDb()
      await updateDoc(
        doc(db, 'suppliers', id),
        stripUndefined(data as Record<string, unknown>),
      )
      toastFsSuccess('הספק עודכן')
    } catch (e) {
      toastFsError('שגיאה בעדכון ספק', e, 'updateSupplier')
    }
  }, [])

  const deleteSupplier = useCallback(async (id: string) => {
    try {
      const db = getDb()
      await deleteDoc(doc(db, 'suppliers', id))
      toastFsSuccess('הספק נמחק')
    } catch (e) {
      toastFsError('שגיאה במחיקת ספק', e, 'deleteSupplier')
    }
  }, [])

  const value = useMemo(
    () => ({
      suppliers,
      loading,
      error,
      addSupplier,
      updateSupplier,
      deleteSupplier,
    }),
    [suppliers, loading, error, addSupplier, updateSupplier, deleteSupplier],
  )

  return (
    <SuppliersContext.Provider value={value}>
      {children}
    </SuppliersContext.Provider>
  )
}

export function useSuppliers(): SuppliersContextValue {
  const ctx = useContext(SuppliersContext)
  if (!ctx) throw new Error('useSuppliers חייב להיות בתוך SuppliersProvider')
  return ctx
}
