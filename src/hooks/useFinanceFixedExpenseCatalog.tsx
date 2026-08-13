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
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { db, canUseLegacyFirestore } from '../lib/firebase'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { FinanceFixedExpenseCatalogItem } from '../types'

function docToCatalogItem(raw: unknown): FinanceFixedExpenseCatalogItem | null {
  if (!raw || typeof raw !== 'object') return null
  const x = raw as Record<string, unknown>
  const id = typeof x.id === 'string' && x.id.trim() ? x.id.trim() : ''
  const name = typeof x.name === 'string' ? x.name.trim() : ''
  const type = typeof x.type === 'string' && x.type.trim() ? x.type.trim() : 'fixed'
  const amount =
    typeof x.amount === 'number' && Number.isFinite(x.amount) ? x.amount : 0
  const paymentMethod = x.paymentMethod === 'credit_card' ? 'credit_card' : 'bank_transfer'
  const dayRaw = typeof x.dayOfMonth === 'number' ? x.dayOfMonth : 1
  const dayOfMonth =
    Number.isFinite(dayRaw) && dayRaw >= 1 && dayRaw <= 31 ? Math.trunc(dayRaw) : 1
  if (!id || !name || amount <= 0) return null
  return {
    id,
    type,
    name,
    amount: Math.round(amount * 100) / 100,
    paymentMethod,
    dayOfMonth,
    amountIncludesVat: x.amountIncludesVat !== false,
  }
}

function docToCatalog(
  snap: QueryDocumentSnapshot<DocumentData>,
): FinanceFixedExpenseCatalogItem[] {
  const x = snap.data()
  const rawItems = Array.isArray(x.items) ? x.items : []
  const items: FinanceFixedExpenseCatalogItem[] = []
  for (const row of rawItems) {
    const item = docToCatalogItem(row)
    if (item) items.push(item)
  }
  return items
}

type FinanceFixedExpenseCatalogContextValue = {
  items: FinanceFixedExpenseCatalogItem[]
  loading: boolean
  updatedAt: string | null
  saveCatalog: (items: FinanceFixedExpenseCatalogItem[]) => Promise<boolean>
}

const FinanceFixedExpenseCatalogContext =
  createContext<FinanceFixedExpenseCatalogContextValue | null>(null)

export function FinanceFixedExpenseCatalogProvider({
  children,
}: {
  children: ReactNode
}) {
  const { user } = useAuth()
  const [items, setItems] = useState<FinanceFixedExpenseCatalogItem[]>([])
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setItems([])
      setUpdatedAt(null)
      setLoading(false)
      return
    }
    if (!canUseLegacyFirestore()) {
      setItems([])
      setUpdatedAt(null)
      setLoading(false)
      return
    }

    setLoading(true)
    return onSnapshot(
      doc(db, 'financeFixedExpenseCatalog', 'current'),
      (snap) => {
        if (!snap.exists()) {
          setItems([])
          setUpdatedAt(null)
        } else {
          setItems(docToCatalog(snap))
          const x = snap.data()
          setUpdatedAt(
            typeof x.updatedAt === 'string'
              ? x.updatedAt
              : x.updatedAt?.toDate?.()?.toISOString?.() ?? null,
          )
        }
        setLoading(false)
      },
      (err) => {
        console.error('financeFixedExpenseCatalog', err)
        setLoading(false)
      },
    )
  }, [user])

  const saveCatalog = useCallback(
    async (nextItems: FinanceFixedExpenseCatalogItem[]): Promise<boolean> => {
      if (!user) return false
      try {
        const normalized = nextItems
          .map((item) => ({
            id: item.id,
            type: item.type.trim() || 'fixed',
            name: item.name.trim(),
            amount: Math.round(item.amount * 100) / 100,
            paymentMethod: item.paymentMethod,
            dayOfMonth:
              item.paymentMethod === 'credit_card'
                ? 1
                : Math.min(31, Math.max(1, item.dayOfMonth || 1)),
            amountIncludesVat: item.amountIncludesVat !== false,
          }))
          .filter((item) => item.name && item.amount > 0)

        await setDoc(
          doc(db, 'financeFixedExpenseCatalog', 'current'),
          {
            items: normalized,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          },
          { merge: true },
        )
        toastFsSuccess('הוצאות קבועות נשמרו')
        return true
      } catch (err) {
        toastFsError('שגיאה בשמירת הוצאות קבועות', err)
        return false
      }
    },
    [user],
  )

  const value = useMemo(
    () => ({
      items,
      loading,
      updatedAt,
      saveCatalog,
    }),
    [items, loading, updatedAt, saveCatalog],
  )

  return (
    <FinanceFixedExpenseCatalogContext.Provider value={value}>
      {children}
    </FinanceFixedExpenseCatalogContext.Provider>
  )
}

export function useFinanceFixedExpenseCatalog(): FinanceFixedExpenseCatalogContextValue {
  const ctx = useContext(FinanceFixedExpenseCatalogContext)
  if (!ctx) {
    throw new Error(
      'useFinanceFixedExpenseCatalog חייב להיות בתוך FinanceFixedExpenseCatalogProvider',
    )
  }
  return ctx
}
