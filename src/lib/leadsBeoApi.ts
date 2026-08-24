export type LeadPipelineStatus =
  | 'found'
  | 'skipped_no_email'
  | 'skipped_too_big'
  | 'skipped_low_score'
  | 'pending_approval'
  | 'rejected'
  | 'approved'
  | 'sent'
  | 'replied'
  | 'closed_no_reply'
  | string

export type LeadPipelineItem = {
  id: string
  company: string
  website: string
  domain?: string
  email?: string | null
  phone?: string
  owner_name?: string
  score?: number
  score_parts?: {
    icp?: number
    site_signal?: number
    pain_fit?: number
    contact?: number
  }
  score_why?: string
  site_hook?: string
  service?: string
  draft_source?: string
  status: LeadPipelineStatus
  skip_reason?: string
  email_subject?: string
  email_subject_b?: string
  email_body?: string
  from_name?: string
  from_email?: string
  whatsapp_url?: string
  created_at?: string
  updated_at?: string
  batch_date?: string
  status_note?: string
  reply_kind?: string
  reply_preview?: string
  os_lead_created?: boolean
}

export type LeadsOverview = {
  ok: boolean
  date?: string
  target_ready_by?: string
  daily_target?: number
  score_floor?: number
  checked_today?: number
  skipped_today?: number
  pending_approval?: number
  pending_today?: number
  sent_today?: number
  replied?: number
  closed_no_reply?: number
  gmail_connected?: boolean
  openai_connected?: boolean
  telegram_connected?: boolean
  whatsapp_url?: string
  from_email?: string
  from_name?: string
  status_labels?: Record<string, string>
  learning_headline?: string
  learning_human?: number
  learning_sent?: number
}

export type LearningArm = {
  key: string
  label: string
  sent: number
  waiting: number
  human: number
  no_reply: number
  or_rejected: number
  decided: number
  rate: number | null
  posterior: number
  ready: boolean
}

export type LeadsLearning = {
  ok?: boolean
  date?: string
  learned_at?: string | null
  headline?: string
  lesson?: string
  tomorrow?: string[]
  totals?: {
    sent?: number
    waiting?: number
    human?: number
    not_interested?: number
    closed?: number
    or_rejected?: number
    decided?: number
    conversion?: number | null
  }
  by_vertical?: LearningArm[]
  by_product?: LearningArm[]
  by_style?: LearningArm[]
  min_decided?: number
}

async function readJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchLeadsOverview(): Promise<
  { ok: true; data: LeadsOverview } | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/beo-agents/leads/overview')
    const data = (await readJsonSafe(res)) as LeadsOverview | null
    if (!res.ok || !data?.ok) {
      return { ok: false, error: (data as { error?: string } | null)?.error || `HTTP ${res.status}` }
    }
    return { ok: true, data }
  } catch {
    return { ok: false, error: 'צי הסוכנים לא זמין' }
  }
}

export async function fetchLeadsPipeline(status?: string): Promise<
  { ok: true; items: LeadPipelineItem[]; labels: Record<string, string> } | { ok: false; error: string }
> {
  try {
    const q = status ? `?status=${encodeURIComponent(status)}` : ''
    const res = await fetch(`/api/beo-agents/leads/pipeline${q}`)
    const data = (await readJsonSafe(res)) as {
      ok?: boolean
      items?: LeadPipelineItem[]
      status_labels?: Record<string, string>
      error?: string
    } | null
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` }
    }
    return { ok: true, items: data.items ?? [], labels: data.status_labels ?? {} }
  } catch {
    return { ok: false, error: 'צי הסוכנים לא זמין' }
  }
}

export async function fetchLeadsApprovals(): Promise<
  { ok: true; items: LeadPipelineItem[] } | { ok: false; error: string }
> {
  const result = await fetchLeadsPipeline('pending_approval')
  if (!result.ok) return result
  return { ok: true, items: result.items }
}

export async function postLeadAction(
  id: string,
  action: 'approve' | 'reject' | 'edit' | 'close',
  body?: { email_subject?: string; email_body?: string; os_lead_created?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/beo-agents/leads/items/${id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    const data = (await readJsonSafe(res)) as { ok?: boolean; error?: string } | null
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'פעולה נכשלה' }
  }
}

export async function runLeadsDaily(
  target = 10,
): Promise<{ ok: true; message?: string; added_pending?: number } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/beo-agents/leads/run-daily', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    })
    const data = (await readJsonSafe(res)) as {
      ok?: boolean
      error?: string
      message?: string
      added_pending?: number
    } | null
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` }
    }
    return { ok: true, message: data.message, added_pending: data.added_pending }
  } catch {
    return { ok: false, error: 'הרצה יומית נכשלה — בדקו ש-8788 רץ' }
  }
}

export async function redraftLeads(): Promise<
  { ok: true; message?: string; updated?: number } | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/beo-agents/leads/redraft', { method: 'POST' })
    const data = (await readJsonSafe(res)) as {
      ok?: boolean
      error?: string
      message?: string
      updated?: number
    } | null
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` }
    }
    return { ok: true, message: data.message, updated: data.updated }
  } catch {
    return { ok: false, error: 'שכתוב טיוטות נכשל' }
  }
}

export async function checkLeadsReplies(): Promise<
  | {
      ok: true
      human?: number
      items?: LeadPipelineItem[]
    }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/beo-agents/leads/check-replies', { method: 'POST' })
    const data = (await readJsonSafe(res)) as {
      ok?: boolean
      error?: string
      human?: number
      items?: LeadPipelineItem[]
    } | null
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` }
    }
    return { ok: true, human: data.human, items: data.items }
  } catch {
    return { ok: false, error: 'בדיקת תשובות נכשלה' }
  }
}

export async function fetchLeadsLearning(): Promise<
  { ok: true; data: LeadsLearning } | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/beo-agents/leads/learning')
    const data = (await readJsonSafe(res)) as LeadsLearning | null
    if (!res.ok || !data) {
      return { ok: false, error: (data as { error?: string } | null)?.error || `HTTP ${res.status}` }
    }
    return { ok: true, data }
  } catch {
    return { ok: false, error: 'למידה לא זמינה' }
  }
}

export async function runLeadsLearn(): Promise<
  { ok: true; data: LeadsLearning } | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/beo-agents/leads/learn', { method: 'POST' })
    const data = (await readJsonSafe(res)) as LeadsLearning | null
    if (!res.ok || !data) {
      return { ok: false, error: (data as { error?: string } | null)?.error || `HTTP ${res.status}` }
    }
    return { ok: true, data }
  } catch {
    return { ok: false, error: 'רענון למידה נכשל' }
  }
}

export type LeadsCostsReport = {
  ok?: boolean
  month?: string
  model?: string
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  usd?: number
  days?: { date?: string; kind?: string; tokens?: number; usd?: number }[]
}

export async function fetchLeadsCosts(): Promise<
  { ok: true; data: LeadsCostsReport } | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/beo-agents/leads/costs')
    const data = (await readJsonSafe(res)) as LeadsCostsReport | null
    if (!res.ok || !data?.ok) {
      return { ok: false, error: (data as { error?: string } | null)?.error || `HTTP ${res.status}` }
    }
    return { ok: true, data }
  } catch {
    return { ok: false, error: 'עלויות לא זמינות' }
  }
}
