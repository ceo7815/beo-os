import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore'
import { Timestamp } from 'firebase/firestore'
import type {
  Client,
  CollectionTracking,
  Doc,
  DocType,
  HostingRecord,
  Invoice,
  InvoiceStatus,
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
  return {
    id: d.id,
    clientId: String(x.clientId ?? d.id),
    lastRequestDate: String(x.lastRequestDate ?? '').slice(0, 10),
    dueDate: String(x.dueDate ?? '').slice(0, 10),
    paidDate:
      typeof pd === 'string' && pd.trim() ? String(pd).slice(0, 10) : undefined,
    note: typeof x.note === 'string' && x.note.trim() ? String(x.note) : undefined,
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
    status: (x.status ?? 'planning') as ProjectStatus,
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

export function docToTask(d: QueryDocumentSnapshot<DocumentData>): Task {
  const x = d.data()
  const raw = (x.status ?? 'todo') as string
  const status = TASK_STATUSES.includes(raw as TaskStatus)
    ? (raw as TaskStatus)
    : 'todo'
  const cid = x.clientId
  const pid = x.projectId
  const sid = x.supplierId
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
    dueDate: String(x.dueDate ?? ''),
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
  return {
    id: d.id,
    name: String(x.name ?? ''),
    phone: String(x.phone ?? ''),
    email: String(x.email ?? ''),
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
  return {
    id: d.id,
    name: String(x.name ?? ''),
    avatar: String(x.avatar ?? '?'),
    color: String(x.color ?? '#2563EB'),
    role: String(x.role ?? ''),
    email: typeof x.email === 'string' ? x.email : undefined,
    active: typeof x.active === 'boolean' ? x.active : true,
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
