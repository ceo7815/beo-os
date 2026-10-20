import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { isSupabaseConfigured } from '../lib/backend'
import { requireSupabase } from '../lib/supabase'
import { isDeleteSentinel, isMissingRelation, subscribeTable, uuidOrNull } from '../lib/sbLive'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { DealPayment, DealPaymentKind, DealPaymentStatus } from '../types'

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && Number.isFinite(Number(v))) return Number(v)
  return 0
}

const KINDS = new Set(['deposit', 'milestone', 'installment', 'retainer', 'hosting'])
const STATUSES = new Set(['scheduled', 'invoiced', 'paid', 'overdue'])

export function rowToDealPayment(row: Record<string, unknown>): DealPayment {
  const kind = typeof row.kind === 'string' && KINDS.has(row.kind) ? row.kind : 'installment'
  const status = typeof row.status === 'string' && STATUSES.has(row.status) ? row.status : 'scheduled'
  return {
    id: String(row.id),
    dealId: row.deal_id ? String(row.deal_id) : '',
    leadId: row.lead_id ? String(row.lead_id) : undefined,
    clientId: row.client_id ? String(row.client_id) : undefined,
    dueDate: row.due_date ? String(row.due_date).slice(0, 10) : undefined,
    amount: num(row.amount),
    kind: kind as DealPaymentKind,
    status: status as DealPaymentStatus,
    paidAt: row.paid_at ? String(row.paid_at) : undefined,
    invoiceId: row.invoice_id ? String(row.invoice_id) : undefined,
    notes: typeof row.notes === 'string' ? row.notes : undefined,
    createdAt: row.created_at ? String(row.created_at) : new Date().toISOString(),
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  }
}

const KEYS: Record<string, string> = {
  dealId: 'deal_id',
  leadId: 'lead_id',
  clientId: 'client_id',
  dueDate: 'due_date',
  amount: 'amount',
  kind: 'kind',
  status: 'status',
  paidAt: 'paid_at',
  invoiceId: 'invoice_id',
  notes: 'notes',
}

function toRow(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    const col = KEYS[k]
    if (!col || v === undefined) continue
    out[col] = isDeleteSentinel(v) || v === '' ? null : v
  }
  for (const col of ['deal_id', 'lead_id', 'client_id', 'invoice_id']) {
    if (col in out) out[col] = uuidOrNull(out[col] == null ? '' : String(out[col]))
  }
  return out
}

export type NewDealPaymentInput = {
  dealId: string
  leadId?: string
  clientId?: string
  dueDate?: string
  amount: number
  kind?: DealPaymentKind
  status?: DealPaymentStatus
  paidAt?: string
  invoiceId?: string
  notes?: string
}

type Ctx = {
  payments: DealPayment[]
  loading: boolean
  schemaMissing: boolean
  addPayment: (data: NewDealPaymentInput) => Promise<string | null>
  updatePayment: (id: string, data: Partial<DealPayment>) => Promise<void>
}

const C = createContext<Ctx | null>(null)

export function DealPaymentsProvider({ children }: { children: ReactNode }) {
  const [payments, setPayments] = useState<DealPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [schemaMissing, setSchemaMissing] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false)
      return
    }
    return subscribeTable(
      'deal_payments',
      (rows) => {
        setPayments(rows.map(rowToDealPayment))
        setSchemaMissing(false)
        setLoading(false)
      },
      (err) => {
        if (isMissingRelation(err)) {
          setPayments([])
          setSchemaMissing(true)
          setLoading(false)
          return
        }
        console.error('deal_payments', err)
        toastFsError('שגיאה בטעינת תשלומים', err, 'deal_payments')
        setLoading(false)
      },
    )
  }, [])

  const addPayment = useCallback(async (data: NewDealPaymentInput) => {
    try {
      const sb = requireSupabase()
      const row = toRow({ ...data, kind: data.kind ?? 'installment', status: data.status ?? 'scheduled' })
      const { data: created, error } = await sb.from('deal_payments').insert(row).select('*').single()
      if (error) throw error
      const item = rowToDealPayment(created as Record<string, unknown>)
      setPayments((prev) => (prev.some((p) => p.id === item.id) ? prev : [item, ...prev]))
      toastFsSuccess('התשלום נוסף')
      return item.id
    } catch (e) {
      toastFsError('שגיאה בהוספת תשלום', e, 'addPayment')
      return null
    }
  }, [])

  const updatePayment = useCallback(async (id: string, data: Partial<DealPayment>) => {
    try {
      const sb = requireSupabase()
      const row = toRow(data as Record<string, unknown>)
      if (Object.keys(row).length === 0) return
      const { error } = await sb.from('deal_payments').update(row).eq('id', id)
      if (error) throw error
      toastFsSuccess('התשלום עודכן')
    } catch (e) {
      toastFsError('שגיאה בעדכון תשלום', e, 'updatePayment')
      throw e
    }
  }, [])

  const value = useMemo(
    () => ({ payments, loading, schemaMissing, addPayment, updatePayment }),
    [payments, loading, schemaMissing, addPayment, updatePayment],
  )
  return <C.Provider value={value}>{children}</C.Provider>
}

export function useDealPayments(): Ctx {
  const ctx = useContext(C)
  if (!ctx) throw new Error('useDealPayments חייב להיות בתוך DealPaymentsProvider')
  return ctx
}
