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
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  addDoc,
  updateDoc,
  getDocs,
  limit,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { db, canUseLegacyFirestore } from '../lib/firebase'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type {
  FinanceCashflowBalanceSnapshot,
  FinanceCashflowExpectedExpense,
  FinanceCashflowState,
  FinanceCashflowVatEstimate,
  FinanceGiRecurringPayment,
  FinanceGiRetainer,
  FinancePaymentMethod,
} from '../types'

function docToCashflowState(
  snap: QueryDocumentSnapshot<DocumentData>,
): FinanceCashflowState {
  const x = snap.data()
  return {
    balance:
      typeof x.balance === 'number' && Number.isFinite(x.balance) ? x.balance : 0,
    asOfDate:
      typeof x.asOfDate === 'string' && x.asOfDate.trim()
        ? x.asOfDate.slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    updatedAt:
      typeof x.updatedAt === 'string'
        ? x.updatedAt
        : x.updatedAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
    updatedBy: typeof x.updatedBy === 'string' ? x.updatedBy : undefined,
  }
}

function docToSnapshot(
  d: QueryDocumentSnapshot<DocumentData>,
): FinanceCashflowBalanceSnapshot {
  const x = d.data()
  return {
    id: d.id,
    balance:
      typeof x.balance === 'number' && Number.isFinite(x.balance) ? x.balance : 0,
    asOfDate:
      typeof x.asOfDate === 'string' && x.asOfDate.trim()
        ? x.asOfDate.slice(0, 10)
        : d.id,
    createdAt:
      typeof x.createdAt === 'string'
        ? x.createdAt
        : x.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
    createdBy: typeof x.createdBy === 'string' ? x.createdBy : undefined,
  }
}

function docToGiRecurring(
  d: QueryDocumentSnapshot<DocumentData>,
): FinanceGiRecurringPayment {
  const x = d.data()
  return {
    id: d.id,
    greenInvoiceId: String(x.greenInvoiceId ?? d.id),
    clientName: String(x.clientName ?? 'לקוח'),
    clientId: typeof x.clientId === 'string' ? x.clientId : undefined,
    amount: typeof x.amount === 'number' ? x.amount : 0,
    intervalMonths: typeof x.intervalMonths === 'number' ? x.intervalMonths : 1,
    status: String(x.status ?? ''),
    nextChargeDate:
      typeof x.nextChargeDate === 'string' ? x.nextChargeDate.slice(0, 10) : undefined,
    startDate: typeof x.startDate === 'string' ? x.startDate.slice(0, 10) : undefined,
    endDate: typeof x.endDate === 'string' ? x.endDate.slice(0, 10) : undefined,
    syncedAt: typeof x.syncedAt === 'string' ? x.syncedAt : undefined,
  }
}

function docToGiRetainer(d: QueryDocumentSnapshot<DocumentData>): FinanceGiRetainer {
  const x = d.data()
  return {
    id: d.id,
    greenInvoiceId: String(x.greenInvoiceId ?? d.id),
    clientName: String(x.clientName ?? 'לקוח'),
    clientId: typeof x.clientId === 'string' ? x.clientId : undefined,
    amount: typeof x.amount === 'number' ? x.amount : 0,
    interval: String(x.interval ?? '1m'),
    status: String(x.status ?? ''),
    nextJobDate:
      typeof x.nextJobDate === 'string' ? x.nextJobDate.slice(0, 10) : undefined,
    startDate: typeof x.startDate === 'string' ? x.startDate.slice(0, 10) : undefined,
    endDate: typeof x.endDate === 'string' ? x.endDate.slice(0, 10) : undefined,
    syncedAt: typeof x.syncedAt === 'string' ? x.syncedAt : undefined,
  }
}

function docToExpectedExpense(
  d: QueryDocumentSnapshot<DocumentData>,
): FinanceCashflowExpectedExpense {
  const x = d.data()
  const methodRaw = String(x.paymentMethod ?? '').trim()
  const paymentMethod: FinancePaymentMethod =
    methodRaw === 'credit_card' ? 'credit_card' : 'bank_transfer'
  return {
    id: d.id,
    name: String(x.name ?? '').trim(),
    amount:
      typeof x.amount === 'number' && Number.isFinite(x.amount) ? x.amount : 0,
    expectedDate:
      typeof x.expectedDate === 'string' && x.expectedDate.trim()
        ? x.expectedDate.slice(0, 10)
        : '',
    paymentMethod,
    notes:
      typeof x.notes === 'string' && x.notes.trim() ? x.notes.trim() : undefined,
    createdAt:
      typeof x.createdAt === 'string'
        ? x.createdAt
        : x.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
    createdBy: typeof x.createdBy === 'string' ? x.createdBy : undefined,
  }
}

function readVatEstimateAmount(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const n = Number(raw.replace(/,/g, '').trim())
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function docToVatEstimate(
  d: QueryDocumentSnapshot<DocumentData>,
): FinanceCashflowVatEstimate {
  const x = d.data()
  const vatYm =
    typeof x.vatYm === 'string' && x.vatYm.trim()
      ? x.vatYm.slice(0, 7)
      : d.id.slice(0, 7)
  return {
    id: d.id,
    vatYm,
    amount: readVatEstimateAmount(x.amount),
    notes:
      typeof x.notes === 'string' && x.notes.trim() ? x.notes.trim() : undefined,
    updatedAt:
      typeof x.updatedAt === 'string'
        ? x.updatedAt
        : x.updatedAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
    updatedBy: typeof x.updatedBy === 'string' ? x.updatedBy : undefined,
  }
}

export type VatEstimatePatchInput = {
  amount?: number
  notes?: string | null
}

export type NewExpectedExpenseInput = {
  name: string
  amount: number
  expectedDate: string
  paymentMethod: FinancePaymentMethod
  notes?: string
}

export type ExpectedExpensePatchInput = {
  name?: string
  amount?: number
  expectedDate?: string
  paymentMethod?: FinancePaymentMethod
  notes?: string | null
}

type FinanceCashflowContextValue = {
  state: FinanceCashflowState | null
  snapshots: FinanceCashflowBalanceSnapshot[]
  giRecurring: FinanceGiRecurringPayment[]
  giRetainers: FinanceGiRetainer[]
  expectedExpenses: FinanceCashflowExpectedExpense[]
  vatEstimates: FinanceCashflowVatEstimate[]
  loading: boolean
  error: Error | null
  saveBalance: (balance: number, asOfDate: string) => Promise<void>
  saveSnapshot: (balance: number, asOfDate: string) => Promise<void>
  addExpectedExpense: (data: NewExpectedExpenseInput) => Promise<boolean>
  updateExpectedExpense: (
    id: string,
    patch: ExpectedExpensePatchInput,
  ) => Promise<void>
  deleteExpectedExpense: (id: string) => Promise<void>
  updateVatEstimate: (vatYm: string, patch: VatEstimatePatchInput) => Promise<void>
}

const FinanceCashflowContext =
  createContext<FinanceCashflowContextValue | null>(null)

export function FinanceCashflowProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [state, setState] = useState<FinanceCashflowState | null>(null)
  const [snapshots, setSnapshots] = useState<FinanceCashflowBalanceSnapshot[]>([])
  const [giRecurring, setGiRecurring] = useState<FinanceGiRecurringPayment[]>([])
  const [giRetainers, setGiRetainers] = useState<FinanceGiRetainer[]>([])
  const [expectedExpenses, setExpectedExpenses] = useState<
    FinanceCashflowExpectedExpense[]
  >([])
  const [vatEstimates, setVatEstimates] = useState<FinanceCashflowVatEstimate[]>(
    [],
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!user) {
      setState(null)
      setSnapshots([])
      setGiRecurring([])
      setGiRetainers([])
      setExpectedExpenses([])
      setVatEstimates([])
      setLoading(false)
      setError(null)
      return
    }
    if (!canUseLegacyFirestore()) {
      setState(null)
      setSnapshots([])
      setGiRecurring([])
      setGiRetainers([])
      setExpectedExpenses([])
      setVatEstimates([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    const unsubs: (() => void)[] = []

    unsubs.push(
      onSnapshot(
        doc(db, 'financeCashflowState', 'current'),
        (snap) => {
          setState(snap.exists() ? docToCashflowState(snap) : null)
          setLoading(false)
        },
        (err) => {
          console.error('financeCashflowState', err)
          setError(err instanceof Error ? err : new Error(String(err)))
          setLoading(false)
        },
      ),
    )

    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'financeCashflowBalanceSnapshots'),
          orderBy('asOfDate', 'desc'),
          limit(30),
        ),
        (snap) => setSnapshots(snap.docs.map(docToSnapshot)),
        (err) => console.error('financeCashflowBalanceSnapshots', err),
      ),
    )

    unsubs.push(
      onSnapshot(
        collection(db, 'financeGiRecurringPayments'),
        (snap) => setGiRecurring(snap.docs.map(docToGiRecurring)),
        (err) => console.error('financeGiRecurringPayments', err),
      ),
    )

    unsubs.push(
      onSnapshot(
        collection(db, 'financeGiRetainers'),
        (snap) => setGiRetainers(snap.docs.map(docToGiRetainer)),
        (err) => console.error('financeGiRetainers', err),
      ),
    )

    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'financeCashflowExpectedExpenses'),
          orderBy('expectedDate', 'asc'),
        ),
        (snap) => setExpectedExpenses(snap.docs.map(docToExpectedExpense)),
        (err) => console.error('financeCashflowExpectedExpenses', err),
      ),
    )

    unsubs.push(
      onSnapshot(
        collection(db, 'financeCashflowVatEstimates'),
        (snap) => setVatEstimates(snap.docs.map(docToVatEstimate)),
        (err) => {
          console.error('financeCashflowVatEstimates', err)
          void getDocs(collection(db, 'financeCashflowVatEstimates'))
            .then((snap) => setVatEstimates(snap.docs.map(docToVatEstimate)))
            .catch((fetchErr) =>
              console.error('financeCashflowVatEstimates fetch', fetchErr),
            )
        },
      ),
    )

    void getDocs(collection(db, 'financeCashflowVatEstimates'))
      .then((snap) => setVatEstimates(snap.docs.map(docToVatEstimate)))
      .catch((err) => console.error('financeCashflowVatEstimates initial', err))

    return () => {
      for (const u of unsubs) u()
    }
  }, [user])

  const updateVatEstimate = useCallback(
    async (vatYm: string, patch: VatEstimatePatchInput) => {
      if (!user) return
      const ym = vatYm.slice(0, 7)
      if (typeof patch.amount !== 'number' || !Number.isFinite(patch.amount)) return
      const rounded = Math.round(patch.amount * 100) / 100

      setVatEstimates((prev) => {
        const idx = prev.findIndex((row) => row.vatYm === ym)
        const nextRow: FinanceCashflowVatEstimate = {
          id: ym,
          vatYm: ym,
          amount: rounded,
          notes: idx >= 0 ? prev[idx]?.notes : undefined,
          updatedAt: new Date().toISOString(),
          updatedBy: user.uid,
        }
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = { ...prev[idx]!, ...nextRow }
          return next
        }
        return [...prev, nextRow]
      })

      try {
        const next: Record<string, unknown> = {
          vatYm: ym,
          amount: rounded,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        }
        if (patch.notes === null || patch.notes === '') {
          next.notes = deleteField()
        } else if (typeof patch.notes === 'string') {
          next.notes = patch.notes.trim()
        }
        await setDoc(doc(db, 'financeCashflowVatEstimates', ym), next, {
          merge: true,
        })
        toastFsSuccess('אומדן מע״מ עודכן')
      } catch (err) {
        toastFsError('שגיאה בעדכון אומדן מע״מ', err)
        void getDocs(collection(db, 'financeCashflowVatEstimates'))
          .then((snap) => setVatEstimates(snap.docs.map(docToVatEstimate)))
          .catch(() => undefined)
        throw err
      }
    },
    [user],
  )

  const saveBalance = useCallback(
    async (balance: number, asOfDate: string) => {
      if (!user) return
      try {
        await setDoc(
          doc(db, 'financeCashflowState', 'current'),
          {
            balance: Math.round(balance * 100) / 100,
            asOfDate: asOfDate.slice(0, 10),
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          },
          { merge: true },
        )
        toastFsSuccess('יתרה עודכנה')
      } catch (err) {
        toastFsError('שגיאה בעדכון יתרה', err)
        throw err
      }
    },
    [user],
  )

  const saveSnapshot = useCallback(
    async (balance: number, asOfDate: string) => {
      if (!user) return
      const ymd = asOfDate.slice(0, 10)
      try {
        await setDoc(doc(db, 'financeCashflowBalanceSnapshots', ymd), {
          balance: Math.round(balance * 100) / 100,
          asOfDate: ymd,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        })
        await saveBalance(balance, ymd)
        toastFsSuccess('Snapshot נשמר')
      } catch (err) {
        toastFsError('שגיאה בשמירת snapshot', err)
        throw err
      }
    },
    [user, saveBalance],
  )

  const addExpectedExpense = useCallback(
    async (data: NewExpectedExpenseInput): Promise<boolean> => {
      if (!user) return false
      try {
        await addDoc(collection(db, 'financeCashflowExpectedExpenses'), {
          name: data.name.trim(),
          amount: Math.round(data.amount * 100) / 100,
          expectedDate: data.expectedDate.slice(0, 10),
          paymentMethod: data.paymentMethod,
          ...(data.notes?.trim() ? { notes: data.notes.trim() } : {}),
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        })
        toastFsSuccess('הוצאה צפויה נוספה')
        return true
      } catch (err) {
        toastFsError('שגיאה בהוספת הוצאה צפויה', err)
        return false
      }
    },
    [user],
  )

  const updateExpectedExpense = useCallback(
    async (id: string, patch: ExpectedExpensePatchInput) => {
      if (!user) return
      try {
        const next: Record<string, unknown> = {}
        if (typeof patch.name === 'string') next.name = patch.name.trim()
        if (typeof patch.amount === 'number' && Number.isFinite(patch.amount)) {
          next.amount = Math.round(patch.amount * 100) / 100
        }
        if (typeof patch.expectedDate === 'string') {
          next.expectedDate = patch.expectedDate.slice(0, 10)
        }
        if (
          patch.paymentMethod === 'bank_transfer' ||
          patch.paymentMethod === 'credit_card'
        ) {
          next.paymentMethod = patch.paymentMethod
        }
        if (patch.notes === null || patch.notes === '') {
          next.notes = deleteField()
        } else if (typeof patch.notes === 'string') {
          next.notes = patch.notes.trim()
        }
        if (Object.keys(next).length === 0) return
        await updateDoc(doc(db, 'financeCashflowExpectedExpenses', id), next)
        toastFsSuccess('הוצאה צפויה עודכנה')
      } catch (err) {
        toastFsError('שגיאה בעדכון הוצאה צפויה', err)
      }
    },
    [user],
  )

  const deleteExpectedExpense = useCallback(async (id: string) => {
    if (!user) return
    try {
      await deleteDoc(doc(db, 'financeCashflowExpectedExpenses', id))
      toastFsSuccess('הוצאה צפויה נמחקה')
    } catch (err) {
      toastFsError('שגיאה במחיקת הוצאה צפויה', err)
    }
  }, [user])

  const value = useMemo(
    () => ({
      state,
      snapshots,
      giRecurring,
      giRetainers,
      expectedExpenses,
      vatEstimates,
      loading,
      error,
      saveBalance,
      saveSnapshot,
      addExpectedExpense,
      updateExpectedExpense,
      deleteExpectedExpense,
      updateVatEstimate,
    }),
    [
      state,
      snapshots,
      giRecurring,
      giRetainers,
      expectedExpenses,
      vatEstimates,
      loading,
      error,
      saveBalance,
      saveSnapshot,
      addExpectedExpense,
      updateExpectedExpense,
      deleteExpectedExpense,
      updateVatEstimate,
    ],
  )

  return (
    <FinanceCashflowContext.Provider value={value}>
      {children}
    </FinanceCashflowContext.Provider>
  )
}

export function useFinanceCashflow(): FinanceCashflowContextValue {
  const ctx = useContext(FinanceCashflowContext)
  if (!ctx) {
    throw new Error('useFinanceCashflow חייב להיות בתוך FinanceCashflowProvider')
  }
  return ctx
}
