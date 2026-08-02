import type { MorningDocument } from './morningClient.js'

/**
 * מיפוי מסמך חשבונית ירוקה → שדות FinanceIncome (כפי שנשמר ב-Firestore).
 * המיפוי סלחני לשמות שדות (ה-API מחזיר וריאציות) ומנרמל לתאריך YYYY-MM-DD.
 */

/** קודי סוגי מסמך ב-Morning */
export const MORNING_DOC_TYPE = {
  PRICE_QUOTE: 10,
  ORDER: 100,
  DELIVERY_NOTE: 200,
  RETURN_DELIVERY: 210,
  TRANSACTION_ACCOUNT: 300, // חשבון עסקה
  TAX_INVOICE: 305, // חשבונית מס
  TAX_INVOICE_RECEIPT: 320, // חשבונית מס קבלה
  CREDIT_INVOICE: 330, // חשבונית זיכוי
  RECEIPT: 400, // קבלה
  DONATION_RECEIPT: 405,
} as const

/** סוגי מסמך שנחשבים הכנסה ומיובאים */
export const INCOME_DOC_TYPES: number[] = [
  MORNING_DOC_TYPE.TRANSACTION_ACCOUNT,
  MORNING_DOC_TYPE.TAX_INVOICE,
  MORNING_DOC_TYPE.TAX_INVOICE_RECEIPT,
  MORNING_DOC_TYPE.CREDIT_INVOICE,
  MORNING_DOC_TYPE.RECEIPT,
]

/** מיפוי קוד סוג מסמך Morning → סוג מסמך Hub */
function documentKindForType(type: number): MappedIncome['documentKind'] {
  switch (type) {
    case MORNING_DOC_TYPE.TAX_INVOICE_RECEIPT:
      return 'tax_invoice_receipt'
    case MORNING_DOC_TYPE.TAX_INVOICE:
      return 'tax_invoice'
    case MORNING_DOC_TYPE.RECEIPT:
    case MORNING_DOC_TYPE.DONATION_RECEIPT:
      return 'receipt'
    case MORNING_DOC_TYPE.CREDIT_INVOICE:
      return 'credit_invoice'
    case MORNING_DOC_TYPE.TRANSACTION_ACCOUNT:
      return 'transaction_account'
    default:
      return 'transaction_account'
  }
}

export type MappedIncome = {
  greenInvoiceId: string
  greenInvoiceType: number
  greenInvoiceNumber: string
  documentKind:
    | 'tax_invoice_receipt'
    | 'tax_invoice'
    | 'receipt'
    | 'transaction_account'
    | 'credit_invoice'
  amount: number
  amountIncludesVat: boolean
  vatAmount?: number
  amountBeforeVat?: number
  invoiceNumber: string
  invoiceDate: string
  status: 'paid' | 'pending' | 'partial'
  /** סכום ששולם בפועל על המסמך (תשלומים חלקיים בתוך חשבון עסקה) */
  paidAmount?: number
  /** קוד סטטוס המסמך ב-GI — 0 פתוח · 1 סגור · 2 נסגר ידנית · 3/4 מבוטל */
  greenInvoiceStatus?: number
  description?: string
  clientName: string
  clientTaxId: string
  clientEmail: string
  source: 'green_invoice'
  /** מזהה הלקוח בחשבונית ירוקה — לקישור מהימן ללקוח שסונכרן */
  clientGreenInvoiceId: string
  /** האם המסמך מבוטל (יש להסיר מהמאגר) */
  cancelled: boolean
}

/** סוגי מסמך שמייצגים תקבול ומקטינים יתרה פתוחה בחשבון עסקה */
const LINKED_PAYMENT_DOC_TYPES = new Set<number>([
  MORNING_DOC_TYPE.TAX_INVOICE_RECEIPT,
  MORNING_DOC_TYPE.RECEIPT,
  MORNING_DOC_TYPE.DONATION_RECEIPT,
])

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** סכום מערך payment של מסמך Morning (אם קיים בתוצאת search/get) */
export function sumDocumentPaymentArray(doc: MorningDocument): number {
  const payment = doc.payment
  if (!Array.isArray(payment)) return 0
  let sum = 0
  for (const raw of payment) {
    if (!raw || typeof raw !== 'object') continue
    const p = raw as Record<string, unknown>
    const price = firstNumber(p, ['price', 'amount', 'sum', 'total'])
    if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
      sum += price
    }
  }
  return round2(sum)
}

/** סכום תקבולים ממסמכים מקושרים (קבלה / חשבונית מס קבלה) */
export function sumLinkedPaymentDocuments(linked: MorningDocument[]): number {
  let sum = 0
  for (const doc of linked) {
    const type = firstNumber(doc, ['type', 'documentType'])
    if (type === undefined || !LINKED_PAYMENT_DOC_TYPES.has(type)) continue
    const status = firstNumber(doc, ['status'])
    if (status === 3 || status === 4) continue // מבוטל
    let amount =
      firstNumber(doc, ['amount', 'amountWithVat', 'total', 'totalAmount']) ?? 0
    if (amount <= 0) {
      amount = sumDocumentPaymentArray(doc)
    }
    if (amount > 0) sum += amount
  }
  return round2(sum)
}

/**
 * מעדכן חשבון עסקה פתוח עם סכום ששולם (תשלום חלקי).
 * לא סוגר את המסמך — סטטוס GI נשאר מקור האמת לפתיחה/סגירה.
 */
export function applyPartialPaidToMappedIncome(
  income: MappedIncome,
  paidCandidate: number,
): MappedIncome {
  if (income.cancelled || income.status === 'paid') return income
  if (income.documentKind !== 'transaction_account') return income
  const paid = round2(Math.max(income.paidAmount ?? 0, paidCandidate))
  if (paid <= 0) return income
  return {
    ...income,
    paidAmount: Math.min(paid, Math.abs(income.amount)),
    status: 'partial',
  }
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

/** נרמול תאריך מסמך: unix שניות / מילישניות / מחרוזת ISO → YYYY-MM-DD */
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

function extractClient(doc: MorningDocument): {
  name: string
  taxId: string
  email: string
  greenInvoiceId: string
} {
  const client = (doc.client ?? {}) as Record<string, unknown>
  const name =
    firstString(client, ['name', 'companyName']) ||
    firstString(doc, ['clientName', 'name'])
  const taxId = firstString(client, ['taxId', 'vatId', 'idNumber', 'taxid'])
  let email = firstString(client, ['email', 'emailAddress'])
  if (!email && Array.isArray(client.emails) && client.emails.length > 0) {
    const first = client.emails[0]
    if (typeof first === 'string') email = first.trim()
  }
  const greenInvoiceId =
    firstString(client, ['id', '_id']) || firstString(doc, ['clientId'])
  return { name, taxId, email, greenInvoiceId }
}

/**
 * ממפה מסמך Morning לשדות הכנסה.
 * מחזיר null אם זה לא סוג מסמך הכנסה (הצעת מחיר, הזמנה וכו׳).
 */
export function mapMorningDocument(doc: MorningDocument): MappedIncome | null {
  const type = firstNumber(doc, ['type', 'documentType'])
  if (type === undefined || !INCOME_DOC_TYPES.includes(type)) return null

  const greenInvoiceId = firstString(doc, ['id', '_id', 'documentId'])
  if (!greenInvoiceId) return null

  const status = firstNumber(doc, ['status'])
  const cancelled = status === 3 || status === 4 // canceling / canceled

  const number = firstString(doc, ['number', 'documentNumber', 'num'])
  const invoiceDate = normalizeDate(
    doc.documentDate ?? doc.date ?? doc.creationDate ?? doc.created,
  )

  // סכום כולל מע״מ. בזיכוי (330) הופכים לשלילי.
  let amount =
    firstNumber(doc, ['amount', 'amountWithVat', 'total', 'totalAmount']) ?? 0
  if (type === MORNING_DOC_TYPE.CREDIT_INVOICE && amount > 0) {
    amount = -amount
  }

  const vatRaw = firstNumber(doc, ['vat', 'vatAmount'])
  const vatAmount = typeof vatRaw === 'number' ? Math.abs(vatRaw) : undefined

  const documentKind = documentKindForType(type)
  const client = extractClient(doc)
  const description =
    firstString(doc, ['description', 'remarks', 'subject']) || undefined

  // סטטוס GI: 1 סגור / 2 נסגר ידנית = שולם/נסגר; 0 פתוח = ממתין
  const giClosed = status === 1 || status === 2
  const isPaidKind =
    documentKind === 'tax_invoice_receipt' ||
    documentKind === 'receipt' ||
    documentKind === 'credit_invoice'
  // חשבון עסקה / חשבונית מס — סטטוס לפי GI אחד-לאחד (סגור = שולם)
  const isPaid = isPaidKind || giClosed
  const paymentPaid = sumDocumentPaymentArray(doc)
  const roundedAmount = round2(amount)

  let mappedStatus: MappedIncome['status'] = isPaid ? 'paid' : 'pending'
  let paidAmount: number | undefined
  if (isPaid) {
    paidAmount = Math.abs(roundedAmount)
  } else if (
    documentKind === 'transaction_account' &&
    paymentPaid > 0
  ) {
    // תשלומים חלקיים בתוך חשבון עסקה פתוח — לא סוגרים את המסמך
    mappedStatus = 'partial'
    paidAmount = Math.min(paymentPaid, Math.abs(roundedAmount))
  }

  return {
    greenInvoiceId,
    greenInvoiceType: type,
    greenInvoiceNumber: number,
    documentKind,
    amount: roundedAmount,
    amountIncludesVat: true,
    ...(vatAmount !== undefined ? { vatAmount } : {}),
    invoiceNumber: number,
    invoiceDate,
    status: mappedStatus,
    ...(paidAmount !== undefined ? { paidAmount } : {}),
    ...(typeof status === 'number' ? { greenInvoiceStatus: status } : {}),
    ...(description ? { description } : {}),
    clientName: client.name,
    clientTaxId: client.taxId,
    clientEmail: client.email,
    clientGreenInvoiceId: client.greenInvoiceId,
    source: 'green_invoice',
    cancelled,
  }
}
