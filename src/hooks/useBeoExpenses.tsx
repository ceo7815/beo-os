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
import { requireSupabase } from '../lib/supabase'
import { subscribeTable } from '../lib/sbLive'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { FinancePaymentMethod } from '../types'

/** הוצאה פנימית ב־Beo OS — לא מחוברת לריווחית / GI */
export type BeoExpenseAllocation = 'office' | 'project'
export type BeoExpenseCurrency = 'ILS' | 'USD' | 'EUR'

export type BeoExpense = {
  id: string
  name: string
  /** סכום בשקלים (אחרי המרה אם יש מט״ח) */
  amount: number
  billingMonth: string
  /** YYYY-MM-DD — תאריך ההוצאה */
  expenseDate?: string
  type: string
  recurring: boolean
  /** שיוך: הוצאות משרד או פרויקט */
  allocation: BeoExpenseAllocation
  projectId?: string
  /** ספק במערכת — חובה בהוצאות חדשות */
  supplierId?: string
  catalogItemId?: string
  supplierName?: string
  description?: string
  notes?: string
  /** אמצעי תשלום חופשי — למשל "ויזה ****1234" */
  paymentMethod?: string
  currency?: BeoExpenseCurrency
  /** סכום במטבע המקור לפני המרה */
  originalAmount?: number
  /** שער המרה למטבע → שקל */
  exchangeRate?: number
  supplierInvoiceReceived: boolean
  invoiceNumber?: string
  documentUrl?: string
  documentFileName?: string
  documentAttachedAt?: string
  source: 'manual' | 'fixed_catalog'
  createdAt: string
  updatedAt?: string
}

export type BeoExpenseInput = {
  name: string
  amount: number
  billingMonth: string
  expenseDate?: string
  type?: string
  recurring?: boolean
  allocation?: BeoExpenseAllocation
  projectId?: string | null
  supplierId?: string | null
  catalogItemId?: string
  supplierName?: string
  description?: string
  notes?: string
  paymentMethod?: string
  currency?: BeoExpenseCurrency
  originalAmount?: number | null
  exchangeRate?: number | null
  supplierInvoiceReceived?: boolean
  invoiceNumber?: string
  documentUrl?: string
  documentFileName?: string
  documentAttachedAt?: string
  source?: 'manual' | 'fixed_catalog'
}

export type BeoFixedCatalogItem = {
  id: string
  name: string
  amount: number
  dayOfMonth: number
  paymentMethod: FinancePaymentMethod
  type: string
  active: boolean
}

function flattenExpense(row: Record<string, unknown>): BeoExpense | null {
  const id = String(row.id ?? '')
  if (!id) return null
  const p =
    row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {}
  const name = String(p.name ?? '').trim()
  const amount = Number(p.amount)
  const billingMonth = String(p.billingMonth ?? '').slice(0, 7)
  if (!name || !Number.isFinite(amount) || !/^\d{4}-\d{2}$/.test(billingMonth)) return null
  const paymentMethod =
    typeof p.paymentMethod === 'string' && p.paymentMethod.trim()
      ? p.paymentMethod.trim()
      : undefined
  const currencyRaw = String(p.currency ?? 'ILS').toUpperCase()
  const currency: BeoExpenseCurrency =
    currencyRaw === 'USD' || currencyRaw === 'EUR' ? currencyRaw : 'ILS'
  const originalAmount =
    typeof p.originalAmount === 'number' && Number.isFinite(p.originalAmount)
      ? Math.round(p.originalAmount * 100) / 100
      : undefined
  const exchangeRate =
    typeof p.exchangeRate === 'number' && Number.isFinite(p.exchangeRate) && p.exchangeRate > 0
      ? Math.round(p.exchangeRate * 10000) / 10000
      : undefined
  const allocation: BeoExpenseAllocation =
    p.allocation === 'project' || p.projectId ? 'project' : 'office'
  const expenseDate =
    typeof p.expenseDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(p.expenseDate)
      ? p.expenseDate.slice(0, 10)
      : undefined
  return {
    id,
    name,
    amount: Math.round(amount * 100) / 100,
    billingMonth,
    expenseDate,
    type: String(p.type ?? (p.recurring ? 'fixed' : 'operating')),
    recurring: p.recurring === true || p.type === 'fixed',
    allocation,
    projectId: p.projectId ? String(p.projectId) : undefined,
    supplierId: p.supplierId ? String(p.supplierId) : undefined,
    catalogItemId: p.catalogItemId ? String(p.catalogItemId) : undefined,
    supplierName: p.supplierName ? String(p.supplierName) : undefined,
    description: p.description ? String(p.description) : undefined,
    notes: p.notes ? String(p.notes) : undefined,
    paymentMethod,
    currency,
    originalAmount,
    exchangeRate,
    supplierInvoiceReceived: p.supplierInvoiceReceived === true,
    invoiceNumber: p.invoiceNumber ? String(p.invoiceNumber) : undefined,
    documentUrl: p.documentUrl ? String(p.documentUrl) : undefined,
    documentFileName: p.documentFileName ? String(p.documentFileName) : undefined,
    documentAttachedAt: p.documentAttachedAt ? String(p.documentAttachedAt) : undefined,
    source: p.source === 'fixed_catalog' ? 'fixed_catalog' : 'manual',
    createdAt: row.created_at ? String(row.created_at) : new Date().toISOString(),
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  }
}

function flattenCatalog(row: Record<string, unknown>): BeoFixedCatalogItem | null {
  const id = String(row.id ?? '')
  if (!id) return null
  const p =
    row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {}
  const name = String(p.name ?? '').trim()
  const amount = Number(p.amount)
  if (!name || !Number.isFinite(amount) || amount <= 0) return null
  const dayRaw = Number(p.dayOfMonth ?? 1)
  return {
    id,
    name,
    amount: Math.round(amount * 100) / 100,
    dayOfMonth: dayRaw >= 1 && dayRaw <= 31 ? Math.trunc(dayRaw) : 1,
    paymentMethod: p.paymentMethod === 'credit_card' ? 'credit_card' : 'bank_transfer',
    type: String(p.type ?? 'fixed'),
    active: p.active !== false,
  }
}

function toPayload(input: BeoExpenseInput): Record<string, unknown> {
  const allocation: BeoExpenseAllocation =
    input.allocation === 'project' || input.projectId ? 'project' : 'office'
  const projectId =
    allocation === 'project' && input.projectId ? String(input.projectId) : undefined
  const currency: BeoExpenseCurrency =
    input.currency === 'USD' || input.currency === 'EUR' ? input.currency : 'ILS'
  return {
    name: input.name.trim(),
    amount: Math.round(Number(input.amount) * 100) / 100,
    billingMonth: input.billingMonth.slice(0, 7),
    expenseDate: input.expenseDate?.slice(0, 10) || undefined,
    type: input.type ?? (input.recurring ? 'fixed' : 'operating'),
    recurring: input.recurring === true || input.type === 'fixed',
    allocation,
    projectId,
    supplierId: input.supplierId ? String(input.supplierId) : undefined,
    catalogItemId: input.catalogItemId || undefined,
    supplierName: input.supplierName?.trim() || undefined,
    description: input.description?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    paymentMethod: input.paymentMethod?.trim() || undefined,
    currency,
    originalAmount:
      currency !== 'ILS' && input.originalAmount != null && Number(input.originalAmount) > 0
        ? Math.round(Number(input.originalAmount) * 100) / 100
        : undefined,
    exchangeRate:
      currency !== 'ILS' && input.exchangeRate != null && Number(input.exchangeRate) > 0
        ? Math.round(Number(input.exchangeRate) * 10000) / 10000
        : undefined,
    supplierInvoiceReceived: input.supplierInvoiceReceived === true,
    invoiceNumber: input.invoiceNumber?.trim() || undefined,
    documentUrl: input.documentUrl || undefined,
    documentFileName: input.documentFileName || undefined,
    documentAttachedAt: input.documentAttachedAt || undefined,
    source: input.source ?? 'manual',
  }
}

export function expenseHasInvoice(e: BeoExpense): boolean {
  return Boolean(e.documentUrl?.trim()) || e.supplierInvoiceReceived === true
}

type Ctx = {
  expenses: BeoExpense[]
  catalog: BeoFixedCatalogItem[]
  loading: boolean
  addExpense: (input: BeoExpenseInput, opts?: { silent?: boolean }) => Promise<string | undefined>
  updateExpense: (id: string, patch: Partial<BeoExpenseInput>) => Promise<boolean>
  deleteExpense: (id: string) => Promise<boolean>
  addCatalogItem: (item: Omit<BeoFixedCatalogItem, 'id'>) => Promise<string | undefined>
  updateCatalogItem: (
    id: string,
    patch: Partial<Omit<BeoFixedCatalogItem, 'id'>>,
  ) => Promise<boolean>
  deleteCatalogItem: (id: string) => Promise<boolean>
  ensureFixedForMonth: (ym: string) => Promise<number>
  uploadInvoice: (expenseId: string, file: File, invoiceNumber?: string) => Promise<boolean>
}

const BeoExpensesContext = createContext<Ctx | null>(null)

export function BeoExpensesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [expenses, setExpenses] = useState<BeoExpense[]>([])
  const [catalog, setCatalog] = useState<BeoFixedCatalogItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setExpenses([])
      setCatalog([])
      setLoading(false)
      return
    }
    setLoading(true)
    let pending = 2
    const done = () => {
      pending -= 1
      if (pending <= 0) setLoading(false)
    }
    const unsubExp = subscribeTable(
      'finance_expenses',
      (rows) => {
        const list = rows
          .map(flattenExpense)
          .filter((x): x is BeoExpense => Boolean(x))
          .sort((a, b) => b.billingMonth.localeCompare(a.billingMonth) || a.name.localeCompare(b.name, 'he'))
        setExpenses(list)
        done()
      },
      (err) => {
        toastFsError('שגיאה בטעינת הוצאות', err, 'beoExpenses')
        done()
      },
    )
    const unsubCat = subscribeTable(
      'finance_fixed_expense_catalog',
      (rows) => {
        const list = rows
          .map(flattenCatalog)
          .filter((x): x is BeoFixedCatalogItem => Boolean(x))
          .sort((a, b) => a.name.localeCompare(b.name, 'he'))
        setCatalog(list)
        done()
      },
      (err) => {
        toastFsError('שגיאה בטעינת הוצאות קבועות', err, 'beoCatalog')
        done()
      },
    )
    return () => {
      unsubExp()
      unsubCat()
    }
  }, [user])

  const addExpense = useCallback(async (input: BeoExpenseInput, opts?: { silent?: boolean }) => {
    try {
      const sb = requireSupabase()
      const payload = toPayload(input)
      const { data, error } = await sb
        .from('finance_expenses')
        .insert({ payload })
        .select('id')
        .single()
      if (error) throw error
      if (!opts?.silent) toastFsSuccess('ההוצאה נוספה')
      return String(data.id)
    } catch (e) {
      toastFsError('שגיאה בהוספת הוצאה', e, 'addExpense')
      return undefined
    }
  }, [])

  const updateExpense = useCallback(async (id: string, patch: Partial<BeoExpenseInput>) => {
    try {
      const sb = requireSupabase()
      const current = expenses.find((e) => e.id === id)
      if (!current) throw new Error('הוצאה לא נמצאה')
      const merged: BeoExpenseInput = {
        name: patch.name ?? current.name,
        amount: patch.amount ?? current.amount,
        billingMonth: patch.billingMonth ?? current.billingMonth,
        expenseDate:
          patch.expenseDate !== undefined ? patch.expenseDate : current.expenseDate,
        type: patch.type ?? current.type,
        recurring: patch.recurring ?? current.recurring,
        allocation: patch.allocation ?? current.allocation,
        projectId:
          patch.projectId !== undefined ? patch.projectId : current.projectId ?? null,
        supplierId:
          patch.supplierId !== undefined ? patch.supplierId : current.supplierId ?? null,
        catalogItemId: patch.catalogItemId ?? current.catalogItemId,
        supplierName: patch.supplierName !== undefined ? patch.supplierName : current.supplierName,
        description: patch.description !== undefined ? patch.description : current.description,
        notes: patch.notes !== undefined ? patch.notes : current.notes,
        paymentMethod:
          patch.paymentMethod !== undefined ? patch.paymentMethod : current.paymentMethod,
        currency: patch.currency ?? current.currency,
        originalAmount:
          patch.originalAmount !== undefined ? patch.originalAmount : current.originalAmount,
        exchangeRate:
          patch.exchangeRate !== undefined ? patch.exchangeRate : current.exchangeRate,
        supplierInvoiceReceived:
          patch.supplierInvoiceReceived ?? current.supplierInvoiceReceived,
        invoiceNumber:
          patch.invoiceNumber !== undefined ? patch.invoiceNumber : current.invoiceNumber,
        documentUrl: patch.documentUrl !== undefined ? patch.documentUrl : current.documentUrl,
        documentFileName:
          patch.documentFileName !== undefined
            ? patch.documentFileName
            : current.documentFileName,
        documentAttachedAt:
          patch.documentAttachedAt !== undefined
            ? patch.documentAttachedAt
            : current.documentAttachedAt,
        source: patch.source ?? current.source,
      }
      const { error } = await sb
        .from('finance_expenses')
        .update({ payload: toPayload(merged), updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      toastFsSuccess('ההוצאה עודכנה')
      return true
    } catch (e) {
      toastFsError('שגיאה בעדכון הוצאה', e, 'updateExpense')
      return false
    }
  }, [expenses])

  const deleteExpense = useCallback(async (id: string) => {
    try {
      const sb = requireSupabase()
      const { error } = await sb.from('finance_expenses').delete().eq('id', id)
      if (error) throw error
      toastFsSuccess('ההוצאה נמחקה')
      return true
    } catch (e) {
      toastFsError('שגיאה במחיקת הוצאה', e, 'deleteExpense')
      return false
    }
  }, [])

  const addCatalogItem = useCallback(async (item: Omit<BeoFixedCatalogItem, 'id'>) => {
    try {
      const sb = requireSupabase()
      const payload = {
        name: item.name.trim(),
        amount: Math.round(item.amount * 100) / 100,
        dayOfMonth: item.dayOfMonth,
        paymentMethod: item.paymentMethod,
        type: item.type || 'fixed',
        active: item.active !== false,
      }
      const { data, error } = await sb
        .from('finance_fixed_expense_catalog')
        .insert({ payload })
        .select('id')
        .single()
      if (error) throw error
      toastFsSuccess('הוצאה קבועה נוספה לקטלוג')
      return String(data.id)
    } catch (e) {
      toastFsError('שגיאה בהוספת הוצאה קבועה', e, 'addCatalog')
      return undefined
    }
  }, [])

  const updateCatalogItem = useCallback(
    async (id: string, patch: Partial<Omit<BeoFixedCatalogItem, 'id'>>) => {
      try {
        const sb = requireSupabase()
        const current = catalog.find((c) => c.id === id)
        if (!current) throw new Error('לא נמצא')
        const payload = {
          name: (patch.name ?? current.name).trim(),
          amount: Math.round((patch.amount ?? current.amount) * 100) / 100,
          dayOfMonth: patch.dayOfMonth ?? current.dayOfMonth,
          paymentMethod: patch.paymentMethod ?? current.paymentMethod,
          type: patch.type ?? current.type,
          active: patch.active ?? current.active,
        }
        const { error } = await sb
          .from('finance_fixed_expense_catalog')
          .update({ payload, updated_at: new Date().toISOString() })
          .eq('id', id)
        if (error) throw error
        toastFsSuccess('הקטלוג עודכן')
        return true
      } catch (e) {
        toastFsError('שגיאה בעדכון קטלוג', e, 'updateCatalog')
        return false
      }
    },
    [catalog],
  )

  const deleteCatalogItem = useCallback(async (id: string) => {
    try {
      const sb = requireSupabase()
      const { error } = await sb.from('finance_fixed_expense_catalog').delete().eq('id', id)
      if (error) throw error
      toastFsSuccess('הוסר מהקטלוג')
      return true
    } catch (e) {
      toastFsError('שגיאה במחיקה מהקטלוג', e, 'deleteCatalog')
      return false
    }
  }, [])

  const ensureFixedForMonth = useCallback(
    async (ym: string) => {
      const month = ym.slice(0, 7)
      let created = 0
      for (const item of catalog.filter((c) => c.active)) {
        const exists = expenses.some(
          (e) => e.billingMonth === month && e.catalogItemId === item.id,
        )
        if (exists) continue
        const id = await addExpense(
          {
            name: item.name,
            amount: item.amount,
            billingMonth: month,
            type: item.type || 'fixed',
            recurring: true,
            catalogItemId: item.id,
            paymentMethod: item.paymentMethod,
            allocation: 'office',
            supplierInvoiceReceived: false,
            source: 'fixed_catalog',
          },
          { silent: true },
        )
        if (id) created += 1
      }
      if (created > 0) toastFsSuccess(`נוצרו ${created} הוצאות קבועות לחודש`)
      else toastFsSuccess('כל ההוצאות הקבועות כבר קיימות בחודש זה')
      return created
    },
    [addExpense, catalog, expenses],
  )

  const uploadInvoice = useCallback(
    async (expenseId: string, file: File, invoiceNumber?: string) => {
      try {
        const sb = requireSupabase()
        const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '.pdf'
        const path = `${expenseId}/${Date.now()}${ext}`
        const { error: upErr } = await sb.storage
          .from('expense-documents')
          .upload(path, file, { upsert: true, contentType: file.type || undefined })
        if (upErr) throw upErr
        const { data: signed, error: signErr } = await sb.storage
          .from('expense-documents')
          .createSignedUrl(path, 60 * 60 * 24 * 365)
        if (signErr) throw signErr
        const ok = await updateExpense(expenseId, {
          documentUrl: signed.signedUrl,
          documentFileName: file.name,
          documentAttachedAt: new Date().toISOString(),
          supplierInvoiceReceived: true,
          invoiceNumber: invoiceNumber?.trim() || undefined,
        })
        return ok
      } catch (e) {
        toastFsError('העלאת חשבונית נכשלה', e, 'uploadInvoice')
        return false
      }
    },
    [updateExpense],
  )

  const value = useMemo(
    () => ({
      expenses,
      catalog,
      loading,
      addExpense,
      updateExpense,
      deleteExpense,
      addCatalogItem,
      updateCatalogItem,
      deleteCatalogItem,
      ensureFixedForMonth,
      uploadInvoice,
    }),
    [
      expenses,
      catalog,
      loading,
      addExpense,
      updateExpense,
      deleteExpense,
      addCatalogItem,
      updateCatalogItem,
      deleteCatalogItem,
      ensureFixedForMonth,
      uploadInvoice,
    ],
  )

  return <BeoExpensesContext.Provider value={value}>{children}</BeoExpensesContext.Provider>
}

export function useBeoExpenses() {
  const ctx = useContext(BeoExpensesContext)
  if (!ctx) throw new Error('useBeoExpenses חייב להיות בתוך BeoExpensesProvider')
  return ctx
}
