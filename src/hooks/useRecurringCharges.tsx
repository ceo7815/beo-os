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
import type { RecurringCharge, RecurringInterval, RecurringKind } from '../types'

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && Number.isFinite(Number(v))) return Number(v)
  return 0
}

export function rowToRecurring(row: Record<string, unknown>): RecurringCharge {
  return {
    id: String(row.id),
    dealId: row.deal_id ? String(row.deal_id) : undefined,
    clientId: row.client_id ? String(row.client_id) : undefined,
    projectId: row.project_id ? String(row.project_id) : undefined,
    leadId: row.lead_id ? String(row.lead_id) : undefined,
    title: typeof row.title === 'string' ? row.title : undefined,
    amount: num(row.amount),
    interval: row.interval === 'yearly' ? 'yearly' : 'monthly',
    startDate: row.start_date ? String(row.start_date).slice(0, 10) : '',
    endDate: row.end_date ? String(row.end_date).slice(0, 10) : undefined,
    nextDue: row.next_due ? String(row.next_due).slice(0, 10) : undefined,
    active: row.active !== false,
    kind: row.kind === 'hosting' ? 'hosting' : 'retainer',
    notes: typeof row.notes === 'string' ? row.notes : undefined,
    createdAt: row.created_at ? String(row.created_at) : new Date().toISOString(),
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  }
}

const KEYS: Record<string, string> = {
  dealId: 'deal_id',
  clientId: 'client_id',
  projectId: 'project_id',
  leadId: 'lead_id',
  title: 'title',
  amount: 'amount',
  interval: 'interval',
  startDate: 'start_date',
  endDate: 'end_date',
  nextDue: 'next_due',
  active: 'active',
  kind: 'kind',
  notes: 'notes',
}

function toRow(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    const col = KEYS[k]
    if (!col || v === undefined) continue
    out[col] = isDeleteSentinel(v) || v === '' ? null : v
  }
  for (const col of ['deal_id', 'client_id', 'project_id', 'lead_id']) {
    if (col in out) out[col] = uuidOrNull(out[col] == null ? '' : String(out[col]))
  }
  return out
}

export type NewRecurringInput = {
  title?: string
  amount: number
  interval?: RecurringInterval
  startDate: string
  endDate?: string
  nextDue?: string
  active?: boolean
  kind?: RecurringKind
  dealId?: string
  clientId?: string
  projectId?: string
  leadId?: string
  notes?: string
}

type Ctx = {
  charges: RecurringCharge[]
  loading: boolean
  schemaMissing: boolean
  addCharge: (data: NewRecurringInput) => Promise<string | null>
  updateCharge: (id: string, data: Partial<RecurringCharge>) => Promise<void>
}

const C = createContext<Ctx | null>(null)

export function RecurringChargesProvider({ children }: { children: ReactNode }) {
  const [charges, setCharges] = useState<RecurringCharge[]>([])
  const [loading, setLoading] = useState(true)
  const [schemaMissing, setSchemaMissing] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false)
      return
    }
    return subscribeTable(
      'recurring_charges',
      (rows) => {
        setCharges(rows.map(rowToRecurring))
        setSchemaMissing(false)
        setLoading(false)
      },
      (err) => {
        if (isMissingRelation(err)) {
          setCharges([])
          setSchemaMissing(true)
          setLoading(false)
          return
        }
        console.error('recurring_charges', err)
        toastFsError('שגיאה בטעינת חיובים קבועים', err, 'recurring_charges')
        setLoading(false)
      },
    )
  }, [])

  const addCharge = useCallback(async (data: NewRecurringInput) => {
    try {
      const sb = requireSupabase()
      const row = toRow({
        ...data,
        interval: data.interval ?? 'monthly',
        kind: data.kind ?? 'retainer',
        active: data.active !== false,
        nextDue: data.nextDue || data.startDate,
      })
      const { data: created, error } = await sb.from('recurring_charges').insert(row).select('*').single()
      if (error) throw error
      const item = rowToRecurring(created as Record<string, unknown>)
      setCharges((prev) => (prev.some((c) => c.id === item.id) ? prev : [item, ...prev]))
      toastFsSuccess('חיוב קבוע נוסף')
      return item.id
    } catch (e) {
      toastFsError('שגיאה בהוספת חיוב קבוע', e, 'addCharge')
      return null
    }
  }, [])

  const updateCharge = useCallback(async (id: string, data: Partial<RecurringCharge>) => {
    try {
      const sb = requireSupabase()
      const row = toRow(data as Record<string, unknown>)
      if (Object.keys(row).length === 0) return
      const { error } = await sb.from('recurring_charges').update(row).eq('id', id)
      if (error) throw error
      toastFsSuccess('החיוב הקבוע עודכן')
    } catch (e) {
      toastFsError('שגיאה בעדכון חיוב קבוע', e, 'updateCharge')
      throw e
    }
  }, [])

  const value = useMemo(
    () => ({ charges, loading, schemaMissing, addCharge, updateCharge }),
    [charges, loading, schemaMissing, addCharge, updateCharge],
  )
  return <C.Provider value={value}>{children}</C.Provider>
}

export function useRecurringCharges(): Ctx {
  const ctx = useContext(C)
  if (!ctx) throw new Error('useRecurringCharges חייב להיות בתוך RecurringChargesProvider')
  return ctx
}
