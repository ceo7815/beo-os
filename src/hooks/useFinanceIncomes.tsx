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
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { applyClientFinanceBalanceDelta } from '../lib/financeClientBalance'
import {
  buildIncomePaymentRecord,
  incomeBalanceDelta,
  incomePaymentRecords,
  incomeTotalPaid,
  normalizeIncomePayments,
  resolveIncomeStatusFromPaidTotal,
  type IncomePaymentInput,
} from '../lib/financeIncomePayment'
import { isFinanceHostingType } from '../lib/financeHostingTypes'
import { db } from '../lib/firebase'
import { docToFinanceIncome } from '../lib/firestoreMappers'
import { todayYmd } from '../lib/dates'
import { withDisplayOverdueIncomes } from '../lib/financeCalc'
import { stripUndefined } from '../lib/stripUndefined'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type {
  FinanceIncome,
  FinanceIncomeStatus,
  FinanceHostingType,
  FinanceIncomePaymentRecord,
  FinancePaymentMethod,
} from '../types'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function applyPaymentFields(
  row: Record<string, unknown>,
  data: {
    status: FinanceIncomeStatus
    paidAmount?: number
    paymentMethod?: FinancePaymentMethod
    paidDate?: string
  },
  clearing = false,
) {
  if (data.status === 'paid' || data.status === 'partial') {
    if (typeof data.paidAmount === 'number' && Number.isFinite(data.paidAmount)) {
      row.paidAmount = round2(data.paidAmount)
    }
    if (data.paymentMethod) row.paymentMethod = data.paymentMethod
    if (data.paidDate?.trim()) row.paidDate = data.paidDate.trim().slice(0, 10)
    return
  }
  if (clearing) {
    row.paidAmount = deleteField()
    row.paymentMethod = deleteField()
    row.paidDate = deleteField()
    row.payments = deleteField()
  }
}

async function syncClientBalance(
  oldInc: FinanceIncome | null,
  nextInc: FinanceIncome,
) {
  const oldClientId = oldInc?.clientId?.trim()
  const newClientId = nextInc.clientId.trim()
  const oldDelta = oldInc ? incomeBalanceDelta(oldInc) : 0
  const newDelta = incomeBalanceDelta(nextInc)

  if (oldClientId && oldClientId !== newClientId) {
    await applyClientFinanceBalanceDelta(oldClientId, -oldDelta)
    await applyClientFinanceBalanceDelta(newClientId, newDelta)
    return
  }
  if (newClientId) {
    await applyClientFinanceBalanceDelta(newClientId, newDelta - oldDelta)
  }
}

function paymentRowsFromInput(data: {
  status: FinanceIncomeStatus
  paidAmount?: number
  paymentMethod?: FinancePaymentMethod
  paidDate?: string
  invoiceDate: string
}): FinanceIncomePaymentRecord[] {
  if (
    (data.status !== 'paid' && data.status !== 'partial') ||
    typeof data.paidAmount !== 'number' ||
    data.paidAmount <= 0
  ) {
    return []
  }
  return [
    buildIncomePaymentRecord({
      amount: data.paidAmount,
      paymentMethod: data.paymentMethod ?? 'bank_transfer',
      paidDate: data.paidDate ?? data.invoiceDate,
    }),
  ]
}

async function persistIncomePayments(
  oldInc: FinanceIncome,
  records: FinanceIncomePaymentRecord[],
) {
  const totalPaid = round2(records.reduce((s, p) => s + p.amount, 0))
  if (totalPaid > oldInc.amount + 0.001) {
    throw new Error('total payments exceed invoice amount')
  }
  const newStatus = resolveIncomeStatusFromPaidTotal(oldInc.amount, totalPaid)
  const last = records[records.length - 1]
  await updateDoc(
    doc(db, 'financeIncomes', oldInc.id),
    stripUndefined({
      payments: records,
      paidAmount: totalPaid,
      paymentMethod: last?.paymentMethod,
      paidDate: last?.paidDate,
      status: newStatus,
    }),
  )
  const nextInc: FinanceIncome = {
    ...oldInc,
    payments: records,
    paidAmount: totalPaid,
    paymentMethod: last?.paymentMethod,
    paidDate: last?.paidDate,
    status: newStatus,
  }
  await syncClientBalance(oldInc, nextInc)
  return nextInc
}

export type NewFinanceIncomeInput = {
  projectId?: string
  clientId: string
  amount: number
  amountIncludesVat?: boolean
  vatAmount?: number
  amountBeforeVat?: number
  invoiceNumber: string
  invoiceDate: string
  description?: string
  status: FinanceIncomeStatus
  monthlyRetainer?: boolean
  hostingClient?: boolean
  hostingType?: FinanceHostingType
  paidAmount?: number
  paymentMethod?: FinancePaymentMethod
  paidDate?: string
}

export type FinanceIncomePatchInput = {
  projectId?: string
  clientId?: string
  amount?: number
  amountIncludesVat?: boolean
  vatAmount?: number | null
  amountBeforeVat?: number | null
  invoiceNumber?: string
  invoiceDate?: string
  description?: string | null
  status?: FinanceIncomeStatus
  monthlyRetainer?: boolean
  hostingClient?: boolean
  hostingType?: FinanceHostingType | null
  paidAmount?: number | null
  paymentMethod?: FinancePaymentMethod | null
  paidDate?: string | null
  payments?: FinanceIncomePaymentRecord[] | null
}

export type AddIncomePaymentInput = IncomePaymentInput

export type UpdateIncomePaymentInput = IncomePaymentInput

type FinanceIncomesContextValue = {
  incomes: FinanceIncome[]
  loading: boolean
  error: Error | null
  addIncome: (data: NewFinanceIncomeInput) => Promise<void>
  updateIncome: (id: string, patch: FinanceIncomePatchInput) => Promise<void>
  addIncomePayment: (id: string, payment: AddIncomePaymentInput) => Promise<void>
  updateIncomePayment: (
    id: string,
    paymentId: string,
    payment: UpdateIncomePaymentInput,
  ) => Promise<void>
  deleteIncome: (id: string) => Promise<void>
}

const FinanceIncomesContext = createContext<FinanceIncomesContextValue | null>(
  null,
)

export function FinanceIncomesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [incomes, setIncomes] = useState<FinanceIncome[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!user) {
      setIncomes([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    const unsub = onSnapshot(
      collection(db, 'financeIncomes'),
      (snap) => {
        const today = todayYmd()
        const mapped = snap.docs.map((d) => docToFinanceIncome(d))
        setIncomes(withDisplayOverdueIncomes(mapped, today))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('financeIncomes snapshot', err)
        toastFsError('שגיאה בטעינת הכנסות', err, 'financeIncomes snapshot')
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      },
    )
    return () => unsub()
  }, [user])

  const addIncome = useCallback(async (data: NewFinanceIncomeInput) => {
    try {
      const row: Record<string, unknown> = {
        clientId: data.clientId.trim(),
        amount: Math.round(data.amount * 100) / 100,
        amountIncludesVat: data.amountIncludesVat !== false,
        invoiceNumber: data.invoiceNumber.trim(),
        invoiceDate: data.invoiceDate.slice(0, 10),
        status: data.status,
        createdAt: serverTimestamp(),
      }
      if (data.description?.trim()) row.description = data.description.trim()
        if (data.hostingClient === true || data.hostingType) {
          row.hostingClient = true
          if (isFinanceHostingType(data.hostingType)) {
            row.hostingType = data.hostingType
          }
        } else if (data.projectId?.trim()) {
        row.projectId = data.projectId.trim()
      }
      if (data.monthlyRetainer === true) row.monthlyRetainer = true
      if (typeof data.vatAmount === 'number' && Number.isFinite(data.vatAmount)) {
        row.vatAmount = Math.round(data.vatAmount * 100) / 100
      }
      if (
        typeof data.amountBeforeVat === 'number' &&
        Number.isFinite(data.amountBeforeVat)
      ) {
        row.amountBeforeVat = Math.round(data.amountBeforeVat * 100) / 100
      }
      applyPaymentFields(row, data)
      const payments = paymentRowsFromInput({
        status: data.status,
        paidAmount: data.paidAmount,
        paymentMethod: data.paymentMethod,
        paidDate: data.paidDate,
        invoiceDate: data.invoiceDate,
      })
      if (payments.length) row.payments = payments
      await addDoc(collection(db, 'financeIncomes'), row)
      await syncClientBalance(null, {
        id: '',
        projectId: data.projectId?.trim() ?? '',
        clientId: data.clientId.trim(),
        amount: row.amount as number,
        invoiceNumber: data.invoiceNumber.trim(),
        invoiceDate: data.invoiceDate.slice(0, 10),
        status: data.status,
        paidAmount: data.paidAmount,
        payments: payments.length ? payments : undefined,
        paymentMethod: data.paymentMethod,
        paidDate: data.paidDate,
        createdAt: '',
      })
      toastFsSuccess('ההכנסה נוספה')
    } catch (e) {
      toastFsError('שגיאה בשמירת ההכנסה', e, 'addIncome')
    }
  }, [])

  const updateIncome = useCallback(
    async (id: string, patch: FinanceIncomePatchInput) => {
      try {
        const oldSnap = await getDoc(doc(db, 'financeIncomes', id))
        const oldInc = oldSnap.exists()
          ? docToFinanceIncome(
              oldSnap as QueryDocumentSnapshot<DocumentData>,
            )
          : null

        const next: Record<string, unknown> = {}
        if (typeof patch.hostingClient === 'boolean') {
          next.hostingClient = patch.hostingClient
          if (patch.hostingClient) {
            next.projectId = deleteField()
          } else {
            next.hostingType = deleteField()
          }
        }
        if (patch.hostingType === null) {
          next.hostingType = deleteField()
        } else if (isFinanceHostingType(patch.hostingType)) {
          next.hostingType = patch.hostingType
          next.hostingClient = true
          next.projectId = deleteField()
        }
        if (
          typeof patch.projectId === 'string' &&
          patch.projectId.trim() &&
          patch.hostingClient !== true
        ) {
          next.projectId = patch.projectId.trim()
          next.hostingClient = false
        }
        if (typeof patch.clientId === 'string' && patch.clientId.trim()) {
          next.clientId = patch.clientId.trim()
        }
        if (
          typeof patch.amount === 'number' &&
          Number.isFinite(patch.amount) &&
          patch.amount >= 0
        ) {
          next.amount = Math.round(patch.amount * 100) / 100
        }
        if (typeof patch.amountIncludesVat === 'boolean') {
          next.amountIncludesVat = patch.amountIncludesVat
        }
        if (patch.vatAmount === null) {
          next.vatAmount = deleteField()
        } else if (
          typeof patch.vatAmount === 'number' &&
          Number.isFinite(patch.vatAmount)
        ) {
          next.vatAmount = Math.round(patch.vatAmount * 100) / 100
        }
        if (patch.amountBeforeVat === null) {
          next.amountBeforeVat = deleteField()
        } else if (
          typeof patch.amountBeforeVat === 'number' &&
          Number.isFinite(patch.amountBeforeVat)
        ) {
          next.amountBeforeVat = Math.round(patch.amountBeforeVat * 100) / 100
        }
        if (
          typeof patch.invoiceNumber === 'string' &&
          patch.invoiceNumber.trim()
        ) {
          next.invoiceNumber = patch.invoiceNumber.trim()
        }
        if (typeof patch.invoiceDate === 'string' && patch.invoiceDate.trim()) {
          next.invoiceDate = patch.invoiceDate.trim().slice(0, 10)
        }
        if (patch.description === null) {
          next.description = deleteField()
        } else if (typeof patch.description === 'string') {
          const t = patch.description.trim()
          next.description = t ? t : deleteField()
        }
        if (patch.status != null) next.status = patch.status
        if (typeof patch.monthlyRetainer === 'boolean') {
          next.monthlyRetainer = patch.monthlyRetainer
        }

        const mergedStatus =
          (patch.status ?? oldInc?.status ?? 'pending') as FinanceIncomeStatus
        const mergedAmount =
          typeof patch.amount === 'number' ? patch.amount : (oldInc?.amount ?? 0)
        const mergedPaidAmount =
          patch.paidAmount === null
            ? undefined
            : typeof patch.paidAmount === 'number'
              ? patch.paidAmount
              : oldInc?.paidAmount
        const mergedPaymentMethod =
          patch.paymentMethod === null
            ? undefined
            : patch.paymentMethod ?? oldInc?.paymentMethod
        const mergedPaidDate =
          patch.paidDate === null
            ? undefined
            : patch.paidDate ?? oldInc?.paidDate

        if (patch.status != null) {
          applyPaymentFields(
            next,
            {
              status: mergedStatus,
              paidAmount: mergedPaidAmount,
              paymentMethod: mergedPaymentMethod,
              paidDate: mergedPaidDate,
            },
            true,
          )
        } else if (
          patch.paidAmount != null ||
          patch.paymentMethod != null ||
          patch.paidDate != null
        ) {
          applyPaymentFields(next, {
            status: mergedStatus,
            paidAmount: mergedPaidAmount,
            paymentMethod: mergedPaymentMethod,
            paidDate: mergedPaidDate,
          })
        }

        if (patch.payments === null) {
          next.payments = deleteField()
        } else if (Array.isArray(patch.payments)) {
          next.payments = patch.payments
        }

        if (Object.keys(next).length === 0) return
        await updateDoc(doc(db, 'financeIncomes', id), stripUndefined(next))

        const mergedPayments =
          patch.payments === null
            ? undefined
            : Array.isArray(patch.payments)
              ? patch.payments
              : oldInc?.payments
        const mergedNext: FinanceIncome = {
          ...(oldInc ?? {
            id,
            projectId: '',
            clientId: '',
            amount: 0,
            invoiceNumber: '',
            invoiceDate: '',
            createdAt: '',
          }),
          clientId: String(next.clientId ?? oldInc?.clientId ?? ''),
          amount: mergedAmount,
          status: mergedStatus,
          paidAmount: mergedPaidAmount,
          paymentMethod: mergedPaymentMethod,
          paidDate: mergedPaidDate,
          payments: mergedPayments,
        }
        await syncClientBalance(oldInc, mergedNext)
        toastFsSuccess('ההכנסה עודכנה')
      } catch (e) {
        toastFsError('שגיאה בעדכון ההכנסה', e, 'updateIncome')
      }
    },
    [],
  )

  const addIncomePayment = useCallback(
    async (id: string, payment: AddIncomePaymentInput) => {
      try {
        const oldSnap = await getDoc(doc(db, 'financeIncomes', id))
        if (!oldSnap.exists()) return
        const oldInc = docToFinanceIncome(
          oldSnap as QueryDocumentSnapshot<DocumentData>,
        )
        const records = normalizeIncomePayments(oldInc)
        const outstanding = Math.max(
          0,
          round2(oldInc.amount - incomeTotalPaid(oldInc)),
        )
        const amount = round2(payment.amount)
        if (!Number.isFinite(amount) || amount <= 0 || amount > outstanding + 0.001) {
          toastFsError(
            'סכום התשלום חורג מהיתרה',
            new Error('invalid payment amount'),
            'addIncomePayment',
          )
          return
        }
        const nextRecords = [
          ...records,
          buildIncomePaymentRecord(payment),
        ]
        const nextInc = await persistIncomePayments(oldInc, nextRecords)
        toastFsSuccess(
          nextInc.status === 'paid'
            ? 'התשלום נרשם — החשבון שולם במלואו'
            : 'התשלום הנוסף נרשם',
        )
      } catch (e) {
        toastFsError('שגיאה ברישום תשלום', e, 'addIncomePayment')
      }
    },
    [],
  )

  const updateIncomePayment = useCallback(
    async (id: string, paymentId: string, payment: UpdateIncomePaymentInput) => {
      try {
        const oldSnap = await getDoc(doc(db, 'financeIncomes', id))
        if (!oldSnap.exists()) return
        const oldInc = docToFinanceIncome(
          oldSnap as QueryDocumentSnapshot<DocumentData>,
        )
        const records = normalizeIncomePayments(oldInc)
        const rawRecords = incomePaymentRecords(oldInc)
        const targetIdx = rawRecords.findIndex((p) => p.id === paymentId)
        if (targetIdx < 0) {
          toastFsError(
            'התשלום לא נמצא',
            new Error('payment not found'),
            'updateIncomePayment',
          )
          return
        }
        const resolvedId = records[targetIdx]!.id
        const amount = round2(payment.amount)
        const others = records
          .filter((p) => p.id !== resolvedId)
          .reduce((s, p) => s + p.amount, 0)
        const maxAmount = round2(oldInc.amount - others)
        if (!Number.isFinite(amount) || amount <= 0 || amount > maxAmount + 0.001) {
          toastFsError(
            'סכום התשלום לא תקין',
            new Error('invalid payment amount'),
            'updateIncomePayment',
          )
          return
        }
        const nextRecords = records.map((p) =>
          p.id === resolvedId
            ? {
                ...p,
                amount,
                paymentMethod: payment.paymentMethod,
                paidDate: payment.paidDate.slice(0, 10),
              }
            : p,
        )
        await persistIncomePayments(oldInc, nextRecords)
        toastFsSuccess('התשלום עודכן')
      } catch (e) {
        toastFsError('שגיאה בעדכון התשלום', e, 'updateIncomePayment')
      }
    },
    [],
  )

  const deleteIncome = useCallback(async (id: string) => {
    try {
      const oldSnap = await getDoc(doc(db, 'financeIncomes', id))
      const oldInc = oldSnap.exists()
        ? docToFinanceIncome(oldSnap as QueryDocumentSnapshot<DocumentData>)
        : null
      if (oldInc) {
        await syncClientBalance(oldInc, {
          ...oldInc,
          status: 'pending',
          paidAmount: undefined,
          payments: undefined,
        })
      }
      await deleteDoc(doc(db, 'financeIncomes', id))
      toastFsSuccess('ההכנסה נמחקה')
    } catch (e) {
      toastFsError('שגיאה במחיקת ההכנסה', e, 'deleteIncome')
    }
  }, [])

  const value = useMemo(
    () => ({
      incomes,
      loading,
      error,
      addIncome,
      updateIncome,
      addIncomePayment,
      updateIncomePayment,
      deleteIncome,
    }),
    [
      incomes,
      loading,
      error,
      addIncome,
      updateIncome,
      addIncomePayment,
      updateIncomePayment,
      deleteIncome,
    ],
  )

  return (
    <FinanceIncomesContext.Provider value={value}>
      {children}
    </FinanceIncomesContext.Provider>
  )
}

export function useFinanceIncomes(): FinanceIncomesContextValue {
  const ctx = useContext(FinanceIncomesContext)
  if (!ctx) {
    throw new Error('useFinanceIncomes חייב להיות בתוך FinanceIncomesProvider')
  }
  return ctx
}
