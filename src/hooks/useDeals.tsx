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
import { db, canUseLegacyFirestore } from '../lib/firebase'
import { isSupabaseConfigured } from '../lib/backend'
import { requireSupabase } from '../lib/supabase'
import { isDeleteSentinel, subscribeTable, uuidOrNull } from '../lib/sbLive'
import { stripUndefined } from '../lib/stripUndefined'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import { useAuth } from '../contexts/AuthContext'
import type {
  Deal,
  DealKind,
  DealScheduledPayment,
  DealStage,
  DealStatus,
} from '../types'

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

function ymdOrUndef(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined
}

const DEAL_STAGES = new Set([
  'signed',
  'deposit_paid',
  'in_progress',
  'delivered',
  'paid_in_full',
  'cancelled',
])

export function rowToDeal(row: Record<string, unknown>): Deal {
  const kind =
    row.deal_kind === 'retainer_monthly' || row.deal_kind === 'retainer_yearly'
      ? row.deal_kind
      : 'one_time'
  const status =
    row.status === 'completed' || row.status === 'cancelled' ? row.status : 'active'
  const stageRaw = typeof row.stage === 'string' ? row.stage : ''
  const stage = DEAL_STAGES.has(stageRaw) ? (stageRaw as DealStage) : undefined
  const scheduled = Array.isArray(row.scheduled_payments)
    ? (row.scheduled_payments as DealScheduledPayment[])
    : undefined
  return {
    id: String(row.id),
    clientId: row.client_id ? String(row.client_id) : '',
    leadId: row.lead_id ? String(row.lead_id) : undefined,
    salesAgentUserId: row.sales_agent_user_id ? String(row.sales_agent_user_id) : undefined,
    dealKind: kind,
    title: String(row.title ?? '').trim() || 'ללא כותרת',
    agreedAmount: num(row.agreed_amount),
    amountTotal: num(row.amount_total) ?? num(row.agreed_amount),
    expectedPaymentYmd: ymdOrUndef(row.expected_payment_ymd),
    annualBillingYmd: ymdOrUndef(row.annual_billing_ymd),
    firstPaymentYmd: ymdOrUndef(row.first_payment_ymd),
    isHostingDeal: row.is_hosting_deal === true,
    scheduledPayments: scheduled,
    commissionPercent: Math.min(100, Math.max(0, Math.round(num(row.commission_percent) ?? 0))),
    status: status as DealStatus,
    stage,
    projectId: row.project_id ? String(row.project_id) : undefined,
    quoteId: row.quote_id ? String(row.quote_id) : undefined,
    depositAmount: num(row.deposit_amount),
    depositPaidAt: ymdOrUndef(row.deposit_paid_at),
    deliveredAt: row.delivered_at ? String(row.delivered_at) : undefined,
    paidInFullAt: ymdOrUndef(row.paid_in_full_at),
    notes: typeof row.notes === 'string' && row.notes.trim() ? row.notes : undefined,
    createdAt: row.created_at ? String(row.created_at) : new Date().toISOString(),
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
    createdByUserId: row.created_by_user_id ? String(row.created_by_user_id) : undefined,
  }
}

const DEAL_KEYS: Record<string, string> = {
  clientId: 'client_id',
  leadId: 'lead_id',
  salesAgentUserId: 'sales_agent_user_id',
  dealKind: 'deal_kind',
  title: 'title',
  agreedAmount: 'agreed_amount',
  amountTotal: 'amount_total',
  expectedPaymentYmd: 'expected_payment_ymd',
  annualBillingYmd: 'annual_billing_ymd',
  firstPaymentYmd: 'first_payment_ymd',
  isHostingDeal: 'is_hosting_deal',
  scheduledPayments: 'scheduled_payments',
  commissionPercent: 'commission_percent',
  status: 'status',
  stage: 'stage',
  projectId: 'project_id',
  quoteId: 'quote_id',
  depositAmount: 'deposit_amount',
  depositPaidAt: 'deposit_paid_at',
  deliveredAt: 'delivered_at',
  paidInFullAt: 'paid_in_full_at',
  notes: 'notes',
  createdByUserId: 'created_by_user_id',
}

function dealToRow(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    const col = DEAL_KEYS[k]
    if (!col || v === undefined) continue
    out[col] = isDeleteSentinel(v) || v === '' ? null : v
  }
  for (const col of ['client_id', 'lead_id', 'sales_agent_user_id', 'project_id', 'quote_id', 'created_by_user_id']) {
    if (col in out) out[col] = uuidOrNull(out[col] == null ? '' : String(out[col]))
  }
  if (typeof out.amount_total === 'number' && out.agreed_amount == null) {
    out.agreed_amount = out.amount_total
  }
  if (typeof out.agreed_amount === 'number' && out.amount_total == null) {
    out.amount_total = out.agreed_amount
  }
  return applyStageSideEffects(out)
}

/** Mirrors the database trigger so the screen stays right even before the migration runs. */
function applyStageSideEffects(row: Record<string, unknown>): Record<string, unknown> {
  const stage = row.stage
  if (typeof stage !== 'string') return row
  const today = new Date().toISOString().slice(0, 10)
  if (stage === 'paid_in_full') {
    row.status = 'completed'
    if (!row.paid_in_full_at) row.paid_in_full_at = today
  } else if (stage === 'cancelled') {
    row.status = 'cancelled'
  } else if (stage === 'signed' || stage === 'deposit_paid' || stage === 'in_progress' || stage === 'delivered') {
    row.status = 'active'
  }
  if (stage === 'deposit_paid' && !row.deposit_paid_at) row.deposit_paid_at = today
  if (stage === 'delivered' && !row.delivered_at) row.delivered_at = new Date().toISOString()
  return row
}

export type NewDealInput = {
  clientId: string
  leadId?: string
  salesAgentUserId?: string
  dealKind: DealKind
  title: string
  agreedAmount?: number | null
  amountTotal?: number | null
  commissionPercent: number
  status?: DealStatus
  stage?: DealStage
  projectId?: string
  quoteId?: string
  depositAmount?: number | null
  depositPaidAt?: string
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
    | 'stage'
    | 'notes'
    | 'agreedAmount'
    | 'amountTotal'
    | 'commissionPercent'
    | 'dealKind'
    | 'expectedPaymentYmd'
    | 'annualBillingYmd'
    | 'firstPaymentYmd'
    | 'isHostingDeal'
    | 'scheduledPayments'
    | 'projectId'
    | 'quoteId'
    | 'leadId'
    | 'clientId'
    | 'depositAmount'
    | 'depositPaidAt'
    | 'deliveredAt'
    | 'paidInFullAt'
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
  const useSb = isSupabaseConfigured()

  useEffect(() => {
    if (!user) {
      setDeals([])
      setLoading(false)
      setError(null)
      return
    }
    if (useSb) {
      setLoading(true)
      return subscribeTable(
        'deals',
        (rows) => {
          setDeals(rows.map(rowToDeal))
          setLoading(false)
          setError(null)
        },
        (err) => {
          console.error('deals', err)
          toastFsError('שגיאה בטעינת עסקאות', err, 'deals')
          setError(err)
          setLoading(false)
        },
      )
    }
    if (!canUseLegacyFirestore()) {
      setLoading(false)
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
  }, [user, useSb])

  const addDeal = useCallback(
    async (data: NewDealInput): Promise<string | undefined> => {
      if (!user) {
        toastFsError('יש להתחבר', new Error('no user'), 'addDeal')
        return undefined
      }
      const comm = Math.min(100, Math.max(0, Math.round(Number(data.commissionPercent) || 0)))
      const amount =
        data.amountTotal != null && Number.isFinite(data.amountTotal)
          ? data.amountTotal
          : data.agreedAmount != null && Number.isFinite(data.agreedAmount)
            ? data.agreedAmount
            : undefined
      try {
        if (useSb) {
          const sb = requireSupabase()
          const row = dealToRow({
            clientId: data.clientId.trim(),
            leadId: data.leadId,
            salesAgentUserId: data.salesAgentUserId,
            dealKind: data.dealKind,
            title: data.title.trim(),
            agreedAmount: amount,
            amountTotal: amount,
            commissionPercent: comm,
            status: data.status ?? 'active',
            stage: data.stage ?? 'signed',
            projectId: data.projectId,
            quoteId: data.quoteId,
            depositAmount: data.depositAmount ?? undefined,
            depositPaidAt: data.depositPaidAt,
            notes: data.notes,
            expectedPaymentYmd: data.expectedPaymentYmd,
            annualBillingYmd: data.annualBillingYmd,
            firstPaymentYmd: data.firstPaymentYmd,
            isHostingDeal: data.isHostingDeal === true,
            scheduledPayments: data.scheduledPayments ?? [],
            createdByUserId: user.uid,
          })
          const { data: created, error: qErr } = await sb.from('deals').insert(row).select('*').single()
          if (qErr) throw qErr
          const deal = rowToDeal(created as Record<string, unknown>)
          setDeals((prev) => (prev.some((d) => d.id === deal.id) ? prev : [deal, ...prev]))
          toastFsSuccess('העסקה נשמרה')
          return deal.id
        }

        const ref = await addDoc(
          collection(db, 'deals'),
          stripUndefined({
            clientId: data.clientId.trim(),
            dealKind: data.dealKind,
            title: data.title.trim(),
            commissionPercent: comm,
            status: data.status ?? 'active',
            stage: data.stage ?? 'signed',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdByUserId: user.uid,
            ...(data.leadId?.trim() ? { leadId: data.leadId.trim() } : {}),
            ...(data.salesAgentUserId?.trim()
              ? { salesAgentUserId: data.salesAgentUserId.trim() }
              : {}),
            ...(amount != null && amount >= 0 ? { agreedAmount: amount, amountTotal: amount } : {}),
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
            ...(data.projectId ? { projectId: data.projectId } : {}),
            ...(data.quoteId ? { quoteId: data.quoteId } : {}),
          } as Record<string, unknown>),
        )
        toastFsSuccess('העסקה נשמרה')
        return ref.id
      } catch (e) {
        toastFsError('שגיאה בשמירת עסקה', e, 'addDeal')
        return undefined
      }
    },
    [user, useSb],
  )

  const updateDeal = useCallback(
    async (id: string, patch: DealPatch) => {
      try {
        if (useSb) {
          const sb = requireSupabase()
          const row = dealToRow(patch as Record<string, unknown>)
          if (Object.keys(row).length === 0) return
          const { error: qErr } = await sb.from('deals').update(row).eq('id', id)
          if (qErr) throw qErr
          setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
          toastFsSuccess('העסקה עודכנה')
          return
        }
        const next: Record<string, unknown> = { updatedAt: serverTimestamp() }
        if (typeof patch.title === 'string') next.title = patch.title.trim()
        if (typeof patch.notes === 'string') next.notes = patch.notes.trim()
        if (patch.status != null) next.status = patch.status
        if (patch.stage != null) next.stage = patch.stage
        if (patch.dealKind != null) next.dealKind = patch.dealKind
        if (typeof patch.agreedAmount === 'number' && Number.isFinite(patch.agreedAmount) && patch.agreedAmount >= 0) {
          next.agreedAmount = patch.agreedAmount
        }
        if (typeof patch.amountTotal === 'number' && Number.isFinite(patch.amountTotal)) {
          next.amountTotal = patch.amountTotal
          next.agreedAmount = patch.amountTotal
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
        if (Array.isArray(patch.scheduledPayments)) next.scheduledPayments = patch.scheduledPayments
        if (patch.projectId) next.projectId = patch.projectId
        if (patch.quoteId) next.quoteId = patch.quoteId
        if (patch.depositAmount != null) next.depositAmount = patch.depositAmount
        if (patch.depositPaidAt) next.depositPaidAt = patch.depositPaidAt
        if (patch.deliveredAt) next.deliveredAt = patch.deliveredAt
        if (patch.paidInFullAt) next.paidInFullAt = patch.paidInFullAt
        if (Object.keys(next).length <= 1) return
        await updateDoc(doc(db, 'deals', id), stripUndefined(next))
        toastFsSuccess('העסקה עודכנה')
      } catch (e) {
        toastFsError('שגיאה בעדכון עסקה', e, 'updateDeal')
      }
    },
    [useSb],
  )

  const deleteDeal = useCallback(
    async (id: string) => {
      try {
        if (useSb) {
          const sb = requireSupabase()
          await sb.from('invoices').delete().eq('deal_id', id)
          const { error: qErr } = await sb.from('deals').delete().eq('id', id)
          if (qErr) throw qErr
          setDeals((prev) => prev.filter((d) => d.id !== id))
          toastFsSuccess('העסקה נמחקה')
          return
        }
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
    },
    [useSb],
  )

  const value = useMemo(
    () => ({ deals, loading, error, addDeal, updateDeal, deleteDeal }),
    [deals, loading, error, addDeal, updateDeal, deleteDeal],
  )

  return <DealsContext.Provider value={value}>{children}</DealsContext.Provider>
}

export function useDeals(): DealsContextValue {
  const ctx = useContext(DealsContext)
  if (!ctx) throw new Error('useDeals חייב להיות בתוך DealsProvider')
  return ctx
}
