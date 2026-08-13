import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseConfigured } from '../lib/backend'
import { requireSupabase } from '../lib/supabase'
import { subscribeTable } from '../lib/sbLive'
import { normalizeSupplierTypesForSave } from '../lib/supplierTypes'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { Supplier } from '../types'

function rowToSupplier(row: Record<string, unknown>): Supplier {
  const types = Array.isArray(row.supplier_types)
    ? row.supplier_types.map((t) => String(t)).filter(Boolean)
    : []
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    phone: String(row.phone ?? ''),
    email: String(row.email ?? ''),
    ...(types.length ? { supplierTypes: types } : {}),
    active: row.active !== false,
    createdAt: row.created_at
      ? new Date(String(row.created_at)).toISOString()
      : new Date().toISOString(),
  }
}

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
    if (!isSupabaseConfigured()) {
      setSuppliers([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    return subscribeTable(
      'suppliers',
      (rows) => {
        setSuppliers(rows.map(rowToSupplier))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('suppliers', err)
        toastFsError('שגיאה בטעינת ספקים', err, 'suppliers')
        setError(err)
        setLoading(false)
      },
    )
  }, [user])

  const addSupplier = useCallback(
    async (data: Omit<Supplier, 'id' | 'createdAt'>) => {
      if (!user) {
        toastFsError('יש להתחבר להוספת ספק', new Error('no user'), 'addSupplier')
        return null
      }
      try {
        const sb = requireSupabase()
        const types = normalizeSupplierTypesForSave(data.supplierTypes)
        const { data: created, error: qErr } = await sb
          .from('suppliers')
          .insert({
            name: data.name,
            phone: data.phone ?? '',
            email: data.email ?? '',
            supplier_types: types,
            active: data.active !== false,
          })
          .select('*')
          .single()
        if (qErr) throw qErr
        const optimistic = rowToSupplier(created as Record<string, unknown>)
        setSuppliers((prev) =>
          prev.some((s) => s.id === optimistic.id) ? prev : [...prev, optimistic],
        )
        toastFsSuccess('הספק נוסף')
        return optimistic.id
      } catch (e) {
        toastFsError('שגיאה בשמירת ספק', e, 'addSupplier')
        return null
      }
    },
    [user],
  )

  const updateSupplier = useCallback(
    async (id: string, data: Partial<Supplier>) => {
      if (!user) {
        toastFsError('יש להתחבר לעדכון ספק', new Error('no user'), 'updateSupplier')
        return
      }
      try {
        const sb = requireSupabase()
        const patch: Record<string, unknown> = {}
        if (data.name !== undefined) patch.name = data.name
        if (data.phone !== undefined) patch.phone = data.phone
        if (data.email !== undefined) patch.email = data.email
        if (data.supplierTypes !== undefined) {
          patch.supplier_types = normalizeSupplierTypesForSave(data.supplierTypes)
        }
        if (data.active !== undefined) patch.active = data.active
        if (Object.keys(patch).length === 0) return
        const { error: qErr } = await sb.from('suppliers').update(patch).eq('id', id)
        if (qErr) throw qErr
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
            if (data.active !== undefined) next.active = data.active
            return next
          }),
        )
        toastFsSuccess('הספק עודכן')
      } catch (e) {
        toastFsError('שגיאה בעדכון ספק', e, 'updateSupplier')
      }
    },
    [user],
  )

  const deleteSupplier = useCallback(async (id: string) => {
    try {
      const sb = requireSupabase()
      const { error: qErr } = await sb.from('suppliers').delete().eq('id', id)
      if (qErr) throw qErr
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
