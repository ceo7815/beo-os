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
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { docToSupplier } from '../lib/firestoreMappers'
import { ensureHubSupplierExists } from '../lib/hubSupplier'
import { db } from '../lib/firebase'
import { normalizeSupplierTypesForSave } from '../lib/supplierTypes'
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

  const displayName = useCallback(() => {
    if (!user) return 'משתמש'
    return user.displayName?.trim() || user.email?.split('@')[0] || 'משתמש'
  }, [user])

  useEffect(() => {
    if (!user) {
      setSuppliers([])
      setLoading(false)
      setError(null)
      return
    }
    void ensureHubSupplierExists().catch((e) => {
      console.error('ensureHubSupplierExists', e)
    })
    setLoading(true)
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

  const addSupplier = useCallback(
    async (data: Omit<Supplier, 'id' | 'createdAt'>) => {
      if (!user) {
        toastFsError('יש להתחבר להוספת ספק', new Error('no user'), 'addSupplier')
        return null
      }
      try {
        const types = normalizeSupplierTypesForSave(data.supplierTypes)
        const uname = displayName()
        const ref = await addDoc(collection(db, 'suppliers'), {
          name: data.name,
          phone: data.phone,
          email: data.email,
          ...(types.length ? { supplierTypes: types } : {}),
          createdAt: serverTimestamp(),
          createdByUserId: user.uid,
          createdByUserName: uname,
          lastActorUserId: user.uid,
          lastActorUserName: uname,
        })
        const optimistic: Supplier = {
          id: ref.id,
          name: data.name,
          phone: data.phone,
          email: data.email,
          ...(types.length ? { supplierTypes: types } : {}),
          createdAt: new Date().toISOString(),
        }
        setSuppliers((prev) => {
          if (prev.some((s) => s.id === optimistic.id)) return prev
          return [...prev, optimistic]
        })
        toastFsSuccess('הספק נוסף')
        return ref.id
      } catch (e) {
        toastFsError('שגיאה בשמירת ספק', e, 'addSupplier')
        return null
      }
    },
    [user, displayName],
  )

  const updateSupplier = useCallback(
    async (id: string, data: Partial<Supplier>) => {
      if (!user) {
        toastFsError('יש להתחבר לעדכון ספק', new Error('no user'), 'updateSupplier')
        return
      }
      try {
        const patch: Record<string, unknown> = {}
        if (data.name !== undefined) patch.name = data.name
        if (data.phone !== undefined) patch.phone = data.phone
        if (data.email !== undefined) patch.email = data.email
        if (data.supplierTypes !== undefined) {
          const types = normalizeSupplierTypesForSave(data.supplierTypes)
          patch.supplierTypes = types.length ? types : deleteField()
          patch.supplierType = deleteField()
        }
        const uname = displayName()
        patch.lastActorUserId = user.uid
        patch.lastActorUserName = uname
        await updateDoc(doc(db, 'suppliers', id), patch)
        setSuppliers((prev) =>
          prev.map((s) => {
            if (s.id !== id) return s
            const next: Supplier = { ...s }
            if (data.name !== undefined) next.name = data.name
            if (data.phone !== undefined) next.phone = data.phone
            if (data.email !== undefined) next.email = data.email
            if (data.supplierTypes !== undefined) {
              const types = normalizeSupplierTypesForSave(data.supplierTypes)
              next.supplierTypes = types.length ? types : undefined
            }
            return next
          }),
        )
        toastFsSuccess('הספק עודכן')
      } catch (e) {
        toastFsError('שגיאה בעדכון ספק', e, 'updateSupplier')
      }
    },
    [user, displayName],
  )

  const deleteSupplier = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'suppliers', id))
      setSuppliers((prev) => prev.filter((s) => s.id !== id))
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
