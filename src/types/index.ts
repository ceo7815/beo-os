export type InvoiceStatus = 'pending' | 'paid' | 'overdue'

export interface Invoice {
  id: string
  clientId: string
  invoiceNumber: string
  amount: number
  dueDate: string
  paidDate?: string
  status: InvoiceStatus
  note?: string
  createdAt: string
}

export type ClientStatus = 'active' | 'inactive'
export type ProjectKind = 'client' | 'internal'
export type ProjectStatus = 'planning' | 'active' | 'review' | 'done'
export type Priority = 'high' | 'medium' | 'low'
export type TaskStatus = 'todo' | 'doing' | 'done' | 'blocked'

export interface Supplier {
  id: string
  name: string
  phone: string
  email: string
  createdAt: string
}

export interface TaskActivity {
  id: string
  taskId: string
  userId: string
  userName: string
  action: string
  timestamp: string
}

/** הערה ידנית בתת-אוסף `tasks/{id}/taskNotes` */
export interface TaskNote {
  id: string
  taskId: string
  userId: string
  userName: string
  text: string
  createdAt: string
}

export interface TaskReminderEntry {
  id: string
  at: string
}

/** משימה — מסמך Firestore `tasks` + תת-אוסף `activity` */
export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: Priority
  assigneeId: string
  /** לקוח (אופציונלי) — נפרד מפרויקט */
  clientId?: string
  projectId?: string
  supplierId?: string
  dueDate: string
  reminderDate?: string
  tags: string[]
  reminders: TaskReminderEntry[]
  createdAt: string
  createdBy: string
  /**
   * עובדים שנבחרו לשיתוף המשימה לביצוע (מופיעים בעמודה «משותפות לביצוע»).
   */
  sharedWithUserIds: string[]
  /**
   * תאימות לאחור: `shared: true` ב-Firestore בלי רשימה — גלוי לכל העובדים.
   */
  teamWideShared?: boolean
  activity: TaskActivity[]
  /** הערות שוטף — מוזג מתת-אוסף taskNotes */
  manualNotes: TaskNote[]
}

/** תאימות למודול Kanban */
export type BoardTask = Task
export type BoardTaskStatus = TaskStatus

export type DocType = 'spec' | 'meeting' | 'brief' | 'note'

export interface TeamMember {
  id: string
  name: string
  avatar: string
  color: string
  role: string
  email?: string
  active?: boolean
}

export interface Client {
  id: string
  name: string
  contact: string
  phone: string
  email: string
  status: ClientStatus
  createdAt: string
}

export interface Project {
  id: string
  name: string
  type: ProjectKind
  /** לפרויקט לקוח — חובה; לפרויקט פנימי — אופציונלי */
  clientId?: string
  /** ספק ביצוע (אופציונלי) */
  supplierId?: string
  status: ProjectStatus
  priority: Priority
  dueDate: string
  ownerId: string
  color: string
  taskCount: number
  doneCount: number
  /**
   * אחוז התקדמות 0–100 שהוזן ידנית.
   * כשלא מוגדר — האחוז מחושב ממשימות (בוצעו/סה״כ).
   */
  manualProgressPercent?: number
  createdAt: string
}

export interface Doc {
  id: string
  projectId: string
  title: string
  type: DocType
  content: string
  authorId: string
  updatedAt: string
}

export type ToastType = 'success' | 'error'

export interface ToastMessage {
  id: string
  message: string
  type: ToastType
}

export type HubCurrentUser = { uid: string } & Record<string, unknown>

export interface HubStore {
  docs: Doc[]

  currentUser: HubCurrentUser | null
  setCurrentUser: (user: HubCurrentUser | null) => void

  selectedProjectId: string | null
  selectedClientId: string | null

  toasts: ToastMessage[]
  pushToast: (message: string, type: ToastType) => void
  dismissToast: (id: string) => void

  addDoc: (data: Omit<Doc, 'id' | 'updatedAt'>) => void
  updateDoc: (id: string, data: Partial<Doc>) => void
  patchDocContent: (id: string, content: string) => void
  deleteDoc: (id: string) => void

  setSelectedProject: (id: string | null) => void
  setSelectedClient: (id: string | null) => void
}
