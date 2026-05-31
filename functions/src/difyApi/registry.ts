import {
  FieldValue,
  Timestamp,
  getFirestore,
} from 'firebase-admin/firestore'
import type { Response } from 'express'
import {
  type Actor,
  type ValidationResult,
  badRequest,
  failErrors,
  mergeErrors,
  okData,
  optionalString,
  parseActor,
  parseDataPayload,
  parseLimit,
  requireEnum,
  requireNumber,
  requireString,
  requireYmd,
  serializeDoc,
  stripUndefined,
} from './httpUtil.js'

const db = getFirestore()

const TASK_STATUSES = ['todo', 'doing', 'done', 'blocked'] as const
const PRIORITIES = ['high', 'medium', 'low'] as const
const PROJECT_STATUSES = ['active', 'paused', 'done'] as const
const PROJECT_KINDS = ['client', 'internal'] as const
const PROJECT_BILLING = ['one-time', 'retainer'] as const
const LEAD_STATUSES = [
  'new',
  'specification',
  'quote_sent',
  'follow_up',
  'no_answer',
  'not_relevant',
  'closed',
] as const
const CLIENT_STATUSES = ['active', 'inactive'] as const
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
const INVOICE_STATUSES = ['pending', 'paid', 'overdue'] as const
const DEAL_KINDS = ['retainer_monthly', 'retainer_yearly', 'one_time'] as const
const DEAL_STATUSES = ['active', 'completed', 'cancelled'] as const
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
  | 'domainrecords'
  | 'users'
  | 'activitylogs'

const COLLECTION_ALIASES: Record<EntityName, string> = {
  tasks: 'tasks',
  projects: 'projects',
  leads: 'leads',
  clients: 'clients',
  suppliers: 'suppliers',
  campaigns: 'campaigns',
  meetings: 'meetings',
  invoices: 'invoices',
  deals: 'deals',
  collectiontracking: 'collectionTracking',
  hostingrecords: 'hostingRecords',
  docs: 'docs',
  recurringtasktemplates: 'recurringTaskTemplates',
  agentcommissionpayments: 'agentCommissionPayments',
  domainrecords: 'domainRecords',
  users: 'users',
  activitylogs: 'activityLogs',
}

const READ_ONLY = new Set<EntityName>(['users'])

export function normalizeEntity(raw: string): EntityName | null {
  const k = raw.trim().toLowerCase().replace(/_/g, '') as EntityName
  return k in COLLECTION_ALIASES ? k : null
}

export function apiCatalog(): Record<string, unknown> {
  return {
    version: 2,
    auth: {
      headers: ['X-Hub-Api-Key', 'Authorization: Bearer <key>'],
    },
    routing: {
      entity: 'query entity (or legacy resource)',
      id: 'GET/PATCH/DELETE single doc',
      limit: 'GET list max 200',
      filters: 'status, clientId, projectId, assigneeId, ownerId, q',
      sub: 'POST tasks notes: sub=notes&id=<taskId>',
      meta: 'GET ?meta=schema',
    },
    entities: Object.keys(COLLECTION_ALIASES).filter((e) => e !== 'users' || true),
    methods: {
      GET: 'list or get by id; ?meta=schema',
      POST: 'create — body { data, actor: { userId, userName? } }',
      PATCH: 'update — body { data, actor? }',
      PUT: 'same as PATCH',
      DELETE: 'delete by id (not collectionTracking)',
    },
    excluded: ['passwords_vault', 'attendanceConfig'],
  }
}

async function resolveActorName(actor: Actor): Promise<string> {
  if (actor.userName?.trim()) return actor.userName.trim()
  const snap = await db.doc(`users/${actor.userId}`).get()
  const n = snap.get('name')
  if (typeof n === 'string' && n.trim()) return n.trim()
  const em = snap.get('email')
  if (typeof em === 'string' && em.includes('@')) return em.split('@')[0] ?? 'משתמש'
  return 'משתמש'
}

function actorFields(actor: Actor, uname: string): Record<string, unknown> {
  return {
    lastActorUserId: actor.userId,
    lastActorUserName: uname,
    lastEventByUserId: actor.userId,
    lastEventByUserName: uname,
  }
}

function applyListFilters(
  items: Record<string, unknown>[],
  query: Record<string, string | undefined>,
): Record<string, unknown>[] {
  let out = items
  const status = query.status?.trim()
  if (status) out = out.filter((i) => String(i.status ?? '').toLowerCase() === status.toLowerCase())
  for (const key of ['clientId', 'projectId', 'assigneeId', 'ownerId'] as const) {
    const v = query[key]?.trim()
    if (v) out = out.filter((i) => String(i[key] ?? '') === v)
  }
  const q = query.q?.trim().toLowerCase()
  if (q) {
    out = out.filter((i) => {
      const hay = [
        i.name,
        i.title,
        i.company,
        i.email,
        i.domain,
        i.description,
      ]
        .filter((x) => typeof x === 'string')
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }
  return out
}

// ——— validators / builders ———

function validateTaskCreate(data: Record<string, unknown>, actor: Actor | null): ValidationResult {
  if (!actor?.userId) return failErrors(['actor.userId — חובה ליצירת משימה (מזהה משתמש Firebase)'])
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

function buildTaskCreate(data: Record<string, unknown>, actor: Actor, uname: string): Record<string, unknown> {
  return stripUndefined({
    title: String(data.title).trim(),
    description: optionalString(data, 'description') ?? '',
    status: optionalString(data, 'status') ?? 'todo',
    priority: optionalString(data, 'priority') ?? 'medium',
    assigneeId: String(data.assigneeId).trim(),
    clientId: optionalString(data, 'clientId') ?? null,
    projectId: optionalString(data, 'projectId') ?? null,
    supplierId: optionalString(data, 'supplierId') ?? null,
    dueDate: String(data.dueDate).slice(0, 10),
    ...(optionalString(data, 'dueTime') ? { dueTime: optionalString(data, 'dueTime') } : {}),
    reminderDate: optionalString(data, 'reminderDate') ?? null,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    reminders: Array.isArray(data.reminders) ? data.reminders : [],
    sharedWithUserIds: Array.isArray(data.sharedWithUserIds)
      ? data.sharedWithUserIds.map(String)
      : [],
    shared: false,
    createdBy: actor.userId,
    ...actorFields(actor, uname),
    createdAt: FieldValue.serverTimestamp(),
  })
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

function buildProjectCreate(data: Record<string, unknown>): Record<string, unknown> {
  const kind =
    data.type === 'internal' || data.projectKind === 'internal' ? 'internal' : 'client'
  const billing =
    data.projectType === 'retainer' ? 'retainer' : 'one-time'
  const doc: Record<string, unknown> = {
    name: String(data.name).trim(),
    projectKind: kind,
    status: optionalString(data, 'status') ?? 'active',
    priority: optionalString(data, 'priority') ?? 'medium',
    ownerId: String(data.ownerId).trim(),
    color: optionalString(data, 'color') ?? '#6366f1',
    taskCount: 0,
    doneCount: 0,
    projectType: billing,
    createdAt: FieldValue.serverTimestamp(),
  }
  if (billing === 'retainer') {
    const sd = optionalString(data, 'startDate')?.slice(0, 10) ?? ''
    doc.startDate = sd
    doc.dueDate = sd || String(data.dueDate).slice(0, 10)
    doc.retainerLog = Array.isArray(data.retainerLog) ? data.retainerLog : []
  } else {
    doc.dueDate = String(data.dueDate).slice(0, 10)
  }
  const cid = optionalString(data, 'clientId')
  if (cid) doc.clientId = cid
  const sid = optionalString(data, 'supplierId')
  if (sid) doc.supplierId = sid
  const desc = optionalString(data, 'description')
  if (desc) doc.description = desc
  return doc
}

function validateLeadCreate(data: Record<string, unknown>, actor: Actor | null): ValidationResult {
  if (!actor?.userId) return failErrors(['actor.userId — חובה ליצירת ליד'])
  const errors = mergeErrors(
    requireString(data, 'name', 'name'),
    requireString(data, 'ownerId', 'ownerId'),
  )
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

function buildLeadCreate(data: Record<string, unknown>, actor: Actor, uname: string): Record<string, unknown> {
  return stripUndefined({
    name: String(data.name).trim(),
    status: optionalString(data, 'status') ?? 'new',
    ownerId: String(data.ownerId).trim(),
    company: optionalString(data, 'company'),
    phone: optionalString(data, 'phone'),
    email: optionalString(data, 'email'),
    clientId: optionalString(data, 'clientId'),
    source: optionalString(data, 'source'),
    clientNeeds: optionalString(data, 'clientNeeds'),
    salesAgentUserId: optionalString(data, 'salesAgentUserId'),
    notRelevantReason: optionalString(data, 'notRelevantReason'),
    createdAt: FieldValue.serverTimestamp(),
    createdByUserId: actor.userId,
    createdByUserName: uname,
    ...actorFields(actor, uname),
  })
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

function buildClientCreate(data: Record<string, unknown>, actor: Actor, uname: string): Record<string, unknown> {
  return stripUndefined({
    name: String(data.name).trim(),
    contact: String(data.contact).trim(),
    phone: String(data.phone).trim(),
    email: String(data.email).trim(),
    status: optionalString(data, 'status') ?? 'active',
    department: data.department ?? null,
    salesAgentUserId: optionalString(data, 'salesAgentUserId'),
    legalName: optionalString(data, 'legalName'),
    taxId: optionalString(data, 'taxId'),
    addressLine: optionalString(data, 'addressLine'),
    city: optionalString(data, 'city'),
    businessNotes: optionalString(data, 'businessNotes'),
    createdAt: FieldValue.serverTimestamp(),
    createdByUserId: actor.userId,
    createdByUserName: uname,
    ...actorFields(actor, uname),
  })
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

function buildSupplierCreate(data: Record<string, unknown>, actor: Actor, uname: string): Record<string, unknown> {
  const types = Array.isArray(data.supplierTypes) ? data.supplierTypes.map(String) : []
  return stripUndefined({
    name: String(data.name).trim(),
    phone: String(data.phone).trim(),
    email: String(data.email).trim(),
    ...(types.length ? { supplierTypes: types } : {}),
    active: data.active !== false,
    createdAt: FieldValue.serverTimestamp(),
    createdByUserId: actor.userId,
    createdByUserName: uname,
    ...actorFields(actor, uname),
  })
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

function buildCampaignCreate(data: Record<string, unknown>, actor: Actor, uname: string): Record<string, unknown> {
  return stripUndefined({
    name: String(data.name).trim(),
    kind: data.kind,
    platform: data.platform,
    status: data.status,
    clientId: optionalString(data, 'clientId'),
    projectId: optionalString(data, 'projectId'),
    supplierId: optionalString(data, 'supplierId'),
    performerUserId: optionalString(data, 'performerUserId'),
    budget: typeof data.budget === 'number' ? data.budget : undefined,
    startDate: optionalString(data, 'startDate'),
    endDate: optionalString(data, 'endDate'),
    resultsUpdate: optionalString(data, 'resultsUpdate'),
    createdAt: FieldValue.serverTimestamp(),
    createdByUserId: actor.userId,
    createdByUserName: uname,
    ...actorFields(actor, uname),
  })
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

function buildMeetingCreate(data: Record<string, unknown>, actor: Actor): Record<string, unknown> {
  const participants = (data.participantUserIds as unknown[]).map(String)
  const organizer = String(data.organizerUserId).trim()
  const exclude = data.excludeCreatorFromAttendees === true
  const attendeeSet = new Set<string>()
  if (!exclude) attendeeSet.add(actor.userId)
  attendeeSet.add(organizer)
  for (const p of participants) if (p.trim()) attendeeSet.add(p.trim())
  return stripUndefined({
    title: String(data.title).trim(),
    purpose: String(data.purpose).trim(),
    agenda: String(data.agenda).trim(),
    startDate: String(data.startDate).slice(0, 10),
    startTime: optionalString(data, 'startTime'),
    endTime: optionalString(data, 'endTime'),
    location: optionalString(data, 'location'),
    clientId: optionalString(data, 'clientId'),
    projectId: optionalString(data, 'projectId'),
    supplierId: optionalString(data, 'supplierId'),
    leadId: optionalString(data, 'leadId'),
    organizerUserId: organizer,
    participantUserIds: participants,
    attendeeUserIds: [...attendeeSet],
    excludeCreatorFromAttendees: exclude,
    createdBy: actor.userId,
    createdAt: FieldValue.serverTimestamp(),
  })
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

function buildInvoiceCreate(data: Record<string, unknown>): Record<string, unknown> {
  const isPaid = data.status === 'paid' || data.initialStatus === 'paid'
  const row: Record<string, unknown> = {
    clientId: String(data.clientId).trim(),
    invoiceNumber: String(data.invoiceNumber).trim(),
    amount: Number(data.amount),
    dueDate: String(data.dueDate).slice(0, 10),
    status: isPaid ? 'paid' : optionalString(data, 'status') ?? 'pending',
    createdAt: FieldValue.serverTimestamp(),
  }
  if (isPaid) row.paidDate = optionalString(data, 'paidDate')?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  if (optionalString(data, 'note')) row.note = optionalString(data, 'note')
  if (optionalString(data, 'dealId')) row.dealId = optionalString(data, 'dealId')
  if (typeof data.agentCommissionPercent === 'number') {
    const p = Math.round(data.agentCommissionPercent)
    if (p >= 0 && p <= 100) row.agentCommissionPercent = p
  }
  return row
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

function buildDealCreate(data: Record<string, unknown>, actor: Actor): Record<string, unknown> {
  const comm = Math.min(100, Math.max(0, Math.round(Number(data.commissionPercent))))
  return stripUndefined({
    clientId: String(data.clientId).trim(),
    dealKind: data.dealKind,
    title: String(data.title).trim(),
    commissionPercent: comm,
    status: optionalString(data, 'status') ?? 'active',
    leadId: optionalString(data, 'leadId'),
    salesAgentUserId: optionalString(data, 'salesAgentUserId'),
    agreedAmount: typeof data.agreedAmount === 'number' ? data.agreedAmount : undefined,
    notes: optionalString(data, 'notes'),
    expectedPaymentYmd: optionalString(data, 'expectedPaymentYmd'),
    annualBillingYmd: optionalString(data, 'annualBillingYmd'),
    firstPaymentYmd: optionalString(data, 'firstPaymentYmd'),
    isHostingDeal: data.isHostingDeal === true ? true : undefined,
    scheduledPayments: Array.isArray(data.scheduledPayments) ? data.scheduledPayments : undefined,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdByUserId: actor.userId,
  })
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

function buildHostingDoc(data: Record<string, unknown>): Record<string, unknown> {
  const fields = [
    'clientId',
    'domain',
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
  const o: Record<string, unknown> = {}
  for (const f of fields) {
    if (data[f] !== undefined) o[f] = data[f]
  }
  return o
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

function buildDocCreate(data: Record<string, unknown>): Record<string, unknown> {
  return {
    projectId: String(data.projectId).trim(),
    title: String(data.title).trim(),
    type: data.type,
    content: String(data.content),
    authorId: String(data.authorId).trim(),
    updatedAt: FieldValue.serverTimestamp(),
  }
}

function validateRecurringTemplateCreate(data: Record<string, unknown>, actor: Actor | null): ValidationResult {
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

function buildRecurringTemplateCreate(data: Record<string, unknown>, actor: Actor): Record<string, unknown> {
  return stripUndefined({
    title: String(data.title).trim(),
    description: optionalString(data, 'description') ?? '',
    assigneeId: String(data.assigneeId).trim(),
    frequency: data.frequency,
    weeklyDayOfWeek: data.frequency === 'weekly' ? data.weeklyDayOfWeek : undefined,
    priority: optionalString(data, 'priority') ?? 'medium',
    clientId: optionalString(data, 'clientId'),
    projectId: optionalString(data, 'projectId'),
    supplierId: optionalString(data, 'supplierId'),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    active: data.active !== false,
    createdBy: actor.userId,
    createdAt: FieldValue.serverTimestamp(),
  })
}

function validateAgentCommissionCreate(data: Record<string, unknown>, actor: Actor | null): ValidationResult {
  if (!actor?.userId) return failErrors(['actor.userId — חובה'])
  const errors = mergeErrors(
    requireString(data, 'agentUserId', 'agentUserId'),
    requireNumber(data, 'amount', 'amount', 0),
    requireYmd(data, 'paidDate', 'paidDate'),
  )
  if (errors.length) return failErrors(errors)
  return okData(data)
}

function buildAgentCommissionCreate(data: Record<string, unknown>, actor: Actor): Record<string, unknown> {
  return stripUndefined({
    agentUserId: String(data.agentUserId).trim(),
    amount: Number(data.amount),
    paidDate: String(data.paidDate).slice(0, 10),
    note: optionalString(data, 'note'),
    clientId: optionalString(data, 'clientId'),
    dealId: optionalString(data, 'dealId'),
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actor.userId,
  })
}

type CreateHandler = (
  data: Record<string, unknown>,
  actor: Actor | null,
) => Promise<{ doc: Record<string, unknown>; collectionPath: string; docId?: string }>

const CREATE_HANDLERS: Partial<Record<EntityName, CreateHandler>> = {
  tasks: async (data, actor) => {
    const v = validateTaskCreate(data, actor)
    if (!v.ok) throw new ValidationHttpError(v.errors)
    const uname = await resolveActorName(actor!)
    const doc = buildTaskCreate(v.data, actor!, uname)
    const ref = await db.collection('tasks').add(doc)
    await db.collection('tasks').doc(ref.id).collection('activity').add({
      userId: actor!.userId,
      userName: uname,
      action: `${uname} יצר את המשימה`,
      createdAt: FieldValue.serverTimestamp(),
    })
    return { doc, collectionPath: 'tasks', docId: ref.id }
  },
  projects: async (data) => {
    const v = validateProjectCreate(data)
    if (!v.ok) throw new ValidationHttpError(v.errors)
    const doc = buildProjectCreate(v.data)
    const ref = await db.collection('projects').add(doc)
    return { doc, collectionPath: 'projects', docId: ref.id }
  },
  leads: async (data, actor) => {
    const v = validateLeadCreate(data, actor)
    if (!v.ok) throw new ValidationHttpError(v.errors)
    const uname = await resolveActorName(actor!)
    const doc = buildLeadCreate(v.data, actor!, uname)
    const ref = await db.collection('leads').add(doc)
    return { doc, collectionPath: 'leads', docId: ref.id }
  },
  clients: async (data, actor) => {
    const v = validateClientCreate(data, actor)
    if (!v.ok) throw new ValidationHttpError(v.errors)
    const uname = await resolveActorName(actor!)
    const doc = buildClientCreate(v.data, actor!, uname)
    const ref = await db.collection('clients').add(doc)
    return { doc, collectionPath: 'clients', docId: ref.id }
  },
  suppliers: async (data, actor) => {
    const v = validateSupplierCreate(data, actor)
    if (!v.ok) throw new ValidationHttpError(v.errors)
    const uname = await resolveActorName(actor!)
    const doc = buildSupplierCreate(v.data, actor!, uname)
    const ref = await db.collection('suppliers').add(doc)
    return { doc, collectionPath: 'suppliers', docId: ref.id }
  },
  campaigns: async (data, actor) => {
    const v = validateCampaignCreate(data, actor)
    if (!v.ok) throw new ValidationHttpError(v.errors)
    const uname = await resolveActorName(actor!)
    const doc = buildCampaignCreate(v.data, actor!, uname)
    const ref = await db.collection('campaigns').add(doc)
    return { doc, collectionPath: 'campaigns', docId: ref.id }
  },
  meetings: async (data, actor) => {
    const v = validateMeetingCreate(data, actor)
    if (!v.ok) throw new ValidationHttpError(v.errors)
    const doc = buildMeetingCreate(v.data, actor!)
    const ref = await db.collection('meetings').add(doc)
    return { doc, collectionPath: 'meetings', docId: ref.id }
  },
  invoices: async (data) => {
    const v = validateInvoiceCreate(data)
    if (!v.ok) throw new ValidationHttpError(v.errors)
    const doc = buildInvoiceCreate(v.data)
    const ref = await db.collection('invoices').add(doc)
    return { doc, collectionPath: 'invoices', docId: ref.id }
  },
  deals: async (data, actor) => {
    const v = validateDealCreate(data, actor)
    if (!v.ok) throw new ValidationHttpError(v.errors)
    const doc = buildDealCreate(v.data, actor!)
    const ref = await db.collection('deals').add(doc)
    return { doc, collectionPath: 'deals', docId: ref.id }
  },
  collectiontracking: async (data, actor) => {
    const v = validateCollectionTrackingUpsert(data)
    if (!v.ok) throw new ValidationHttpError(v.errors)
    const clientId = String(data.clientId).trim()
    const uname = actor ? await resolveActorName(actor) : 'Dify'
    const ref = db.collection('collectionTracking').doc(clientId)
    const snap = await ref.get()
    const patch: Record<string, unknown> = {
      clientId,
      lastRequestDate: String(data.lastRequestDate).slice(0, 10),
      dueDate: String(data.dueDate).slice(0, 10),
      updatedAt: FieldValue.serverTimestamp(),
      ...(optionalString(data, 'paidDate')
        ? { paidDate: optionalString(data, 'paidDate') }
        : { paidDate: FieldValue.delete() }),
      ...(optionalString(data, 'note')
        ? { note: optionalString(data, 'note') }
        : { note: FieldValue.delete() }),
      ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      ...(actor
        ? {
            lastActorUserId: actor.userId,
            lastActorUserName: uname,
          }
        : {}),
    }
    await ref.set(patch, { merge: true })
    return { doc: patch, collectionPath: 'collectionTracking', docId: clientId }
  },
  hostingrecords: async (data) => {
    const v = validateHostingCreate(data)
    if (!v.ok) throw new ValidationHttpError(v.errors)
    const doc = { ...buildHostingDoc(v.data), createdAt: FieldValue.serverTimestamp() }
    const ref = await db.collection('hostingRecords').add(doc)
    return { doc, collectionPath: 'hostingRecords', docId: ref.id }
  },
  docs: async (data) => {
    const v = validateDocCreate(data)
    if (!v.ok) throw new ValidationHttpError(v.errors)
    const doc = buildDocCreate(v.data)
    const ref = await db.collection('docs').add(doc)
    return { doc, collectionPath: 'docs', docId: ref.id }
  },
  recurringtasktemplates: async (data, actor) => {
    const v = validateRecurringTemplateCreate(data, actor)
    if (!v.ok) throw new ValidationHttpError(v.errors)
    const doc = buildRecurringTemplateCreate(v.data, actor!)
    const ref = await db.collection('recurringTaskTemplates').add(doc)
    return { doc, collectionPath: 'recurringTaskTemplates', docId: ref.id }
  },
  agentcommissionpayments: async (data, actor) => {
    const v = validateAgentCommissionCreate(data, actor)
    if (!v.ok) throw new ValidationHttpError(v.errors)
    const doc = buildAgentCommissionCreate(v.data, actor!)
    const ref = await db.collection('agentCommissionPayments').add(doc)
    return { doc, collectionPath: 'agentCommissionPayments', docId: ref.id }
  },
  domainrecords: async (data) => {
    const domain = requireString(data, 'domain', 'domain')
    if (domain.errors.length) throw new ValidationHttpError(domain.errors)
    const doc = stripUndefined({
      domain: domain.value,
      inHostinger: data.inHostinger === true,
      notes: optionalString(data, 'notes'),
      updatedAt: FieldValue.serverTimestamp(),
    })
    const ref = await db.collection('domainRecords').add(doc)
    return { doc, collectionPath: 'domainRecords', docId: ref.id }
  },
}

export class ValidationHttpError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join('; '))
  }
}

function parseLimitFromQuery(reqQuery: Record<string, unknown>, max = 200, fallback = 100): number {
  const raw = reqQuery.limit
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(Math.floor(n), max)
}

export async function handleGet(
  entity: EntityName,
  id: string,
  reqQuery: Record<string, unknown>,
  res: Response,
): Promise<void> {
  if (typeof reqQuery.meta === 'string' && reqQuery.meta === 'schema') {
    res.status(200).json({ ok: true, catalog: apiCatalog() })
    return
  }

  const col = COLLECTION_ALIASES[entity]
  const limit = parseLimitFromQuery(reqQuery)

  if (id) {
    const snap = await db.collection(col).doc(id).get()
    if (!snap.exists) {
      res.status(404).json({ ok: false, error: 'not_found', entity, id })
      return
    }
    res.status(200).json({ ok: true, entity, item: serializeDoc(snap.id, snap.data()!) })
    return
  }

  const snap = await db.collection(col).limit(limit).get()
  let items = snap.docs.map((d) => serializeDoc(d.id, d.data()))
  const filters: Record<string, string | undefined> = {
    status: typeof reqQuery.status === 'string' ? reqQuery.status : undefined,
    clientId: typeof reqQuery.clientId === 'string' ? reqQuery.clientId : undefined,
    projectId: typeof reqQuery.projectId === 'string' ? reqQuery.projectId : undefined,
    assigneeId: typeof reqQuery.assigneeId === 'string' ? reqQuery.assigneeId : undefined,
    ownerId: typeof reqQuery.ownerId === 'string' ? reqQuery.ownerId : undefined,
    q: typeof reqQuery.q === 'string' ? reqQuery.q : undefined,
  }
  items = applyListFilters(items, filters)
  res.status(200).json({ ok: true, entity, count: items.length, limit, items })
}

export async function handlePost(
  entity: EntityName,
  id: string,
  body: Record<string, unknown>,
  sub: string,
  res: Response,
): Promise<void> {
  if (READ_ONLY.has(entity)) {
    badRequest(res, `entity ${entity} — קריאה בלבד`)
    return
  }

  if (entity === 'tasks' && sub === 'notes' && id) {
    const actor = parseActor(body)
    if (!actor) {
      badRequest(res, 'actor.userId — חובה להוספת הערה')
      return
    }
    const data = parseDataPayload(body)
    const text = requireString(data, 'text', 'text')
    if (text.errors.length) {
      badRequest(res, text.errors)
      return
    }
    const uname = await resolveActorName(actor)
    const ref = await db.collection('tasks').doc(id).collection('taskNotes').add({
      userId: actor.userId,
      userName: uname,
      text: text.value,
      createdAt: FieldValue.serverTimestamp(),
    })
    res.status(201).json({ ok: true, entity: 'tasks', subResource: 'notes', taskId: id, noteId: ref.id })
    return
  }

  const handler = CREATE_HANDLERS[entity]
  if (!handler) {
    badRequest(res, `POST לא נתמך עבור ${entity}`)
    return
  }

  const data = parseDataPayload(body)
  const actor = parseActor(body)
  try {
    const result = await handler(data, actor)
    res.status(201).json({
      ok: true,
      entity,
      id: result.docId,
      collection: result.collectionPath,
    })
  } catch (e) {
    if (e instanceof ValidationHttpError) {
      badRequest(res, e.errors)
      return
    }
    throw e
  }
}

/** PATCH — מיזוג שדות מותרים; לא מקבל undefined */
export async function handlePatch(
  entity: EntityName,
  id: string,
  body: Record<string, unknown>,
  res: Response,
): Promise<void> {
  if (!id) {
    badRequest(res, 'query id — חובה לעדכון')
    return
  }
  if (READ_ONLY.has(entity)) {
    badRequest(res, `entity ${entity} — קריאה בלבד`)
    return
  }

  const col = COLLECTION_ALIASES[entity]
  const ref = db.collection(col).doc(id)
  const snap = await ref.get()
  if (!snap.exists) {
    res.status(404).json({ ok: false, error: 'not_found', entity, id })
    return
  }

  const data = parseDataPayload(body)
  const actor = parseActor(body)
  const patch: Record<string, unknown> = {}

  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && v !== null) patch[k] = v
  }

  if (entity === 'projects' && patch.type !== undefined) {
    patch.projectKind = patch.type
    delete patch.type
  }

  if (entity === 'leads' && patch.status === 'not_relevant' && !patch.notRelevantReason) {
    const existing = snap.data()?.notRelevantReason
    if (!existing) {
      badRequest(res, 'notRelevantReason — חובה כש-status הוא not_relevant')
      return
    }
  }

  if (actor) {
    const uname = await resolveActorName(actor)
    Object.assign(patch, actorFields(actor, uname))
  }

  if (entity === 'deals') {
    patch.updatedAt = FieldValue.serverTimestamp()
  }

  if (Object.keys(patch).length === 0) {
    badRequest(res, 'data — אין שדות לעדכון')
    return
  }

  await ref.update(stripUndefined(patch))
  const updated = await ref.get()
  res.status(200).json({
    ok: true,
    entity,
    id,
    item: serializeDoc(updated.id, updated.data()!),
  })
}

export async function handleDelete(
  entity: EntityName,
  id: string,
  res: Response,
): Promise<void> {
  if (!id) {
    badRequest(res, 'query id — חובה למחיקה')
    return
  }
  if (entity === 'collectiontracking') {
    badRequest(res, 'מחיקה: DELETE עם id=clientId להסרה ממעקב')
    return
  }
  if (READ_ONLY.has(entity)) {
    badRequest(res, `entity ${entity} — קריאה בלבד`)
    return
  }

  const col = COLLECTION_ALIASES[entity]
  const ref = db.collection(col).doc(id)

  if (entity === 'deals') {
    const inv = await db.collection('invoices').where('dealId', '==', id).get()
    const batch = db.batch()
    for (const d of inv.docs) batch.delete(d.ref)
    batch.delete(ref)
    await batch.commit()
  } else if (entity === 'projects') {
    const tasks = await db.collection('tasks').where('projectId', '==', id).get()
    const docs = await db.collection('docs').where('projectId', '==', id).get()
    const batch = db.batch()
    for (const t of tasks.docs) {
      batch.delete(t.ref)
      const act = await t.ref.collection('activity').get()
      for (const a of act.docs) batch.delete(a.ref)
      const notes = await t.ref.collection('taskNotes').get()
      for (const n of notes.docs) batch.delete(n.ref)
    }
    for (const d of docs.docs) batch.delete(d.ref)
    batch.delete(ref)
    await batch.commit()
  } else if (entity === 'tasks') {
    const act = await ref.collection('activity').get()
    const notes = await ref.collection('taskNotes').get()
    const batch = db.batch()
    for (const a of act.docs) batch.delete(a.ref)
    for (const n of notes.docs) batch.delete(n.ref)
    batch.delete(ref)
    await batch.commit()
  } else {
    await ref.delete()
  }

  res.status(200).json({ ok: true, entity, id, deleted: true })
}
