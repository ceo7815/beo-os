import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore'
import { Timestamp } from 'firebase/firestore'
import type {
  Client,
  Campaign,
  CampaignPlatform,
  CampaignStatus,
  CollectionTracking,
  Doc,
  DocType,
  HostingRecord,
  Invoice,
  InvoiceStatus,
  Lead,
  Meeting,
  Priority,
  Project,
  ProjectBillingType,
  ProjectKind,
  ProjectStatus,
  RetainerEntry,
  Supplier,
  Task,
  TaskActivity,
  TaskNote,
  TaskReminderEntry,
  TaskStatus,
  TeamMember,
} from '../types'
import { normalizeDueTimeHm } from './dates'
import { parseFirestoreSupplierTypes } from './supplierTypes'

export function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString()
  }
  if (typeof value === 'string') return value
  return new Date().toISOString()
}

function parseReminders(value: unknown): TaskReminderEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .map((r) => {
      if (r && typeof r === 'object' && 'id' in r && 'at' in r) {
        return {
          id: String((r as { id: unknown }).id),
          at: String((r as { at: unknown }).at),
        }
      }
      return null
    })
    .filter((x): x is TaskReminderEntry => x !== null)
}

const INVOICE_STATUSES: InvoiceStatus[] = ['pending', 'paid', 'overdue']

export function docToInvoice(d: QueryDocumentSnapshot<DocumentData>): Invoice {
  const x = d.data()
  const raw = (x.status ?? 'pending') as string
  const status = INVOICE_STATUSES.includes(raw as InvoiceStatus)
    ? (raw as InvoiceStatus)
    : 'pending'
  const pd = x.paidDate
  return {
    id: d.id,
    clientId: String(x.clientId ?? ''),
    invoiceNumber: String(x.invoiceNumber ?? ''),
    amount: typeof x.amount === 'number' && !Number.isNaN(x.amount) ? x.amount : 0,
    dueDate: String(x.dueDate ?? ''),
    paidDate:
      typeof pd === 'string' && pd.trim() ? String(pd).slice(0, 10) : undefined,
    status,
    note: typeof x.note === 'string' && x.note.trim() ? String(x.note) : undefined,
    createdAt: timestampToIso(x.createdAt),
  }
}

export function docToCollectionTracking(
  d: QueryDocumentSnapshot<DocumentData>,
): CollectionTracking {
  const x = d.data()
  const pd = x.paidDate
  const ldm = x.lastDemandMethod
  const ldcr = x.lastDemandClientReply
  const ldr = x.lastDemandRecordedAt
  return {
    id: d.id,
    clientId: String(x.clientId ?? d.id),
    lastRequestDate: String(x.lastRequestDate ?? '').slice(0, 10),
    dueDate: String(x.dueDate ?? '').slice(0, 10),
    paidDate:
      typeof pd === 'string' && pd.trim() ? String(pd).slice(0, 10) : undefined,
    note: typeof x.note === 'string' && x.note.trim() ? String(x.note) : undefined,
    lastDemandMethod:
      typeof ldm === 'string' && ldm.trim() ? String(ldm) : undefined,
    lastDemandClientReply:
      typeof ldcr === 'string' && ldcr.trim() ? String(ldcr) : undefined,
    lastDemandRecordedAt:
      ldr != null && (ldr instanceof Timestamp || typeof ldr === 'string')
        ? timestampToIso(ldr)
        : undefined,
    createdAt: timestampToIso(x.createdAt),
    updatedAt: timestampToIso(x.updatedAt ?? x.createdAt),
  }
}

export function docToClient(d: QueryDocumentSnapshot<DocumentData>): Client {
  const x = d.data()
  const deptRaw = x.department
  const department =
    typeof deptRaw === 'string' && deptRaw.trim() ? deptRaw.trim() : undefined
  return {
    id: d.id,
    name: String(x.name ?? ''),
    contact: String(x.contact ?? ''),
    phone: String(x.phone ?? ''),
    email: String(x.email ?? ''),
    department,
    status: (x.status === 'inactive' ? 'inactive' : 'active') as Client['status'],
    createdAt: timestampToIso(x.createdAt),
  }
}

function parseRetainerLog(value: unknown): RetainerEntry[] | undefined {
  if (!Array.isArray(value)) return undefined
  const entries: RetainerEntry[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = String(o.id ?? '')
    const monthRaw = String(o.month ?? '')
    const month = monthRaw.slice(0, 7)
    if (!id || !/^\d{4}-\d{2}$/.test(month)) continue
    entries.push({
      id,
      month,
      note: String(o.note ?? ''),
      createdAt: timestampToIso(o.createdAt),
    })
  }
  return entries.length ? entries : undefined
}

function normalizeProjectStatus(raw: unknown): ProjectStatus {
  const s = String(raw ?? 'active').trim()
  if (s === 'done') return 'done'
  if (s === 'paused') return 'paused'
  if (s === 'active') return 'active'
  if (s === 'planning' || s === 'review') return 'active'
  return 'active'
}

export function docToProject(d: QueryDocumentSnapshot<DocumentData>): Project {
  const x = d.data()
  const sid = x.supplierId
  const rawManual = x.manualProgressPercent
  let manualProgressPercent: number | undefined
  if (typeof rawManual === 'number' && !Number.isNaN(rawManual)) {
    manualProgressPercent = Math.min(100, Math.max(0, Math.round(rawManual)))
  }
  const rawKind = x.projectKind ?? x.type
  const type: ProjectKind =
    rawKind === 'internal' ? 'internal' : 'client'
  const rawCid = x.clientId
  const clientIdStr =
    rawCid !== undefined && rawCid !== null
      ? String(rawCid).trim()
      : ''
  const clientId = clientIdStr ? clientIdStr : undefined
  const projectType: ProjectBillingType =
    x.projectType === 'retainer' ? 'retainer' : 'one-time'
  const retainerAmount =
    typeof x.retainerAmount === 'number' && !Number.isNaN(x.retainerAmount)
      ? x.retainerAmount
      : undefined
  const subContractor =
    typeof x.subContractor === 'string' && x.subContractor.trim()
      ? x.subContractor.trim()
      : undefined
  const startDate =
    typeof x.startDate === 'string' && x.startDate.trim()
      ? x.startDate.slice(0, 10)
      : undefined
  const retainerLog = parseRetainerLog(x.retainerLog)
  const description =
    typeof x.description === 'string' && x.description.trim()
      ? x.description.trim()
      : undefined
  return {
    id: d.id,
    name: String(x.name ?? ''),
    description,
    type,
    projectType,
    retainerAmount,
    subContractor,
    startDate,
    retainerLog,
    clientId,
    supplierId: sid !== undefined && sid !== null && String(sid).trim()
      ? String(sid)
      : undefined,
    status: normalizeProjectStatus(x.status),
    priority: (x.priority ?? 'medium') as Priority,
    dueDate: String(x.dueDate ?? ''),
    ownerId: String(x.ownerId ?? ''),
    color: String(x.color ?? '#2563EB'),
    taskCount: typeof x.taskCount === 'number' ? x.taskCount : 0,
    doneCount: typeof x.doneCount === 'number' ? x.doneCount : 0,
    ...(manualProgressPercent !== undefined
      ? { manualProgressPercent }
      : {}),
    createdAt: timestampToIso(x.createdAt),
  }
}

const TASK_STATUSES: TaskStatus[] = ['todo', 'doing', 'done', 'blocked']

/** תאריך יעד למשימה — תמיכה ב-Timestamp מ-Firestore ובמחרוזת YYYY-MM-DD */
function coerceTaskDueDateYmd(raw: unknown): string {
  if (raw instanceof Timestamp) {
    return raw.toDate().toISOString().slice(0, 10)
  }
  if (typeof raw === 'string') {
    const t = raw.trim()
    const m = t.match(/^(\d{4}-\d{2}-\d{2})/)
    if (m) return m[1]!
    return ''
  }
  return ''
}

export function docToTask(d: QueryDocumentSnapshot<DocumentData>): Task {
  const x = d.data()
  const raw = (x.status ?? 'todo') as string
  const status = TASK_STATUSES.includes(raw as TaskStatus)
    ? (raw as TaskStatus)
    : 'todo'
  const cid = x.clientId
  const pid = x.projectId
  const sid = x.supplierId
  const dueHm = normalizeDueTimeHm(
    typeof x.dueTime === 'string' ? x.dueTime : undefined,
  )
  return {
    id: d.id,
    title: String(x.title ?? ''),
    description: String(x.description ?? ''),
    status,
    priority: (x.priority ?? 'medium') as Priority,
    assigneeId: String(x.assigneeId ?? ''),
    clientId: cid !== undefined && cid !== null && String(cid).trim()
      ? String(cid)
      : undefined,
    projectId: pid !== undefined && pid !== null && String(pid).trim()
      ? String(pid)
      : undefined,
    supplierId: sid !== undefined && sid !== null && String(sid).trim()
      ? String(sid)
      : undefined,
    dueDate: coerceTaskDueDateYmd(x.dueDate),
    ...(dueHm ? { dueTime: dueHm } : {}),
    reminderDate:
      typeof x.reminderDate === 'string' ? x.reminderDate : undefined,
    tags: Array.isArray(x.tags) ? x.tags.map((t) => String(t)) : [],
    reminders: parseReminders(x.reminders),
    createdAt: timestampToIso(x.createdAt),
    createdBy: String(x.createdBy ?? ''),
    sharedWithUserIds: Array.isArray(x.sharedWithUserIds)
      ? x.sharedWithUserIds.map((id: unknown) => String(id)).filter(Boolean)
      : [],
    teamWideShared:
      x.shared === true &&
      (!Array.isArray(x.sharedWithUserIds) ||
        x.sharedWithUserIds.length === 0),
    activity: [],
    manualNotes: [],
    ...(typeof x.recurringTemplateId === 'string' && x.recurringTemplateId.trim()
      ? { recurringTemplateId: x.recurringTemplateId.trim() }
      : {}),
    ...(x.recurringFrequency === 'daily' || x.recurringFrequency === 'weekly'
      ? { recurringFrequency: x.recurringFrequency }
      : {}),
  }
}

function parseUserIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((id) => String(id)).filter(Boolean)
}

export function docToMeeting(d: QueryDocumentSnapshot<DocumentData>): Meeting {
  const x = d.data()
  const cid = x.clientId
  const pid = x.projectId
  const sid = x.supplierId
  const lid = x.leadId
  const startHm = normalizeDueTimeHm(
    typeof x.startTime === 'string' ? x.startTime : undefined,
  )
  const endHm = normalizeDueTimeHm(
    typeof x.endTime === 'string' ? x.endTime : undefined,
  )
  const participants = parseUserIdList(x.participantUserIds)
  const organizer = String(x.organizerUserId ?? '').trim()
  const attendeeFromFs = parseUserIdList(x.attendeeUserIds)
  const attendeeUserIds =
    attendeeFromFs.length > 0
      ? [...new Set(attendeeFromFs)]
      : [...new Set([organizer, ...participants].filter(Boolean))]

  return {
    id: d.id,
    title: String(x.title ?? ''),
    purpose: String(x.purpose ?? ''),
    agenda: String(x.agenda ?? ''),
    startDate: coerceTaskDueDateYmd(x.startDate),
    ...(startHm ? { startTime: startHm } : {}),
    ...(endHm ? { endTime: endHm } : {}),
    location:
      typeof x.location === 'string' && x.location.trim()
        ? String(x.location).trim()
        : undefined,
    clientId: cid !== undefined && cid !== null && String(cid).trim()
      ? String(cid)
      : undefined,
    projectId: pid !== undefined && pid !== null && String(pid).trim()
      ? String(pid)
      : undefined,
    supplierId: sid !== undefined && sid !== null && String(sid).trim()
      ? String(sid)
      : undefined,
    leadId: lid !== undefined && lid !== null && String(lid).trim()
      ? String(lid)
      : undefined,
    organizerUserId: organizer,
    participantUserIds: participants,
    attendeeUserIds,
    excludeCreatorFromAttendees: x.excludeCreatorFromAttendees === true,
    createdAt: timestampToIso(x.createdAt),
    createdBy: String(x.createdBy ?? ''),
  }
}

export function taskNoteDocToTaskNote(
  d: QueryDocumentSnapshot<DocumentData>,
  taskId: string,
): TaskNote {
  const x = d.data()
  return {
    id: d.id,
    taskId,
    userId: String(x.userId ?? ''),
    userName: String(x.userName ?? ''),
    text: String(x.text ?? ''),
    createdAt: timestampToIso(x.createdAt),
  }
}

export function activityDocToTaskActivity(
  d: QueryDocumentSnapshot<DocumentData>,
  taskId: string,
): TaskActivity {
  const x = d.data()
  return {
    id: d.id,
    taskId,
    userId: String(x.userId ?? ''),
    userName: String(x.userName ?? ''),
    action: String(x.action ?? ''),
    timestamp: timestampToIso(x.createdAt ?? x.timestamp),
  }
}

export function docToSupplier(d: QueryDocumentSnapshot<DocumentData>): Supplier {
  const x = d.data()
  const activeRaw = x.active
  const active = activeRaw === false ? false : true
  return {
    id: d.id,
    name: String(x.name ?? ''),
    phone: String(x.phone ?? ''),
    email: String(x.email ?? ''),
    supplierTypes: parseFirestoreSupplierTypes(x as Record<string, unknown>),
    ...(active === false ? { active: false } : {}),
    createdAt: timestampToIso(x.createdAt),
  }
}

export function docToLead(d: QueryDocumentSnapshot<DocumentData>): Lead {
  const x = d.data()
  const rawStatus = String(x.status ?? 'new')
  /** ערכים ישנים handling / in_progress — ממופים ל־new (הסרת סטטוס «בטיפול» מהמערכת) */
  const status: Lead['status'] =
    rawStatus === 'specification' ||
    rawStatus === 'quote_sent' ||
    rawStatus === 'follow_up' ||
    rawStatus === 'no_answer' ||
    rawStatus === 'not_relevant' ||
    rawStatus === 'closed'
      ? rawStatus
      : rawStatus === 'handling' || rawStatus === 'in_progress'
        ? 'new'
        : rawStatus === 'hot'
          ? 'follow_up'
          : rawStatus === 'won'
            ? 'closed'
            : 'new'
  const activityLog = Array.isArray(x.activityLog)
    ? x.activityLog
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const o = item as Record<string, unknown>
          const text = typeof o.text === 'string' ? o.text.trim() : ''
          const at = typeof o.at === 'string' ? o.at : ''
          if (!text || !at) return null
          return {
            id: String(o.id ?? crypto.randomUUID()),
            text,
            at,
            ...(typeof o.actorName === 'string' && o.actorName.trim()
              ? { actorName: o.actorName.trim() }
              : {}),
            ...(typeof o.nextFollowUpDate === 'string' && o.nextFollowUpDate.trim()
              ? { nextFollowUpDate: o.nextFollowUpDate.slice(0, 10) }
              : {}),
          }
        })
        .filter((v): v is NonNullable<typeof v> => v !== null)
    : undefined
  const cid = x.clientId
  const clientId =
    typeof cid === 'string' && cid.trim() ? cid.trim() : undefined
  return {
    id: d.id,
    name: String(x.name ?? ''),
    company: typeof x.company === 'string' && x.company.trim() ? x.company.trim() : undefined,
    phone: typeof x.phone === 'string' && x.phone.trim() ? x.phone.trim() : undefined,
    email: typeof x.email === 'string' && x.email.trim() ? x.email.trim() : undefined,
    clientId,
    source: typeof x.source === 'string' && x.source.trim() ? x.source.trim() : undefined,
    status,
    ownerId: String(x.ownerId ?? ''),
    clientNeeds:
      typeof x.clientNeeds === 'string' && x.clientNeeds.trim()
        ? x.clientNeeds.trim()
        : typeof x.note === 'string' && x.note.trim()
          ? x.note.trim()
          : undefined,
    lastActivityText:
      typeof x.lastActivityText === 'string' && x.lastActivityText.trim()
        ? x.lastActivityText.trim()
        : undefined,
    lastActivityAt:
      typeof x.lastActivityAt === 'string' && x.lastActivityAt.trim()
        ? x.lastActivityAt
        : undefined,
    nextFollowUpDate:
      typeof x.nextFollowUpDate === 'string' && x.nextFollowUpDate.trim()
        ? x.nextFollowUpDate.slice(0, 10)
        : undefined,
    activityLog,
    quoteChannel: (() => {
      const qc = x.quoteChannel
      if (qc === 'green_invoice' || qc === 'pdf_file' || qc === 'visual_link') return qc
      return undefined
    })(),
    quotePdfUrl:
      typeof x.quotePdfUrl === 'string' && x.quotePdfUrl.trim()
        ? x.quotePdfUrl.trim()
        : undefined,
    quotePdfFileName:
      typeof x.quotePdfFileName === 'string' && x.quotePdfFileName.trim()
        ? x.quotePdfFileName.trim()
        : undefined,
    quoteVisualUrl:
      typeof x.quoteVisualUrl === 'string' && x.quoteVisualUrl.trim()
        ? x.quoteVisualUrl.trim()
        : undefined,
    quoteReturnByDate:
      typeof x.quoteReturnByDate === 'string' && x.quoteReturnByDate.trim()
        ? x.quoteReturnByDate.slice(0, 10)
        : undefined,
    notRelevantReason:
      typeof x.notRelevantReason === 'string' && x.notRelevantReason.trim()
        ? x.notRelevantReason.trim()
        : undefined,
    createdAt: timestampToIso(x.createdAt),
  }
}

const CAMPAIGN_PLATFORMS: CampaignPlatform[] = [
  'instagram',
  'google_ads',
  'facebook',
  'tiktok',
  'linkedin',
  'other',
]
const CAMPAIGN_STATUSES: CampaignStatus[] = ['planning', 'active', 'paused', 'completed']

export function docToCampaign(d: QueryDocumentSnapshot<DocumentData>): Campaign {
  const x = d.data()
  const rawPlatform = String(x.platform ?? 'other') as CampaignPlatform
  const rawStatus = String(x.status ?? 'planning') as CampaignStatus
  const resultsLog = Array.isArray(x.resultsLog)
    ? x.resultsLog
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const o = item as Record<string, unknown>
          const text = typeof o.text === 'string' ? o.text.trim() : ''
          const at = typeof o.at === 'string' ? o.at : ''
          if (!text || !at) return null
          return {
            id: String(o.id ?? crypto.randomUUID()),
            text,
            at,
            actorName:
              typeof o.actorName === 'string' && o.actorName.trim()
                ? o.actorName.trim()
                : undefined,
          }
        })
        .filter((v): v is NonNullable<typeof v> => v !== null)
    : undefined
  return {
    id: d.id,
    name: String(x.name ?? ''),
    kind: x.kind === 'internal' ? 'internal' : 'client',
    platform: CAMPAIGN_PLATFORMS.includes(rawPlatform) ? rawPlatform : 'other',
    status: CAMPAIGN_STATUSES.includes(rawStatus) ? rawStatus : 'planning',
    clientId:
      typeof x.clientId === 'string' && x.clientId.trim() ? x.clientId.trim() : undefined,
    projectId:
      typeof x.projectId === 'string' && x.projectId.trim() ? x.projectId.trim() : undefined,
    supplierId:
      typeof x.supplierId === 'string' && x.supplierId.trim() ? x.supplierId.trim() : undefined,
    performerUserId:
      typeof x.performerUserId === 'string' && x.performerUserId.trim()
        ? x.performerUserId.trim()
        : undefined,
    budget: typeof x.budget === 'number' && !Number.isNaN(x.budget) ? x.budget : undefined,
    startDate:
      typeof x.startDate === 'string' && x.startDate.trim() ? x.startDate.slice(0, 10) : undefined,
    endDate:
      typeof x.endDate === 'string' && x.endDate.trim() ? x.endDate.slice(0, 10) : undefined,
    resultsUpdate:
      typeof x.resultsUpdate === 'string' && x.resultsUpdate.trim()
        ? x.resultsUpdate.trim()
        : undefined,
    resultsLog,
    createdAt: timestampToIso(x.createdAt),
  }
}

export function docToDoc(d: QueryDocumentSnapshot<DocumentData>): Doc {
  const x = d.data()
  return {
    id: d.id,
    projectId: String(x.projectId ?? ''),
    title: String(x.title ?? ''),
    type: (x.type ?? 'note') as DocType,
    content: String(x.content ?? ''),
    authorId: String(x.authorId ?? ''),
    updatedAt: timestampToIso(x.updatedAt),
  }
}

export function docToTeamMember(
  d: QueryDocumentSnapshot<DocumentData>,
): TeamMember {
  const x = d.data()
  const rawRole = String(x.role ?? '')
  const rNorm = rawRole.trim().toLowerCase()
  const role = rNorm === 'admin' || rNorm === 'superadmin' ? 'admin' : 'employee'
  let monthlyWorkHours: number | null | undefined
  if (!Object.prototype.hasOwnProperty.call(x, 'monthlyWorkHours')) {
    monthlyWorkHours = undefined
  } else if (x.monthlyWorkHours === null) {
    monthlyWorkHours = null
  } else if (typeof x.monthlyWorkHours === 'number' && Number.isFinite(x.monthlyWorkHours)) {
    monthlyWorkHours = x.monthlyWorkHours
  } else {
    monthlyWorkHours = undefined
  }

  const scheduleDayStart =
    typeof x.scheduleDayStart === 'string' && /^\d{1,2}:\d{2}$/.test(x.scheduleDayStart.trim())
      ? x.scheduleDayStart.trim()
      : undefined
  const scheduleDayEnd =
    typeof x.scheduleDayEnd === 'string' && /^\d{1,2}:\d{2}$/.test(x.scheduleDayEnd.trim())
      ? x.scheduleDayEnd.trim()
      : undefined
  let scheduleBreakMinutes: number | null | undefined
  if (!Object.prototype.hasOwnProperty.call(x, 'scheduleBreakMinutes')) {
    scheduleBreakMinutes = undefined
  } else if (x.scheduleBreakMinutes === null) {
    scheduleBreakMinutes = null
  } else if (typeof x.scheduleBreakMinutes === 'number' && Number.isFinite(x.scheduleBreakMinutes)) {
    scheduleBreakMinutes = x.scheduleBreakMinutes
  } else {
    scheduleBreakMinutes = undefined
  }

  return {
    id: d.id,
    name: String(x.name ?? ''),
    avatar: String(x.avatar ?? '?'),
    color: String(x.color ?? '#2563EB'),
    role,
    email: typeof x.email === 'string' ? x.email : undefined,
    active: typeof x.active === 'boolean' ? x.active : true,
    monthlyWorkHours,
    scheduleDayStart,
    scheduleDayEnd,
    scheduleBreakMinutes,
  }
}

function ymdPart(value: unknown): string {
  if (typeof value !== 'string') return ''
  const p = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(p) ? p : ''
}

export function docToHostingRecord(
  d: QueryDocumentSnapshot<DocumentData>,
): HostingRecord {
  const x = d.data()
  return {
    id: d.id,
    clientId: String(x.clientId ?? ''),
    domain: String(x.domain ?? ''),
    server: String(x.server ?? ''),
    serverLocation: String(x.serverLocation ?? ''),
    controlPanel: String(x.controlPanel ?? ''),
    username: String(x.username ?? ''),
    ipAddress: String(x.ipAddress ?? ''),
    sslExpiry: ymdPart(x.sslExpiry),
    domainExpiry: ymdPart(x.domainExpiry),
    platform: String(x.platform ?? ''),
    phpVersion: String(x.phpVersion ?? ''),
    notes: String(x.notes ?? ''),
    createdAt: timestampToIso(x.createdAt),
  }
}
