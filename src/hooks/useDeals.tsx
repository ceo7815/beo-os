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
  getDocsFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { docToDeal } from '../lib/firestoreMappers'
import { db } from '../lib/firebase'
import { stripUndefined } from '../lib/stripUndefined'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import { useAuth } from '../contexts/AuthContext'
import type { Deal, DealKind, DealScheduledPayment, DealStatus } from '../types'

export type NewDealInput = {
  clientId: string
  leadId?: string
  salesAgentUserId?: string
  dealKind: DealKind
  title: string
  agreedAmount?: number | null
  commissionPercent: number
  status?: DealStatus
  notes?: string
  expectedPaymentYmd?: string
  annualBillingYmd?: string
  firstPaymentYmd?: string
  isHostingDeal?: boolean
  scheduledPayments?: DealScheduledPayment[]
}

type DealPatch = Partial<
  Pick<
    Deal,
    | 'title'
    | 'status'
    | 'notes'
    | 'agreedAmount'
    | 'commissionPercent'
    | 'dealKind'
    | 'expectedPaymentYmd'
    | 'annualBillingYmd'
    | 'firstPaymentYmd'
    | 'isHostingDeal'
    | 'scheduledPayments'
  >
>

type DealsContextValue = {
  deals: Deal[]
  loading: boolean
  error: Error | null
  addDeal: (data: NewDealInput) => Promise<string | undefined>
  updateDeal: (id: string, patch: DealPatch) => Promise<void>
  deleteDeal: (id: string) => Promise<void>
}

const DealsContext = createContext<DealsContextValue | null>(null)

export function DealsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!user) {
      setDeals([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    const unsub = onSnapshot(
      collection(db, 'deals'),
      (snap) => {
        setDeals(snap.docs.map((d) => docToDeal(d)))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('deals snapshot', err)
        toastFsError('שגיאה בטעינת עסקאות', err, 'deals snapshot')
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      },
    )
    return () => unsub()
  }, [user])

  const addDeal = useCallback(
    async (data: NewDealInput): Promise<string | undefined> => {
      if (!user) {
        toastFsError('יש להתחבר', new Error('no user'), 'addDeal')
        return undefined
      }
      try {
        const comm = Math.min(100, Math.max(0, Math.round(Number(data.commissionPercent))))
        const ref = await addDoc(
          collection(db, 'deals'),
          stripUndefined({
            clientId: data.clientId.trim(),
            dealKind: data.dealKind,
            title: data.title.trim(),
            commissionPercent: comm,
            status: data.status ?? 'active',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdByUserId: user.uid,
            ...(data.leadId?.trim() ? { leadId: data.leadId.trim() } : {}),
            ...(data.salesAgentUserId?.trim()
              ? { salesAgentUserId: data.salesAgentUserId.trim() }
              : {}),
            ...(data.agreedAmount != null &&
            Number.isFinite(data.agreedAmount) &&
            data.agreedAmount >= 0
              ? { agreedAmount: data.agreedAmount }
              : {}),
            ...(data.notes?.trim() ? { notes: data.notes.trim() } : {}),
            ...(data.expectedPaymentYmd?.trim()
              ? { expectedPaymentYmd: data.expectedPaymentYmd.trim().slice(0, 10) }
              : {}),
            ...(data.annualBillingYmd?.trim()
              ? { annualBillingYmd: data.annualBillingYmd.trim().slice(0, 10) }
              : {}),
            ...(data.firstPaymentYmd?.trim()
              ? { firstPaymentYmd: data.firstPaymentYmd.trim().slice(0, 10) }
              : {}),
            ...(data.isHostingDeal === true ? { isHostingDeal: true } : {}),
            ...(data.scheduledPayments?.length ? { scheduledPayments: data.scheduledPayments } : {}),
          } as Record<string, unknown>),
        )
        toastFsSuccess('העסקה נשמרה')
        return ref.id
      } catch (e) {
        toastFsError('שגיאה בשמירת עסקה', e, 'addDeal')
        return undefined
      }
    },
    [user],
  )

  const updateDeal = useCallback(async (id: string, patch: DealPatch) => {
    try {
      const next: Record<string, unknown> = { updatedAt: serverTimestamp() }
      if (typeof patch.title === 'string') next.title = patch.title.trim()
      if (typeof patch.notes === 'string') next.notes = patch.notes.trim()
      if (patch.status != null) next.status = patch.status
      if (patch.dealKind != null) next.dealKind = patch.dealKind
      if (typeof patch.agreedAmount === 'number' && Number.isFinite(patch.agreedAmount) && patch.agreedAmount >= 0) {
        next.agreedAmount = patch.agreedAmount
      }
      if (typeof patch.commissionPercent === 'number' && Number.isFinite(patch.commissionPercent)) {
        next.commissionPercent = Math.min(100, Math.max(0, Math.round(patch.commissionPercent)))
      }
      if (typeof patch.expectedPaymentYmd === 'string' && patch.expectedPaymentYmd.trim()) {
        next.expectedPaymentYmd = patch.expectedPaymentYmd.trim().slice(0, 10)
      }
      if (typeof patch.annualBillingYmd === 'string' && patch.annualBillingYmd.trim()) {
        next.annualBillingYmd = patch.annualBillingYmd.trim().slice(0, 10)
      }
      if (typeof patch.firstPaymentYmd === 'string' && patch.firstPaymentYmd.trim()) {
        next.firstPaymentYmd = patch.firstPaymentYmd.trim().slice(0, 10)
      }
      if (patch.isHostingDeal === true) next.isHostingDeal = true
      if (patch.isHostingDeal === false) next.isHostingDeal = false
      if (Array.isArray(patch.scheduledPayments)) {
        next.scheduledPayments = patch.scheduledPayments
      }
      if (Object.keys(next).length <= 1) return
      await updateDoc(doc(db, 'deals', id), stripUndefined(next))
      toastFsSuccess('העסקה עודכנה')
    } catch (e) {
      toastFsError('שגיאה בעדכון עסקה', e, 'updateDeal')
    }
  }, [])

  const deleteDeal = useCallback(async (id: string) => {
    try {
      const invSnap = await getDocsFromServer(
        query(collection(db, 'invoices'), where('dealId', '==', id)),
      )
      for (const inv of invSnap.docs) {
        await deleteDoc(inv.ref)
      }
      await deleteDoc(doc(db, 'deals', id))
      setDeals((prev) => prev.filter((d) => d.id !== id))
      toastFsSuccess('העסקה נמחקה')
    } catch (e) {
      toastFsError('שגיאה במחיקת העסקה', e, 'deleteDeal')
    }
  }, [])

  const value = useMemo(
    () => ({
      deals,
      loading,
      error,
      addDeal,
      updateDeal,
      deleteDeal,
    }),
    [deals, loading, error, addDeal, updateDeal, deleteDeal],
  )

  return <DealsContext.Provider value={value}>{children}</DealsContext.Provider>
}

export function useDeals(): DealsContextValue {
  const ctx = useContext(DealsContext)
  if (!ctx) throw new Error('useDeals חייב להיות בתוך DealsProvider')
  return ctx
}
