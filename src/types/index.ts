export type InvoiceStatus = 'pending' | 'paid' | 'overdue'

/** סטטוס הכנסה במודול פיננסים */
export type FinanceIncomeStatus = 'paid' | 'pending' | 'overdue' | 'partial'

export type FinancePaymentMethod = 'bank_transfer' | 'credit_card'

/** תשלום בודד על הכנסה */
export interface FinanceIncomePaymentRecord {
  id: string
  amount: number
  paymentMethod: FinancePaymentMethod
  /** YYYY-MM-DD */
  paidDate: string
  createdAt?: string
}

/** תשלום צפוי בודד בגבייה — לתחזית תזרim */
export interface FinanceExpectedCollection {
  id: string
  /** YYYY-MM-DD */
  expectedDate: string
  amount: number
}

/** סוג הכנסה ללא פרויקט — אחסון / פורטל */
export type FinanceHostingType = 'monthly' | 'yearly' | 'portal_monthly'

/**
 * סוגי מסמך הכנסה — תואם לחשבונית ירוקה (Morning).
 * ערכים ישנים (tax_receipt / transaction_invoice) מנורמלים ב-mapper.
 */
export type FinanceIncomeDocumentKind =
  | 'tax_invoice_receipt' // 320 חשבונית מס קבלה
  | 'tax_invoice' // 305 חשבונית מס
  | 'receipt' // 400 קבלה
  | 'transaction_account' // 300 חשבון עסקה (גבייה)
  | 'credit_invoice' // 330 חשבונית זיכוי
  /** @deprecated — השתמשו ב-tax_invoice_receipt */
  | 'tax_receipt'
  /** @deprecated — השתמשו ב-transaction_account */
  | 'transaction_invoice'

/** מקור ההכנסה — ידני (היסטורי) או חשבונית ירוקה (מקור האמת) */
export type FinanceIncomeSource = 'manual' | 'green_invoice'

/** הכנסה במודול פיננסים — אדמין בלבד */
export interface FinanceIncome {
  id: string
  /** ריק כש־hostingClient — הכנסת אחסון ללא פרויקט */
  projectId: string
  clientId: string
  amount: number
  /** true = הסכום שנשמר כולל מע״מ (ברירת מחדל) */
  amountIncludesVat?: boolean
  /** סכום מע״מ ₪ */
  vatAmount?: number
  /** לפני מע״מ ₪ */
  amountBeforeVat?: number
  /** חשבונית מס קבלה (בפועל) או חשבונית עסקה (פתוחה) — ברירת מחדל לרשומות ישנות: עסקה */
  documentKind?: FinanceIncomeDocumentKind
  /** מספר המסמך — מס קבלה או חשבונית עסקה לפי documentKind */
  invoiceNumber: string
  /** YYYY-MM-DD — תאריך המסמך */
  invoiceDate: string
  /** כשנוצרה מס קבלה מהמרה ידנית של חשבונית עסקה */
  sourceTransactionInvoiceId?: string
  description?: string
  status: FinanceIncomeStatus
  /** סכום ששולם בפועל (כולל מע״מ) — רלוונטי ל־paid / partial */
  paidAmount?: number
  paymentMethod?: FinancePaymentMethod
  /** YYYY-MM-DD — מתי התקבל התשלום */
  paidDate?: string
  /** YYYY-MM-DD — תאריך צפי לכניסת כסף (גבייה / תזרim, ידני) */
  expectedPaymentDate?: string
  /** לוח תשלומים צפוי — חלוקה לכמה תאריכים (תזרim) */
  expectedPaymentSchedule?: FinanceExpectedCollection[]
  /** היסטוריית תשלומים (תשלום ראשון + תשלומים נוספים) */
  payments?: FinanceIncomePaymentRecord[]
  /** ריטיינר חודשי — חוזר בכל חודש מהתחלה ועד סוף אותה שנה */
  monthlyRetainer?: boolean
  /** הכנסה מלקוח אחסון — ללא פרויקט מקושר */
  hostingClient?: boolean
  /** monthly = חוזר כל חודש · yearly = חד־פעמי לשנה */
  hostingType?: FinanceHostingType
  /** שיוך לבנק שעות (HourlyService) של הלקוח */
  hourlyServiceId?: string
  createdAt: string
  /** הרחבה לתצוגה — מופע חודשי של ריטיינר */
  isAutoOccurrence?: boolean
  sourceInvoiceDate?: string
  /** מקור הרשומה — 'green_invoice' = סונכרן מחשבונית ירוקה (קריאה בלבד) */
  source?: FinanceIncomeSource
  /** מזהה המסמך בחשבונית ירוקה */
  greenInvoiceId?: string
  /** קוד סוג המסמך בחשבונית ירוקה (320 / 305 / 400 ...) */
  greenInvoiceType?: number
  /** קוד סטטוס המסמך בחשבונית ירוקה — 0 פתוח · 1 סגור · 2 נסגר ידנית · 3/4 מבוטל */
  greenInvoiceStatus?: number
  /** מספר המסמך בחשבונית ירוקה */
  greenInvoiceNumber?: string
  /** שם הלקוח כפי שמופיע בחשבונית ירוקה (לרשומות ללא התאמה ללקוח) */
  greenInvoiceClientName?: string
  /** ISO — מתי סונכרן לאחרונה מחשבונית ירוקה */
  syncedAt?: string
}

/** יתרת עובר ושב נוכחית — מודול תזרim */
export interface FinanceCashflowState {
  balance: number
  /** YYYY-MM-DD */
  asOfDate: string
  updatedAt: string
  updatedBy?: string
}

/** snapshot יומי של יתרה */
export interface FinanceCashflowBalanceSnapshot {
  id: string
  balance: number
  /** YYYY-MM-DD */
  asOfDate: string
  createdAt: string
  createdBy?: string
}

/** cache הוראת קבע מ-GI */
export interface FinanceGiRecurringPayment {
  id: string
  greenInvoiceId: string
  clientName: string
  clientId?: string
  amount: number
  /** 1 / 2 / 3 / 12 חודשים */
  intervalMonths: number
  status: string
  /** YYYY-MM-DD */
  nextChargeDate?: string
  startDate?: string
  endDate?: string
  syncedAt?: string
}

/** cache ריטיינר מ-GI */
export interface FinanceGiRetainer {
  id: string
  greenInvoiceId: string
  clientName: string
  clientId?: string
  amount: number
  /** 1m / 2m / 3m / 6m / 1y */
  interval: string
  status: string
  nextJobDate?: string
  startDate?: string
  endDate?: string
  syncedAt?: string
}

/** ערכי אומדן מע״מ לתזרים — סכום ניתן לעריכה ידנית */
export interface FinanceCashflowVatEstimate {
  /** מזהה = YYYY-MM של חודש המע״מ */
  id: string
  vatYm: string
  amount: number
  notes?: string
  updatedAt: string
  updatedBy?: string
}

/** הוצאה קבועה מאושרת — קטלוג עסקי לתזרים (לא תלוי ב-recurring על רשומות בנק) */
export interface FinanceFixedExpenseCatalogItem {
  id: string
  type: string
  name: string
  amount: number
  paymentMethod: FinancePaymentMethod
  /** יום יציאה מהבנק בחודש החיוב — רלוונטי להעברה בנקאית */
  dayOfMonth: number
  amountIncludesVat?: boolean
}

/** הוצאה צפויה ידנית — מודול תזרim בלבד (לא מספר הוצאה בפיננסים) */
export interface FinanceCashflowExpectedExpense {
  id: string
  name: string
  amount: number
  /** YYYY-MM-DD — מועד יציאה צפוי מהבנק */
  expectedDate: string
  paymentMethod: FinancePaymentMethod
  notes?: string
  createdAt: string
  createdBy?: string
}

export type FinanceExpenseFieldMode = 'none' | 'supplier' | 'platform' | 'salary'
export type FinanceExpensePnlCategory = 'fixed' | 'supplier' | 'platform'

/** סיווג מע״מ להוצאה — חשבונאי */
export type FinanceExpenseVatClass =
  | 'vat_liable' /** תשומות — חייב מע״מ, ניתן לקיזוז */
  | 'statutory' /** חוקי — ביטוח לאומי, מס הכנסה, מע״מ לתשלום */
  | 'exempt_supplier' /** ספק פטור — ללא מע״מ */

/** הגדרת סוג הוצאה — מובנים + מותאמים אישית ב-Firestore */
export interface FinanceExpenseTypeDef {
  id: string
  label: string
  color: string
  fieldMode: FinanceExpenseFieldMode
  /** חוזר אוטומטית בכל חודש מהתחלה ועד סוף אותה שנה */
  autoRecurring: boolean
  pnlCategory: FinanceExpensePnlCategory
  builtIn?: boolean
  createdAt?: string
}

/** מזהה סוג — מובנה (fixed/supplier/platform) או מזהה מסמך מותאם */
export type FinanceExpenseTypeId = string

export type FinanceExpenseSource = 'manual' | 'bank_import' | 'green_invoice'

export type GiExpenseDocKind = 'invoice' | 'receipt' | 'invoice_receipt' | 'other'

export type ExpenseReconciliationStatus =
  | 'matched'
  | 'bank_missing_document'
  | 'gi_unpaid'
  | 'document_not_required'
  | 'manual_ok'
  | 'manual_pending'
  /** החיוב בוטל בזיכוי מלא — אין מה לגבות בחשבונית */
  | 'refunded'

/** הוצאה במודול פיננסים — אדמין בלבד */
export interface FinanceExpense {
  id: string
  /** אופציונלי — שיוך ישיר ללקוח */
  clientId?: string
  /** אופציונלי — הוצאה כללית ללא פרויקט */
  projectId?: string
  type: FinanceExpenseTypeId
  /** קישור לספק רשמי במערכת */
  supplierId?: string
  /** שם מסונכרן — לתצוגה / רשומות ישנות */
  supplierName?: string
  /** ח.פ / ע.מ של הספק — מיובא מהבנק או מ-GI */
  supplierTaxId?: string
  platformName?: string
  /** שם ההוצאה — לזיהוי מהיר (למשל שכירות, Google Ads) */
  name?: string
  /** שם העובד — רלוונטי להוצאות משכורת */
  employeeName?: string
  amount: number
  /** @deprecated — השתמשו ב-vatClass */
  vatLiable?: boolean
  /** סיווג מע״מ: תשומות / חוקי / פטור */
  vatClass?: FinanceExpenseVatClass
  /** true = הסכום שהוזן/נשמר כולל מע״מ (ברירת מחדל) */
  amountIncludesVat?: boolean
  /** סכום מע״מ ₪ */
  vatAmount?: number
  /** לפני מע״מ ₪ */
  amountBeforeVat?: number
  description?: string
  recurring: boolean
  /** אמצעי תשלום — עו״ש / כרטיס אשראי */
  paymentMethod?: FinancePaymentMethod
  /** YYYY-MM-DD — תאריך תשלום בפועל (מהבנק) */
  paidDate?: string
  /**
   * YYYY-MM-DD — מועד ירידת הכסף מהחשבון.
   * בכרטיס אשראי זה מועד החיוב המרוכז, שאינו זהה לתאריך העסקה.
   */
  chargeDate?: string
  /** אסמכתא ייחודית מקובץ הבנק — למניעת ייבוא כפול */
  bankRef?: string
  /** true = הוצאת אחסון (שרתים/דומיינים) — משויכת ל"אחסון אתרים" הפיננסי */
  hostingExpense?: boolean
  /** YYYY-MM — חודש תשלום בפועל */
  billingMonth: string
  /** YYYY-MM — חודש לרווח והפסד (כשמקושר לפרויקט/עסקה) */
  pnlMonth?: string
  /** הכנסה/עסקה שאליה משויכת ההוצאה לצורכי רווח והפסד */
  linkedIncomeId?: string
  /** האם התקבלה חשבונית (כל סוגי ההוצאות) */
  supplierInvoiceReceived?: boolean
  /** מקור הרשומה — ידני / ייבוא בנק / חשבונית ירוקה */
  source?: FinanceExpenseSource
  /** מזהה הוצאה בחשבונית ירוקה */
  greenInvoiceId?: string
  /** קוד סוג מסמך ב-GI (10 חשבונית · 20 קבלה · 30 חשבונית+קבלה · 40 אחר) */
  greenInvoiceDocType?: number
  greenInvoiceDocKind?: GiExpenseDocKind
  greenInvoiceNumber?: string
  greenInvoiceSupplierName?: string
  greenInvoiceSupplierTaxId?: string
  /** קישור בין תשלום בנק לרשומת GI (מזהה מסמך Firestore) */
  matchedExpenseId?: string
  linkedGreenInvoiceId?: string
  reconciliationStatus?: ExpenseReconciliationStatus
  syncedAt?: string
  /** מטבע המסמך המקורי כשאינו שקל */
  currency?: string
  originalAmount?: number
  /** הסכום בשקלים הוא הערכה עד להתאמה מול שורת האשראי */
  amountIsEstimate?: boolean
  /** מספר חשבונית הספק */
  invoiceNumber?: string
  /** קישור לחשבונית הספק השמורה — ההוכחה שהתשלום מתועד */
  documentUrl?: string
  /** שם הקובץ המקורי, לתצוגה ולזיהוי */
  documentFileName?: string
  /** ISO — מתי הוצמדה החשבונית לתשלום */
  documentAttachedAt?: string
  /**
   * מזהה החיוב שהזיכוי הזה מבטל.
   * קיים רק על רשומות זיכוי (amount שלילי) — שתי התנועות נשמרות בנפרד
   * כדי שהספרים יישארו זהים לדף הבנק, והקישור מראה שהצמד מתאפס.
   */
  refundForExpenseId?: string
  /** YYYY-MM-DD — תאריך המסמך, קובע את חודש הרווח וההפסד */
  documentDate?: string
  /** YYYY-MM — החודש שאליו המסמך שייך כלכלית, גם כשהוא נעול */
  documentMonth?: string
  /** המסמך הגיע אחרי שחודשו כבר נדווח, ולכן נספר בחודש הפתוח */
  isLateDocument?: boolean
  /** הערה ידנית על השורה — מוצגת בבולטות במסך ההוצאות */
  expenseNote?: string
  /** מספר חודשים לפריסת תשלום מראש — שורה אחת, תצוגה חודשית */
  spreadMonths?: number
  /** YYYY-MM — תחילת הפריסה; ברירת מחדל היא חודש החיוב */
  spreadStartMonth?: string
  createdAt: string
  /** הרחבה לתצוגה — הוצאה קבועה/חוזרת לחודש אחר */
  isAutoOccurrence?: boolean
  sourceBillingMonth?: string
  /** הרחבה לתצוגה — מוצגת בחודש רווח והפסד שונה מתשלום */
  isPnlAttribution?: boolean
  /** הרחבה לתצוגה — מנה חודשית מתוך תשלום פרוס */
  isSpreadOccurrence?: boolean
  spreadIndex?: number
}

export interface Invoice {
  id: string
  clientId: string
  /** מספר חשבונית מס (חובה במסלול תשלומי עסקה) */
  invoiceNumber: string
  /** סכום כולל מע״מ (₪) */
  amount: number
  dueDate: string
  paidDate?: string
  status: InvoiceStatus
  note?: string
  createdAt: string
  /** קישור לעסקה במסלול ניהול עסקאות — לדוחות אדמין */
  dealId?: string
  /**
   * אחוז עמלה לסוכן על חשבונית זו בלבד (0–100).
   * כשחסר — משתמשים באחוז מפרופיל המשתמש בפורטל הסוכן.
   */
  agentCommissionPercent?: number
}

/** תשלום עמלה לסוכן — אחרי תקבול מהלקוח (נפרד מרישום תקבול ב־invoices) */
export interface AgentCommissionPayment {
  id: string
  agentUserId: string
  amount: number
  /** YYYY-MM-DD */
  paidDate: string
  note?: string
  clientId?: string
  dealId?: string
  createdAt: string
  createdBy: string
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
  | 'no_answer'
  | 'not_relevant'
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
  /** שעת יעד אופציונלית (HH:mm, 24 שעות) — מוצג לצד תאריך היעד */
  dueTime?: string
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

/**
 * פגישה / יומן — אוסף Firestore `meetings`.
 * `attendeeUserIds` — מי רואה ביומן (array-contains); בדרך כלל יוצר + מאורגן + משתתפים.
 * `excludeCreatorFromAttendees` — היוצר לא נכלל (פגישה בשם עובד/גורם חיצוני בלבד).
 */
export interface Meeting {
  id: string
  title: string
  /** מטרת הפגישה */
  purpose: string
  /** תוכן / סדר יום */
  agenda: string
  /** תאריך התחלה YYYY-MM-DD */
  startDate: string
  /** שעת התחלה HH:mm (אופציונלי) */
  startTime?: string
  /** שעת סיום HH:mm (אופציונלי) */
  endTime?: string
  location?: string
  clientId?: string
  projectId?: string
  supplierId?: string
  leadId?: string
  organizerUserId: string
  participantUserIds: string[]
  attendeeUserIds: string[]
  /** כש-true — יוצר הפגישה לא ב-attendeeUserIds (לא ביומן שלו, לא מקבל מייל הזמנה) */
  excludeCreatorFromAttendees?: boolean
  createdBy: string
  createdAt: string
  /** סגירת פגישה — כל משתמש מחובר יכול לסמן הסתיימה ולהזין סיכום */
  completed?: boolean
  /** טקסט סיכום לאחר סגירה */
  completionSummary?: string
  /** מועד סגירה (ISO) */
  completedAt?: string
  completedByUserId?: string
  completedByName?: string
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
  /** סוכן מכירות — פורטל לקוחות משויכים (לא חל על אדמין) */
  isAgent?: boolean
  /** אחוז עמלה 0–100 על הכנסות חודשיות מחשבוניות ששולמו (אופציונלי ב־Firestore) */
  agentCommissionPercent?: number
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
  /** סוכן שקיבל/מלווה את ההצעה — מוצג בפורטל סוכן */
  salesAgentUserId?: string
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
  /** נדרש כש־status הוא «לא רלוונטי» — הסבר למה */
  notRelevantReason?: string
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
  /** סוכן מכירות אחראי על הלקוח — לפורטל סוכנים ולעמלות */
  salesAgentUserId?: string
  /** עובדים (uids ב־`users`) המשויכים ללקוח — מוצג בפורטל סוכן ובטופס לקוח */
  assignedEmployeeUserIds?: string[]
  /** שם חברה רשמי / מותג — אופציונלי (אשף עסק חדש) */
  legalName?: string
  /** ח.פ / עוסק מורשה */
  taxId?: string
  addressLine?: string
  city?: string
  /** הערות פנימיות על העסק */
  businessNotes?: string
  /** יתרת חוב פתוחה מהכנסות (תשלום חלקי) — ₪ */
  financeBalance?: number
  /** מזהה הלקוח בחשבונית ירוקה — כשסונכרן משם */
  greenInvoiceId?: string
  /** מקור הלקוח — 'green_invoice' = סונכרן מחשבונית ירוקה */
  source?: 'manual' | 'green_invoice'
}

/** סוג עסקה במסלול ניהול אדמין — `deals` */
export type DealKind = 'retainer_monthly' | 'retainer_yearly' | 'one_time'

export type DealStatus = 'active' | 'completed' | 'cancelled'

/** תשלום מתוכנן בעסקה — צפי תאריך + סכום (מקור לחישוב הכנסה משוערת לפי חודש) */
export interface DealScheduledPayment {
  id: string
  /** YYYY-MM-DD */
  expectedPaymentYmd: string
  amount: number
  label?: string
}

export interface Deal {
  id: string
  clientId: string
  /** ליד מקורי — לסנכרון מסלול מכירות */
  leadId?: string
  /** עותק לשאילתות; בדרך כלל זהה ל־clients.salesAgentUserId */
  salesAgentUserId?: string
  dealKind: DealKind
  /** כותרת פנימית לעסקה */
  title: string
  /**
   * סכום מוסכם בש״ח: חודשי לריטיינר חודשי, שנתי לריטיינר שנתי, סכום כולל לחד־פעמי.
   */
  agreedAmount?: number
  /** חד־פעמי: תאריך משוער לתשלום/סיום — ההכנסה המשוערת תופיע בחודש זה בלבד */
  expectedPaymentYmd?: string
  /** ריטיינר שנתי: תאריך חיוב שנתי קבוע (חודש+יום חוזרים כל שנה) */
  annualBillingYmd?: string
  /** ריטיינר חודשי: תאריך ראשון לתשלום — ההכנסה המשוערת מחודש זה ואילך */
  firstPaymentYmd?: string
  /** עסקת אחסון (אתר/שרת) — חובה תאריך תשלום ראשון לחישוב הכנסה ועמלה */
  isHostingDeal?: boolean
  /** לוח תשלומים — כל שורה נספרת בחודש של תאריך הצפי */
  scheduledPayments?: DealScheduledPayment[]
  /** אחוז עמלת סוכן על תשלומים הקשורים לעסקה (מועתק לחשבונית בעת רישום תשלום) */
  commissionPercent: number
  status: DealStatus
  notes?: string
  createdAt: string
  updatedAt?: string
  createdByUserId?: string
}

/** סוג שרת האחסון */
export type HostingServerType = 'shared' | 'private'

/** מי מנהל את הדומיין */
export type DomainManager = 'agency' | 'client' | 'external'

/** מחזור חיוב לאחסון / רטיינר */
export type HostingBillingCycle = 'monthly' | 'yearly' | 'biennial' | 'oneTime'

/**
 * רשומה במאגר אחסון ודומיינים — אתר אחד.
 * מקשרת אתר ללקוח עם כל פרטי השרת, הדומיין, מועדי החידוש והרטיינר.
 */
export interface HostingRecord {
  id: string
  /** שיוך ללקוח (חובה) */
  clientId: string
  /** דומיין ראשי / כתובת האתר */
  domain: string
  /** שם תצוגה ידידותי (אופציונלי) */
  siteName: string

  // ── שרת ואחסון ──
  /** אחסון שיתופי או שרת פרטי */
  serverType: HostingServerType
  /** ספק/שם השרת (Hostinger, AWS, שרת פרטי…) */
  serverProvider: string
  /** מיקום השרת (ישראל / חו״ל / דאטה־סנטר) */
  serverLocation: string
  /** תאריך תשלום/חידוש אחסון (YYYY-MM-DD) */
  hostingRenewalDate: string
  /** מחזור חיוב אחסון */
  hostingCycle: HostingBillingCycle

  // ── דומיין ──
  /** רשם הדומיינים (GoDaddy, Cloudflare, Hostinger…) */
  registrar: string
  /** מי מנהל את הדומיין */
  domainManager: DomainManager
  /** הערה על מנהל הדומיין כשהוא חיצוני (שם/חברה) */
  domainManagerNote: string
  /** תאריך חידוש דומיין (YYYY-MM-DD) */
  domainRenewalDate: string

  // ── חיוב / רטיינר ──
  /** האם קיים רטיינר אוטומטי בחשבונית ירוקה */
  greenInvoiceRetainer: boolean
  /** סכום הרטיינר בש״ח (אם קיים) */
  retainerAmount?: number
  /** מחזור חיוב הרטיינר */
  retainerCycle: HostingBillingCycle

  // ── טכני (אופציונלי) ──
  sslExpiry: string
  ipAddress: string
  controlPanel: string
  username: string
  platform: string
  phpVersion: string

  notes: string
  createdAt: string
  updatedAt: string
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
  /** תקציב כולל לפרויקט (₪) — מודול פיננסים */
  budgetTotal?: number
  /** אחוז ניצול תקציב 0–100 — מודול פיננסים */
  budgetUsedPercent?: number
  createdAt: string
}

/** סטטוס חשבון שירות שעות */
export type HourlyServiceStatus = 'active' | 'paused' | 'closed'

/** סוג שירות שעות */
export type HourlyServiceKind =
  | 'development'
  | 'support'
  | 'maintenance'
  | 'consulting'

/** קטגוריית עבודה ברשומת שעות */
export type HourlyWorkCategory =
  | 'development'
  | 'support'
  | 'meeting'
  | 'documentation'
  | 'qa'
  | 'other'

/** סטטוס רשומת שעות */
export type HourlyEntryStatus = 'logged' | 'approved' | 'invoiced'

/**
 * חשבון שירות שעות ללקוח — Firestore: `hourlyServices/{id}`
 */
export interface HourlyService {
  id: string
  clientId: string
  title: string
  status: HourlyServiceStatus
  serviceKind: HourlyServiceKind
  /** תעריף שעה ₪ */
  hourlyRate?: number
  /** חבילת שעות כוללת ללקוח — נוצל מול רשומות העבודה */
  hoursPackageTotal: number
  /** קישור לפרויקט Hub (אופציונלי) */
  projectId?: string
  notes?: string
  /** קישור שיתוף ציבורי ללקוח */
  shareToken?: string
  shareEnabled?: boolean
  createdAt: string
  updatedAt?: string
}

/**
 * רשומת שעות — Firestore: `hourlyServices/{serviceId}/entries/{id}`
 */
export interface HourlyServiceEntry {
  id: string
  serviceId: string
  clientId: string
  performerId: string
  performerName: string
  workDate: string
  startTime?: string
  endTime?: string
  hours: number
  taskTitle: string
  description?: string
  workCategory: HourlyWorkCategory
  billable: boolean
  status: HourlyEntryStatus
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
