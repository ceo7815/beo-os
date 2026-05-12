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

/** מעקב גבייה ללקוח (מקור: חשבונית ירוקה חיצונית — כאן רק מעקב) */
export interface CollectionTracking {
  /** מזהה מסמך = clientId */
  id: string
  clientId: string
  lastRequestDate: string
  dueDate: string
  paidDate?: string
  note?: string
  /** איך בוצעה דרישת התשלום האחרונה (טקסט חופשי) */
  lastDemandMethod?: string
  /** מענה הלקוח לאחר הדרישה (טקסט חופשי) */
  lastDemandClientReply?: string
  /** מתי נרשמה דרישת התשלום האחרונה (ISO — תאריך ושעה) */
  lastDemandRecordedAt?: string
  createdAt: string
  updatedAt: string
}

export type ClientStatus = 'active' | 'inactive'
export type ProjectKind = 'client' | 'internal'
/** חד־פעמי מול שוטף (Retainer) */
export type ProjectBillingType = 'one-time' | 'retainer'

export interface RetainerEntry {
  id: string
  /** פורמט YYYY-MM */
  month: string
  note: string
  createdAt: string
}

/** פעיל · מושהה · הושלם (ערכים ישנים ב-Firestore ממופים בצד הלקוח ל־active) */
export type ProjectStatus = 'active' | 'paused' | 'done'
export type Priority = 'high' | 'medium' | 'low'
export type TaskStatus = 'todo' | 'doing' | 'done' | 'blocked'

/** משימה קבועה — יומי או שבועי ביום קבוע */
export type TaskRecurrence = 'daily' | 'weekly'

/** תבנית משימה קבועה — נשמר ב־`recurringTaskTemplates` */
export interface RecurringTaskTemplate {
  id: string
  title: string
  description: string
  assigneeId: string
  frequency: TaskRecurrence
  /** 0–6 כמו Date#getDay() — רק ל־weekly */
  weeklyDayOfWeek?: number
  priority: Priority
  clientId?: string
  projectId?: string
  supplierId?: string
  tags: string[]
  active: boolean
  createdAt: string
  createdBy: string
}
export type LeadStatus =
  | 'new'
  | 'specification'
  | 'quote_sent'
  | 'follow_up'
  | 'closed'

/** אופן שליחת הצעת המחיר כשהסטטוס «נשלחה הצעת מחיר» */
export type LeadQuoteChannel = 'green_invoice' | 'pdf_file' | 'visual_link'
export type CampaignPlatform =
  | 'instagram'
  | 'google_ads'
  | 'facebook'
  | 'tiktok'
  | 'linkedin'
  | 'other'
export type CampaignKind = 'internal' | 'client'
export type CampaignStatus = 'planning' | 'active' | 'paused' | 'completed'

export interface Supplier {
  id: string
  name: string
  phone: string
  email: string
  /** סוגים מקצועיים — מ־SUPPLIER_TYPE_OPTIONS (מערך) */
  supplierTypes?: string[]
  /** ברירת מחדל למסמכים ישנים: פעיל */
  active?: boolean
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
  /** קישור לתבנית משימה קבועה — בעת סימון «הושלם» נוצרת משימה חדשה לפי התבנית */
  recurringTemplateId?: string
  /** עותק לתצוגה — מתעדכן מן התבנית בכל מופע */
  recurringFrequency?: TaskRecurrence
}

/** תאימות למודול Kanban */
export type BoardTask = Task
export type BoardTaskStatus = TaskStatus

export type DocType = 'spec' | 'meeting' | 'brief' | 'note'

/** אופן התחברות לפריט בכספת — `google` = ללא סיסמה שמורה (כניסה עם חשבון Google) */
export type VaultLoginType = 'password' | 'google'

/** רשומה בכספת סיסמאות — אוסף Firestore `passwords_vault` */
export interface PasswordVaultEntry {
  id: string
  title: string
  category: string
  username: string
  password: string
  /** ברירת מחדל למסמכים ישנים: password */
  loginType: VaultLoginType
  url: string
  notes: string
  /** משתמשים (uid) שרשאים לצפות בפריט ובסיסמה; ריק = רק אדמינים */
  visibleUserIds: string[]
  /** מזהה לקוח ב-`clients` (אופציונלי) */
  clientId: string
  updatedBy: string
  updatedAt: string
}

/** נתונים לשמירה ב-Firestore — `updatedBy` נקבע בשרת/הוק לפי המשתמש המחובר */
export type PasswordVaultWrite = Omit<PasswordVaultEntry, 'id' | 'updatedAt' | 'updatedBy'>

export interface TeamMember {
  id: string
  name: string
  avatar: string
  color: string
  role: string
  email?: string
  active?: boolean
  /** יעד שעות עבודה בחודש קלנדרי — מוגדר ע״י אדמין (לשכר / תכנון) */
  monthlyWorkHours?: number | null
  /** מועדי יום עבודה מקובלים (שעון מקומי HH:mm) — לאימות כניסה/יציאה */
  scheduleDayStart?: string | null
  scheduleDayEnd?: string | null
  scheduleBreakMinutes?: number | null
}

export interface Lead {
  id: string
  name: string
  company?: string
  phone?: string
  email?: string
  /** שיוך אופציונלי לכרטיס לקוח קיים במערכת (לא נשמר אם ריק) */
  clientId?: string
  source?: string
  status: LeadStatus
  ownerId: string
  clientNeeds?: string
  lastActivityText?: string
  lastActivityAt?: string
  nextFollowUpDate?: string
  activityLog?: Array<{
    id: string
    text: string
    at: string
    actorName?: string
    nextFollowUpDate?: string
  }>
  /** פרטי שליחת הצעה — רלוונטי ל־quote_sent */
  quoteChannel?: LeadQuoteChannel
  quotePdfUrl?: string
  quotePdfFileName?: string
  quoteVisualUrl?: string
  /** תאריך יעד לחזרה ללקוח בנוגע להצעת המחיר — נשמר בעת מעבר ל־quote_sent */
  quoteReturnByDate?: string
  createdAt: string
}

export interface Campaign {
  id: string
  name: string
  kind: CampaignKind
  platform: CampaignPlatform
  status: CampaignStatus
  clientId?: string
  projectId?: string
  supplierId?: string
  performerUserId?: string
  budget?: number
  startDate?: string
  endDate?: string
  resultsUpdate?: string
  resultsLog?: Array<{
    id: string
    text: string
    at: string
    actorName?: string
  }>
  createdAt: string
}

/**
 * מסמך Firestore: `attendanceConfig/clockify` — מפתח Clockify ו־Workspace (עריכה רק לאדמין ב-rules).
 * קריאות ל-Clockify עוברות דרך Cloud Function `clockifyProxy`.
 */
export interface ClockifyIntegrationConfig {
  apiKey?: string
  workspaceId?: string
  /** לדוגמה: https://api.clockify.me/api/v1 */
  apiBaseUrl?: string
  updatedAt?: string
}

/** מסמך `attendanceConfig/settings` — workspaceId בלבד (ללא מפתח); קריאה לכל משתמש מחובר */
export interface ClockifyPublicSettings {
  workspaceId?: string
  updatedAt?: string
}

export interface Client {
  id: string
  name: string
  contact: string
  phone: string
  email: string
  /** מחלקה / קטגוריה ארגונית (לדוחות גבייה ודשבורד). `null` בשרת = נוקה במסמך */
  department?: string | null
  status: ClientStatus
  createdAt: string
}

/** רשומה במאגר אחסון — מידע בלבד (ללא תשלומים) */
export interface HostingRecord {
  id: string
  clientId: string
  domain: string
  server: string
  serverLocation: string
  controlPanel: string
  username: string
  ipAddress: string
  sslExpiry: string
  domainExpiry: string
  platform: string
  phpVersion: string
  notes: string
  createdAt: string
}

export interface Project {
  id: string
  name: string
  /** תיאור קצר — מוצג בכרטיס הפרויקט */
  description?: string
  type: ProjectKind
  /** חד־פעמי (ברירת מחדל) או שוטף */
  projectType?: ProjectBillingType
  /** סכום חודשי בש״ח — רלוונטי ל־retainer */
  retainerAmount?: number
  /** ספק משנה (טקסט חופשי) */
  subContractor?: string
  /** תחילת ההתקשרות — רלוונטי ל־retainer */
  startDate?: string
  /** יומן עדכונים חודשיים */
  retainerLog?: RetainerEntry[]
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
