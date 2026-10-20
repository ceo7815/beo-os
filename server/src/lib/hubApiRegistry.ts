import { getServiceSupabase } from './supabaseAdmin.js'
import {
  type ApiResult,
  type Actor,
  type ValidationResult,
  badRequest,
  failErrors,
  mergeErrors,
  notFound,
  ok,
  okData,
  optionalString,
  parseActor,
  parseDataPayload,
  parseLimit,
  requireEnum,
  requireNumber,
  requireString,
  requireYmd,
  stripUndefined,
} from './hubApiHttpUtil.js'
import { insertDealStageHistory, insertLeadStageHistory, loadPipelineSummary } from './pipelineApi.js'

class HubApiDbNotReadyError extends Error {}

function sb() {
  const client = getServiceSupabase()
  if (!client) {
    throw new HubApiDbNotReadyError(
      'Supabase service_role לא מוגדר בשרת (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)',
    )
  }
  return client
}

const TASK_STATUSES = ['todo', 'doing', 'done', 'blocked'] as const
const PRIORITIES = ['high', 'medium', 'low'] as const
const PROJECT_KINDS = ['client', 'internal'] as const
const LEAD_STATUSES = [
  'cold',
  'new',
  'contacted',
  'follow_up',
  'replied',
  'meeting_scheduled',
  'specification',
  'quote_sent',
  'negotiation',
  'no_answer',
  'nurture',
  'lost',
  'not_relevant',
  'closed',
] as const
const LOST_REASONS = ['price', 'timing', 'no_reply', 'chose_competitor', 'not_fit', 'other'] as const
const LEAD_TEMPERATURES = ['hot', 'warm', 'cold'] as const
const QUOTE_STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired'] as const
const QUOTE_PERIODS = ['one_time', 'monthly', 'yearly'] as const
const DEAL_STAGES = ['signed', 'deposit_paid', 'in_progress', 'delivered', 'paid_in_full', 'cancelled'] as const
const PAYMENT_KINDS = ['deposit', 'milestone', 'installment', 'retainer', 'hosting'] as const
const PAYMENT_STATUSES = ['scheduled', 'invoiced', 'paid', 'overdue'] as const
const RECURRING_INTERVALS = ['monthly', 'yearly'] as const
const RECURRING_KINDS = ['retainer', 'hosting'] as const
const CAMPAIGN_KINDS = ['internal', 'client'] as const
const CAMPAIGN_PLATFORMS = [
  'instagram',
  'google_ads',
  'facebook',
  'tiktok',
  'linkedin',
  'other',
] as const
const CAMPAIGN_STATUSES = ['planning', 'active', 'paused', 'completed'] as const
const DEAL_KINDS = ['retainer_monthly', 'retainer_yearly', 'one_time'] as const
const DOC_TYPES = ['spec', 'meeting', 'brief', 'note'] as const
const TASK_RECURRENCE = ['daily', 'weekly'] as const

export type EntityName =
  | 'tasks'
  | 'projects'
  | 'leads'
  | 'clients'
  | 'suppliers'
  | 'campaigns'
  | 'meetings'
  | 'invoices'
  | 'deals'
  | 'collectiontracking'
  | 'hostingrecords'
  | 'docs'
  | 'recurringtasktemplates'
  | 'agentcommissionpayments'
  | 'users'
  | 'quotes'
  | 'dealpayments'
  | 'recurringcharges'
  | 'leadstagehistory'
  | 'dealstagehistory'

const TABLE: Record<EntityName, string> = {
  tasks: 'tasks',
  projects: 'projects',
  leads: 'leads',
  clients: 'clients',
  suppliers: 'suppliers',
  campaigns: 'campaigns',
  meetings: 'meetings',
  invoices: 'invoices',
  deals: 'deals',
  collectiontracking: 'collection_tracking',
  hostingrecords: 'hosting_records',
  docs: 'docs',
  recurringtasktemplates: 'recurring_task_templates',
  agentcommissionpayments: 'agent_commission_payments',
  users: 'profiles',
  quotes: 'quotes',
  dealpayments: 'deal_payments',
  recurringcharges: 'recurring_charges',
  leadstagehistory: 'lead_stage_history',
  dealstagehistory: 'deal_stage_history',
}

const BLOCKED_ENTITIES = new Set([
  'financeexpenses',
  'financeincomes',
  'passwords_vault',
  'passwordsvault',
  'activitylogs',
  'domainrecords',
])
const READ_ONLY = new Set<EntityName>(['users', 'leadstagehistory', 'dealstagehistory'])

const FILTER_CAMEL_TO_SNAKE: Record<string, string> = {
  status: 'status',
  clientId: 'client_id',
  projectId: 'project_id',
  assigneeId: 'assignee_id',
  ownerId: 'owner_id',
  leadId: 'lead_id',
  dealId: 'deal_id',
  stage: 'stage',
  source: 'source',
  quoteId: 'quote_id',
  temperature: 'temperature',
  kind: 'kind',
}

const TEXT_SEARCH_FIELDS = ['name', 'title', 'company', 'email', 'domain', 'description', 'slug', 'number'] as const

export function normalizeEntity(raw: string): EntityName | null {
  const k = raw.trim().toLowerCase().replace(/_/g, '')
  if (BLOCKED_ENTITIES.has(k)) return null
  return k in TABLE ? (k as EntityName) : null
}

export function apiCatalog(): Record<string, unknown> {
  return {
    version: 3,
    source: 'beo-os-server (Fastify + Supabase)',
    auth: { headers: ['X-Hub-Api-Key', 'Authorization: Bearer <key>'] },
    routing: {
      entity: 'query entity (or legacy resource)',
      id: 'GET/PATCH/DELETE single doc',
      limit: 'GET list max 200',
      filters: 'status, clientId, projectId, assigneeId, ownerId, leadId, dealId, stage, source, quoteId, temperature, kind, q, dueFrom, dueTo',
      sub: 'POST tasks notes: sub=notes&id=<taskId>. POST leads activity|stage: sub=activity|stage&id=<leadId>. POST deals stage: sub=stage&id=<dealId>',
      meta: 'GET ?meta=schema',
      pipeline: 'GET /api/pipeline/summary or GET /api/bot-data?entity=pipeline. openPipelineAmount is the plain total. openPipelineWeighted and stage.weightedAmount are estimates (weightedIsEstimate: true, estimateLabel הערכה). wonThisMonth uses signed_at (Asia/Jerusalem) and skips cancelled and lost deals. collectedThisMonth sums payments with status paid and paid_at this month.',
    },
    entities: Object.keys(TABLE),
    methods: {
      GET: 'list or get by id; ?meta=schema',
      POST: 'create — body { data, actor: { userId, userName? } }',
      PATCH: 'update — body { data, actor? }',
      DELETE: 'delete by id',
    },
    excluded: [
      'financeExpenses',
      'financeIncomes',
      'passwords_vault',
      'activityLogs',
      'domainRecords',
    ],
    notes: {
      finance: 'קריאה בלבד דרך GET /api/finance-agent/...',
      greenInvoice: 'POST /api/bot-morning/documents',
      writes: 'כל כתיבה אצל ג׳וני בטלגרם מחכה לאישור אור',
    },
  }
}

function toCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

function toSnakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
}

function rowToApi(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (k === 'payload' && v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
        out[toCamelKey(pk)] = pv
      }
      continue
    }
    out[toCamelKey(k)] = v
  }
  return out
}

function uuidOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t || null
}

async function resolveActorName(actor: Actor): Promise<string> {
  if (actor.userName?.trim()) return actor.userName.trim()
  const { data } = await sb()
    .from('profiles')
    .select('name,email')
    .eq('id', actor.userId)
    .maybeSingle()
  const n = typeof data?.name === 'string' ? data.name.trim() : ''
  if (n) return n
  const em = typeof data?.email === 'string' ? data.email : ''
  if (em.includes('@')) return em.split('@')[0] ?? 'משתמש'
  return 'משתמש'
}

function applyTextSearch(
  items: Record<string, unknown>[],
  rawQ: string | undefined,
): Record<string, unknown>[] {
  const q = rawQ?.trim().toLowerCase()
  if (!q) return items
  return items.filter((i) => {
    const hay = TEXT_SEARCH_FIELDS.map((f) => i[f])
      .filter((x) => typeof x === 'string')
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

function validateTaskCreate(data: Record<string, unknown>, actor: Actor | null): ValidationResult {
  if (!actor?.userId) {
    return failErrors(['actor.userId — חובה ליצירת משימה (מזהה משתמש profiles.id)'])
  }
  const errors = mergeErrors(
    requireString(data, 'title', 'title'),
    requireString(data, 'assigneeId', 'assigneeId'),
    requireYmd(data, 'dueDate', 'dueDate'),
  )
  if (errors.length) return failErrors(errors)
  const status = optionalString(data, 'status')
  if (status && !TASK_STATUSES.includes(status as (typeof TASK_STATUSES)[number])) {
    return failErrors([`status — חייב: ${TASK_STATUSES.join(', ')}`])
  }
  const priority = optionalString(data, 'priority')
  if (priority && !PRIORITIES.includes(priority as (typeof PRIORITIES)[number])) {
    return failErrors([`priority — חייב: ${PRIORITIES.join(', ')}`])
  }
  return okData(data)
}

function validateLeadCreate(data: Record<string, unknown>, actor: Actor | null): ValidationResult {
  if (!actor?.userId) return failErrors(['actor.userId — חובה ליצירת ליד'])
  const errors = mergeErrors(requireString(data, 'name', 'name'), requireString(data, 'ownerId', 'ownerId'))
  if (errors.length) return failErrors(errors)
  const st = optionalString(data, 'status') ?? 'new'
  if (!LEAD_STATUSES.includes(st as (typeof LEAD_STATUSES)[number])) {
    return failErrors([`status — חייב: ${LEAD_STATUSES.join(', ')}`])
  }
  if (st === 'not_relevant' && !optionalString(data, 'notRelevantReason')) {
    return failErrors(['notRelevantReason — חובה כש-status הוא not_relevant'])
  }
  if (st === 'lost' && !optionalString(data, 'lostReason')) {
    return failErrors([`lostReason — חובה כש-status הוא lost (${LOST_REASONS.join(', ')})`])
  }
  const temp = optionalString(data, 'temperature')
  if (temp && !LEAD_TEMPERATURES.includes(temp as (typeof LEAD_TEMPERATURES)[number])) {
    return failErrors([`temperature — חייב: ${LEAD_TEMPERATURES.join(', ')}`])
  }
  const prob = data.probability
  if (prob != null && prob !== '' && (typeof prob !== 'number' || prob < 0 || prob > 100)) {
    return failErrors(['probability — מספר בין 0 ל-100'])
  }
  return okData(data)
}

function validateClientCreate(data: Record<string, unknown>, actor: Actor | null): ValidationResult {
  if (!actor?.userId) return failErrors(['actor.userId — חובה ליצירת לקוח'])
  const errors = mergeErrors(
    requireString(data, 'name', 'name'),
    requireString(data, 'contact', 'contact'),
    requireString(data, 'phone', 'phone'),
    requireString(data, 'email', 'email'),
  )
  if (errors.length) return failErrors(errors)
  return okData(data)
}

function validateSupplierCreate(data: Record<string, unknown>, actor: Actor | null): ValidationResult {
  if (!actor?.userId) return failErrors(['actor.userId — חובה ליצירת ספק'])
  const errors = mergeErrors(
    requireString(data, 'name', 'name'),
    requireString(data, 'phone', 'phone'),
    requireString(data, 'email', 'email'),
  )
  if (errors.length) return failErrors(errors)
  return okData(data)
}

function validateCampaignCreate(data: Record<string, unknown>, actor: Actor | null): ValidationResult {
  if (!actor?.userId) return failErrors(['actor.userId — חובה ליצירת קמפיין'])
  const errors = mergeErrors(
    requireString(data, 'name', 'name'),
    requireEnum(data, 'kind', CAMPAIGN_KINDS, 'kind'),
    requireEnum(data, 'platform', CAMPAIGN_PLATFORMS, 'platform'),
    requireEnum(data, 'status', CAMPAIGN_STATUSES, 'status'),
  )
  if (errors.length) return failErrors(errors)
  return okData(data)
}

function validateMeetingCreate(data: Record<string, unknown>, actor: Actor | null): ValidationResult {
  if (!actor?.userId) return failErrors(['actor.userId — חובה ליצירת פגישה'])
  const errors = mergeErrors(
    requireString(data, 'title', 'title'),
    requireString(data, 'purpose', 'purpose'),
    requireString(data, 'agenda', 'agenda'),
    requireYmd(data, 'startDate', 'startDate'),
    requireString(data, 'organizerUserId', 'organizerUserId'),
  )
  if (errors.length) return failErrors(errors)
  if (!Array.isArray(data.participantUserIds)) {
    return failErrors(['participantUserIds — חובה מערך (אפשר ריק)'])
  }
  return okData(data)
}

function validateProjectCreate(data: Record<string, unknown>): ValidationResult {
  const errors = mergeErrors(
    requireString(data, 'name', 'name'),
    requireString(data, 'ownerId', 'ownerId'),
    requireYmd(data, 'dueDate', 'dueDate'),
  )
  if (errors.length) return failErrors(errors)
  const kindRaw = (data.type ?? data.projectKind) as unknown
  const kind =
    typeof kindRaw === 'string' && PROJECT_KINDS.includes(kindRaw as (typeof PROJECT_KINDS)[number])
      ? kindRaw
      : 'client'
  if (kind === 'client' && !optionalString(data, 'clientId')) {
    return failErrors(['clientId — חובה לפרויקט מסוג client'])
  }
  return okData({ ...data, type: kind })
}

function validateInvoiceCreate(data: Record<string, unknown>): ValidationResult {
  const errors = mergeErrors(
    requireString(data, 'clientId', 'clientId'),
    requireString(data, 'invoiceNumber', 'invoiceNumber'),
    requireNumber(data, 'amount', 'amount', 0),
    requireYmd(data, 'dueDate', 'dueDate'),
  )
  if (errors.length) return failErrors(errors)
  return okData(data)
}

function validateDealCreate(data: Record<string, unknown>, actor: Actor | null): ValidationResult {
  if (!actor?.userId) return failErrors(['actor.userId — חובה ליצירת עסקה'])
  const errors = mergeErrors(
    requireString(data, 'clientId', 'clientId'),
    requireEnum(data, 'dealKind', DEAL_KINDS, 'dealKind'),
    requireString(data, 'title', 'title'),
  )
  if (data.commissionPercent != null && data.commissionPercent !== '') {
    errors.push(...requireNumber(data, 'commissionPercent', 'commissionPercent', 0).errors)
  }
  const stage = optionalString(data, 'stage')
  if (stage && !DEAL_STAGES.includes(stage as (typeof DEAL_STAGES)[number])) {
    errors.push(`stage — חייב: ${DEAL_STAGES.join(', ')}`)
  }
  if (errors.length) return failErrors(errors)
  return okData(data)
}

function validateQuoteCreate(data: Record<string, unknown>): ValidationResult {
  if (!optionalString(data, 'title') && !optionalString(data, 'leadId') && !optionalString(data, 'clientId')) {
    return failErrors(['title או leadId או clientId — חובה'])
  }
  const status = optionalString(data, 'status') ?? 'draft'
  if (!QUOTE_STATUSES.includes(status as (typeof QUOTE_STATUSES)[number])) {
    return failErrors([`status — חייב: ${QUOTE_STATUSES.join(', ')}`])
  }
  const period = optionalString(data, 'period') ?? 'one_time'
  if (!QUOTE_PERIODS.includes(period as (typeof QUOTE_PERIODS)[number])) {
    return failErrors([`period — חייב: ${QUOTE_PERIODS.join(', ')}`])
  }
  return okData(data)
}

function validateDealPaymentCreate(data: Record<string, unknown>): ValidationResult {
  const errors = mergeErrors(
    requireString(data, 'dealId', 'dealId'),
    requireNumber(data, 'amount', 'amount', 0),
  )
  const kind = optionalString(data, 'kind') ?? 'installment'
  if (!PAYMENT_KINDS.includes(kind as (typeof PAYMENT_KINDS)[number])) {
    errors.push(`kind — חייב: ${PAYMENT_KINDS.join(', ')}`)
  }
  const status = optionalString(data, 'status') ?? 'scheduled'
  if (!PAYMENT_STATUSES.includes(status as (typeof PAYMENT_STATUSES)[number])) {
    errors.push(`status — חייב: ${PAYMENT_STATUSES.join(', ')}`)
  }
  if (errors.length) return failErrors(errors)
  return okData(data)
}

function validateRecurringCreate(data: Record<string, unknown>): ValidationResult {
  const errors = mergeErrors(
    requireNumber(data, 'amount', 'amount', 0),
    requireYmd(data, 'startDate', 'startDate'),
  )
  const interval = optionalString(data, 'interval') ?? 'monthly'
  if (!RECURRING_INTERVALS.includes(interval as (typeof RECURRING_INTERVALS)[number])) {
    errors.push(`interval — חייב: ${RECURRING_INTERVALS.join(', ')}`)
  }
  const kind = optionalString(data, 'kind') ?? 'retainer'
  if (!RECURRING_KINDS.includes(kind as (typeof RECURRING_KINDS)[number])) {
    errors.push(`kind — חייב: ${RECURRING_KINDS.join(', ')}`)
  }
  if (errors.length) return failErrors(errors)
  return okData(data)
}

function optionalNumber(data: Record<string, unknown>, field: string): number | null {
  const v = data[field]
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function offerUrl(slug: string | null): string | null {
  if (!slug) return null
  return `https://beo-offer.pages.dev/offer/${slug}`
}

function validateCollectionTrackingUpsert(data: Record<string, unknown>): ValidationResult {
  const errors = mergeErrors(
    requireString(data, 'clientId', 'clientId'),
    requireYmd(data, 'lastRequestDate', 'lastRequestDate'),
    requireYmd(data, 'dueDate', 'dueDate'),
  )
  if (errors.length) return failErrors(errors)
  return okData(data)
}

function validateHostingCreate(data: Record<string, unknown>): ValidationResult {
  const errors = mergeErrors(
    requireString(data, 'clientId', 'clientId'),
    requireString(data, 'domain', 'domain'),
  )
  if (errors.length) return failErrors(errors)
  return okData(data)
}

function validateDocCreate(data: Record<string, unknown>): ValidationResult {
  const errors = mergeErrors(
    requireString(data, 'projectId', 'projectId'),
    requireString(data, 'title', 'title'),
    requireEnum(data, 'type', DOC_TYPES, 'type'),
    requireString(data, 'content', 'content'),
    requireString(data, 'authorId', 'authorId'),
  )
  if (errors.length) return failErrors(errors)
  return okData(data)
}

function validateRecurringTemplateCreate(
  data: Record<string, unknown>,
  actor: Actor | null,
): ValidationResult {
  if (!actor?.userId) return failErrors(['actor.userId — חובה'])
  const errors = mergeErrors(
    requireString(data, 'title', 'title'),
    requireString(data, 'assigneeId', 'assigneeId'),
    requireEnum(data, 'frequency', TASK_RECURRENCE, 'frequency'),
  )
  if (errors.length) return failErrors(errors)
  if (data.frequency === 'weekly' && typeof data.weeklyDayOfWeek !== 'number') {
    return failErrors(['weeklyDayOfWeek — חובה 0–6 כש-frequency הוא weekly'])
  }
  return okData(data)
}

function validateAgentCommissionCreate(
  data: Record<string, unknown>,
  actor: Actor | null,
): ValidationResult {
  if (!actor?.userId) return failErrors(['actor.userId — חובה'])
  const errors = mergeErrors(
    requireString(data, 'agentUserId', 'agentUserId'),
    requireNumber(data, 'amount', 'amount', 0),
    requireYmd(data, 'paidDate', 'paidDate'),
  )
  if (errors.length) return failErrors(errors)
  return okData(data)
}

class ValidationHttpError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join('; '))
  }
}

type CreateResult = { id: string; table: string }

async function insertRow(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await sb().from(table).insert(row).select('id').single()
  if (error) throw new Error(error.message)
  return String(data.id)
}

async function createEntity(
  entity: EntityName,
  data: Record<string, unknown>,
  actor: Actor | null,
): Promise<CreateResult> {
  switch (entity) {
    case 'tasks': {
      const v = validateTaskCreate(data, actor)
      if (!v.ok) throw new ValidationHttpError(v.errors)
      const uname = await resolveActorName(actor!)
      const id = await insertRow('tasks', {
        title: String(data.title).trim(),
        description: optionalString(data, 'description') ?? '',
        status: optionalString(data, 'status') ?? 'todo',
        priority: optionalString(data, 'priority') ?? 'medium',
        assignee_id: uuidOrNull(data.assigneeId),
        client_id: uuidOrNull(data.clientId),
        project_id: uuidOrNull(data.projectId),
        supplier_id: uuidOrNull(data.supplierId),
        lead_id: uuidOrNull(data.leadId),
        due_date: String(data.dueDate).slice(0, 10),
        due_time: optionalString(data, 'dueTime') ?? null,
        reminder_date: optionalString(data, 'reminderDate') ?? null,
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        reminders: Array.isArray(data.reminders) ? data.reminders : [],
        shared_with_user_ids: Array.isArray(data.sharedWithUserIds)
          ? data.sharedWithUserIds.map(String).filter(Boolean)
          : [],
        team_wide_shared: false,
        created_by: actor!.userId,
      })
      await sb().from('task_activity').insert({
        task_id: id,
        user_id: actor!.userId,
        user_name: uname,
        action: `${uname} יצר את המשימה`,
      })
      return { id, table: 'tasks' }
    }
    case 'projects': {
      const v = validateProjectCreate(data)
      if (!v.ok) throw new ValidationHttpError(v.errors)
      const kind = data.type === 'internal' || data.projectKind === 'internal' ? 'internal' : 'client'
      const billing = data.projectType === 'retainer' ? 'retainer' : 'one-time'
      const id = await insertRow('projects', {
        name: String(data.name).trim(),
        description: optionalString(data, 'description') ?? null,
        type: kind,
        project_type: billing,
        client_id: uuidOrNull(data.clientId),
        supplier_id: uuidOrNull(data.supplierId),
        status: optionalString(data, 'status') ?? 'active',
        priority: optionalString(data, 'priority') ?? 'medium',
        due_date: String(data.dueDate).slice(0, 10),
        start_date: optionalString(data, 'startDate')?.slice(0, 10) ?? null,
        owner_id: uuidOrNull(data.ownerId),
        color: optionalString(data, 'color') ?? '#5828A0',
        task_count: 0,
        done_count: 0,
        retainer_log: Array.isArray(data.retainerLog) ? data.retainerLog : [],
        deal_id: uuidOrNull(data.dealId),
        lead_id: uuidOrNull(data.leadId),
      })
      return { id, table: 'projects' }
    }
    case 'leads': {
      const v = validateLeadCreate(data, actor)
      if (!v.ok) throw new ValidationHttpError(v.errors)
      const id = await insertRow('leads', {
        name: String(data.name).trim(),
        status: optionalString(data, 'status') ?? 'new',
        owner_id: uuidOrNull(data.ownerId),
        company: optionalString(data, 'company') ?? null,
        phone: optionalString(data, 'phone') ?? null,
        email: optionalString(data, 'email') ?? null,
        client_id: uuidOrNull(data.clientId),
        source: optionalString(data, 'source') ?? null,
        client_needs: optionalString(data, 'clientNeeds') ?? null,
        sales_agent_user_id: uuidOrNull(data.salesAgentUserId),
        not_relevant_reason: optionalString(data, 'notRelevantReason') ?? null,
        activity_log: Array.isArray(data.activityLog) ? data.activityLog : [],
        estimated_value: optionalNumber(data, 'estimatedValue'),
        lost_reason: optionalString(data, 'lostReason') ?? null,
        lost_reason_note: optionalString(data, 'lostReasonNote') ?? null,
        replied_at:
          optionalString(data, 'repliedAt') ??
          ((optionalString(data, 'status') ?? 'new') === 'replied' ? new Date().toISOString() : null),
        source_detail: optionalString(data, 'sourceDetail') ?? null,
        utm_source: optionalString(data, 'utmSource') ?? null,
        utm_medium: optionalString(data, 'utmMedium') ?? null,
        utm_campaign: optionalString(data, 'utmCampaign') ?? null,
        utm_content: optionalString(data, 'utmContent') ?? null,
        utm_term: optionalString(data, 'utmTerm') ?? null,
        landing_page: optionalString(data, 'landingPage') ?? null,
        first_message: optionalString(data, 'firstMessage') ?? null,
        consent: typeof data.consent === 'boolean' ? data.consent : null,
        probability: optionalNumber(data, 'probability'),
        next_action: optionalString(data, 'nextAction') ?? null,
        next_action_at: optionalString(data, 'nextActionAt') ?? null,
        next_follow_up_date: optionalString(data, 'nextFollowUpDate')?.slice(0, 10) ?? null,
        last_activity_text: optionalString(data, 'lastActivityText') ?? null,
        last_activity_at: optionalString(data, 'lastActivityAt') ?? null,
        last_contact_at: optionalString(data, 'lastContactAt') ?? null,
        meeting_at: optionalString(data, 'meetingAt') ?? null,
        temperature: optionalString(data, 'temperature') ?? null,
        domain: optionalString(data, 'domain') ?? null,
        quote_channel: optionalString(data, 'quoteChannel') ?? null,
        quote_pdf_url: optionalString(data, 'quotePdfUrl') ?? null,
        quote_pdf_file_name: optionalString(data, 'quotePdfFileName') ?? null,
        quote_visual_url: optionalString(data, 'quoteVisualUrl') ?? null,
        quote_return_by_date: optionalString(data, 'quoteReturnByDate')?.slice(0, 10) ?? null,
      })
      return { id, table: 'leads' }
    }
    case 'clients': {
      const v = validateClientCreate(data, actor)
      if (!v.ok) throw new ValidationHttpError(v.errors)
      const id = await insertRow('clients', {
        name: String(data.name).trim(),
        contact: String(data.contact).trim(),
        phone: String(data.phone).trim(),
        email: String(data.email).trim(),
        status: optionalString(data, 'status') ?? 'active',
        department: optionalString(data, 'department') ?? null,
        sales_agent_user_id: uuidOrNull(data.salesAgentUserId),
        assigned_employee_user_ids: Array.isArray(data.assignedEmployeeUserIds)
          ? data.assignedEmployeeUserIds.map(String).filter(Boolean)
          : [],
        legal_name: optionalString(data, 'legalName') ?? null,
        tax_id: optionalString(data, 'taxId') ?? null,
        address_line: optionalString(data, 'addressLine') ?? null,
        city: optionalString(data, 'city') ?? null,
        business_notes: optionalString(data, 'businessNotes') ?? null,
        source: 'manual',
      })
      return { id, table: 'clients' }
    }
    case 'suppliers': {
      const v = validateSupplierCreate(data, actor)
      if (!v.ok) throw new ValidationHttpError(v.errors)
      const types = Array.isArray(data.supplierTypes) ? data.supplierTypes.map(String) : []
      const id = await insertRow('suppliers', {
        name: String(data.name).trim(),
        phone: String(data.phone).trim(),
        email: String(data.email).trim(),
        supplier_types: types,
        active: data.active !== false,
      })
      return { id, table: 'suppliers' }
    }
    case 'campaigns': {
      const v = validateCampaignCreate(data, actor)
      if (!v.ok) throw new ValidationHttpError(v.errors)
      const id = await insertRow('campaigns', {
        name: String(data.name).trim(),
        kind: data.kind,
        platform: data.platform,
        status: data.status,
        client_id: uuidOrNull(data.clientId),
        project_id: uuidOrNull(data.projectId),
        supplier_id: uuidOrNull(data.supplierId),
        performer_user_id: uuidOrNull(data.performerUserId),
        budget: typeof data.budget === 'number' ? data.budget : null,
        start_date: optionalString(data, 'startDate') ?? null,
        end_date: optionalString(data, 'endDate') ?? null,
        results_update: optionalString(data, 'resultsUpdate') ?? null,
        results_log: [],
      })
      return { id, table: 'campaigns' }
    }
    case 'meetings': {
      const v = validateMeetingCreate(data, actor)
      if (!v.ok) throw new ValidationHttpError(v.errors)
      const participants = (data.participantUserIds as unknown[]).map(String)
      const organizer = String(data.organizerUserId).trim()
      const exclude = data.excludeCreatorFromAttendees === true
      const attendeeSet = new Set<string>()
      if (!exclude) attendeeSet.add(actor!.userId)
      attendeeSet.add(organizer)
      for (const p of participants) if (p.trim()) attendeeSet.add(p.trim())
      const id = await insertRow('meetings', {
        title: String(data.title).trim(),
        purpose: String(data.purpose).trim(),
        agenda: String(data.agenda).trim(),
        start_date: String(data.startDate).slice(0, 10),
        start_time: optionalString(data, 'startTime') ?? null,
        end_time: optionalString(data, 'endTime') ?? null,
        location: optionalString(data, 'location') ?? null,
        client_id: uuidOrNull(data.clientId),
        project_id: uuidOrNull(data.projectId),
        supplier_id: uuidOrNull(data.supplierId),
        lead_id: uuidOrNull(data.leadId),
        organizer_user_id: uuidOrNull(organizer),
        participant_user_ids: participants,
        attendee_user_ids: [...attendeeSet],
        exclude_creator_from_attendees: exclude,
        created_by: actor!.userId,
        completed: false,
      })
      return { id, table: 'meetings' }
    }
    case 'invoices': {
      const v = validateInvoiceCreate(data)
      if (!v.ok) throw new ValidationHttpError(v.errors)
      const isPaid = data.status === 'paid' || data.initialStatus === 'paid'
      const payload = stripUndefined({
        invoiceNumber: String(data.invoiceNumber).trim(),
        amount: Number(data.amount),
        dueDate: String(data.dueDate).slice(0, 10),
        note: optionalString(data, 'note'),
        paidDate: isPaid
          ? optionalString(data, 'paidDate')?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
          : undefined,
        agentCommissionPercent:
          typeof data.agentCommissionPercent === 'number' ? data.agentCommissionPercent : undefined,
      })
      const id = await insertRow('invoices', {
        client_id: uuidOrNull(data.clientId),
        deal_id: uuidOrNull(data.dealId),
        project_id: uuidOrNull(data.projectId),
        status: isPaid ? 'paid' : optionalString(data, 'status') ?? 'pending',
        payload,
      })
      return { id, table: 'invoices' }
    }
    case 'deals': {
      const v = validateDealCreate(data, actor)
      if (!v.ok) throw new ValidationHttpError(v.errors)
      const comm = Math.min(
        100,
        Math.max(0, Math.round(Number(data.commissionPercent ?? 0)) || 0),
      )
      const amount =
        typeof data.amountTotal === 'number'
          ? data.amountTotal
          : typeof data.agreedAmount === 'number'
            ? data.agreedAmount
            : optionalNumber(data, 'amountTotal') ?? optionalNumber(data, 'agreedAmount')
      const id = await insertRow('deals', {
        client_id: uuidOrNull(data.clientId),
        lead_id: uuidOrNull(data.leadId),
        sales_agent_user_id: uuidOrNull(data.salesAgentUserId),
        deal_kind: data.dealKind,
        title: String(data.title).trim(),
        agreed_amount: amount,
        amount_total: amount,
        expected_payment_ymd: optionalString(data, 'expectedPaymentYmd') ?? null,
        annual_billing_ymd: optionalString(data, 'annualBillingYmd') ?? null,
        first_payment_ymd: optionalString(data, 'firstPaymentYmd') ?? null,
        is_hosting_deal: data.isHostingDeal === true,
        scheduled_payments: Array.isArray(data.scheduledPayments) ? data.scheduledPayments : [],
        commission_percent: comm,
        status: optionalString(data, 'status') ?? 'active',
        stage: optionalString(data, 'stage') ?? 'signed',
        project_id: uuidOrNull(data.projectId),
        quote_id: uuidOrNull(data.quoteId),
        deposit_amount: optionalNumber(data, 'depositAmount'),
        deposit_paid_at: optionalString(data, 'depositPaidAt')?.slice(0, 10) ?? null,
        delivered_at: optionalString(data, 'deliveredAt') ?? null,
        paid_in_full_at: optionalString(data, 'paidInFullAt')?.slice(0, 10) ?? null,
        notes: optionalString(data, 'notes') ?? null,
        created_by_user_id: actor!.userId,
      })
      return { id, table: 'deals' }
    }
    case 'collectiontracking': {
      const v = validateCollectionTrackingUpsert(data)
      if (!v.ok) throw new ValidationHttpError(v.errors)
      const clientId = String(data.clientId).trim()
      const payload = stripUndefined({
        clientId,
        lastRequestDate: String(data.lastRequestDate).slice(0, 10),
        dueDate: String(data.dueDate).slice(0, 10),
        paidDate: optionalString(data, 'paidDate'),
        note: optionalString(data, 'note'),
        lastActorUserId: actor?.userId,
        lastActorUserName: actor ? await resolveActorName(actor) : undefined,
      })
      const { error } = await sb()
        .from('collection_tracking')
        .upsert({ id: clientId, payload }, { onConflict: 'id' })
      if (error) throw new Error(error.message)
      return { id: clientId, table: 'collection_tracking' }
    }
    case 'hostingrecords': {
      const v = validateHostingCreate(data)
      if (!v.ok) throw new ValidationHttpError(v.errors)
      const extra = [
        'server',
        'serverLocation',
        'controlPanel',
        'username',
        'ipAddress',
        'sslExpiry',
        'domainExpiry',
        'platform',
        'phpVersion',
        'notes',
      ] as const
      const payload: Record<string, unknown> = {}
      for (const f of extra) if (data[f] !== undefined) payload[f] = data[f]
      const id = await insertRow('hosting_records', {
        client_id: uuidOrNull(data.clientId),
        domain: String(data.domain).trim(),
        site_name: optionalString(data, 'siteName') ?? null,
        payload,
      })
      return { id, table: 'hosting_records' }
    }
    case 'docs': {
      const v = validateDocCreate(data)
      if (!v.ok) throw new ValidationHttpError(v.errors)
      const id = await insertRow('docs', {
        project_id: uuidOrNull(data.projectId),
        title: String(data.title).trim(),
        type: data.type,
        content: String(data.content),
        author_id: uuidOrNull(data.authorId),
      })
      return { id, table: 'docs' }
    }
    case 'recurringtasktemplates': {
      const v = validateRecurringTemplateCreate(data, actor)
      if (!v.ok) throw new ValidationHttpError(v.errors)
      const id = await insertRow('recurring_task_templates', {
        title: String(data.title).trim(),
        description: optionalString(data, 'description') ?? '',
        assignee_id: uuidOrNull(data.assigneeId),
        frequency: data.frequency,
        weekly_day_of_week: data.frequency === 'weekly' ? data.weeklyDayOfWeek : null,
        priority: optionalString(data, 'priority') ?? 'medium',
        client_id: uuidOrNull(data.clientId),
        project_id: uuidOrNull(data.projectId),
        supplier_id: uuidOrNull(data.supplierId),
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        active: data.active !== false,
        created_by: actor!.userId,
      })
      return { id, table: 'recurring_task_templates' }
    }
    case 'agentcommissionpayments': {
      const v = validateAgentCommissionCreate(data, actor)
      if (!v.ok) throw new ValidationHttpError(v.errors)
      const id = await insertRow('agent_commission_payments', {
        payload: stripUndefined({
          agentUserId: String(data.agentUserId).trim(),
          amount: Number(data.amount),
          paidDate: String(data.paidDate).slice(0, 10),
          note: optionalString(data, 'note'),
          clientId: optionalString(data, 'clientId'),
          dealId: optionalString(data, 'dealId'),
          createdBy: actor!.userId,
        }),
      })
      return { id, table: 'agent_commission_payments' }
    }
    case 'quotes': {
      const v = validateQuoteCreate(data)
      if (!v.ok) throw new ValidationHttpError(v.errors)
      let number = optionalString(data, 'number') ?? null
      if (!number) {
        const { data: allocated, error } = await sb().rpc('next_quote_number')
        if (!error && typeof allocated === 'string') number = allocated
      }
      const slug = optionalString(data, 'slug') ?? null
      const id = await insertRow('quotes', {
        number,
        slug,
        url: optionalString(data, 'url') ?? offerUrl(slug),
        title: optionalString(data, 'title') ?? null,
        lead_id: uuidOrNull(data.leadId),
        client_id: uuidOrNull(data.clientId),
        deal_id: uuidOrNull(data.dealId),
        amount_pre_vat: optionalNumber(data, 'amountPreVat'),
        vat_included: data.vatIncluded === true,
        period: optionalString(data, 'period') ?? 'one_time',
        valid_until: optionalString(data, 'validUntil')?.slice(0, 10) ?? null,
        sent_at: optionalString(data, 'sentAt') ?? null,
        viewed_at: optionalString(data, 'viewedAt') ?? null,
        decided_at: optionalString(data, 'decidedAt') ?? null,
        status: optionalString(data, 'status') ?? 'draft',
        notes: optionalString(data, 'notes') ?? null,
        source: optionalString(data, 'source') ?? 'beo-os',
      })
      return { id, table: 'quotes' }
    }
    case 'dealpayments': {
      const v = validateDealPaymentCreate(data)
      if (!v.ok) throw new ValidationHttpError(v.errors)
      const id = await insertRow('deal_payments', {
        deal_id: uuidOrNull(data.dealId),
        lead_id: uuidOrNull(data.leadId),
        client_id: uuidOrNull(data.clientId),
        due_date: optionalString(data, 'dueDate')?.slice(0, 10) ?? null,
        amount: Number(data.amount),
        kind: optionalString(data, 'kind') ?? 'installment',
        status: optionalString(data, 'status') ?? 'scheduled',
        paid_at: optionalString(data, 'paidAt') ?? null,
        invoice_id: uuidOrNull(data.invoiceId),
        notes: optionalString(data, 'notes') ?? null,
      })
      return { id, table: 'deal_payments' }
    }
    case 'recurringcharges': {
      const v = validateRecurringCreate(data)
      if (!v.ok) throw new ValidationHttpError(v.errors)
      const start = String(data.startDate).slice(0, 10)
      const id = await insertRow('recurring_charges', {
        deal_id: uuidOrNull(data.dealId),
        client_id: uuidOrNull(data.clientId),
        project_id: uuidOrNull(data.projectId),
        lead_id: uuidOrNull(data.leadId),
        title: optionalString(data, 'title') ?? null,
        amount: Number(data.amount),
        interval: optionalString(data, 'interval') ?? 'monthly',
        start_date: start,
        end_date: optionalString(data, 'endDate')?.slice(0, 10) ?? null,
        next_due: optionalString(data, 'nextDue')?.slice(0, 10) ?? start,
        active: data.active !== false,
        kind: optionalString(data, 'kind') ?? 'retainer',
        notes: optionalString(data, 'notes') ?? null,
      })
      return { id, table: 'recurring_charges' }
    }
    case 'leadstagehistory':
    case 'dealstagehistory':
      throw new ValidationHttpError(['היסטוריה נכתבת אוטומטית בעת שינוי סטטוס (sub=stage)'])
    default:
      throw new ValidationHttpError([`POST לא נתמך עבור ${entity}`])
  }
}

const PATCH_ALLOW: Partial<Record<EntityName, Set<string>>> = {
  tasks: new Set([
    'title',
    'description',
    'status',
    'priority',
    'assigneeId',
    'clientId',
    'projectId',
    'supplierId',
    'leadId',
    'dueDate',
    'dueTime',
    'reminderDate',
    'tags',
    'reminders',
    'sharedWithUserIds',
    'teamWideShared',
  ]),
  projects: new Set([
    'name',
    'description',
    'type',
    'projectKind',
    'projectType',
    'clientId',
    'supplierId',
    'status',
    'priority',
    'dueDate',
    'startDate',
    'ownerId',
    'color',
    'manualProgressPercent',
    'budgetTotal',
    'budgetUsedPercent',
    'dealId',
    'leadId',
  ]),
  leads: new Set([
    'name',
    'company',
    'phone',
    'email',
    'clientId',
    'status',
    'ownerId',
    'source',
    'clientNeeds',
    'salesAgentUserId',
    'notRelevantReason',
    'nextFollowUpDate',
    'estimatedValue',
    'lostReason',
    'lostReasonNote',
    'repliedAt',
    'sourceDetail',
    'utmSource',
    'utmMedium',
    'utmCampaign',
    'utmContent',
    'utmTerm',
    'landingPage',
    'firstMessage',
    'consent',
    'probability',
    'nextAction',
    'nextActionAt',
    'lastActivityText',
    'lastActivityAt',
    'lastContactAt',
    'meetingAt',
    'temperature',
    'domain',
    'quoteChannel',
    'quotePdfUrl',
    'quotePdfFileName',
    'quoteVisualUrl',
    'quoteReturnByDate',
    'activityLog',
  ]),
  clients: new Set([
    'name',
    'contact',
    'phone',
    'email',
    'department',
    'status',
    'salesAgentUserId',
    'assignedEmployeeUserIds',
    'legalName',
    'taxId',
    'addressLine',
    'city',
    'businessNotes',
    'greenInvoiceId',
  ]),
  suppliers: new Set(['name', 'phone', 'email', 'supplierTypes', 'active']),
  campaigns: new Set([
    'name',
    'kind',
    'platform',
    'status',
    'clientId',
    'projectId',
    'supplierId',
    'performerUserId',
    'budget',
    'startDate',
    'endDate',
    'resultsUpdate',
  ]),
  meetings: new Set([
    'title',
    'purpose',
    'agenda',
    'startDate',
    'startTime',
    'endTime',
    'location',
    'clientId',
    'projectId',
    'supplierId',
    'leadId',
    'organizerUserId',
    'participantUserIds',
    'attendeeUserIds',
    'excludeCreatorFromAttendees',
    'completed',
    'completionSummary',
  ]),
  deals: new Set([
    'clientId',
    'leadId',
    'salesAgentUserId',
    'dealKind',
    'title',
    'agreedAmount',
    'expectedPaymentYmd',
    'annualBillingYmd',
    'firstPaymentYmd',
    'isHostingDeal',
    'scheduledPayments',
    'commissionPercent',
    'status',
    'notes',
    'stage',
    'projectId',
    'quoteId',
    'amountTotal',
    'depositAmount',
    'depositPaidAt',
    'deliveredAt',
    'paidInFullAt',
  ]),
  quotes: new Set([
    'number',
    'slug',
    'url',
    'title',
    'leadId',
    'clientId',
    'dealId',
    'amountPreVat',
    'vatIncluded',
    'period',
    'validUntil',
    'sentAt',
    'viewedAt',
    'decidedAt',
    'status',
    'notes',
    'source',
  ]),
  dealpayments: new Set([
    'dealId',
    'leadId',
    'clientId',
    'dueDate',
    'amount',
    'kind',
    'status',
    'paidAt',
    'invoiceId',
    'notes',
  ]),
  recurringcharges: new Set([
    'dealId',
    'clientId',
    'projectId',
    'leadId',
    'title',
    'amount',
    'interval',
    'startDate',
    'endDate',
    'nextDue',
    'active',
    'kind',
    'notes',
  ]),
  docs: new Set(['projectId', 'title', 'type', 'content', 'authorId']),
  recurringtasktemplates: new Set([
    'title',
    'description',
    'assigneeId',
    'frequency',
    'weeklyDayOfWeek',
    'priority',
    'clientId',
    'projectId',
    'supplierId',
    'tags',
    'active',
  ]),
  hostingrecords: new Set(['clientId', 'domain', 'siteName']),
}

function patchToRow(entity: EntityName, data: Record<string, unknown>): Record<string, unknown> {
  const allow = PATCH_ALLOW[entity]
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue
    if (allow && !allow.has(k)) continue
    if (k === 'projectKind' || (k === 'type' && entity === 'projects')) {
      out.type = v
      continue
    }
    const snake = toSnakeKey(k)
    if (snake.endsWith('_id') || snake === 'created_by') {
      out[snake] = uuidOrNull(v)
    } else if (
      k === 'sharedWithUserIds' ||
      k === 'assignedEmployeeUserIds' ||
      k === 'participantUserIds' ||
      k === 'attendeeUserIds'
    ) {
      out[snake] = Array.isArray(v) ? v.map(String).filter(Boolean) : []
    } else {
      out[snake] = v
    }
  }
  return out
}

export async function handleGet(
  entity: EntityName,
  id: string,
  reqQuery: Record<string, unknown>,
): Promise<ApiResult> {
  const table = TABLE[entity]
  const limit = parseLimit(reqQuery)

  if (id) {
    const { data, error } = await sb().from(table).select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return notFound(entity, id)
    return ok(200, { ok: true, entity, item: rowToApi(data as Record<string, unknown>) })
  }

  let q = sb().from(table).select('*').limit(limit)
  const columnEntities: Record<string, ReadonlySet<EntityName>> = {
    lead_id: new Set([
      'quotes',
      'deals',
      'projects',
      'dealpayments',
      'recurringcharges',
      'leadstagehistory',
      'tasks',
      'meetings',
    ]),
    deal_id: new Set([
      'quotes',
      'projects',
      'dealpayments',
      'recurringcharges',
      'invoices',
      'dealstagehistory',
    ]),
    stage: new Set(['deals']),
    source: new Set(['leads']),
    quote_id: new Set(['deals']),
    temperature: new Set(['leads']),
    kind: new Set(['dealpayments', 'recurringcharges', 'campaigns']),
  }
  for (const [camel, snake] of Object.entries(FILTER_CAMEL_TO_SNAKE)) {
    const allowed = columnEntities[snake]
    if (allowed && !allowed.has(entity)) continue
    const v = typeof reqQuery[camel] === 'string' ? (reqQuery[camel] as string).trim() : ''
    if (v) q = q.eq(snake, v)
  }
  if (entity === 'leads' && typeof reqQuery.stage === 'string' && reqQuery.stage.trim() && !reqQuery.status) {
    q = q.eq('status', reqQuery.stage.trim())
  }
  const dueFrom = typeof reqQuery.dueFrom === 'string' ? reqQuery.dueFrom.trim().slice(0, 10) : ''
  const dueTo = typeof reqQuery.dueTo === 'string' ? reqQuery.dueTo.trim().slice(0, 10) : ''
  const dueColumn =
    entity === 'dealpayments' ? 'due_date' : entity === 'recurringcharges' ? 'next_due' : ''
  if (dueColumn && dueFrom) q = q.gte(dueColumn, dueFrom)
  if (dueColumn && dueTo) q = q.lte(dueColumn, dueTo)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  let items = (data ?? []).map((r) => rowToApi(r as Record<string, unknown>))
  items = applyTextSearch(items, typeof reqQuery.q === 'string' ? reqQuery.q : undefined)
  return ok(200, { ok: true, entity, count: items.length, limit, items })
}

export async function handlePost(
  entity: EntityName,
  id: string,
  body: Record<string, unknown>,
  sub: string,
): Promise<ApiResult> {
  if (READ_ONLY.has(entity)) return badRequest(`entity ${entity} — קריאה בלבד`)

  if (entity === 'tasks' && sub === 'notes' && id) {
    const actor = parseActor(body)
    if (!actor) return badRequest('actor.userId — חובה להוספת הערה')
    const data = parseDataPayload(body)
    const text = requireString(data, 'text', 'text')
    if (text.errors.length) return badRequest(text.errors)
    const uname = await resolveActorName(actor)
    const { data: note, error } = await sb()
      .from('task_notes')
      .insert({
        task_id: id,
        user_id: actor.userId,
        user_name: uname,
        text: text.value,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return ok(201, {
      ok: true,
      entity: 'tasks',
      subResource: 'notes',
      taskId: id,
      noteId: note.id,
    })
  }

  if (entity === 'leads' && sub === 'activity' && id) {
    const actor = parseActor(body)
    const data = parseDataPayload(body)
    const text = requireString(data, 'text', 'text')
    if (text.errors.length || !text.value) return badRequest(text.errors.length ? text.errors : 'text — חובה')
    const { data: row, error: getErr } = await sb().from('leads').select('activity_log').eq('id', id).maybeSingle()
    if (getErr) throw new Error(getErr.message)
    if (!row) return notFound(entity, id)
    const uname = actor ? await resolveActorName(actor) : 'בוט'
    const now = new Date().toISOString()
    const log = Array.isArray(row.activity_log) ? row.activity_log : []
    const entry = {
      id: crypto.randomUUID(),
      text: text.value,
      at: now,
      actorName: uname,
      ...(optionalString(data, 'nextFollowUpDate')
        ? { nextFollowUpDate: optionalString(data, 'nextFollowUpDate')!.slice(0, 10) }
        : {}),
    }
    const patch: Record<string, unknown> = {
      activity_log: [...log, entry],
      last_activity_text: text.value,
      last_activity_at: now,
      last_contact_at: now,
    }
    if (optionalString(data, 'nextFollowUpDate')) {
      patch.next_follow_up_date = optionalString(data, 'nextFollowUpDate')!.slice(0, 10)
    }
    const { error } = await sb().from('leads').update(patch).eq('id', id)
    if (error) throw new Error(error.message)
    return ok(201, { ok: true, entity: 'leads', subResource: 'activity', id, entry })
  }

  if ((entity === 'leads' || entity === 'deals') && sub === 'stage' && id) {
    const actor = parseActor(body)
    const data = parseDataPayload(body)
    if (entity === 'leads') {
      const status = optionalString(data, 'status')
      if (!status || !LEAD_STATUSES.includes(status as (typeof LEAD_STATUSES)[number])) {
        return badRequest(`status — חייב: ${LEAD_STATUSES.join(', ')}`)
      }
      if (status === 'lost' && !optionalString(data, 'lostReason')) {
        return badRequest(`lostReason — חובה (${LOST_REASONS.join(', ')})`)
      }
      const { data: row, error: getErr } = await sb().from('leads').select('status').eq('id', id).maybeSingle()
      if (getErr) throw new Error(getErr.message)
      if (!row) return notFound(entity, id)
      const patch: Record<string, unknown> = { status }
      if (status === 'replied') patch.replied_at = optionalString(data, 'repliedAt') ?? new Date().toISOString()
      if (optionalString(data, 'lostReason')) patch.lost_reason = optionalString(data, 'lostReason')
      if (optionalString(data, 'lostReasonNote')) patch.lost_reason_note = optionalString(data, 'lostReasonNote')
      const { data: updated, error } = await sb().from('leads').update(patch).eq('id', id).select('*').single()
      if (error) throw new Error(error.message)
      if (String(row.status) !== status) {
        await insertLeadStageHistory(sb(), {
          leadId: id,
          fromStatus: row.status ? String(row.status) : null,
          toStatus: status,
          changedBy: actor?.userId ?? null,
          note: optionalString(data, 'note') ?? null,
        })
      }
      return ok(200, { ok: true, entity, id, item: rowToApi(updated as Record<string, unknown>) })
    }
    const stage = optionalString(data, 'stage')
    if (!stage || !DEAL_STAGES.includes(stage as (typeof DEAL_STAGES)[number])) {
      return badRequest(`stage — חייב: ${DEAL_STAGES.join(', ')}`)
    }
    const { data: row, error: getErr } = await sb().from('deals').select('stage').eq('id', id).maybeSingle()
    if (getErr) throw new Error(getErr.message)
    if (!row) return notFound(entity, id)
    const { data: updated, error } = await sb().from('deals').update({ stage }).eq('id', id).select('*').single()
    if (error) throw new Error(error.message)
    if (String(row.stage ?? '') !== stage) {
      await insertDealStageHistory(sb(), {
        dealId: id,
        fromStage: row.stage ? String(row.stage) : null,
        toStage: stage,
        changedBy: actor?.userId ?? null,
        note: optionalString(data, 'note') ?? null,
      })
    }
    return ok(200, { ok: true, entity, id, item: rowToApi(updated as Record<string, unknown>) })
  }

  const data = parseDataPayload(body)
  const actor = parseActor(body)
  try {
    const result = await createEntity(entity, data, actor)
    return ok(201, { ok: true, entity, id: result.id, collection: result.table })
  } catch (e) {
    if (e instanceof ValidationHttpError) return badRequest(e.errors)
    throw e
  }
}

export async function handlePatch(
  entity: EntityName,
  id: string,
  body: Record<string, unknown>,
): Promise<ApiResult> {
  if (!id) return badRequest('query id — חובה לעדכון')
  if (READ_ONLY.has(entity)) return badRequest(`entity ${entity} — קריאה בלבד`)

  const table = TABLE[entity]
  const { data: existing, error: getErr } = await sb()
    .from(table)
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (getErr) throw new Error(getErr.message)
  if (!existing) return notFound(entity, id)

  const data = parseDataPayload(body)
  if (entity === 'leads' && data.status === 'not_relevant' && !data.notRelevantReason) {
    const row = existing as Record<string, unknown>
    if (!row.not_relevant_reason) {
      return badRequest('notRelevantReason — חובה כש-status הוא not_relevant')
    }
  }
  if (entity === 'leads' && data.status === 'lost' && !data.lostReason) {
    const row = existing as Record<string, unknown>
    if (!row.lost_reason) {
      return badRequest(`lostReason — חובה כש-status הוא lost (${LOST_REASONS.join(', ')})`)
    }
  }
  if (entity === 'leads' && typeof data.status === 'string' && !LEAD_STATUSES.includes(data.status as (typeof LEAD_STATUSES)[number])) {
    return badRequest(`status — חייב: ${LEAD_STATUSES.join(', ')}`)
  }
  if (entity === 'deals' && typeof data.stage === 'string' && !DEAL_STAGES.includes(data.stage as (typeof DEAL_STAGES)[number])) {
    return badRequest(`stage — חייב: ${DEAL_STAGES.join(', ')}`)
  }
  if (entity === 'quotes' && typeof data.status === 'string' && !QUOTE_STATUSES.includes(data.status as (typeof QUOTE_STATUSES)[number])) {
    return badRequest(`status — חייב: ${QUOTE_STATUSES.join(', ')}`)
  }

  if (
    entity === 'invoices' ||
    entity === 'collectiontracking' ||
    entity === 'agentcommissionpayments'
  ) {
    const prev = (existing as Record<string, unknown>).payload
    const prevObj =
      prev && typeof prev === 'object' && !Array.isArray(prev)
        ? (prev as Record<string, unknown>)
        : {}
    const nextPayload = { ...prevObj, ...data }
    const patch: Record<string, unknown> = { payload: nextPayload }
    if (entity === 'invoices') {
      if (typeof data.status === 'string') patch.status = data.status
      if (data.clientId !== undefined) patch.client_id = uuidOrNull(data.clientId)
      if (data.dealId !== undefined) patch.deal_id = uuidOrNull(data.dealId)
      if (data.projectId !== undefined) patch.project_id = uuidOrNull(data.projectId)
    }
    const { data: updated, error } = await sb()
      .from(table)
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return ok(200, { ok: true, entity, id, item: rowToApi(updated as Record<string, unknown>) })
  }

  if (entity === 'hostingrecords') {
    const prev = (existing as Record<string, unknown>).payload
    const prevObj =
      prev && typeof prev === 'object' && !Array.isArray(prev)
        ? (prev as Record<string, unknown>)
        : {}
    const patch: Record<string, unknown> = {}
    if (data.clientId !== undefined) patch.client_id = uuidOrNull(data.clientId)
    if (data.domain !== undefined) patch.domain = String(data.domain).trim()
    if (data.siteName !== undefined) patch.site_name = optionalString(data, 'siteName')
    const payloadKeys = [
      'server',
      'serverLocation',
      'controlPanel',
      'username',
      'ipAddress',
      'sslExpiry',
      'domainExpiry',
      'platform',
      'phpVersion',
      'notes',
    ] as const
    let touched = false
    const nextPayload = { ...prevObj }
    for (const k of payloadKeys) {
      if (data[k] !== undefined) {
        nextPayload[k] = data[k]
        touched = true
      }
    }
    if (touched) patch.payload = nextPayload
    if (Object.keys(patch).length === 0) return badRequest('data — אין שדות לעדכון')
    const { data: updated, error } = await sb()
      .from(table)
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return ok(200, { ok: true, entity, id, item: rowToApi(updated as Record<string, unknown>) })
  }

  const patch = patchToRow(entity, data)
  if (entity === 'leads' && data.status === 'replied' && data.repliedAt == null) {
    const row = existing as Record<string, unknown>
    if (!row.replied_at) patch.replied_at = new Date().toISOString()
  }
  if (entity === 'deals') {
    if (data.amountTotal != null && data.agreedAmount == null) patch.agreed_amount = patch.amount_total
    if (data.agreedAmount != null && data.amountTotal == null) patch.amount_total = patch.agreed_amount
  }
  if (Object.keys(patch).length === 0) return badRequest('data — אין שדות לעדכון')

  const { data: updated, error } = await sb()
    .from(table)
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  const actor = parseActor(body)
  const prev = existing as Record<string, unknown>
  if (entity === 'leads' && typeof data.status === 'string' && String(prev.status ?? '') !== data.status) {
    await insertLeadStageHistory(sb(), {
      leadId: id,
      fromStatus: prev.status ? String(prev.status) : null,
      toStatus: data.status,
      changedBy: actor?.userId ?? null,
      note: optionalString(data, 'note') ?? null,
    })
  }
  if (entity === 'deals' && typeof data.stage === 'string' && String(prev.stage ?? '') !== data.stage) {
    await insertDealStageHistory(sb(), {
      dealId: id,
      fromStage: prev.stage ? String(prev.stage) : null,
      toStage: data.stage,
      changedBy: actor?.userId ?? null,
      note: optionalString(data, 'note') ?? null,
    })
  }
  return ok(200, { ok: true, entity, id, item: rowToApi(updated as Record<string, unknown>) })
}

export async function handlePipeline(): Promise<ApiResult> {
  const summary = await loadPipelineSummary(sb())
  return ok(200, { ok: true, summary })
}

export async function handleDelete(entity: EntityName, id: string): Promise<ApiResult> {
  if (!id) return badRequest('query id — חובה למחיקה')
  if (READ_ONLY.has(entity)) return badRequest(`entity ${entity} — קריאה בלבד`)

  const table = TABLE[entity]
  const client = sb()

  if (entity === 'deals') {
    await client.from('invoices').delete().eq('deal_id', id)
    const { error } = await client.from(table).delete().eq('id', id)
    if (error) throw new Error(error.message)
  } else if (entity === 'projects') {
    const { data: tasks } = await client.from('tasks').select('id').eq('project_id', id)
    const taskIds = (tasks ?? []).map((t) => String(t.id))
    if (taskIds.length) {
      await client.from('task_activity').delete().in('task_id', taskIds)
      await client.from('task_notes').delete().in('task_id', taskIds)
      await client.from('tasks').delete().in('id', taskIds)
    }
    await client.from('docs').delete().eq('project_id', id)
    const { error } = await client.from(table).delete().eq('id', id)
    if (error) throw new Error(error.message)
  } else if (entity === 'tasks') {
    await client.from('task_activity').delete().eq('task_id', id)
    await client.from('task_notes').delete().eq('task_id', id)
    const { error } = await client.from(table).delete().eq('id', id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await client.from(table).delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  return ok(200, { ok: true, entity, id, deleted: true })
}

export { HubApiDbNotReadyError }
