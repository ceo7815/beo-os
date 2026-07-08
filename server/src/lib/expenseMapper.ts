import type { MorningDocument } from './morningClient.js'

/** סוגי מסמך הוצאה ב-Morning */
export const GI_EXPENSE_DOC_TYPE = {
  INVOICE: 10,
  RECEIPT: 20,
  INVOICE_RECEIPT: 30,
  OTHER: 40,
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
  const name =
    firstString(supplier, ['name', 'companyName']) ||
    firstString(doc, ['supplierName', 'name'])
  const taxId = firstString(supplier, ['taxId', 'vatId', 'idNumber', 'taxid'])
  const greenInvoiceId =
    firstString(supplier, ['id', '_id']) || firstString(doc, ['supplierId'])
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

  const amount =
    firstNumber(doc, ['amount', 'amountWithVat', 'total', 'totalAmount']) ?? 0
  if (amount <= 0) return null

  const vatRaw = firstNumber(doc, ['vat', 'vatAmount'])
  const vatAmount = typeof vatRaw === 'number' ? Math.abs(vatRaw) : undefined
  const amountBeforeVat =
    vatAmount !== undefined
      ? Math.round((amount - vatAmount) * 100) / 100
      : undefined

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
    amount: Math.round(amount * 100) / 100,
    amountIncludesVat: true,
    ...(vatAmount !== undefined ? { vatAmount } : {}),
    ...(amountBeforeVat !== undefined ? { amountBeforeVat } : {}),
    documentDate,
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
