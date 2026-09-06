import { apiFetch } from './apiClient'

export type RivhitPaymentType = { id: number; label: string }

export type RivhitStatus = {
  ok: boolean
  configured: boolean
  supabaseServiceRole: boolean
  supabaseUserDb?: boolean
  types: {
    workOrder: number
    taxReceipt: number
    creditNote: number
    catalog: Array<{ id: number; name: string; isInvoiceReceipt: boolean }>
  } | null
  typeError: string | null
  paymentTypes?: RivhitPaymentType[]
}

export type DocLineInput = {
  description: string
  quantity: number
  priceNis: number
  catalogNumber?: string
  exemptVat?: boolean
}

export type PaymentInput = {
  paymentType: number
  amountNis: number
  dueDate?: string
  description?: string
  numberOfPayments?: number
  bankCode?: number
  branchNumber?: number
  bankAccountNumber?: string
  checkNumber?: number
}

export type FinanceDocument = {
  id: string
  kind: 'work_order' | 'tax_receipt' | 'credit_note'
  client_id: string
  parent_id: string | null
  project_id: string | null
  rivhit_customer_id: number | null
  rivhit_document_type: number | null
  rivhit_document_number: number | null
  rivhit_document_identity: string | null
  rivhit_document_link: string | null
  title: string
  amount_nis: number
  amount_before_vat?: number | null
  vat_amount?: number | null
  status: 'open' | 'partial' | 'paid' | 'cancelled'
  lines: unknown
  payments: unknown
  notes: string | null
  due_date?: string | null
  issue_date?: string | null
  reference_text?: string | null
  order_ref?: string | null
  discount_type?: number
  discount_value?: number
  price_include_vat?: boolean
  language?: string
  customer_snapshot?: Record<string, unknown>
  created_at: string
  clients?: {
    id: string
    name: string
    rivhit_customer_id: number | null
    phone?: string | null
    email?: string | null
    address_line?: string | null
    city?: string | null
    tax_id?: string | null
    contact?: string | null
  } | null
}

export const DEFAULT_PAYMENT_TYPES: RivhitPaymentType[] = [
  { id: 1, label: 'מזומן' },
  { id: 2, label: 'שיק' },
  { id: 3, label: 'אשראי' },
  { id: 4, label: 'העברה בנקאית' },
  { id: 5, label: 'תשלום אחר' },
  { id: 10, label: 'ביט' },
  { id: 11, label: 'פייבוקס' },
]

export const VAT_RATE = 0.18

export function calcDocTotals(
  lines: Array<{ quantity: number; priceNis: number; exemptVat?: boolean }>,
  opts: { priceIncludeVat: boolean; discountValue?: number },
) {
  const lineSum = lines.reduce((s, l) => s + l.quantity * l.priceNis, 0)
  const afterDiscount = Math.max(0, lineSum - (opts.discountValue ?? 0))
  if (opts.priceIncludeVat) {
    const before = Math.round((afterDiscount / (1 + VAT_RATE)) * 100) / 100
    const vat = Math.round((afterDiscount - before) * 100) / 100
    return {
      lineSum: Math.round(lineSum * 100) / 100,
      before,
      vat,
      total: Math.round(afterDiscount * 100) / 100,
    }
  }
  const before = Math.round(afterDiscount * 100) / 100
  const vat = Math.round(before * VAT_RATE * 100) / 100
  return {
    lineSum: Math.round(lineSum * 100) / 100,
    before,
    vat,
    total: Math.round((before + vat) * 100) / 100,
  }
}

export async function fetchRivhitStatus() {
  return apiFetch<RivhitStatus>('/api/rivhit/status')
}

export async function fetchFinanceDocuments(params?: {
  clientId?: string
  kind?: string
  parentId?: string
  openOnly?: boolean
}) {
  const q = new URLSearchParams()
  if (params?.clientId) q.set('clientId', params.clientId)
  if (params?.kind) q.set('kind', params.kind)
  if (params?.parentId) q.set('parentId', params.parentId)
  if (params?.openOnly) q.set('openOnly', '1')
  const suffix = q.toString() ? `?${q}` : ''
  return apiFetch<{ ok: boolean; items: FinanceDocument[] }>(`/api/finance/documents${suffix}`)
}

export async function fetchFinanceDocument(id: string) {
  return apiFetch<{ ok: boolean; document: FinanceDocument; children: FinanceDocument[] }>(
    `/api/finance/documents/${encodeURIComponent(id)}`,
  )
}

export async function ensureRivhitCustomer(clientId: string) {
  return apiFetch<{ ok: boolean; created: boolean; rivhitCustomerId: number }>(
    '/api/rivhit/customers/ensure',
    { method: 'POST', body: JSON.stringify({ clientId }) },
  )
}

export type WorkOrderPayload = {
  clientId: string
  title?: string
  projectId?: string
  notes?: string
  lines: DocLineInput[]
  dueDate?: string
  issueDate?: string
  orderRef?: string
  reference?: string
  discountType?: number
  discountValue?: number
  priceIncludeVat?: boolean
  language?: string
  sendMail?: boolean
  firstName?: string
  address?: string
  city?: string
  zipcode?: string
  phone?: string
}

export async function createWorkOrder(input: WorkOrderPayload) {
  return apiFetch<{ ok: boolean; document: FinanceDocument }>(
    '/api/rivhit/work-orders',
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export type TaxReceiptPayload = {
  workOrderId: string
  amountNis?: number
  description?: string
  notes?: string
  lines?: DocLineInput[]
  payments?: PaymentInput[]
  dueDate?: string
  issueDate?: string
  orderRef?: string
  reference?: string
  discountValue?: number
  priceIncludeVat?: boolean
  language?: string
  sendMail?: boolean
}

export async function createTaxReceipt(input: TaxReceiptPayload) {
  return apiFetch<{ ok: boolean; document: FinanceDocument; openBalanceBefore?: number }>(
    '/api/rivhit/tax-receipts',
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export async function cancelFinanceDocument(id: string, comments?: string) {
  return apiFetch<{ ok: boolean; creditNote?: FinanceDocument | null }>(
    `/api/rivhit/documents/${encodeURIComponent(id)}/cancel`,
    { method: 'POST', body: JSON.stringify({ comments }) },
  )
}

/** תצוגה מקדימה — דף המסמך האמיתי בריווחית (לא חיקוי UI) */
export async function previewRivhitDocument(input: {
  kind: 'work_order' | 'tax_receipt'
  clientId: string
  lines: DocLineInput[]
  payments?: PaymentInput[]
  notes?: string
  dueDate?: string
  orderRef?: string
  discountValue?: number
  priceIncludeVat?: boolean
  firstName?: string
  address?: string
  city?: string
  zipcode?: string
  phone?: string
  lastName?: string
}) {
  return apiFetch<{
    ok: boolean
    pageUrl: string
    documentType: number
    rivhitCustomerId: number
  }>('/api/rivhit/document-preview', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function syncRivhitFromDate(fromDate = '15/08/2026', toDate?: string) {
  return apiFetch<{ ok: boolean; result: {
    fromDate: string
    toDate: string
    customers: { fetched: number; created: number; updated: number }
    workOrders: { fetched: number; created: number; updated: number }
    taxReceipts: { fetched: number; created: number; updated: number }
    errors: string[]
  } }>('/api/rivhit/sync', {
    method: 'POST',
    body: JSON.stringify({ fromDate, toDate }),
  })
}

export function formatNisSimple(n: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 2,
  }).format(n)
}

export function docKindLabel(kind: FinanceDocument['kind']): string {
  if (kind === 'work_order') return 'הזמנת עבודה'
  if (kind === 'tax_receipt') return 'חשבונית מס קבלה'
  return 'חשבונית מס זיכוי'
}

export function docStatusLabel(status: FinanceDocument['status']): string {
  if (status === 'open') return 'פתוח לגבייה'
  if (status === 'partial') return 'שולם חלקית'
  if (status === 'paid') return 'שולם'
  return 'בוטל'
}

export function todayIsoDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
