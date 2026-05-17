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
import { docToInvoice } from '../lib/firestoreMappers'
import { db } from '../lib/firebase'
import { todayYmd } from '../lib/dates'
import { stripUndefined } from '../lib/stripUndefined'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { Invoice, InvoiceStatus } from '../types'

export type NewInvoiceInput = {
  clientId: string
  invoiceNumber: string
  amount: number
  dueDate: string
  note?: string
  dealId?: string
  /** אחוז עמלה לסוכן על רישום זה — מסתנכרן לפורטל הסוכן */
  agentCommissionPercent?: number
  /** כש־paid — נרשם תשלום ששולם מיד (מסלול עסקאות) */
  initialStatus?: 'pending' | 'paid'
  paidDate?: string
}

export type InvoicePatchInput = {
  amount?: number
  dueDate?: string
  paidDate?: string | null
  note?: string | null
  status?: InvoiceStatus
  agentCommissionPercent?: number | null
  dealId?: string | null
  invoiceNumber?: string
}

type InvoicesContextValue = {
  invoices: Invoice[]
  loading: boolean
  error: Error | null
  addInvoice: (data: NewInvoiceInput) => Promise<void>
  markAsPaid: (id: string) => Promise<void>
  deleteInvoice: (id: string) => Promise<void>
  patchInvoice: (id: string, patch: InvoicePatchInput) => Promise<void>
}

const InvoicesContext = createContext<InvoicesContextValue | null>(null)

function ymdFromField(value: string): string {
  return value.slice(0, 10)
}

function withDisplayOverdue(list: Invoice[], today: string): Invoice[] {
  return list.map((inv) => {
    const due = ymdFromField(inv.dueDate)
    if (
      inv.status === 'pending' &&
      /^\d{4}-\d{2}-\d{2}$/.test(due) &&
      due < today
    ) {
      return { ...inv, status: 'overdue' as InvoiceStatus }
    }
    return inv
  })
}

export function InvoicesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!user) {
      setInvoices([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    const unsub = onSnapshot(
      collection(db, 'invoices'),
      (snap) => {
        const today = todayYmd()
        const mapped = snap.docs.map((d) => docToInvoice(d))
        setInvoices(withDisplayOverdue(mapped, today))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('invoices snapshot', err)
        toastFsError('שגיאה בטעינת חשבוניות', err, 'invoices snapshot')
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      },
    )

    return () => unsub()
  }, [user])

  const addInvoice = useCallback(async (data: NewInvoiceInput) => {
    try {
      const isPaid = data.initialStatus === 'paid'
      const paidYmd = (data.paidDate ?? todayYmd()).slice(0, 10)
      const dueYmd = data.dueDate.slice(0, 10)
      const row: Record<string, unknown> = {
        clientId: data.clientId,
        invoiceNumber: data.invoiceNumber.trim(),
        amount: data.amount,
        dueDate: dueYmd,
        status: isPaid ? 'paid' : 'pending',
        createdAt: serverTimestamp(),
      }
      if (isPaid) row.paidDate = paidYmd
      if (data.note?.trim()) row.note = data.note.trim()
      if (data.dealId?.trim()) row.dealId = data.dealId.trim()
      if (
        typeof data.agentCommissionPercent === 'number' &&
        Number.isFinite(data.agentCommissionPercent)
      ) {
        const p = Math.round(data.agentCommissionPercent)
        if (p >= 0 && p <= 100) row.agentCommissionPercent = p
      }
      await addDoc(collection(db, 'invoices'), row)
      toastFsSuccess(isPaid ? 'התשלום נרשם' : 'החשבונית נוספה')
    } catch (e) {
      toastFsError('שגיאה בשמירת החשבונית', e, 'addInvoice')
    }
  }, [])

  const markAsPaid = useCallback(async (id: string) => {
    try {
      const paid = todayYmd()
      await updateDoc(doc(db, 'invoices', id), {
        status: 'paid',
        paidDate: paid,
      })
      toastFsSuccess('סומן כשולם')
    } catch (e) {
      toastFsError('שגיאה בעדכון החשבונית', e, 'markAsPaid')
    }
  }, [])

  const deleteInvoice = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'invoices', id))
      toastFsSuccess('החשבונית נמחקה')
    } catch (e) {
      toastFsError('שגיאה במחיקת החשבונית', e, 'deleteInvoice')
    }
  }, [])

  const patchInvoice = useCallback(async (id: string, patch: InvoicePatchInput) => {
    try {
      const next: Record<string, unknown> = {}
      if (typeof patch.amount === 'number' && Number.isFinite(patch.amount) && patch.amount >= 0) {
        next.amount = Math.round(patch.amount * 100) / 100
      }
      if (typeof patch.dueDate === 'string' && patch.dueDate.trim()) {
        next.dueDate = patch.dueDate.trim().slice(0, 10)
      }
      if (patch.paidDate === null) {
        next.paidDate = deleteField()
      } else if (typeof patch.paidDate === 'string' && patch.paidDate.trim()) {
        next.paidDate = patch.paidDate.trim().slice(0, 10)
      }
      if (patch.note === null) {
        next.note = deleteField()
      } else if (typeof patch.note === 'string') {
        const t = patch.note.trim()
        next.note = t ? t : deleteField()
      }
      if (patch.status != null) next.status = patch.status
      if (typeof patch.invoiceNumber === 'string' && patch.invoiceNumber.trim()) {
        next.invoiceNumber = patch.invoiceNumber.trim()
      }
      if (patch.dealId === null) {
        next.dealId = deleteField()
      } else if (typeof patch.dealId === 'string' && patch.dealId.trim()) {
        next.dealId = patch.dealId.trim()
      }
      if (patch.agentCommissionPercent === null) {
        next.agentCommissionPercent = deleteField()
      } else if (
        typeof patch.agentCommissionPercent === 'number' &&
        Number.isFinite(patch.agentCommissionPercent)
      ) {
        const p = Math.round(patch.agentCommissionPercent)
        if (p >= 0 && p <= 100) next.agentCommissionPercent = p
      }
      if (Object.keys(next).length === 0) return
      await updateDoc(doc(db, 'invoices', id), stripUndefined(next))
      toastFsSuccess('החשבונית עודכנה')
    } catch (e) {
      toastFsError('שגיאה בעדכון חשבונית', e, 'patchInvoice')
    }
  }, [])

  const value = useMemo(
    () => ({
      invoices,
      loading,
      error,
      addInvoice,
      markAsPaid,
      deleteInvoice,
      patchInvoice,
    }),
    [invoices, loading, error, addInvoice, markAsPaid, deleteInvoice, patchInvoice],
  )

  return (
    <InvoicesContext.Provider value={value}>{children}</InvoicesContext.Provider>
  )
}

export function useInvoices(): InvoicesContextValue {
  const ctx = useContext(InvoicesContext)
  if (!ctx) throw new Error('useInvoices חייב להיות בתוך InvoicesProvider')
  return ctx
}
