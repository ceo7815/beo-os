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
import { docToInvoice } from '../lib/firestoreMappers'
import { getDb } from '../lib/firebase'
import { todayYmd } from '../lib/dates'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { Invoice, InvoiceStatus } from '../types'

export type NewInvoiceInput = {
  clientId: string
  invoiceNumber: string
  amount: number
  dueDate: string
  note?: string
}

type InvoicesContextValue = {
  invoices: Invoice[]
  loading: boolean
  error: Error | null
  addInvoice: (data: NewInvoiceInput) => Promise<void>
  markAsPaid: (id: string) => Promise<void>
  deleteInvoice: (id: string) => Promise<void>
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
    const db = getDb()
    const unsub = onSnapshot(
      collection(db, 'invoices'),
      (snap) => {
        const today = todayYmd()
        const mapped = snap.docs.map((d) => docToInvoice(d))

        for (const d of snap.docs) {
          const inv = docToInvoice(d)
          const due = ymdFromField(inv.dueDate)
          if (
            inv.status === 'pending' &&
            /^\d{4}-\d{2}-\d{2}$/.test(due) &&
            due < today
          ) {
            void updateDoc(d.ref, { status: 'overdue' })
          }
        }

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
      const db = getDb()
      await addDoc(collection(db, 'invoices'), {
        clientId: data.clientId,
        invoiceNumber: data.invoiceNumber.trim(),
        amount: data.amount,
        dueDate: data.dueDate.slice(0, 10),
        status: 'pending' as const,
        ...(data.note?.trim()
          ? { note: data.note.trim() }
          : {}),
        createdAt: serverTimestamp(),
      })
      toastFsSuccess('החשבונית נוספה')
    } catch (e) {
      toastFsError('שגיאה בשמירת החשבונית', e, 'addInvoice')
    }
  }, [])

  const markAsPaid = useCallback(async (id: string) => {
    try {
      const db = getDb()
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
      const db = getDb()
      await deleteDoc(doc(db, 'invoices', id))
      toastFsSuccess('החשבונית נמחקה')
    } catch (e) {
      toastFsError('שגיאה במחיקת החשבונית', e, 'deleteInvoice')
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
    }),
    [invoices, loading, error, addInvoice, markAsPaid, deleteInvoice],
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
