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
import type { Lead, LeadStatus, LeadTemperature } from '../types'

function numOrUndef(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

function rowToLead(row: Record<string, unknown>): Lead {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    company: typeof row.company === 'string' ? row.company : undefined,
    phone: typeof row.phone === 'string' ? row.phone : undefined,
    email: typeof row.email === 'string' ? row.email : undefined,
    clientId: row.client_id ? String(row.client_id) : undefined,
    salesAgentUserId: row.sales_agent_user_id ? String(row.sales_agent_user_id) : undefined,
    source: typeof row.source === 'string' ? row.source : undefined,
    sourceDetail: typeof row.source_detail === 'string' ? row.source_detail : undefined,
    utmSource: typeof row.utm_source === 'string' ? row.utm_source : undefined,
    utmMedium: typeof row.utm_medium === 'string' ? row.utm_medium : undefined,
    utmCampaign: typeof row.utm_campaign === 'string' ? row.utm_campaign : undefined,
    utmContent: typeof row.utm_content === 'string' ? row.utm_content : undefined,
    utmTerm: typeof row.utm_term === 'string' ? row.utm_term : undefined,
    landingPage: typeof row.landing_page === 'string' ? row.landing_page : undefined,
    firstMessage: typeof row.first_message === 'string' ? row.first_message : undefined,
    consent: typeof row.consent === 'boolean' ? row.consent : undefined,
    domain: typeof row.domain === 'string' ? row.domain : undefined,
    status: (row.status as LeadStatus) || 'new',
    ownerId: row.owner_id ? String(row.owner_id) : '',
    clientNeeds: typeof row.client_needs === 'string' ? row.client_needs : undefined,
    estimatedValue: numOrUndef(row.estimated_value),
    probability: numOrUndef(row.probability),
    temperature:
      row.temperature === 'hot' || row.temperature === 'warm' || row.temperature === 'cold'
        ? (row.temperature as LeadTemperature)
        : undefined,
    nextAction: typeof row.next_action === 'string' ? row.next_action : undefined,
    nextActionAt: row.next_action_at ? String(row.next_action_at) : undefined,
    lastContactAt: row.last_contact_at ? String(row.last_contact_at) : undefined,
    meetingAt: row.meeting_at ? String(row.meeting_at) : undefined,
    repliedAt: row.replied_at ? String(row.replied_at) : undefined,
    lostReason: typeof row.lost_reason === 'string' ? row.lost_reason : undefined,
    lostReasonNote: typeof row.lost_reason_note === 'string' ? row.lost_reason_note : undefined,
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
  salesAgentUserId: 'sales_agent_user_id',
  source: 'source',
  sourceDetail: 'source_detail',
  utmSource: 'utm_source',
  utmMedium: 'utm_medium',
  utmCampaign: 'utm_campaign',
  utmContent: 'utm_content',
  utmTerm: 'utm_term',
  landingPage: 'landing_page',
  firstMessage: 'first_message',
  consent: 'consent',
  domain: 'domain',
  status: 'status',
  ownerId: 'owner_id',
  clientNeeds: 'client_needs',
  estimatedValue: 'estimated_value',
  probability: 'probability',
  temperature: 'temperature',
  nextAction: 'next_action',
  nextActionAt: 'next_action_at',
  lastContactAt: 'last_contact_at',
  meetingAt: 'meeting_at',
  repliedAt: 'replied_at',
  lostReason: 'lost_reason',
  lostReasonNote: 'lost_reason_note',
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
  if ('sales_agent_user_id' in out) {
    out.sales_agent_user_id = uuidOrNull(String(out.sales_agent_user_id ?? ''))
  }
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
