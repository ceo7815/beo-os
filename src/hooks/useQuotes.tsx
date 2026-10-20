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
import type { Quote, QuotePeriod, QuoteStatus } from '../types'

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

export function rowToQuote(row: Record<string, unknown>): Quote {
  const period = row.period === 'monthly' || row.period === 'yearly' ? row.period : 'one_time'
  return {
    id: String(row.id),
    number: typeof row.number === 'string' ? row.number : undefined,
    slug: typeof row.slug === 'string' ? row.slug : undefined,
    url: typeof row.url === 'string' ? row.url : undefined,
    title: typeof row.title === 'string' ? row.title : undefined,
    leadId: row.lead_id ? String(row.lead_id) : undefined,
    clientId: row.client_id ? String(row.client_id) : undefined,
    dealId: row.deal_id ? String(row.deal_id) : undefined,
    amountPreVat: num(row.amount_pre_vat),
    vatIncluded: row.vat_included === true,
    period,
    validUntil: row.valid_until ? String(row.valid_until).slice(0, 10) : undefined,
    sentAt: row.sent_at ? String(row.sent_at) : undefined,
    viewedAt: row.viewed_at ? String(row.viewed_at) : undefined,
    decidedAt: row.decided_at ? String(row.decided_at) : undefined,
    status: (typeof row.status === 'string' ? row.status : 'draft') as QuoteStatus,
    notes: typeof row.notes === 'string' ? row.notes : undefined,
    source: typeof row.source === 'string' ? row.source : undefined,
    createdAt: row.created_at ? String(row.created_at) : new Date().toISOString(),
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  }
}

const QUOTE_KEYS: Record<string, string> = {
  number: 'number',
  slug: 'slug',
  url: 'url',
  title: 'title',
  leadId: 'lead_id',
  clientId: 'client_id',
  dealId: 'deal_id',
  amountPreVat: 'amount_pre_vat',
  vatIncluded: 'vat_included',
  period: 'period',
  validUntil: 'valid_until',
  sentAt: 'sent_at',
  viewedAt: 'viewed_at',
  decidedAt: 'decided_at',
  status: 'status',
  notes: 'notes',
  source: 'source',
}

function quoteToRow(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    const col = QUOTE_KEYS[k]
    if (!col || v === undefined) continue
    out[col] = isDeleteSentinel(v) || v === '' ? null : v
  }
  for (const col of ['lead_id', 'client_id', 'deal_id']) {
    if (col in out) out[col] = uuidOrNull(out[col] == null ? '' : String(out[col]))
  }
  return out
}

export type NewQuoteInput = {
  title?: string
  number?: string
  slug?: string
  url?: string
  leadId?: string
  clientId?: string
  dealId?: string
  amountPreVat?: number
  vatIncluded?: boolean
  period?: QuotePeriod
  validUntil?: string
  sentAt?: string
  status?: QuoteStatus
  notes?: string
  source?: string
}

type QuotesContextValue = {
  quotes: Quote[]
  loading: boolean
  schemaMissing: boolean
  addQuote: (data: NewQuoteInput) => Promise<string | null>
  updateQuote: (id: string, data: Partial<Quote>) => Promise<void>
}

const QuotesContext = createContext<QuotesContextValue | null>(null)

export function QuotesProvider({ children }: { children: ReactNode }) {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [schemaMissing, setSchemaMissing] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false)
      return
    }
    return subscribeTable(
      'quotes',
      (rows) => {
        setQuotes(rows.map(rowToQuote))
        setSchemaMissing(false)
        setLoading(false)
      },
      (err) => {
        if (isMissingRelation(err)) {
          setQuotes([])
          setSchemaMissing(true)
          setLoading(false)
          return
        }
        console.error('quotes', err)
        toastFsError('שגיאה בטעינת הצעות מחיר', err, 'quotes')
        setLoading(false)
      },
    )
  }, [])

  const addQuote = useCallback(async (data: NewQuoteInput) => {
    try {
      const sb = requireSupabase()
      let number = data.number?.trim() || null
      if (!number) {
        const { data: allocated, error: nErr } = await sb.rpc('next_quote_number')
        if (!nErr && typeof allocated === 'string') number = allocated
      }
      const row = quoteToRow({
        ...data,
        number: number ?? undefined,
        period: data.period ?? 'one_time',
        status: data.status ?? 'draft',
        source: data.source ?? 'beo-os',
      })
      const { data: created, error } = await sb.from('quotes').insert(row).select('*').single()
      if (error) throw error
      const quote = rowToQuote(created as Record<string, unknown>)
      setQuotes((prev) => (prev.some((q) => q.id === quote.id) ? prev : [quote, ...prev]))
      toastFsSuccess('ההצעה נשמרה')
      return quote.id
    } catch (e) {
      toastFsError('שגיאה בשמירת הצעה', e, 'addQuote')
      return null
    }
  }, [])

  const updateQuote = useCallback(async (id: string, data: Partial<Quote>) => {
    try {
      const sb = requireSupabase()
      const row = quoteToRow(data as Record<string, unknown>)
      if (Object.keys(row).length === 0) return
      const { error } = await sb.from('quotes').update(row).eq('id', id)
      if (error) throw error
      toastFsSuccess('ההצעה עודכנה')
    } catch (e) {
      toastFsError('שגיאה בעדכון הצעה', e, 'updateQuote')
      throw e
    }
  }, [])

  const value = useMemo(
    () => ({ quotes, loading, schemaMissing, addQuote, updateQuote }),
    [quotes, loading, schemaMissing, addQuote, updateQuote],
  )
  return <QuotesContext.Provider value={value}>{children}</QuotesContext.Provider>
}

export function useQuotes(): QuotesContextValue {
  const ctx = useContext(QuotesContext)
  if (!ctx) throw new Error('useQuotes חייב להיות בתוך QuotesProvider')
  return ctx
}
