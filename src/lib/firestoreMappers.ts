import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore'
import { Timestamp } from 'firebase/firestore'
import { parseIncomePaymentRecords } from './financeIncomePayment'
import { parseExpectedCollectionSchedule } from './expectedCollectionSchedule'
import { isFinanceHostingType } from './financeHostingTypes'
import type {
  Client,
  Deal,
  DealKind,
  DealScheduledPayment,
  DealStatus,
  Campaign,
  CampaignPlatform,
  CampaignStatus,
  CollectionTracking,
  Doc,
  DocType,
  HostingRecord,
  HourlyService,
  HourlyServiceEntry,
  AgentCommissionPayment,
  FinanceExpense,
  FinanceExpenseFieldMode,
  FinanceExpensePnlCategory,
  FinanceExpenseTypeDef,
  FinanceExpenseVatClass,
  FinanceIncome,
  FinanceIncomeDocumentKind,
  FinanceIncomeStatus,
  FinancePaymentMethod,
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
import { resolveExpenseForeign } from './foreignCurrency'

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
const FINANCE_INCOME_STATUSES: FinanceIncomeStatus[] = [
  'pending',
  'paid',
  'overdue',
  'partial',
]
const FINANCE_EXPENSE_VAT_CLASSES: FinanceExpenseVatClass[] = [
  'vat_liable',
  'statutory',
  'exempt_supplier',
]

function normalizeExpenseVatClass(raw: unknown): FinanceExpenseVatClass | undefined {
  const s = String(raw ?? '').trim()
  if (FINANCE_EXPENSE_VAT_CLASSES.includes(s as FinanceExpenseVatClass)) {
    return s as FinanceExpenseVatClass
  }
  return undefined
}

const FINANCE_EXPENSE_FIELD_MODES: FinanceExpenseFieldMode[] = [
  'none',
  'supplier',
  'platform',
  'salary',
]
const FINANCE_EXPENSE_PNL: FinanceExpensePnlCategory[] = [
  'fixed',
  'supplier',
  'platform',
]

function normalizeFinanceExpenseTypeId(raw: unknown): string {
  const s = String(raw ?? '').trim()
  return s || 'fixed'
}

function normalizeExpenseFieldMode(raw: unknown): FinanceExpenseFieldMode {
  const s = String(raw ?? '').trim()
  if (FINANCE_EXPENSE_FIELD_MODES.includes(s as FinanceExpenseFieldMode)) {
    return s as FinanceExpenseFieldMode
  }
  return 'none'
}

function normalizeExpensePnlCategory(raw: unknown): FinanceExpensePnlCategory {
  const s = String(raw ?? '').trim()
  if (FINANCE_EXPENSE_PNL.includes(s as FinanceExpensePnlCategory)) {
    return s as FinanceExpensePnlCategory
  }
  return 'fixed'
}

export function docToFinanceExpenseType(
  d: QueryDocumentSnapshot<DocumentData>,
): FinanceExpenseTypeDef {
  const x = d.data()
  return {
    id: d.id,
    label: String(x.label ?? '').trim() || 'סוג הוצאה',
    color: String(x.color ?? '#F97316'),
    fieldMode: normalizeExpenseFieldMode(x.fieldMode),
    autoRecurring: x.autoRecurring === true,
    pnlCategory: normalizeExpensePnlCategory(x.pnlCategory),
    createdAt: timestampToIso(x.createdAt),
  }
}

const FINANCE_INCOME_DOCUMENT_KINDS: FinanceIncomeDocumentKind[] = [
  'tax_invoice_receipt',
  'tax_invoice',
  'receipt',
  'transaction_account',
  'credit_invoice',
  'tax_receipt',
  'transaction_invoice',
]

function normalizeFinanceIncomeDocumentKind(
  raw: unknown,
): FinanceIncomeDocumentKind | undefined {
  const s = String(raw ?? '').trim()
  if (FINANCE_INCOME_DOCUMENT_KINDS.includes(s as FinanceIncomeDocumentKind)) {
    return s as FinanceIncomeDocumentKind
  }
  return undefined
}

function normalizeFinanceIncomeStatus(raw: unknown): FinanceIncomeStatus {
  const s = String(raw ?? '').trim().toLowerCase()
  if (FINANCE_INCOME_STATUSES.includes(s as FinanceIncomeStatus)) {
    return s as FinanceIncomeStatus
  }
  return 'pending'
}

export function docToFinanceIncome(
  d: QueryDocumentSnapshot<DocumentData>,
): FinanceIncome {
  const x = d.data()
  const invoiceDate =
    typeof x.invoiceDate === 'string' && x.invoiceDate.trim()
      ? x.invoiceDate.slice(0, 10)
      : ''
  const description =
    typeof x.description === 'string' && x.description.trim()
      ? x.description.trim()
      : undefined
  const amountIncludesVat = x.amountIncludesVat !== false
  const vatAmount =
    typeof x.vatAmount === 'number' && !Number.isNaN(x.vatAmount)
      ? x.vatAmount
      : undefined
  const amountBeforeVat =
    typeof x.amountBeforeVat === 'number' && !Number.isNaN(x.amountBeforeVat)
      ? x.amountBeforeVat
      : undefined
  const paidAmount =
    typeof x.paidAmount === 'number' && !Number.isNaN(x.paidAmount)
      ? x.paidAmount
      : undefined
  const paymentMethodRaw = String(x.paymentMethod ?? '').trim()
  const paymentMethod: FinancePaymentMethod | undefined =
    paymentMethodRaw === 'bank_transfer' || paymentMethodRaw === 'credit_card'
      ? paymentMethodRaw
      : undefined
  const paidDate =
    typeof x.paidDate === 'string' && x.paidDate.trim()
      ? x.paidDate.slice(0, 10)
      : undefined
  const expectedPaymentDate =
    typeof x.expectedPaymentDate === 'string' && x.expectedPaymentDate.trim()
      ? x.expectedPaymentDate.slice(0, 10)
      : undefined
  const expectedPaymentSchedule = parseExpectedCollectionSchedule(
    x.expectedPaymentSchedule,
  )
  const payments = parseIncomePaymentRecords(x.payments)
  const documentKind = normalizeFinanceIncomeDocumentKind(x.documentKind)
  const sourceTransactionInvoiceId =
    typeof x.sourceTransactionInvoiceId === 'string' &&
    x.sourceTransactionInvoiceId.trim()
      ? x.sourceTransactionInvoiceId.trim()
      : undefined
  const source = x.source === 'green_invoice' ? 'green_invoice' : undefined
  const greenInvoiceId =
    typeof x.greenInvoiceId === 'string' && x.greenInvoiceId.trim()
      ? x.greenInvoiceId.trim()
      : undefined
  const greenInvoiceType =
    typeof x.greenInvoiceType === 'number' && !Number.isNaN(x.greenInvoiceType)
      ? x.greenInvoiceType
      : undefined
  const greenInvoiceStatus =
    typeof x.greenInvoiceStatus === 'number' &&
    !Number.isNaN(x.greenInvoiceStatus)
      ? x.greenInvoiceStatus
      : undefined
  const greenInvoiceNumber =
    typeof x.greenInvoiceNumber === 'string' && x.greenInvoiceNumber.trim()
      ? x.greenInvoiceNumber.trim()
      : undefined
  const greenInvoiceClientName =
    typeof x.greenInvoiceClientName === 'string' && x.greenInvoiceClientName.trim()
      ? x.greenInvoiceClientName.trim()
      : undefined
  const syncedAt =
    typeof x.syncedAt === 'string' && x.syncedAt.trim()
      ? x.syncedAt.trim()
      : undefined
  return {
    id: d.id,
    projectId: String(x.projectId ?? ''),
    clientId: String(x.clientId ?? ''),
    amount:
      typeof x.amount === 'number' && !Number.isNaN(x.amount) ? x.amount : 0,
    amountIncludesVat,
    ...(vatAmount !== undefined ? { vatAmount } : {}),
    ...(amountBeforeVat !== undefined ? { amountBeforeVat } : {}),
    ...(documentKind ? { documentKind } : {}),
    invoiceNumber: String(x.invoiceNumber ?? ''),
    invoiceDate,
    ...(sourceTransactionInvoiceId ? { sourceTransactionInvoiceId } : {}),
    description,
    status: normalizeFinanceIncomeStatus(x.status),
    ...(paidAmount !== undefined ? { paidAmount } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(paidDate ? { paidDate } : {}),
    ...(expectedPaymentDate ? { expectedPaymentDate } : {}),
    ...(expectedPaymentSchedule.length
      ? { expectedPaymentSchedule }
      : {}),
    ...(payments.length ? { payments } : {}),
    monthlyRetainer: x.monthlyRetainer === true,
    hostingClient: x.hostingClient === true,
    ...(isFinanceHostingType(x.hostingType) ? { hostingType: x.hostingType } : {}),
    ...(typeof x.hourlyServiceId === 'string' && x.hourlyServiceId.trim()
      ? { hourlyServiceId: x.hourlyServiceId.trim() }
      : {}),
    ...(source ? { source } : {}),
    ...(greenInvoiceId ? { greenInvoiceId } : {}),
    ...(greenInvoiceType !== undefined ? { greenInvoiceType } : {}),
    ...(greenInvoiceStatus !== undefined ? { greenInvoiceStatus } : {}),
    ...(greenInvoiceNumber ? { greenInvoiceNumber } : {}),
    ...(greenInvoiceClientName ? { greenInvoiceClientName } : {}),
    ...(syncedAt ? { syncedAt } : {}),
    createdAt: timestampToIso(x.createdAt),
  }
}

export function docToFinanceExpense(
  d: QueryDocumentSnapshot<DocumentData>,
): FinanceExpense {
  const x = d.data()
  const rawPid = x.projectId
  const projectIdStr =
    rawPid !== undefined && rawPid !== null ? String(rawPid).trim() : ''
  const supplierName =
    typeof x.supplierName === 'string' && x.supplierName.trim()
      ? x.supplierName.trim()
      : undefined
  const supplierTaxId =
    typeof x.supplierTaxId === 'string' && x.supplierTaxId.trim()
      ? x.supplierTaxId.trim()
      : undefined
  const rawSid = x.supplierId
  const supplierId =
    rawSid !== undefined && rawSid !== null && String(rawSid).trim()
      ? String(rawSid).trim()
      : undefined
  const platformName =
    typeof x.platformName === 'string' && x.platformName.trim()
      ? x.platformName.trim()
      : undefined
  const name =
    typeof x.name === 'string' && x.name.trim() ? x.name.trim() : undefined
  const employeeName =
    typeof x.employeeName === 'string' && x.employeeName.trim()
      ? x.employeeName.trim()
      : undefined
  const amountIncludesVat = x.amountIncludesVat !== false
  const vatAmount =
    typeof x.vatAmount === 'number' && !Number.isNaN(x.vatAmount)
      ? x.vatAmount
      : undefined
  const amountBeforeVat =
    typeof x.amountBeforeVat === 'number' && !Number.isNaN(x.amountBeforeVat)
      ? x.amountBeforeVat
      : undefined
  const description =
    typeof x.description === 'string' && x.description.trim()
      ? x.description.trim()
      : undefined
  const billingMonth =
    typeof x.billingMonth === 'string' && x.billingMonth.trim()
      ? x.billingMonth.slice(0, 7)
      : ''
  const pnlMonth =
    typeof x.pnlMonth === 'string' && x.pnlMonth.trim()
      ? x.pnlMonth.slice(0, 7)
      : undefined
  const linkedIncomeId =
    typeof x.linkedIncomeId === 'string' && x.linkedIncomeId.trim()
      ? x.linkedIncomeId.trim()
      : undefined
  const paymentMethod =
    x.paymentMethod === 'credit_card' || x.paymentMethod === 'bank_transfer'
      ? x.paymentMethod
      : undefined
  const paidDate =
    typeof x.paidDate === 'string' && x.paidDate.trim()
      ? x.paidDate.slice(0, 10)
      : undefined
  const bankRef =
    typeof x.bankRef === 'string' && x.bankRef.trim()
      ? x.bankRef.trim()
      : undefined
  const sourceRaw = String(x.source ?? '').trim()
  const source =
    sourceRaw === 'bank_import' ||
    sourceRaw === 'green_invoice' ||
    sourceRaw === 'manual'
      ? (sourceRaw as FinanceExpense['source'])
      : d.id.startsWith('gi_')
        ? 'green_invoice'
        : bankRef
          ? 'bank_import'
          : undefined
  const greenInvoiceId =
    typeof x.greenInvoiceId === 'string' && x.greenInvoiceId.trim()
      ? x.greenInvoiceId.trim()
      : undefined
  const greenInvoiceDocType =
    typeof x.greenInvoiceDocType === 'number' &&
    !Number.isNaN(x.greenInvoiceDocType)
      ? x.greenInvoiceDocType
      : undefined
  const greenInvoiceDocKindRaw = String(x.greenInvoiceDocKind ?? '').trim()
  const greenInvoiceDocKind =
    greenInvoiceDocKindRaw === 'invoice' ||
    greenInvoiceDocKindRaw === 'receipt' ||
    greenInvoiceDocKindRaw === 'invoice_receipt' ||
    greenInvoiceDocKindRaw === 'other'
      ? (greenInvoiceDocKindRaw as FinanceExpense['greenInvoiceDocKind'])
      : undefined
  const greenInvoiceNumber =
    typeof x.greenInvoiceNumber === 'string' && x.greenInvoiceNumber.trim()
      ? x.greenInvoiceNumber.trim()
      : undefined
  const greenInvoiceSupplierName =
    typeof x.greenInvoiceSupplierName === 'string' &&
    x.greenInvoiceSupplierName.trim()
      ? x.greenInvoiceSupplierName.trim()
      : undefined
  const greenInvoiceSupplierTaxId =
    typeof x.greenInvoiceSupplierTaxId === 'string' &&
    x.greenInvoiceSupplierTaxId.trim()
      ? x.greenInvoiceSupplierTaxId.trim()
      : undefined
  const matchedExpenseId =
    typeof x.matchedExpenseId === 'string' && x.matchedExpenseId.trim()
      ? x.matchedExpenseId.trim()
      : undefined
  const linkedGreenInvoiceId =
    typeof x.linkedGreenInvoiceId === 'string' && x.linkedGreenInvoiceId.trim()
      ? x.linkedGreenInvoiceId.trim()
      : undefined
  const reconciliationStatusRaw = String(x.reconciliationStatus ?? '').trim()
  const reconciliationStatus =
    reconciliationStatusRaw === 'matched' ||
    reconciliationStatusRaw === 'bank_missing_document' ||
    reconciliationStatusRaw === 'gi_unpaid' ||
    reconciliationStatusRaw === 'document_not_required' ||
    reconciliationStatusRaw === 'manual_ok' ||
    reconciliationStatusRaw === 'manual_pending' ||
    reconciliationStatusRaw === 'refunded'
      ? (reconciliationStatusRaw as FinanceExpense['reconciliationStatus'])
      : undefined
  const syncedAt =
    typeof x.syncedAt === 'string' && x.syncedAt.trim()
      ? x.syncedAt.trim()
      : undefined
  const rawCid = x.clientId
  const clientId =
    rawCid !== undefined && rawCid !== null && String(rawCid).trim()
      ? String(rawCid).trim()
      : undefined
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined

  /**
   * מט״ח: שדות ייעודיים, או חילוץ מתיאור ישן (לפני שנשמרו בשדות).
   */
  const resolvedForeign = resolveExpenseForeign({
    currency: str(x.currency),
    originalAmount: num(x.originalAmount),
    description,
    name,
  })
  const foreignFields = resolvedForeign
    ? {
        currency: resolvedForeign.currency,
        originalAmount: resolvedForeign.amount,
      }
    : {}

  return {
    id: d.id,
    ...(clientId ? { clientId } : {}),
    projectId: projectIdStr ? projectIdStr : undefined,
    type: normalizeFinanceExpenseTypeId(x.type),
    supplierId,
    supplierName,
    ...(supplierTaxId ? { supplierTaxId } : {}),
    platformName,
    amount:
      typeof x.amount === 'number' && !Number.isNaN(x.amount) ? x.amount : 0,
    name,
    ...(employeeName ? { employeeName } : {}),
    amountIncludesVat,
    ...(vatAmount !== undefined ? { vatAmount } : {}),
    ...(amountBeforeVat !== undefined ? { amountBeforeVat } : {}),
    description,
    recurring: x.recurring === true,
    billingMonth,
    vatLiable: x.vatLiable === false ? false : x.vatLiable === true ? true : undefined,
    ...(normalizeExpenseVatClass(x.vatClass)
      ? { vatClass: normalizeExpenseVatClass(x.vatClass) }
      : {}),
    ...(pnlMonth ? { pnlMonth } : {}),
    ...(linkedIncomeId ? { linkedIncomeId } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(paidDate ? { paidDate } : {}),
    ...(bankRef ? { bankRef } : {}),
    ...(source ? { source } : {}),
    ...(greenInvoiceId ? { greenInvoiceId } : {}),
    ...(greenInvoiceDocType !== undefined ? { greenInvoiceDocType } : {}),
    ...(greenInvoiceDocKind ? { greenInvoiceDocKind } : {}),
    ...(greenInvoiceNumber ? { greenInvoiceNumber } : {}),
    ...(greenInvoiceSupplierName ? { greenInvoiceSupplierName } : {}),
    ...(greenInvoiceSupplierTaxId ? { greenInvoiceSupplierTaxId } : {}),
    ...(matchedExpenseId ? { matchedExpenseId } : {}),
    ...(linkedGreenInvoiceId ? { linkedGreenInvoiceId } : {}),
    ...(reconciliationStatus ? { reconciliationStatus } : {}),
    ...(syncedAt ? { syncedAt } : {}),
    ...(x.hostingExpense === true ? { hostingExpense: true } : {}),
    // חשבונית ספק מוצמדת — בלעדיה מסך ההתאמות לא יודע שהתשלום מתועד
    ...(str(x.invoiceNumber) ? { invoiceNumber: str(x.invoiceNumber)! } : {}),
    ...(str(x.documentUrl) ? { documentUrl: str(x.documentUrl)! } : {}),
    ...(str(x.documentFileName)
      ? { documentFileName: str(x.documentFileName)! }
      : {}),
    ...(str(x.documentAttachedAt)
      ? { documentAttachedAt: str(x.documentAttachedAt)! }
      : {}),
    // שיוך חודשי — קובע לאיזה חודש הרשומה נספרת ברווח והפסד
    ...(str(x.documentDate)
      ? { documentDate: str(x.documentDate)!.slice(0, 10) }
      : {}),
    ...(str(x.documentMonth)
      ? { documentMonth: str(x.documentMonth)!.slice(0, 7) }
      : {}),
    ...(x.isLateDocument === true ? { isLateDocument: true } : {}),
    ...(str(x.expenseNote) ? { expenseNote: str(x.expenseNote)! } : {}),
    ...(str(x.refundForExpenseId)
      ? { refundForExpenseId: str(x.refundForExpenseId)! }
      : {}),
    // פריסת תשלום מראש על פני חודשים
    ...(num(x.spreadMonths) ? { spreadMonths: num(x.spreadMonths)! } : {}),
    ...(str(x.spreadStartMonth)
      ? { spreadStartMonth: str(x.spreadStartMonth)!.slice(0, 7) }
      : {}),
    // בכרטיס אשראי מועד החיוב בבנק שונה מתאריך העסקה
    ...(str(x.chargeDate)
      ? { chargeDate: str(x.chargeDate)!.slice(0, 10) }
      : {}),
    // מסמך במטבע חוץ — הסכום בשקלים עשוי להיות הערכה
    ...foreignFields,
    ...(x.amountIsEstimate === true ? { amountIsEstimate: true } : {}),
    supplierInvoiceReceived: x.supplierInvoiceReceived === true,
    createdAt: timestampToIso(x.createdAt),
  }
}

export function docToInvoice(d: QueryDocumentSnapshot<DocumentData>): Invoice {
  const x = d.data()
  const raw = (x.status ?? 'pending') as string
  const status = INVOICE_STATUSES.includes(raw as InvoiceStatus)
    ? (raw as InvoiceStatus)
    : 'pending'
  const pd = x.paidDate
  const dealIdRaw = x.dealId
  const dealId =
    typeof dealIdRaw === 'string' && dealIdRaw.trim() ? dealIdRaw.trim() : undefined
  const acp = x.agentCommissionPercent
  let agentCommissionPercent: number | undefined
  if (typeof acp === 'number' && Number.isFinite(acp)) {
    const p = Math.round(acp)
    if (p >= 0 && p <= 100) agentCommissionPercent = p
  }
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
    ...(dealId ? { dealId } : {}),
    ...(agentCommissionPercent !== undefined ? { agentCommissionPercent } : {}),
  }
}

export function docToAgentCommissionPayment(
  d: QueryDocumentSnapshot<DocumentData>,
): AgentCommissionPayment {
  const x = d.data()
  const pd = x.paidDate
  const paidDate =
    typeof pd === 'string' && /^\d{4}-\d{2}-\d{2}/.test(pd.trim())
      ? pd.trim().slice(0, 10)
      : ''
  const clientIdRaw = x.clientId
  const dealIdRaw = x.dealId
  return {
    id: d.id,
    agentUserId: String(x.agentUserId ?? ''),
    amount: typeof x.amount === 'number' && Number.isFinite(x.amount) ? x.amount : 0,
    paidDate,
    note: typeof x.note === 'string' && x.note.trim() ? String(x.note) : undefined,
    clientId:
      typeof clientIdRaw === 'string' && clientIdRaw.trim() ? clientIdRaw.trim() : undefined,
    dealId: typeof dealIdRaw === 'string' && dealIdRaw.trim() ? dealIdRaw.trim() : undefined,
    createdAt: timestampToIso(x.createdAt),
    createdBy: String(x.createdBy ?? ''),
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
  const sa = x.salesAgentUserId
  const salesAgentUserId =
    typeof sa === 'string' && sa.trim() ? sa.trim() : undefined
  const rawEmp = x.assignedEmployeeUserIds
  let assignedEmployeeUserIds: string[] | undefined
  if (Array.isArray(rawEmp)) {
    const ids = rawEmp
      .map((id) => (typeof id === 'string' && id.trim() ? id.trim() : ''))
      .filter(Boolean)
    if (ids.length) assignedEmployeeUserIds = ids
  }
  const legalName =
    typeof x.legalName === 'string' && x.legalName.trim() ? String(x.legalName).trim() : undefined
  const taxId =
    typeof x.taxId === 'string' && x.taxId.trim() ? String(x.taxId).trim() : undefined
  const addressLine =
    typeof x.addressLine === 'string' && x.addressLine.trim()
      ? String(x.addressLine).trim()
      : undefined
  const city = typeof x.city === 'string' && x.city.trim() ? String(x.city).trim() : undefined
  const businessNotes =
    typeof x.businessNotes === 'string' && x.businessNotes.trim()
      ? String(x.businessNotes).trim()
      : undefined
  const financeBalance =
    typeof x.financeBalance === 'number' && !Number.isNaN(x.financeBalance)
      ? x.financeBalance
      : undefined
  const greenInvoiceId =
    typeof x.greenInvoiceId === 'string' && x.greenInvoiceId.trim()
      ? x.greenInvoiceId.trim()
      : undefined
  const source = x.source === 'green_invoice' ? 'green_invoice' : undefined
  return {
    id: d.id,
    name: String(x.name ?? ''),
    contact: String(x.contact ?? ''),
    phone: String(x.phone ?? ''),
    email: String(x.email ?? ''),
    department,
    status: (x.status === 'inactive' ? 'inactive' : 'active') as Client['status'],
    createdAt: timestampToIso(x.createdAt),
    ...(salesAgentUserId ? { salesAgentUserId } : {}),
    ...(assignedEmployeeUserIds ? { assignedEmployeeUserIds } : {}),
    ...(legalName ? { legalName } : {}),
    ...(taxId ? { taxId } : {}),
    ...(addressLine ? { addressLine } : {}),
    ...(city ? { city } : {}),
    ...(businessNotes ? { businessNotes } : {}),
    ...(financeBalance !== undefined ? { financeBalance } : {}),
    ...(greenInvoiceId ? { greenInvoiceId } : {}),
    ...(source ? { source } : {}),
  }
}

function normalizeDealKind(raw: unknown): DealKind {
  const s = String(raw ?? '').trim()
  if (s === 'retainer_yearly') return 'retainer_yearly'
  if (s === 'one_time') return 'one_time'
  return 'retainer_monthly'
}

function parseScheduledPayments(value: unknown): DealScheduledPayment[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: DealScheduledPayment[] = []
  for (let i = 0; i < value.length; i++) {
    const item = value[i]
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const ymdRaw = o.expectedPaymentYmd
    const ymd =
      typeof ymdRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ymdRaw.trim().slice(0, 10))
        ? ymdRaw.trim().slice(0, 10)
        : undefined
    const amtRaw = o.amount
    const amount =
      typeof amtRaw === 'number' && Number.isFinite(amtRaw) && amtRaw >= 0 ? amtRaw : undefined
    if (!ymd || amount === undefined || amount <= 0) continue
    const idRaw = o.id
    const id = typeof idRaw === 'string' && idRaw.trim() ? idRaw.trim() : `sp-${i}-${ymd}`
    const labelRaw = o.label
    const label = typeof labelRaw === 'string' && labelRaw.trim() ? labelRaw.trim() : undefined
    out.push({ id, expectedPaymentYmd: ymd, amount, ...(label ? { label } : {}) })
  }
  return out.length > 0 ? out : undefined
}

function normalizeDealStatus(raw: unknown): DealStatus {
  const s = String(raw ?? '').trim()
  if (s === 'completed') return 'completed'
  if (s === 'cancelled') return 'cancelled'
  return 'active'
}

export function docToDeal(d: QueryDocumentSnapshot<DocumentData>): Deal {
  const x = d.data()
  const sa = x.salesAgentUserId
  const salesAgentUserId =
    typeof sa === 'string' && sa.trim() ? sa.trim() : undefined
  const lid = x.leadId
  const leadId = typeof lid === 'string' && lid.trim() ? lid.trim() : undefined
  const rawComm = x.commissionPercent
  let commissionPercent = 8
  if (typeof rawComm === 'number' && Number.isFinite(rawComm)) {
    commissionPercent = Math.min(100, Math.max(0, Math.round(rawComm)))
  }
  const rawAmt = x.agreedAmount
  const agreedAmount =
    typeof rawAmt === 'number' && Number.isFinite(rawAmt) && rawAmt >= 0 ? rawAmt : undefined
  const notes = typeof x.notes === 'string' && x.notes.trim() ? String(x.notes).trim() : undefined
  const ep = x.expectedPaymentYmd
  const expectedPaymentYmd =
    typeof ep === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ep.trim().slice(0, 10))
      ? ep.trim().slice(0, 10)
      : undefined
  const ab = x.annualBillingYmd
  const annualBillingYmd =
    typeof ab === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ab.trim().slice(0, 10))
      ? ab.trim().slice(0, 10)
      : undefined
  const fp = x.firstPaymentYmd
  const firstPaymentYmd =
    typeof fp === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fp.trim().slice(0, 10))
      ? fp.trim().slice(0, 10)
      : undefined
  const isHostingDeal = x.isHostingDeal === true
  const scheduledPayments = parseScheduledPayments(x.scheduledPayments)
  const cb = x.createdByUserId
  const createdByUserId =
    typeof cb === 'string' && cb.trim() ? cb.trim() : undefined
  return {
    id: d.id,
    clientId: String(x.clientId ?? '').trim(),
    dealKind: normalizeDealKind(x.dealKind),
    title: String(x.title ?? '').trim() || 'ללא כותרת',
    commissionPercent,
    status: normalizeDealStatus(x.status),
    createdAt: timestampToIso(x.createdAt),
    updatedAt: timestampToIso(x.updatedAt ?? x.createdAt),
    ...(leadId ? { leadId } : {}),
    ...(salesAgentUserId ? { salesAgentUserId } : {}),
    ...(agreedAmount !== undefined ? { agreedAmount } : {}),
    ...(expectedPaymentYmd ? { expectedPaymentYmd } : {}),
    ...(annualBillingYmd ? { annualBillingYmd } : {}),
    ...(firstPaymentYmd ? { firstPaymentYmd } : {}),
    ...(isHostingDeal ? { isHostingDeal: true } : {}),
    ...(scheduledPayments ? { scheduledPayments } : {}),
    ...(notes ? { notes } : {}),
    ...(createdByUserId ? { createdByUserId } : {}),
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
  const budgetTotal =
    typeof x.budgetTotal === 'number' && !Number.isNaN(x.budgetTotal)
      ? x.budgetTotal
      : undefined
  let budgetUsedPercent: number | undefined
  const rawBudgetUsed = x.budgetUsedPercent
  if (typeof rawBudgetUsed === 'number' && !Number.isNaN(rawBudgetUsed)) {
    budgetUsedPercent = Math.min(100, Math.max(0, Math.round(rawBudgetUsed)))
  }
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
    ...(budgetTotal !== undefined ? { budgetTotal } : {}),
    ...(budgetUsedPercent !== undefined ? { budgetUsedPercent } : {}),
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

function parseOptionalMeetingIso(value: unknown): string | undefined {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
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
    ...(x.completed === true
      ? {
          completed: true as const,
          completionSummary:
            typeof x.completionSummary === 'string' ? x.completionSummary : '',
          completedAt: parseOptionalMeetingIso(x.completedAt),
          completedByUserId:
            typeof x.completedByUserId === 'string' &&
            x.completedByUserId.trim()
              ? x.completedByUserId.trim()
              : undefined,
          completedByName:
            typeof x.completedByName === 'string' && x.completedByName.trim()
              ? x.completedByName.trim()
              : undefined,
        }
      : {}),
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
  const saLead = x.salesAgentUserId
  const salesAgentUserId =
    typeof saLead === 'string' && saLead.trim() ? saLead.trim() : undefined
  return {
    id: d.id,
    name: String(x.name ?? ''),
    company: typeof x.company === 'string' && x.company.trim() ? x.company.trim() : undefined,
    phone: typeof x.phone === 'string' && x.phone.trim() ? x.phone.trim() : undefined,
    email: typeof x.email === 'string' && x.email.trim() ? x.email.trim() : undefined,
    clientId,
    ...(salesAgentUserId ? { salesAgentUserId } : {}),
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

  let agentCommissionPercent: number | undefined
  if (typeof x.agentCommissionPercent === 'number' && Number.isFinite(x.agentCommissionPercent)) {
    const p = Math.round(x.agentCommissionPercent)
    if (p >= 0 && p <= 100) agentCommissionPercent = p
  }

  return {
    id: d.id,
    name: String(x.name ?? ''),
    avatar: String(x.avatar ?? '?'),
    color: String(x.color ?? '#2563EB'),
    role,
    email: typeof x.email === 'string' ? x.email : undefined,
    active: typeof x.active === 'boolean' ? x.active : true,
    isAgent: x.isAgent === true,
    ...(agentCommissionPercent !== undefined ? { agentCommissionPercent } : {}),
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

function asServerType(v: unknown): HostingRecord['serverType'] {
  return v === 'private' ? 'private' : 'shared'
}

function asDomainManager(v: unknown): HostingRecord['domainManager'] {
  if (v === 'client' || v === 'external') return v
  return 'agency'
}

function asBillingCycle(
  v: unknown,
  fallback: HostingRecord['hostingCycle'],
): HostingRecord['hostingCycle'] {
  if (
    v === 'monthly' ||
    v === 'yearly' ||
    v === 'biennial' ||
    v === 'oneTime'
  )
    return v
  return fallback
}

export function docToHostingRecord(
  d: QueryDocumentSnapshot<DocumentData>,
): HostingRecord {
  const x = d.data()
  const retainerRaw = x.retainerAmount
  const retainerAmount =
    typeof retainerRaw === 'number' && Number.isFinite(retainerRaw)
      ? retainerRaw
      : undefined
  return {
    id: d.id,
    clientId: String(x.clientId ?? ''),
    domain: String(x.domain ?? ''),
    siteName: String(x.siteName ?? ''),

    serverType: asServerType(x.serverType),
    // back-compat: שדה "server" הישן → serverProvider
    serverProvider: String(x.serverProvider ?? x.server ?? ''),
    serverLocation: String(x.serverLocation ?? ''),
    hostingRenewalDate: ymdPart(x.hostingRenewalDate),
    hostingCycle: asBillingCycle(x.hostingCycle, 'yearly'),

    registrar: String(x.registrar ?? ''),
    domainManager: asDomainManager(x.domainManager),
    domainManagerNote: String(x.domainManagerNote ?? ''),
    // back-compat: "domainExpiry" הישן → domainRenewalDate
    domainRenewalDate: ymdPart(x.domainRenewalDate ?? x.domainExpiry),

    greenInvoiceRetainer: Boolean(x.greenInvoiceRetainer),
    retainerAmount,
    retainerCycle: asBillingCycle(x.retainerCycle, 'monthly'),

    sslExpiry: ymdPart(x.sslExpiry),
    ipAddress: String(x.ipAddress ?? ''),
    controlPanel: String(x.controlPanel ?? ''),
    username: String(x.username ?? ''),
    platform: String(x.platform ?? ''),
    phpVersion: String(x.phpVersion ?? ''),

    notes: String(x.notes ?? ''),
    createdAt: timestampToIso(x.createdAt),
    updatedAt: x.updatedAt ? timestampToIso(x.updatedAt) : '',
  }
}

function asHourlyServiceStatus(v: unknown): HourlyService['status'] {
  if (v === 'paused' || v === 'closed') return v
  return 'active'
}

function asHourlyServiceKind(v: unknown): HourlyService['serviceKind'] {
  if (v === 'support' || v === 'maintenance' || v === 'consulting') return v
  return 'development'
}

function asHourlyWorkCategory(v: unknown): HourlyServiceEntry['workCategory'] {
  if (
    v === 'support' ||
    v === 'meeting' ||
    v === 'documentation' ||
    v === 'qa' ||
    v === 'other'
  )
    return v
  return 'development'
}

function asHourlyEntryStatus(v: unknown): HourlyServiceEntry['status'] {
  if (v === 'approved' || v === 'invoiced') return v
  return 'logged'
}

function hhmmPart(v: unknown): string {
  if (typeof v !== 'string') return ''
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
  if (!m) return ''
  return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`
}

export function docToHourlyService(
  d: QueryDocumentSnapshot<DocumentData>,
): HourlyService {
  const x = d.data()
  const hourlyRateRaw = x.hourlyRate
  const packageRaw = x.hoursPackageTotal ?? x.monthlyHoursBudget
  return {
    id: d.id,
    clientId: String(x.clientId ?? ''),
    title: String(x.title ?? ''),
    status: asHourlyServiceStatus(x.status),
    serviceKind: asHourlyServiceKind(x.serviceKind),
    hourlyRate:
      typeof hourlyRateRaw === 'number' && Number.isFinite(hourlyRateRaw)
        ? hourlyRateRaw
        : undefined,
    hoursPackageTotal:
      typeof packageRaw === 'number' && Number.isFinite(packageRaw)
        ? packageRaw
        : 0,
    projectId: x.projectId ? String(x.projectId) : undefined,
    notes: x.notes ? String(x.notes) : undefined,
    shareToken: x.shareToken ? String(x.shareToken) : undefined,
    shareEnabled: x.shareEnabled === true,
    createdAt: timestampToIso(x.createdAt),
    updatedAt: x.updatedAt ? timestampToIso(x.updatedAt) : undefined,
  }
}

export function docToHourlyServiceEntry(
  d: QueryDocumentSnapshot<DocumentData>,
  serviceId: string,
): HourlyServiceEntry {
  const x = d.data()
  const hoursRaw = x.hours
  return {
    id: d.id,
    serviceId: String(x.serviceId ?? serviceId),
    clientId: String(x.clientId ?? ''),
    performerId: String(x.performerId ?? ''),
    performerName: String(x.performerName ?? ''),
    workDate: ymdPart(x.workDate),
    startTime: hhmmPart(x.startTime) || undefined,
    endTime: hhmmPart(x.endTime) || undefined,
    hours:
      typeof hoursRaw === 'number' && Number.isFinite(hoursRaw) ? hoursRaw : 0,
    taskTitle: String(x.taskTitle ?? ''),
    description: x.description ? String(x.description) : undefined,
    workCategory: asHourlyWorkCategory(x.workCategory),
    billable: x.billable !== false,
    status: asHourlyEntryStatus(x.status),
    createdAt: timestampToIso(x.createdAt),
  }
}
