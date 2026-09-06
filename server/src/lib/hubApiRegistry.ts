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
  'specification',
  'quote_sent',
  'follow_up',
  'no_answer',
  'not_relevant',
  'closed',
] as const
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
}

const BLOCKED_ENTITIES = new Set([
  'financeexpenses',
  'financeincomes',
  'passwords_vault',
  'passwordsvault',
  'activitylogs',
  'domainrecords',
])
const READ_ONLY = new Set<EntityName>(['users'])

const FILTER_CAMEL_TO_SNAKE: Record<string, string> = {
  status: 'status',
  clientId: 'client_id',
  projectId: 'project_id',
  assigneeId: 'assignee_id',
  ownerId: 'owner_id',
}

const TEXT_SEARCH_FIELDS = ['name', 'title', 'company', 'email', 'domain', 'description'] as const

export function normalizeEntity(raw: string): EntityName | null {
  const k = raw.trim().toLowerCase().replace(/_/g, '')
  if (BLOCKED_ENTITIES.has(k)) return null
  return k in TABLE ? (k as EntityName) : null
}

export function apiCatalog(): Record<string, unknown> {
  return {
    version: 2,
    source: 'beo-os-server (Fastify + Supabase)',
    auth: { headers: ['X-Hub-Api-Key', 'Authorization: Bearer <key>'] },
    routing: {
      entity: 'query entity (or legacy resource)',
      id: 'GET/PATCH/DELETE single doc',
      limit: 'GET list max 200',
      filters: 'status, clientId, projectId, assigneeId, ownerId, q',
      sub: 'POST tasks notes: sub=notes&id=<taskId>',
      meta: 'GET ?meta=schema',
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
    requireNumber(data, 'commissionPercent', 'commissionPercent', 0),
  )
  if (errors.length) return failErrors(errors)
  return okData(data)
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
        activity_log: [],
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
      const comm = Math.min(100, Math.max(0, Math.round(Number(data.commissionPercent))))
      const id = await insertRow('deals', {
        client_id: uuidOrNull(data.clientId),
        lead_id: uuidOrNull(data.leadId),
        sales_agent_user_id: uuidOrNull(data.salesAgentUserId),
        deal_kind: data.dealKind,
        title: String(data.title).trim(),
        agreed_amount: typeof data.agreedAmount === 'number' ? data.agreedAmount : null,
        expected_payment_ymd: optionalString(data, 'expectedPaymentYmd') ?? null,
        annual_billing_ymd: optionalString(data, 'annualBillingYmd') ?? null,
        first_payment_ymd: optionalString(data, 'firstPaymentYmd') ?? null,
        is_hosting_deal: data.isHostingDeal === true,
        scheduled_payments: Array.isArray(data.scheduledPayments) ? data.scheduledPayments : [],
        commission_percent: comm,
        status: optionalString(data, 'status') ?? 'active',
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
  for (const [camel, snake] of Object.entries(FILTER_CAMEL_TO_SNAKE)) {
    const v = typeof reqQuery[camel] === 'string' ? (reqQuery[camel] as string).trim() : ''
    if (v) q = q.eq(snake, v)
  }

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
