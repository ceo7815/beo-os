import { boardStatusHe, priorityHe } from './boardTaskLabels'
import type { CashflowLedgerRow } from './cashflowCompute'
import { formatDateIL, todayYmd } from './dates'
import { downloadRtlExcel, roundExcelMoney } from './excelExport'
import { RECONCILIATION_STATUS_LABEL } from './expenseReconciliation'
import { deriveExpensePnlMonth, expensePaymentMonth } from './financeExpensePnl'
import { expenseDisplayName, resolveExpenseType } from './financeExpenseTypes'
import { EXPENSE_VAT_CLASS_SHORT, resolveExpenseVatClass } from './financeExpenseVat'
import { INCOME_STATUS_LABEL, monthLabelHe } from './financeCalc'
import {
  FINANCE_INCOME_DOCUMENT_LABELS,
  incomeDocumentKind,
} from './financeIncomeDocument'
import { hostingIncomeLabel, isHostingIncome } from './financeHostingTypes'
import {
  incomeOutstandingAmount,
  incomePaymentDate,
  PAYMENT_METHOD_LABEL,
} from './financeIncomePayment'
import { catalogItemLabel, catalogItemTimingHint } from './fixedExpenses'
import {
  formatRetainerInterval,
  formatStandingOrderInterval,
  giRetainerStatusLabel,
  giRecurringStatusLabel,
} from './giRecurringDisplay'
import {
  HOURLY_ENTRY_STATUS_LABEL,
  HOURLY_SERVICE_KIND_LABEL,
  HOURLY_SERVICE_STATUS_LABEL,
  HOURLY_WORK_CATEGORY_LABEL,
} from './hourlyServiceLabels'
import { resolveExpenseRowVat, resolveIncomeVat } from './israeliVat'
import type {
  Campaign,
  CampaignKind,
  CampaignPlatform,
  CampaignStatus,
  DomainManager,
  FinanceExpense,
  FinanceFixedExpenseCatalogItem,
  FinanceExpenseTypeDef,
  FinanceGiRetainer,
  FinanceGiRecurringPayment,
  FinanceIncome,
  HostingBillingCycle,
  HostingRecord,
  HostingServerType,
  HourlyService,
  HourlyServiceEntry,
  Lead,
  LeadStatus,
  Priority,
  Project,
  ProjectStatus,
  Task,
} from '../types'

// ── Campaign labels ──

const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  planning: 'בתכנון',
  active: 'פעיל',
  paused: 'מושהה',
  completed: 'הושלם',
}

const CAMPAIGN_PLATFORM_LABEL: Record<CampaignPlatform, string> = {
  instagram: 'אינסטגרם',
  google_ads: 'Google Ads',
  facebook: 'פייסבוק',
  tiktok: 'טיקטוק',
  linkedin: 'לינקדאין',
  other: 'אחר',
}

const CAMPAIGN_KIND_LABEL: Record<CampaignKind, string> = {
  internal: 'פנימי',
  client: 'לקוח',
}

// ── Lead labels ──

const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'חדש',
  specification: 'בתהליך אפיון',
  quote_sent: 'נשלחה הצעת מחיר',
  follow_up: 'יש לבצע פולואפ',
  no_answer: 'אין מענה',
  not_relevant: 'לא רלוונטי',
  closed: 'נסגרה',
}

// ── Project labels ──

const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'פעיל',
  paused: 'מושהה',
  done: 'הושלם',
}

const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'גבוהה',
  medium: 'בינונית',
  low: 'נמוכה',
}

// ── Hosting labels ──

const HOSTING_SERVER_LABEL: Record<HostingServerType, string> = {
  shared: 'אחסון שיתופי',
  private: 'שרת פרטי',
}

const HOSTING_DOMAIN_MANAGER_LABEL: Record<DomainManager, string> = {
  agency: 'סוכנות',
  client: 'לקוח',
  external: 'חיצוני',
}

const HOSTING_CYCLE_LABEL: Record<HostingBillingCycle, string> = {
  monthly: 'חודשי',
  yearly: 'שנתי',
  biennial: 'דו-שנתי',
  oneTime: 'חד-פעמי',
}

function incomeSourceLabel(source?: FinanceIncome['source']): string {
  if (source === 'green_invoice') return 'חשבונית ירוקה'
  return 'ידני'
}

function collectionDaysOpen(invoiceDate: string, today = todayYmd()): number {
  const due = invoiceDate.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return 0
  const ms =
    new Date(today.slice(0, 10)).getTime() - new Date(due).getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}

function incomeRowDate(row: FinanceIncome): string {
  const kind = incomeDocumentKind(row)
  return kind === 'tax_invoice_receipt' || kind === 'receipt'
    ? incomePaymentDate(row)
    : row.invoiceDate
}

function projectProgressPercent(p: Project): number {
  if (
    typeof p.manualProgressPercent === 'number' &&
    !Number.isNaN(p.manualProgressPercent)
  ) {
    return Math.max(0, Math.min(100, Math.round(p.manualProgressPercent)))
  }
  if (!p.taskCount) return 0
  return Math.round((p.doneCount / p.taskCount) * 100)
}

// ── Hourly services ──

export function exportHourlyServicesToExcel(input: {
  services: HourlyService[]
  entries: HourlyServiceEntry[]
  clientNameById: Map<string, string>
}): void {
  const { services, entries, clientNameById } = input

  const serviceRows = services
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title, 'he'))
    .map((s) => {
      const used = entries
        .filter((e) => e.serviceId === s.id)
        .reduce((sum, e) => sum + e.hours, 0)
      const remaining = Math.max(0, s.hoursPackageTotal - used)
      return [
        s.title,
        clientNameById.get(s.clientId) ?? '',
        HOURLY_SERVICE_KIND_LABEL[s.serviceKind],
        HOURLY_SERVICE_STATUS_LABEL[s.status],
        s.hourlyRate != null ? roundExcelMoney(s.hourlyRate) : '',
        roundExcelMoney(s.hoursPackageTotal),
        roundExcelMoney(used),
        roundExcelMoney(remaining),
        s.notes?.trim() ?? '',
        formatDateIL(s.createdAt),
        s.id,
      ]
    })

  const entryRows = entries
    .slice()
    .sort((a, b) => b.workDate.localeCompare(a.workDate))
    .map((e) => {
      const svc = services.find((s) => s.id === e.serviceId)
      return [
        formatDateIL(e.workDate),
        svc?.title ?? '',
        clientNameById.get(e.clientId) ?? '',
        e.taskTitle,
        e.description?.trim() ?? '',
        HOURLY_WORK_CATEGORY_LABEL[e.workCategory],
        roundExcelMoney(e.hours),
        e.billable ? 'כן' : 'לא',
        HOURLY_ENTRY_STATUS_LABEL[e.status],
        e.performerName,
        e.startTime ?? '',
        e.endTime ?? '',
        e.id,
      ]
    })

  downloadRtlExcel({
    filenamePrefix: 'שירותי-שעות',
    sheets: [
      {
        sheetName: 'בנקי שעות',
        headers: [
          'שם',
          'לקוח',
          'סוג שירות',
          'סטטוס',
          'תעריף שעה ₪',
          'חבילת שעות',
          'שעות שנוצלו',
          'שעות נותרות',
          'הערות',
          'תאריך יצירה',
          'מזהה',
        ],
        rows: serviceRows,
        colWidths: [
          { wch: 24 },
          { wch: 22 },
          { wch: 12 },
          { wch: 10 },
          { wch: 12 },
          { wch: 12 },
          { wch: 12 },
          { wch: 12 },
          { wch: 24 },
          { wch: 12 },
          { wch: 22 },
        ],
      },
      {
        sheetName: 'רשומות שעות',
        headers: [
          'תאריך',
          'בנק שעות',
          'לקוח',
          'משימה',
          'תיאור',
          'קטגוריה',
          'שעות',
          'לחיוב',
          'סטטוס',
          'מבצע',
          'התחלה',
          'סיום',
          'מזהה',
        ],
        rows: entryRows,
        colWidths: [
          { wch: 12 },
          { wch: 22 },
          { wch: 20 },
          { wch: 24 },
          { wch: 28 },
          { wch: 12 },
          { wch: 8 },
          { wch: 8 },
          { wch: 10 },
          { wch: 16 },
          { wch: 8 },
          { wch: 8 },
          { wch: 22 },
        ],
      },
    ],
  })
}

// ── Campaigns ──

export function exportCampaignsToExcel(input: {
  campaigns: Campaign[]
  clientNameById: Map<string, string>
  projectNameById: Map<string, string>
  supplierNameById: Map<string, string>
  performerNameById: Map<string, string>
}): void {
  const rows = input.campaigns
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'he'))
    .map((c) => [
      c.name,
      CAMPAIGN_KIND_LABEL[c.kind],
      CAMPAIGN_PLATFORM_LABEL[c.platform],
      CAMPAIGN_STATUS_LABEL[c.status],
      c.clientId ? input.clientNameById.get(c.clientId) ?? '' : '',
      c.projectId ? input.projectNameById.get(c.projectId) ?? '' : '',
      c.supplierId ? input.supplierNameById.get(c.supplierId) ?? '' : '',
      c.performerUserId
        ? input.performerNameById.get(c.performerUserId) ?? ''
        : '',
      c.budget != null ? roundExcelMoney(c.budget) : '',
      c.startDate ? formatDateIL(c.startDate) : '',
      c.endDate ? formatDateIL(c.endDate) : '',
      c.resultsUpdate?.trim() ?? '',
      formatDateIL(c.createdAt),
      c.id,
    ])

  downloadRtlExcel({
    filenamePrefix: 'קמפיינים',
    sheets: [
      {
        sheetName: 'קמפיינים',
        headers: [
          'שם',
          'סוג',
          'פלטפורמה',
          'סטטוס',
          'לקוח',
          'פרויקט',
          'ספק',
          'מבצע',
          'תקציב ₪',
          'תאריך התחלה',
          'תאריך סיום',
          'עדכון תוצאות',
          'נוצר',
          'מזהה',
        ],
        rows,
        colWidths: [
          { wch: 26 },
          { wch: 10 },
          { wch: 14 },
          { wch: 10 },
          { wch: 22 },
          { wch: 22 },
          { wch: 18 },
          { wch: 16 },
          { wch: 12 },
          { wch: 12 },
          { wch: 12 },
          { wch: 28 },
          { wch: 12 },
          { wch: 22 },
        ],
      },
    ],
  })
}

// ── Expenses ──

export function exportExpensesToExcel(input: {
  expenses: FinanceExpense[]
  expenseTypeById: Map<string, FinanceExpenseTypeDef>
  clientNameById: Map<string, string>
  projectNameById: Map<string, string>
  supplierNameById: Map<string, string>
  reconciliationStatusById?: Map<string, { status: keyof typeof RECONCILIATION_STATUS_LABEL }>
  isClosed?: (row: FinanceExpense) => boolean
}): void {
  const rows = input.expenses.map((row) => {
    const typeDef = resolveExpenseType(row.type, input.expenseTypeById)
    const breakdown = resolveExpenseRowVat(row)
    const vatClass = resolveExpenseVatClass(row)
    const reportMonth = deriveExpensePnlMonth(row)
    const payMonth = expensePaymentMonth(row)
    const recon = input.reconciliationStatusById?.get(row.id)
    const closed = input.isClosed?.(row) ?? false

    return [
      monthLabelHe(reportMonth),
      expenseDisplayName(row, typeDef),
      typeDef.label,
      roundExcelMoney(breakdown.gross),
      roundExcelMoney(breakdown.vat),
      roundExcelMoney(breakdown.net),
      EXPENSE_VAT_CLASS_SHORT[vatClass],
      row.recurring ? 'כן' : 'לא',
      row.paidDate ? formatDateIL(row.paidDate) : '',
      row.chargeDate ? formatDateIL(row.chargeDate) : '',
      row.documentDate ? formatDateIL(row.documentDate) : '',
      monthLabelHe(payMonth),
      row.clientId ? input.clientNameById.get(row.clientId) ?? '' : '',
      row.projectId ? input.projectNameById.get(row.projectId) ?? '' : '',
      row.supplierId
        ? input.supplierNameById.get(row.supplierId) ?? row.supplierName ?? ''
        : row.supplierName ?? '',
      row.paymentMethod ? PAYMENT_METHOD_LABEL[row.paymentMethod] : '',
      recon ? RECONCILIATION_STATUS_LABEL[recon.status] : '',
      closed ? 'סגור' : 'פתוח',
      row.description?.trim() ?? '',
      row.id,
    ]
  })

  downloadRtlExcel({
    filenamePrefix: 'הוצאות',
    sheets: [
      {
        sheetName: 'הוצאות',
        headers: [
          'חודש דיווח',
          'שם הוצאה',
          'סוג',
          'ברוטו ₪',
          'מע״מ ₪',
          'נטו ₪',
          'סיווג מע״מ',
          'קבועה',
          'תאריך תשלום',
          'תאריך חיוב',
          'תאריך חשבונית',
          'חודש תשלום',
          'לקוח',
          'פרויקט',
          'ספק',
          'אמצעי תשלום',
          'סטטוס התאמה',
          'סגירה',
          'תיאור',
          'מזהה',
        ],
        rows,
        colWidths: [
          { wch: 14 },
          { wch: 24 },
          { wch: 14 },
          { wch: 12 },
          { wch: 10 },
          { wch: 12 },
          { wch: 10 },
          { wch: 8 },
          { wch: 12 },
          { wch: 12 },
          { wch: 12 },
          { wch: 14 },
          { wch: 18 },
          { wch: 18 },
          { wch: 18 },
          { wch: 14 },
          { wch: 16 },
          { wch: 8 },
          { wch: 24 },
          { wch: 22 },
        ],
      },
    ],
  })
}

// ── Incomes ──

export function exportIncomesToExcel(input: {
  rows: FinanceIncome[]
  clientNameById: Map<string, string>
  projectNameById: Map<string, string>
}): void {
  const sheetRows = input.rows.map((row) => {
    const kind = incomeDocumentKind(row)
    const vat = resolveIncomeVat(row)
    const date = incomeRowDate(row)
    const clientLabel =
      input.clientNameById.get(row.clientId) ??
      row.greenInvoiceClientName ??
      ''
    let projectLabel = ''
    if (isHostingIncome(row)) {
      projectLabel = hostingIncomeLabel(row) ?? ''
    } else if (row.projectId) {
      projectLabel = input.projectNameById.get(row.projectId) ?? ''
    }

    return [
      FINANCE_INCOME_DOCUMENT_LABELS[kind],
      formatDateIL(date),
      row.invoiceNumber || row.greenInvoiceNumber || '',
      clientLabel,
      projectLabel,
      roundExcelMoney(vat.gross),
      roundExcelMoney(vat.vat),
      roundExcelMoney(vat.net),
      INCOME_STATUS_LABEL[row.status],
      incomeSourceLabel(row.source),
      row.description?.trim() ?? '',
      row.id,
    ]
  })

  downloadRtlExcel({
    filenamePrefix: 'הכנסות',
    sheets: [
      {
        sheetName: 'הכנסות',
        headers: [
          'סוג מסמך',
          'תאריך',
          'מספר',
          'לקוח',
          'פרויקט / שיוך',
          'ברוטו ₪',
          'מע״מ ₪',
          'נטו ₪',
          'סטטוס',
          'מקור',
          'תיאור',
          'מזהה',
        ],
        rows: sheetRows,
        colWidths: [
          { wch: 18 },
          { wch: 12 },
          { wch: 12 },
          { wch: 22 },
          { wch: 22 },
          { wch: 12 },
          { wch: 10 },
          { wch: 12 },
          { wch: 12 },
          { wch: 14 },
          { wch: 24 },
          { wch: 22 },
        ],
      },
    ],
  })
}

// ── Collections ──

export function exportCollectionsToExcel(input: {
  rows: FinanceIncome[]
  clientNameById: Map<string, string>
  projectNameById: Map<string, string>
}): void {
  const sheetRows = input.rows.map((row) => {
    const outstanding = incomeOutstandingAmount(row)
    const openDays = collectionDaysOpen(row.invoiceDate)
    const clientLabel =
      input.clientNameById.get(row.clientId) ??
      row.greenInvoiceClientName ??
      ''

    return [
      formatDateIL(row.invoiceDate),
      row.invoiceNumber || row.greenInvoiceNumber || '',
      clientLabel,
      row.projectId ? input.projectNameById.get(row.projectId) ?? '' : '',
      roundExcelMoney(row.amount),
      roundExcelMoney(outstanding),
      openDays,
      INCOME_STATUS_LABEL[row.status],
      row.id,
    ]
  })

  downloadRtlExcel({
    filenamePrefix: 'גבייה',
    sheets: [
      {
        sheetName: 'גבייה',
        headers: [
          'תאריך מסמך',
          'מספר',
          'לקוח',
          'פרויקט',
          'סכום ₪',
          'יתרה פתוחה ₪',
          'ימים פתוח',
          'סטטוס',
          'מזהה',
        ],
        rows: sheetRows,
        colWidths: [
          { wch: 12 },
          { wch: 12 },
          { wch: 22 },
          { wch: 22 },
          { wch: 12 },
          { wch: 14 },
          { wch: 10 },
          { wch: 12 },
          { wch: 22 },
        ],
      },
    ],
  })
}

// ── Cashflow ledger ──

export function exportCashflowLedgerToExcel(rows: CashflowLedgerRow[]): void {
  const sheetRows = rows.map((row) => [
    formatDateIL(row.date),
    row.category,
    row.description,
    row.inflow > 0 ? roundExcelMoney(row.inflow) : '',
    row.outflow > 0 ? roundExcelMoney(row.outflow) : '',
    roundExcelMoney(row.balance),
    row.paymentMethod,
    row.notes,
  ])

  downloadRtlExcel({
    filenamePrefix: 'תזרים-מזומנים',
    sheets: [
      {
        sheetName: 'יומן תזרים',
        headers: [
          'תאריך',
          'סוג',
          'תיאור',
          'נכנס ₪',
          'יצא ₪',
          'יתרה זמינה ₪',
          'אופן תשלום',
          'הערות',
        ],
        rows: sheetRows,
        colWidths: [
          { wch: 12 },
          { wch: 16 },
          { wch: 28 },
          { wch: 12 },
          { wch: 12 },
          { wch: 14 },
          { wch: 16 },
          { wch: 28 },
        ],
      },
    ],
  })
}

// ── Leads ──

export function exportLeadsToExcel(input: {
  leads: Lead[]
  clientNameById: Map<string, string>
  ownerNameById: Map<string, string>
}): void {
  const rows = input.leads.map((l) => [
    l.name,
    l.company?.trim() ?? '',
    l.phone?.trim() ?? '',
    l.email?.trim() ?? '',
    LEAD_STATUS_LABEL[l.status],
    l.clientId ? input.clientNameById.get(l.clientId) ?? '' : '',
    l.ownerId ? input.ownerNameById.get(l.ownerId) ?? '' : '',
    l.source?.trim() ?? '',
    l.clientNeeds?.trim() ?? '',
    l.nextFollowUpDate ? formatDateIL(l.nextFollowUpDate) : '',
    l.lastActivityText?.trim() ?? '',
    l.lastActivityAt ? formatDateIL(l.lastActivityAt) : '',
    l.notRelevantReason?.trim() ?? '',
    formatDateIL(l.createdAt),
    l.id,
  ])

  downloadRtlExcel({
    filenamePrefix: 'לידים',
    sheets: [
      {
        sheetName: 'לידים',
        headers: [
          'שם',
          'חברה',
          'טלפון',
          'אימייל',
          'סטטוס',
          'לקוח במערכת',
          'אחראי',
          'מקור',
          'צרכים',
          'מעקב הבא',
          'פעילות אחרונה',
          'תאריך פעילות',
          'סיבת לא רלוונטי',
          'נוצר',
          'מזהה',
        ],
        rows,
        colWidths: [
          { wch: 20 },
          { wch: 20 },
          { wch: 14 },
          { wch: 24 },
          { wch: 16 },
          { wch: 20 },
          { wch: 16 },
          { wch: 14 },
          { wch: 24 },
          { wch: 12 },
          { wch: 24 },
          { wch: 12 },
          { wch: 20 },
          { wch: 12 },
          { wch: 22 },
        ],
      },
    ],
  })
}

// ── Projects ──

export function exportProjectsToExcel(input: {
  projects: Project[]
  clientNameById: Map<string, string>
  supplierNameById: Map<string, string>
  ownerNameById: Map<string, string>
}): void {
  const rows = input.projects.map((p) => [
    p.name,
    p.type === 'internal' ? 'פנימי' : 'לקוח',
    PROJECT_STATUS_LABEL[p.status],
    PRIORITY_LABEL[p.priority],
    p.clientId ? input.clientNameById.get(p.clientId) ?? '' : '',
    p.supplierId ? input.supplierNameById.get(p.supplierId) ?? '' : '',
    p.ownerId ? input.ownerNameById.get(p.ownerId) ?? '' : '',
    p.dueDate ? formatDateIL(p.dueDate) : '',
    projectProgressPercent(p),
    p.taskCount,
    p.doneCount,
    p.budgetTotal != null ? roundExcelMoney(p.budgetTotal) : '',
    p.retainerAmount != null ? roundExcelMoney(p.retainerAmount) : '',
    p.description?.trim() ?? '',
    formatDateIL(p.createdAt),
    p.id,
  ])

  downloadRtlExcel({
    filenamePrefix: 'פרויקטים',
    sheets: [
      {
        sheetName: 'פרויקטים',
        headers: [
          'שם',
          'סוג',
          'סטטוס',
          'עדיפות',
          'לקוח',
          'ספק',
          'אחראי',
          'תאריך יעד',
          'התקדמות %',
          'משימות',
          'הושלמו',
          'תקציב ₪',
          'ריטיינר ₪',
          'תיאור',
          'נוצר',
          'מזהה',
        ],
        rows,
        colWidths: [
          { wch: 24 },
          { wch: 10 },
          { wch: 10 },
          { wch: 10 },
          { wch: 20 },
          { wch: 18 },
          { wch: 16 },
          { wch: 12 },
          { wch: 10 },
          { wch: 8 },
          { wch: 8 },
          { wch: 12 },
          { wch: 12 },
          { wch: 24 },
          { wch: 12 },
          { wch: 22 },
        ],
      },
    ],
  })
}

// ── Tasks ──

export function exportTasksToExcel(input: {
  tasks: Task[]
  clientNameById: Map<string, string>
  projectNameById: Map<string, string>
  assigneeNameById: Map<string, string>
  supplierNameById: Map<string, string>
}): void {
  const rows = input.tasks.map((t) => [
    t.title,
    boardStatusHe(t.status),
    priorityHe(t.priority),
    t.assigneeId ? input.assigneeNameById.get(t.assigneeId) ?? '' : '',
    t.clientId ? input.clientNameById.get(t.clientId) ?? '' : '',
    t.projectId ? input.projectNameById.get(t.projectId) ?? '' : '',
    t.supplierId ? input.supplierNameById.get(t.supplierId) ?? '' : '',
    t.dueDate ? formatDateIL(t.dueDate) : '',
    t.dueTime ?? '',
    t.tags.join(' · '),
    t.description?.trim() ?? '',
    formatDateIL(t.createdAt),
    t.id,
  ])

  downloadRtlExcel({
    filenamePrefix: 'משימות',
    sheets: [
      {
        sheetName: 'משימות',
        headers: [
          'כותרת',
          'סטטוס',
          'עדיפות',
          'מבצע',
          'לקוח',
          'פרויקט',
          'ספק',
          'תאריך יעד',
          'שעת יעד',
          'תגיות',
          'תיאור',
          'נוצר',
          'מזהה',
        ],
        rows,
        colWidths: [
          { wch: 28 },
          { wch: 10 },
          { wch: 10 },
          { wch: 16 },
          { wch: 18 },
          { wch: 20 },
          { wch: 16 },
          { wch: 12 },
          { wch: 8 },
          { wch: 20 },
          { wch: 28 },
          { wch: 12 },
          { wch: 22 },
        ],
      },
    ],
  })
}

// ── Hosting ──

export function exportHostingToExcel(input: {
  records: HostingRecord[]
  clientNameById: Map<string, string>
}): void {
  const rows = input.records.map((r) => [
    r.domain,
    r.siteName?.trim() ?? '',
    input.clientNameById.get(r.clientId) ?? '',
    HOSTING_SERVER_LABEL[r.serverType],
    r.serverProvider,
    r.serverLocation,
    formatDateIL(r.hostingRenewalDate),
    HOSTING_CYCLE_LABEL[r.hostingCycle],
    r.registrar,
    HOSTING_DOMAIN_MANAGER_LABEL[r.domainManager],
    r.domainManagerNote?.trim() ?? '',
    formatDateIL(r.domainRenewalDate),
    r.greenInvoiceRetainer ? 'כן' : 'לא',
    r.retainerAmount != null ? roundExcelMoney(r.retainerAmount) : '',
    HOSTING_CYCLE_LABEL[r.retainerCycle],
    r.sslExpiry ? formatDateIL(r.sslExpiry) : '',
    r.ipAddress?.trim() ?? '',
    r.platform?.trim() ?? '',
    r.notes?.trim() ?? '',
    formatDateIL(r.createdAt),
    r.id,
  ])

  downloadRtlExcel({
    filenamePrefix: 'אחסון-ודומיינים',
    sheets: [
      {
        sheetName: 'אחסון',
        headers: [
          'דומיין',
          'שם אתר',
          'לקוח',
          'סוג שרת',
          'ספק שרת',
          'מיקום',
          'חידוש אחסון',
          'מחזור אחסון',
          'רשם',
          'מנהל דומיין',
          'הערת מנהל',
          'חידוש דומיין',
          'רטיינר GI',
          'סכום רטיינר ₪',
          'מחזור רטיינר',
          'תפוגת SSL',
          'IP',
          'פלטפורמה',
          'הערות',
          'נוצר',
          'מזהה',
        ],
        rows,
        colWidths: [
          { wch: 22 },
          { wch: 18 },
          { wch: 20 },
          { wch: 14 },
          { wch: 16 },
          { wch: 14 },
          { wch: 12 },
          { wch: 12 },
          { wch: 14 },
          { wch: 12 },
          { wch: 16 },
          { wch: 12 },
          { wch: 10 },
          { wch: 12 },
          { wch: 12 },
          { wch: 12 },
          { wch: 14 },
          { wch: 12 },
          { wch: 24 },
          { wch: 12 },
          { wch: 22 },
        ],
      },
    ],
  })
}

// ── Finance: fixed expenses catalog ──

export function exportFixedExpensesCatalogToExcel(input: {
  items: FinanceFixedExpenseCatalogItem[]
  expenseTypeById: Map<string, FinanceExpenseTypeDef>
}): void {
  const rows = input.items.map((item) => {
    const typeDef = resolveExpenseType(item.type, input.expenseTypeById)
    return [
      catalogItemLabel(item),
      typeDef.label,
      roundExcelMoney(item.amount),
      PAYMENT_METHOD_LABEL[item.paymentMethod],
      catalogItemTimingHint(item),
      item.dayOfMonth ?? '',
      item.id,
    ]
  })

  downloadRtlExcel({
    filenamePrefix: 'הוצאות-קבועות',
    sheets: [
      {
        sheetName: 'הוצאות קבועות',
        headers: [
          'שם',
          'סוג',
          'סכום ₪',
          'אמצעי תשלום',
          'תזמון',
          'יום בחודש',
          'מזהה',
        ],
        rows,
        colWidths: [
          { wch: 28 },
          { wch: 14 },
          { wch: 12 },
          { wch: 16 },
          { wch: 20 },
          { wch: 10 },
          { wch: 22 },
        ],
      },
    ],
  })
}

// ── Finance: GI retainers ──

export function exportGiRetainersToExcel(input: {
  rows: FinanceGiRetainer[]
  clientNameById: Map<string, string>
}): void {
  const sheetRows = input.rows.map((row) => [
    (row.clientId && input.clientNameById.get(row.clientId)) || row.clientName,
    roundExcelMoney(row.amount),
    formatRetainerInterval(row.interval),
    row.nextJobDate ? formatDateIL(row.nextJobDate) : '',
    giRetainerStatusLabel(row.status),
    row.id,
  ])

  downloadRtlExcel({
    filenamePrefix: 'ריטיינרים',
    sheets: [
      {
        sheetName: 'ריטיינרים',
        headers: ['לקוח', 'סכום ₪', 'מחזור', 'חיוב הבא', 'סטטוס', 'מזהה'],
        rows: sheetRows,
        colWidths: [
          { wch: 24 },
          { wch: 12 },
          { wch: 14 },
          { wch: 12 },
          { wch: 12 },
          { wch: 22 },
        ],
      },
    ],
  })
}

// ── Finance: GI standing orders ──

export function exportGiStandingOrdersToExcel(input: {
  rows: FinanceGiRecurringPayment[]
  clientNameById: Map<string, string>
}): void {
  const sheetRows = input.rows.map((row) => [
    (row.clientId && input.clientNameById.get(row.clientId)) || row.clientName,
    roundExcelMoney(row.amount),
    formatStandingOrderInterval(row.intervalMonths),
    row.nextChargeDate ? formatDateIL(row.nextChargeDate) : '',
    giRecurringStatusLabel(row.status),
    row.id,
  ])

  downloadRtlExcel({
    filenamePrefix: 'הוראות-קבע',
    sheets: [
      {
        sheetName: 'הוראות קבע',
        headers: ['לקוח', 'סכום ₪', 'מחזור', 'חיוב הבא', 'סטטוס', 'מזהה'],
        rows: sheetRows,
        colWidths: [
          { wch: 24 },
          { wch: 12 },
          { wch: 14 },
          { wch: 12 },
          { wch: 12 },
          { wch: 22 },
        ],
      },
    ],
  })
}

// ── Finance: projects P&L ──

export type ProjectFinanceExcelRow = {
  projectName: string
  clientName: string
  status: string
  incomeGross: number
  expenseGross: number
  netProfit: number
  collectionBalance: number
  dueDate?: string
}

export function exportFinanceProjectsToExcel(rows: ProjectFinanceExcelRow[]): void {
  const sheetRows = rows.map((r) => [
    r.projectName,
    r.clientName,
    r.status,
    roundExcelMoney(r.incomeGross),
    roundExcelMoney(r.expenseGross),
    roundExcelMoney(r.netProfit),
    roundExcelMoney(r.collectionBalance),
    r.dueDate ? formatDateIL(r.dueDate) : '',
  ])

  downloadRtlExcel({
    filenamePrefix: 'פרויקטים-פיננסים',
    sheets: [
      {
        sheetName: 'פרויקטים',
        headers: [
          'פרויקט',
          'לקוח',
          'סטטוס',
          'הכנסות ₪',
          'הוצאות ₪',
          'רווח נקי ₪',
          'יתרה לגבייה ₪',
          'תאריך יעד',
        ],
        rows: sheetRows,
        colWidths: [
          { wch: 24 },
          { wch: 20 },
          { wch: 10 },
          { wch: 12 },
          { wch: 12 },
          { wch: 12 },
          { wch: 14 },
          { wch: 12 },
        ],
      },
    ],
  })
}
