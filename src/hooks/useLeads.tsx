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
import { isSupabaseConfigured } from '../lib/backend'
import { requireSupabase } from '../lib/supabase'
import { isDeleteSentinel, subscribeTable, uuidOrNull } from '../lib/sbLive'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { Lead, LeadStatus } from '../types'

function rowToLead(row: Record<string, unknown>): Lead {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    company: typeof row.company === 'string' ? row.company : undefined,
    phone: typeof row.phone === 'string' ? row.phone : undefined,
    email: typeof row.email === 'string' ? row.email : undefined,
    clientId: row.client_id ? String(row.client_id) : undefined,
    source: typeof row.source === 'string' ? row.source : undefined,
    status: (row.status as LeadStatus) || 'new',
    ownerId: row.owner_id ? String(row.owner_id) : '',
    clientNeeds: typeof row.client_needs === 'string' ? row.client_needs : undefined,
    lastActivityText:
      typeof row.last_activity_text === 'string' ? row.last_activity_text : undefined,
    lastActivityAt: row.last_activity_at ? String(row.last_activity_at) : undefined,
    nextFollowUpDate: row.next_follow_up_date ? String(row.next_follow_up_date) : undefined,
    activityLog: Array.isArray(row.activity_log)
      ? (row.activity_log as Lead['activityLog'])
      : [],
    quoteChannel: (row.quote_channel as Lead['quoteChannel']) || undefined,
    quotePdfUrl: typeof row.quote_pdf_url === 'string' ? row.quote_pdf_url : undefined,
    quotePdfFileName:
      typeof row.quote_pdf_file_name === 'string' ? row.quote_pdf_file_name : undefined,
    quoteVisualUrl:
      typeof row.quote_visual_url === 'string' ? row.quote_visual_url : undefined,
    quoteReturnByDate: row.quote_return_by_date
      ? String(row.quote_return_by_date)
      : undefined,
    notRelevantReason:
      typeof row.not_relevant_reason === 'string' ? row.not_relevant_reason : undefined,
    createdAt: row.created_at
      ? new Date(String(row.created_at)).toISOString()
      : new Date().toISOString(),
  }
}

const LEAD_KEYS: Record<string, string> = {
  name: 'name',
  company: 'company',
  phone: 'phone',
  email: 'email',
  clientId: 'client_id',
  source: 'source',
  status: 'status',
  ownerId: 'owner_id',
  clientNeeds: 'client_needs',
  lastActivityText: 'last_activity_text',
  lastActivityAt: 'last_activity_at',
  nextFollowUpDate: 'next_follow_up_date',
  activityLog: 'activity_log',
  quoteChannel: 'quote_channel',
  quotePdfUrl: 'quote_pdf_url',
  quotePdfFileName: 'quote_pdf_file_name',
  quoteVisualUrl: 'quote_visual_url',
  quoteReturnByDate: 'quote_return_by_date',
  notRelevantReason: 'not_relevant_reason',
}

function leadToRow(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    const col = LEAD_KEYS[k]
    if (!col) continue
    if (v === undefined) continue
    if (isDeleteSentinel(v) || v === '') {
      out[col] = null
      continue
    }
    out[col] = v
  }
  if (typeof out.client_id === 'string') out.client_id = uuidOrNull(out.client_id as string)
  if (typeof out.owner_id === 'string') out.owner_id = uuidOrNull(out.owner_id as string)
  return out
}

type LeadsContextValue = {
  leads: Lead[]
  loading: boolean
  error: Error | null
  addLead: (data: Omit<Lead, 'id' | 'createdAt'>) => Promise<void>
  updateLead: (id: string, data: Partial<Lead>) => Promise<void>
  deleteLead: (id: string) => Promise<void>
  updateLeadStatus: (id: string, status: LeadStatus) => Promise<void>
}

const LeadsContext = createContext<LeadsContextValue | null>(null)

export function LeadsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!user) {
      setLeads([])
      setLoading(false)
      setError(null)
      return
    }
    if (!isSupabaseConfigured()) {
      setLoading(false)
      return
    }
    setLoading(true)
    return subscribeTable(
      'leads',
      (rows) => {
        setLeads(rows.map(rowToLead))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('leads', err)
        toastFsError('שגיאה בטעינת לידים', err, 'leads')
        setError(err)
        setLoading(false)
      },
    )
  }, [user])

  const addLead = useCallback(
    async (data: Omit<Lead, 'id' | 'createdAt'>) => {
      if (!user) {
        toastFsError('יש להתחבר להוספת ליד', new Error('no user'), 'addLead')
        return
      }
      try {
        const sb = requireSupabase()
        const row = leadToRow({
          ...data,
          name: data.name.trim(),
          ownerId: data.ownerId || user.uid,
        })
        const { error: qErr } = await sb.from('leads').insert(row)
        if (qErr) throw qErr
        toastFsSuccess('הליד נוסף בהצלחה')
      } catch (e) {
        toastFsError('שגיאה בהוספת ליד', e, 'addLead')
      }
    },
    [user],
  )

  const updateLead = useCallback(
    async (id: string, data: Partial<Lead> & Record<string, unknown>) => {
      if (!user) {
        toastFsError('יש להתחבר לעדכון ליד', new Error('no user'), 'updateLead')
        throw new Error('no user')
      }
      try {
        const sb = requireSupabase()
        const row = leadToRow(data)
        if (Object.keys(row).length === 0) return
        const { error: qErr } = await sb.from('leads').update(row).eq('id', id)
        if (qErr) throw qErr
        toastFsSuccess('הליד עודכן')
      } catch (e) {
        toastFsError('שגיאה בעדכון ליד', e, 'updateLead')
        throw e
      }
    },
    [user],
  )

  const deleteLead = useCallback(async (id: string) => {
    try {
      const sb = requireSupabase()
      const { error: qErr } = await sb.from('leads').delete().eq('id', id)
      if (qErr) throw qErr
      toastFsSuccess('הליד נמחק')
    } catch (e) {
      toastFsError('שגיאה במחיקת ליד', e, 'deleteLead')
    }
  }, [])

  const updateLeadStatus = useCallback(
    async (id: string, status: LeadStatus) => {
      await updateLead(id, { status })
    },
    [updateLead],
  )

  const value = useMemo(
    () => ({
      leads,
      loading,
      error,
      addLead,
      updateLead,
      deleteLead,
      updateLeadStatus,
    }),
    [leads, loading, error, addLead, updateLead, deleteLead, updateLeadStatus],
  )

  return <LeadsContext.Provider value={value}>{children}</LeadsContext.Provider>
}

export function useLeads(): LeadsContextValue {
  const ctx = useContext(LeadsContext)
  if (!ctx) throw new Error('useLeads חייב להיות בתוך LeadsProvider')
  return ctx
}
