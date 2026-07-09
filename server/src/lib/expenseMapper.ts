import type { MorningDocument } from './morningClient.js'

/** סוגי מסמך הוצאה ב-Morning */
export const GI_EXPENSE_DOC_TYPE = {
  INVOICE: 10,
  RECEIPT: 20,
  INVOICE_RECEIPT: 30,
  OTHER: 40,
  /** זיכוי / החזר */
  CREDIT_NOTE: 330,
} as const

export type MappedExpense = {
  greenInvoiceId: string
  greenInvoiceDocType: number
  greenInvoiceDocKind: 'invoice' | 'receipt' | 'invoice_receipt' | 'other'
  greenInvoiceNumber: string
  amount: number
  amountIncludesVat: boolean
  vatAmount?: number
  amountBeforeVat?: number
  documentDate: string
  /** תאריך דיווח ב-GI (לרוב חודש המסמך לצורכי התאמה) */
  reportingDate?: string
  paidDate?: string
  paymentMethod?: 'bank_transfer' | 'credit_card'
  supplierName: string
  supplierTaxId: string
  supplierGreenInvoiceId: string
  description?: string
  /** 10 פתוח · 20 דווח */
  greenInvoiceStatus?: number
  source: 'green_invoice'
  supplierInvoiceReceived: true
}

function firstString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return ''
}

function firstNumber(
  obj: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) {
      return Number(v)
    }
  }
  return undefined
}

function normalizeDate(raw: unknown): string {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const ms = raw > 1e12 ? raw : raw * 1000
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  if (typeof raw === 'string' && raw.trim()) {
    const s = raw.trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return ''
}

function docKindForType(type: number): MappedExpense['greenInvoiceDocKind'] {
  switch (type) {
    case GI_EXPENSE_DOC_TYPE.INVOICE:
      return 'invoice'
    case GI_EXPENSE_DOC_TYPE.RECEIPT:
      return 'receipt'
    case GI_EXPENSE_DOC_TYPE.INVOICE_RECEIPT:
      return 'invoice_receipt'
    default:
      return 'other'
  }
}

function extractSupplier(doc: MorningDocument): {
  name: string
  taxId: string
  greenInvoiceId: string
} {
  const supplier = (doc.supplier ?? {}) as Record<string, unknown>
  const dataBlock = doc.data as Record<string, unknown> | undefined
  const nestedSupplier = (dataBlock?.supplier ?? {}) as Record<string, unknown>
  const name =
    firstString(supplier, ['name', 'companyName']) ||
    firstString(nestedSupplier, ['name', 'companyName']) ||
    firstString(doc, ['supplierName', 'name'])
  const taxId =
    firstString(supplier, ['taxId', 'vatId', 'idNumber', 'taxid']) ||
    firstString(nestedSupplier, ['taxId', 'vatId', 'idNumber', 'taxid'])
  const greenInvoiceId =
    firstString(supplier, ['id', '_id']) ||
    firstString(nestedSupplier, ['id', '_id']) ||
    firstString(doc, ['supplierId'])
  return { name, taxId, greenInvoiceId }
}

function extractPayment(doc: MorningDocument): {
  paidDate?: string
  paymentMethod?: 'bank_transfer' | 'credit_card'
} {
  const payment = doc.payment as Record<string, unknown> | undefined
  if (!payment || typeof payment !== 'object') return {}
  const paidDate = normalizeDate(
    payment.date ?? payment.paymentDate ?? payment.paidDate,
  )
  const type = firstNumber(payment, ['type'])
  let paymentMethod: 'bank_transfer' | 'credit_card' | undefined
  if (type === 3) paymentMethod = 'credit_card'
  else if (type === 4 || type === 1 || type === 2) paymentMethod = 'bank_transfer'
  return {
    ...(paidDate ? { paidDate } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * סכומים כפי שמוצגים ב-GI:
 * - מטבע זר: amountLocal (שקלים) ולא amount (מטבע מקור)
 * - זיכויים: businessAmount / businessVat (שליליים)
 */
function extractAmounts(doc: MorningDocument): {
  amount: number
  vatAmount?: number
  amountBeforeVat?: number
} | null {
  const businessAmount = firstNumber(doc, ['businessAmount'])
  const businessVat = firstNumber(doc, ['businessVat'])
  const businessAmountExcludeVat = firstNumber(doc, [
    'businessAmountExcludeVat',
  ])

  if (typeof businessAmount === 'number' && businessAmount < 0) {
    const vatAmount =
      typeof businessVat === 'number' ? round2(businessVat) : undefined
    const amountBeforeVat =
      typeof businessAmountExcludeVat === 'number'
        ? round2(businessAmountExcludeVat)
        : vatAmount !== undefined
          ? round2(businessAmount - vatAmount)
          : undefined
    return {
      amount: round2(businessAmount),
      ...(vatAmount !== undefined ? { vatAmount } : {}),
      ...(amountBeforeVat !== undefined ? { amountBeforeVat } : {}),
    }
  }

  const amount =
    firstNumber(doc, ['amountLocal', 'amount', 'amountWithVat', 'total']) ?? 0
  if (amount === 0) return null

  const vatRaw = firstNumber(doc, [
    'businessVat',
    'vatAccounting',
    'vat',
    'vatAmount',
  ])
  const vatAmount =
    typeof vatRaw === 'number' ? round2(vatRaw) : undefined
  const amountExcludeVat = firstNumber(doc, [
    'businessAmountExcludeVat',
    'amountExcludeVat',
    'amountExcludeLocal',
  ])
  const amountBeforeVat =
    typeof amountExcludeVat === 'number'
      ? round2(amountExcludeVat)
      : vatAmount !== undefined
        ? round2(amount - vatAmount)
        : undefined

  return {
    amount: round2(amount),
    ...(vatAmount !== undefined ? { vatAmount } : {}),
    ...(amountBeforeVat !== undefined ? { amountBeforeVat } : {}),
  }
}

/** ממפה הוצאה מ-Morning לשדות FinanceExpense */
export function mapMorningExpense(doc: MorningDocument): MappedExpense | null {
  const greenInvoiceId = firstString(doc, ['id', '_id', 'expenseId'])
  if (!greenInvoiceId) return null

  const docType = firstNumber(doc, ['type', 'documentType']) ?? GI_EXPENSE_DOC_TYPE.INVOICE
  const number = firstString(doc, ['number', 'documentNumber', 'num'])
  const documentDate = normalizeDate(
    doc.documentDate ?? doc.date ?? doc.creationDate ?? doc.created,
  )
  if (!documentDate) return null

  const reportingDate = normalizeDate(doc.reportingDate) || undefined

  const amounts = extractAmounts(doc)
  if (!amounts) return null

  const supplier = extractSupplier(doc)
  const payment = extractPayment(doc)
  const status = firstNumber(doc, ['status'])
  const description =
    firstString(doc, ['description', 'remarks', 'subject']) || undefined

  return {
    greenInvoiceId,
    greenInvoiceDocType: docType,
    greenInvoiceDocKind: docKindForType(docType),
    greenInvoiceNumber: number,
    amount: amounts.amount,
    amountIncludesVat: true,
    ...(amounts.vatAmount !== undefined ? { vatAmount: amounts.vatAmount } : {}),
    ...(amounts.amountBeforeVat !== undefined
      ? { amountBeforeVat: amounts.amountBeforeVat }
      : {}),
    documentDate,
    ...(reportingDate ? { reportingDate } : {}),
    ...(payment.paidDate ? { paidDate: payment.paidDate } : {}),
    ...(payment.paymentMethod ? { paymentMethod: payment.paymentMethod } : {}),
    supplierName: supplier.name,
    supplierTaxId: supplier.taxId,
    supplierGreenInvoiceId: supplier.greenInvoiceId,
    ...(description ? { description } : {}),
    ...(typeof status === 'number' ? { greenInvoiceStatus: status } : {}),
    source: 'green_invoice',
    supplierInvoiceReceived: true,
  }
}
