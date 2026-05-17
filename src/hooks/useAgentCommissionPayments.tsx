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
import { docToAgentCommissionPayment } from '../lib/firestoreMappers'
import { db } from '../lib/firebase'
import { todayYmd } from '../lib/dates'
import { stripUndefined } from '../lib/stripUndefined'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { AgentCommissionPayment } from '../types'

export type NewAgentCommissionPaymentInput = {
  agentUserId: string
  amount: number
  paidDate: string
  note?: string
  clientId?: string
  dealId?: string
}

type AgentCommissionPaymentsContextValue = {
  payments: AgentCommissionPayment[]
  loading: boolean
  error: Error | null
  addPayment: (data: NewAgentCommissionPaymentInput) => Promise<void>
  deletePayment: (id: string) => Promise<void>
}

const AgentCommissionPaymentsContext = createContext<AgentCommissionPaymentsContextValue | null>(
  null,
)

export function AgentCommissionPaymentsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [payments, setPayments] = useState<AgentCommissionPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!user) {
      setPayments([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    const unsub = onSnapshot(
      collection(db, 'agentCommissionPayments'),
      (snap) => {
        const list = snap.docs.map(docToAgentCommissionPayment)
        list.sort((a, b) => {
          const da = a.paidDate || a.createdAt
          const dbDate = b.paidDate || b.createdAt
          return dbDate.localeCompare(da)
        })
        setPayments(list)
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err)
        setLoading(false)
        toastFsError('שגיאה בטעינת תשלומי סוכנים', err, 'AgentCommissionPaymentsProvider')
      },
    )
    return () => unsub()
  }, [user])

  const addPayment = useCallback(
    async (data: NewAgentCommissionPaymentInput) => {
      if (!user) return
      const amount = Math.round(data.amount * 100) / 100
      if (!Number.isFinite(amount) || amount <= 0) {
        toastFsError('סכום חייב להיות חיובי', new Error('amount'), 'addAgentCommissionPayment')
        return
      }
      const paidDate = data.paidDate.trim().slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) {
        toastFsError('תאריך תשלום לא תקין', new Error('paidDate'), 'addAgentCommissionPayment')
        return
      }
      if (!data.agentUserId.trim()) {
        toastFsError('חסר סוכן', new Error('agentUserId'), 'addAgentCommissionPayment')
        return
      }
      try {
        await addDoc(
          collection(db, 'agentCommissionPayments'),
          stripUndefined({
            agentUserId: data.agentUserId.trim(),
            amount,
            paidDate,
            note: data.note?.trim() || undefined,
            clientId: data.clientId?.trim() || undefined,
            dealId: data.dealId?.trim() || undefined,
            createdBy: user.uid,
            createdAt: serverTimestamp(),
          }),
        )
        toastFsSuccess('תשלום לסוכן נרשם')
      } catch (err) {
        toastFsError('שגיאה ברישום תשלום לסוכן', err, 'addAgentCommissionPayment')
        throw err
      }
    },
    [user],
  )

  const deletePayment = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'agentCommissionPayments', id))
      toastFsSuccess('תשלום לסוכן נמחק')
    } catch (err) {
      toastFsError('שגיאה במחיקת תשלום', err, 'deleteAgentCommissionPayment')
      throw err
    }
  }, [])

  const value = useMemo(
    () => ({ payments, loading, error, addPayment, deletePayment }),
    [payments, loading, error, addPayment, deletePayment],
  )

  return (
    <AgentCommissionPaymentsContext.Provider value={value}>
      {children}
    </AgentCommissionPaymentsContext.Provider>
  )
}

export function useAgentCommissionPayments() {
  const ctx = useContext(AgentCommissionPaymentsContext)
  if (!ctx) {
    throw new Error('useAgentCommissionPayments חייב להיות בתוך AgentCommissionPaymentsProvider')
  }
  return ctx
}

export function defaultAgentPaymentDateYmd(): string {
  return todayYmd()
}
