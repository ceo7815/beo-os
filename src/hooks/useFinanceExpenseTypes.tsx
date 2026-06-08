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
} from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { docToFinanceExpenseType } from '../lib/firestoreMappers'
import { db } from '../lib/firebase'
import {
  defaultPnlForFieldMode,
  mergeExpenseTypes,
} from '../lib/financeExpenseTypes'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type {
  FinanceExpenseFieldMode,
  FinanceExpensePnlCategory,
  FinanceExpenseTypeDef,
} from '../types'

export type NewFinanceExpenseTypeInput = {
  label: string
  color: string
  fieldMode: FinanceExpenseFieldMode
  autoRecurring: boolean
  pnlCategory: FinanceExpensePnlCategory
}

type FinanceExpenseTypesContextValue = {
  types: FinanceExpenseTypeDef[]
  loading: boolean
  addExpenseType: (data: NewFinanceExpenseTypeInput) => Promise<string | null>
  deleteExpenseType: (id: string) => Promise<void>
}

const FinanceExpenseTypesContext =
  createContext<FinanceExpenseTypesContextValue | null>(null)

export function FinanceExpenseTypesProvider({
  children,
}: {
  children: ReactNode
}) {
  const { user } = useAuth()
  const [customTypes, setCustomTypes] = useState<FinanceExpenseTypeDef[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setCustomTypes([])
      setLoading(false)
      return
    }
    setLoading(true)
    const unsub = onSnapshot(
      collection(db, 'financeExpenseTypes'),
      (snap) => {
        setCustomTypes(snap.docs.map((d) => docToFinanceExpenseType(d)))
        setLoading(false)
      },
      (err) => {
        console.error('financeExpenseTypes snapshot', err)
        toastFsError('שגיאה בטעינת סוגי הוצאות', err, 'financeExpenseTypes')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [user])

  const types = useMemo(() => mergeExpenseTypes(customTypes), [customTypes])

  const addExpenseType = useCallback(async (data: NewFinanceExpenseTypeInput) => {
    try {
      const label = data.label.trim()
      if (!label) return null
      const ref = await addDoc(collection(db, 'financeExpenseTypes'), {
        label,
        color: data.color,
        fieldMode: data.fieldMode,
        autoRecurring: data.autoRecurring,
        pnlCategory: data.pnlCategory,
        createdAt: serverTimestamp(),
      })
      toastFsSuccess('סוג ההוצאה נוסף')
      return ref.id
    } catch (e) {
      toastFsError('שגיאה בהוספת סוג הוצאה', e, 'addExpenseType')
      return null
    }
  }, [])

  const deleteExpenseType = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'financeExpenseTypes', id))
      toastFsSuccess('סוג ההוצאה נמחק')
    } catch (e) {
      toastFsError('שגיאה במחיקת סוג הוצאה', e, 'deleteExpenseType')
    }
  }, [])

  const value = useMemo(
    () => ({
      types,
      loading,
      addExpenseType,
      deleteExpenseType,
    }),
    [types, loading, addExpenseType, deleteExpenseType],
  )

  return (
    <FinanceExpenseTypesContext.Provider value={value}>
      {children}
    </FinanceExpenseTypesContext.Provider>
  )
}

export function useFinanceExpenseTypes(): FinanceExpenseTypesContextValue {
  const ctx = useContext(FinanceExpenseTypesContext)
  if (!ctx) {
    throw new Error(
      'useFinanceExpenseTypes חייב להיות בתוך FinanceExpenseTypesProvider',
    )
  }
  return ctx
}

export function newExpenseTypeDefaults(
  fieldMode: FinanceExpenseFieldMode = 'none',
): NewFinanceExpenseTypeInput {
  return {
    label: '',
    color: '#F97316',
    fieldMode,
    autoRecurring: false,
    pnlCategory: defaultPnlForFieldMode(fieldMode),
  }
}
