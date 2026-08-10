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
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { docToFinanceExpense } from '../lib/firestoreMappers'
import { db } from '../lib/firebase'
import { stripUndefined } from '../lib/stripUndefined'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type {
  FinanceExpense,
  FinanceExpenseVatClass,
  FinancePaymentMethod,
} from '../types'

export type NewFinanceExpenseInput = {
  type: string
  clientId?: string
  supplierId?: string
  supplierName?: string
  platformName?: string
  projectId?: string
  amount: number
  vatLiable?: boolean
  vatClass?: FinanceExpenseVatClass
  amountIncludesVat?: boolean
  vatAmount?: number
  amountBeforeVat?: number
  name?: string
  employeeName?: string
  description?: string
  billingMonth: string
  pnlMonth?: string
  linkedIncomeId?: string
  recurring: boolean
  supplierInvoiceReceived?: boolean
  paymentMethod?: FinancePaymentMethod
  paidDate?: string
  /** YYYY-MM-DD — מועד ירידת הכסף מהחשבון (חיוב מרוכז בכרטיס) */
  chargeDate?: string
  bankRef?: string
  hostingExpense?: boolean
  /** YYYY-MM-DD — תאריך המסמך, קובע את חודש הרווח וההפסד */
  documentDate?: string
  /** YYYY-MM — החודש שאליו המסמך שייך כלכלית, גם כשהוא נעול */
  documentMonth?: string
  isLateDocument?: boolean
  spreadMonths?: number
  spreadStartMonth?: string
  /** עסקת מט״ח — קוד המטבע והסכום הנקוב לפני ההמרה לשקלים */
  currency?: string
  originalAmount?: number
}

export type FinanceExpensePatchInput = {
  type?: string
  clientId?: string | null
  supplierId?: string | null
  supplierName?: string | null
  platformName?: string | null
  projectId?: string | null
  amount?: number
  vatLiable?: boolean
  vatClass?: FinanceExpenseVatClass | null
  amountIncludesVat?: boolean
  vatAmount?: number | null
  amountBeforeVat?: number | null
  name?: string | null
  employeeName?: string | null
  description?: string | null
  billingMonth?: string
  pnlMonth?: string | null
  linkedIncomeId?: string | null
  recurring?: boolean
  supplierInvoiceReceived?: boolean
  hostingExpense?: boolean
  paidDate?: string | null
  /** הצמדת חשבונית ספק לתשלום — null מנתק את המסמך הקיים */
  invoiceNumber?: string | null
  documentUrl?: string | null
  documentFileName?: string | null
  /** שיוך זיכוי לחיוב שהוא מבטל — null מנתק את השיוך */
  refundForExpenseId?: string | null
  /** תאריך החשבונית — קובע את חודש הרווח וההפסד */
  documentDate?: string | null
  documentMonth?: string | null
  isLateDocument?: boolean
  /** הערה על השורה — null מוחק */
  expenseNote?: string | null
  /** אופן תשלום — null מוחק */
  paymentMethod?: FinancePaymentMethod | null
  /** מועד ירידה מהבנק — null מוחק */
  chargeDate?: string | null
  /** מט״ח — null מוחק את שני השדות */
  currency?: string | null
  originalAmount?: number | null
}

type FinanceExpensesContextValue = {
  expenses: FinanceExpense[]
  loading: boolean
  error: Error | null
  addExpense: (data: NewFinanceExpenseInput) => Promise<boolean>
  addExpensesBatch: (rows: NewFinanceExpenseInput[]) => Promise<number>
  updateExpense: (
    id: string,
    patch: FinanceExpensePatchInput,
    opts?: { silent?: boolean },
  ) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
  deleteAllExpenses: () => Promise<number>
}

const FinanceExpensesContext =
  createContext<FinanceExpensesContextValue | null>(null)

/** בונה רשומת Firestore להוצאה — משותף ל-add בודד ול-batch ייבוא */
function buildExpenseRow(data: NewFinanceExpenseInput): Record<string, unknown> {
  const row: Record<string, unknown> = {
    type: data.type,
    amount: Math.round(data.amount * 100) / 100,
    amountIncludesVat: data.amountIncludesVat !== false,
    billingMonth: data.billingMonth.slice(0, 7),
    recurring: data.recurring === true,
    createdAt: serverTimestamp(),
  }
  if (typeof data.vatLiable === 'boolean') row.vatLiable = data.vatLiable
  if (data.vatClass) row.vatClass = data.vatClass
  if (data.projectId?.trim()) row.projectId = data.projectId.trim()
  if (data.clientId?.trim()) row.clientId = data.clientId.trim()
  if (data.supplierId?.trim()) row.supplierId = data.supplierId.trim()
  if (data.supplierName?.trim()) row.supplierName = data.supplierName.trim()
  if (data.platformName?.trim()) row.platformName = data.platformName.trim()
  if (data.name?.trim()) row.name = data.name.trim()
  if (data.employeeName?.trim()) row.employeeName = data.employeeName.trim()
  if (typeof data.vatAmount === 'number' && Number.isFinite(data.vatAmount)) {
    row.vatAmount = Math.round(data.vatAmount * 100) / 100
  }
  if (
    typeof data.amountBeforeVat === 'number' &&
    Number.isFinite(data.amountBeforeVat)
  ) {
    row.amountBeforeVat = Math.round(data.amountBeforeVat * 100) / 100
  }
  if (data.description?.trim()) row.description = data.description.trim()
  if (data.paymentMethod) row.paymentMethod = data.paymentMethod
  if (data.paidDate?.trim()) row.paidDate = data.paidDate.trim().slice(0, 10)
  if (data.chargeDate?.trim()) row.chargeDate = data.chargeDate.trim().slice(0, 10)
  if (data.bankRef?.trim()) {
    row.bankRef = data.bankRef.trim()
    row.source = 'bank_import'
  }
  if (data.pnlMonth?.trim()) row.pnlMonth = data.pnlMonth.trim().slice(0, 7)
  if (data.linkedIncomeId?.trim()) row.linkedIncomeId = data.linkedIncomeId.trim()
  if (data.hostingExpense === true) row.hostingExpense = true
  if (data.documentDate?.trim()) {
    row.documentDate = data.documentDate.trim().slice(0, 10)
  }
  if (data.documentMonth?.trim()) {
    row.documentMonth = data.documentMonth.trim().slice(0, 7)
  }
  if (data.isLateDocument === true) row.isLateDocument = true
  if (typeof data.spreadMonths === 'number' && data.spreadMonths > 1) {
    row.spreadMonths = Math.floor(data.spreadMonths)
    if (data.spreadStartMonth?.trim()) {
      row.spreadStartMonth = data.spreadStartMonth.trim().slice(0, 7)
    }
  }
  // סכום המקור נשמר רק כשיש מטבע לצדו — בלעדיו הוא חסר משמעות
  const currency = data.currency?.trim().toUpperCase()
  if (
    currency &&
    currency !== 'ILS' &&
    typeof data.originalAmount === 'number' &&
    Number.isFinite(data.originalAmount) &&
    data.originalAmount !== 0
  ) {
    row.currency = currency
    row.originalAmount = Math.round(data.originalAmount * 100) / 100
  }
  return row
}

export function FinanceExpensesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [expenses, setExpenses] = useState<FinanceExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!user) {
      setExpenses([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    const unsub = onSnapshot(
      collection(db, 'financeExpenses'),
      (snap) => {
        setExpenses(snap.docs.map((d) => docToFinanceExpense(d)))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('financeExpenses snapshot', err)
        toastFsError('שגיאה בטעינת הוצאות', err, 'financeExpenses snapshot')
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      },
    )
    return () => unsub()
  }, [user])

  const addExpense = useCallback(async (data: NewFinanceExpenseInput): Promise<boolean> => {
    try {
      const row = buildExpenseRow(data)
      await addDoc(collection(db, 'financeExpenses'), row)
      toastFsSuccess('ההוצאה נוספה')
      return true
    } catch (e) {
      toastFsError('שגיאה בשמירת ההוצאה', e, 'addExpense')
      return false
    }
  }, [])

  const addExpensesBatch = useCallback(
    async (rows: NewFinanceExpenseInput[]): Promise<number> => {
      if (rows.length === 0) return 0
      try {
        let written = 0
        for (let i = 0; i < rows.length; i += 400) {
          const batch = writeBatch(db)
          for (const data of rows.slice(i, i + 400)) {
            const ref = doc(collection(db, 'financeExpenses'))
            batch.set(ref, buildExpenseRow(data))
            written += 1
          }
          await batch.commit()
        }
        toastFsSuccess(`יובאו ${written} הוצאות`)
        return written
      } catch (e) {
        toastFsError('שגיאה בייבוא ההוצאות', e, 'addExpensesBatch')
        return 0
      }
    },
    [],
  )

  const updateExpense = useCallback(
    async (
      id: string,
      patch: FinanceExpensePatchInput,
      opts?: { silent?: boolean },
    ) => {
      try {
        const next: Record<string, unknown> = {}
        if (patch.type != null) next.type = patch.type
        if (patch.supplierId === null) {
          next.supplierId = deleteField()
        } else if (
          typeof patch.supplierId === 'string' &&
          patch.supplierId.trim()
        ) {
          next.supplierId = patch.supplierId.trim()
        }
        if (patch.supplierName === null) {
          next.supplierName = deleteField()
        } else if (
          typeof patch.supplierName === 'string' &&
          patch.supplierName.trim()
        ) {
          next.supplierName = patch.supplierName.trim()
        }
        if (patch.platformName === null) {
          next.platformName = deleteField()
        } else if (
          typeof patch.platformName === 'string' &&
          patch.platformName.trim()
        ) {
          next.platformName = patch.platformName.trim()
        }
        if (patch.projectId === null) {
          next.projectId = deleteField()
        } else if (
          typeof patch.projectId === 'string' &&
          patch.projectId.trim()
        ) {
          next.projectId = patch.projectId.trim()
        }
        if (patch.clientId === null) {
          next.clientId = deleteField()
        } else if (typeof patch.clientId === 'string' && patch.clientId.trim()) {
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
        if (patch.description === null) {
          next.description = deleteField()
        } else if (typeof patch.description === 'string') {
          const t = patch.description.trim()
          next.description = t ? t : deleteField()
        }
        if (patch.name === null) {
          next.name = deleteField()
        } else if (typeof patch.name === 'string') {
          const t = patch.name.trim()
          next.name = t ? t : deleteField()
        }
        if (patch.employeeName === null) {
          next.employeeName = deleteField()
        } else if (typeof patch.employeeName === 'string') {
          const t = patch.employeeName.trim()
          next.employeeName = t ? t : deleteField()
        }
        if (typeof patch.billingMonth === 'string' && patch.billingMonth.trim()) {
          next.billingMonth = patch.billingMonth.trim().slice(0, 7)
        }
        if (patch.pnlMonth === null) {
          next.pnlMonth = deleteField()
        } else if (typeof patch.pnlMonth === 'string' && patch.pnlMonth.trim()) {
          next.pnlMonth = patch.pnlMonth.trim().slice(0, 7)
        }
        if (patch.linkedIncomeId === null) {
          next.linkedIncomeId = deleteField()
        } else if (
          typeof patch.linkedIncomeId === 'string' &&
          patch.linkedIncomeId.trim()
        ) {
          next.linkedIncomeId = patch.linkedIncomeId.trim()
        }
        if (typeof patch.recurring === 'boolean') {
          next.recurring = patch.recurring
        }
        if (typeof patch.hostingExpense === 'boolean') {
          next.hostingExpense = patch.hostingExpense
            ? true
            : (deleteField() as unknown as boolean)
        }
        if (typeof patch.vatLiable === 'boolean') {
          next.vatLiable = patch.vatLiable
        } else if (patch.vatLiable === null) {
          next.vatLiable = deleteField()
        }
        if (patch.vatClass) {
          next.vatClass = patch.vatClass
        } else if (patch.vatClass === null) {
          next.vatClass = deleteField()
        }
        if (typeof patch.supplierInvoiceReceived === 'boolean') {
          next.supplierInvoiceReceived = patch.supplierInvoiceReceived
        }
        if (patch.paidDate === null) {
          next.paidDate = deleteField()
        } else if (typeof patch.paidDate === 'string' && patch.paidDate.trim()) {
          next.paidDate = patch.paidDate.trim().slice(0, 10)
        }
        // הצמדת מסמך היא הצהרה שהתשלום מתועד, ולכן היא נרשמת יחד עם מועד
        // ההצמדה. ניתוק המסמך מסיר גם את החותמת, כדי שלא תישאר עדות למסמך
        // שכבר אינו קיים.
        if (patch.documentUrl === null) {
          next.documentUrl = deleteField()
          next.documentFileName = deleteField()
          next.documentAttachedAt = deleteField()
        } else if (typeof patch.documentUrl === 'string' && patch.documentUrl.trim()) {
          next.documentUrl = patch.documentUrl.trim()
          next.documentAttachedAt = new Date().toISOString()
          if (typeof patch.documentFileName === 'string' && patch.documentFileName.trim()) {
            next.documentFileName = patch.documentFileName.trim()
          }
        }
        if (patch.invoiceNumber === null) {
          next.invoiceNumber = deleteField()
        } else if (typeof patch.invoiceNumber === 'string' && patch.invoiceNumber.trim()) {
          next.invoiceNumber = patch.invoiceNumber.trim()
        }
        if (patch.refundForExpenseId === null) {
          next.refundForExpenseId = deleteField()
        } else if (
          typeof patch.refundForExpenseId === 'string' &&
          patch.refundForExpenseId.trim()
        ) {
          next.refundForExpenseId = patch.refundForExpenseId.trim()
        }
        if (patch.documentDate === null) {
          next.documentDate = deleteField()
        } else if (
          typeof patch.documentDate === 'string' &&
          patch.documentDate.trim()
        ) {
          next.documentDate = patch.documentDate.trim().slice(0, 10)
        }
        if (patch.documentMonth === null) {
          next.documentMonth = deleteField()
        } else if (
          typeof patch.documentMonth === 'string' &&
          patch.documentMonth.trim()
        ) {
          next.documentMonth = patch.documentMonth.trim().slice(0, 7)
        }
        if (typeof patch.isLateDocument === 'boolean') {
          next.isLateDocument = patch.isLateDocument
            ? true
            : (deleteField() as unknown as boolean)
        }
        if (patch.expenseNote === null || patch.expenseNote === '') {
          next.expenseNote = deleteField()
        } else if (
          typeof patch.expenseNote === 'string' &&
          patch.expenseNote.trim()
        ) {
          next.expenseNote = patch.expenseNote.trim()
        }
        if (patch.paymentMethod === null) {
          next.paymentMethod = deleteField()
        } else if (
          patch.paymentMethod === 'bank_transfer' ||
          patch.paymentMethod === 'credit_card'
        ) {
          next.paymentMethod = patch.paymentMethod
        }
        if (patch.chargeDate === null || patch.chargeDate === '') {
          next.chargeDate = deleteField()
        } else if (
          typeof patch.chargeDate === 'string' &&
          patch.chargeDate.trim()
        ) {
          next.chargeDate = patch.chargeDate.trim().slice(0, 10)
        }
        if (patch.currency === null || patch.originalAmount === null) {
          next.currency = deleteField()
          next.originalAmount = deleteField()
        } else if (
          typeof patch.currency === 'string' &&
          patch.currency.trim() &&
          patch.currency.trim().toUpperCase() !== 'ILS' &&
          typeof patch.originalAmount === 'number' &&
          Number.isFinite(patch.originalAmount) &&
          patch.originalAmount !== 0
        ) {
          next.currency = patch.currency.trim().toUpperCase()
          next.originalAmount = Math.round(patch.originalAmount * 100) / 100
        }
        if (Object.keys(next).length === 0) return
        await updateDoc(doc(db, 'financeExpenses', id), stripUndefined(next))
        if (!opts?.silent) toastFsSuccess('ההוצאה עודכנה')
      } catch (e) {
        if (!opts?.silent) {
          toastFsError('שגיאה בעדכון ההוצאה', e, 'updateExpense')
        }
      }
    },
    [],
  )

  const deleteExpense = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'financeExpenses', id))
      toastFsSuccess('ההוצאה נמחקה')
    } catch (e) {
      toastFsError('שגיאה במחיקת ההוצאה', e, 'deleteExpense')
    }
  }, [])

  const deleteAllExpenses = useCallback(async (): Promise<number> => {
    try {
      const snap = await getDocs(collection(db, 'financeExpenses'))
      if (snap.empty) return 0
      const refs = snap.docs.map((d) => d.ref)
      for (let i = 0; i < refs.length; i += 400) {
        const batch = writeBatch(db)
        for (const ref of refs.slice(i, i + 400)) batch.delete(ref)
        await batch.commit()
      }
      toastFsSuccess(`נמחקו ${refs.length} הוצאות`)
      return refs.length
    } catch (e) {
      toastFsError('שגיאה במחיקת ההוצאות', e, 'deleteAllExpenses')
      return 0
    }
  }, [])

  const value = useMemo(
    () => ({
      expenses,
      loading,
      error,
      addExpense,
      addExpensesBatch,
      updateExpense,
      deleteExpense,
      deleteAllExpenses,
    }),
    [
      expenses,
      loading,
      error,
      addExpense,
      addExpensesBatch,
      updateExpense,
      deleteExpense,
      deleteAllExpenses,
    ],
  )

  return (
    <FinanceExpensesContext.Provider value={value}>
      {children}
    </FinanceExpensesContext.Provider>
  )
}

export function useFinanceExpenses(): FinanceExpensesContextValue {
  const ctx = useContext(FinanceExpensesContext)
  if (!ctx) {
    throw new Error('useFinanceExpenses חייב להיות בתוך FinanceExpensesProvider')
  }
  return ctx
}
