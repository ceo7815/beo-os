import { env } from '../config/env.js'

const RIVHIT_BASE = 'https://api.rivhit.co.il/online/RivhitOnlineAPI.svc'

export type RivhitResponse<T> = {
  error_code: number
  client_message?: string
  debug_message?: string
  data?: T
}

export type RivhitDocumentType = {
  document_type: number
  document_name: string
  is_invoice_receipt?: boolean
  is_accounting?: boolean
  price_include_vat?: boolean
}

export type RivhitDocLine = {
  catalog_number?: string
  description: string
  quantity: number
  price_nis: number
  exempt_vat?: boolean
}

export type RivhitPayment = {
  payment_type: number
  amount_nis: number
  due_date?: string
  description?: string
  bank_code?: number
  branch_number?: number
  bank_account_number?: string
  check_number?: number
  number_of_payments?: number
}

export class RivhitError extends Error {
  constructor(
    message: string,
    public readonly errorCode: number,
    public readonly debug?: string,
  ) {
    super(message)
    this.name = 'RivhitError'
  }
}

function tokenOrThrow(): string {
  const t = env.rivhitApiToken
  if (!t) {
    throw new RivhitError('חסר RIVHIT_API_TOKEN בשרת', 401)
  }
  return t
}

export function rivhitConfigured(): boolean {
  return Boolean(env.rivhitApiToken)
}

async function rivhitPost<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const api_token = tokenOrThrow()
  const res = await fetch(`${RIVHIT_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ api_token, ...body }),
  })
  const json = (await res.json()) as RivhitResponse<T>
  if (!res.ok || json.error_code !== 0) {
    throw new RivhitError(
      json.client_message || json.debug_message || `ריווחית שגיאה ${json.error_code}`,
      json.error_code ?? res.status,
      json.debug_message,
    )
  }
  if (json.data === undefined || json.data === null) {
    throw new RivhitError('ריווחית לא החזירה data', json.error_code)
  }
  return json.data
}

export async function rivhitDocumentTypeList(): Promise<RivhitDocumentType[]> {
  const data = await rivhitPost<{ document_type_list?: RivhitDocumentType[] }>(
    '/Document.TypeList',
    {},
  )
  return data.document_type_list ?? []
}

export type ResolvedRivhitTypes = {
  workOrder: number
  taxReceipt: number
  creditNote: number
  raw: RivhitDocumentType[]
}

function pickType(
  list: RivhitDocumentType[],
  predicates: Array<(t: RivhitDocumentType) => boolean>,
): number | null {
  for (const pred of predicates) {
    const hit = list.find(pred)
    if (hit) return hit.document_type
  }
  return null
}

/** מזהה סוגי מסמך לפי שם בעברית / דגל is_invoice_receipt */
export async function resolveRivhitDocumentTypes(): Promise<ResolvedRivhitTypes> {
  const raw = await rivhitDocumentTypeList()
  const workOrder =
    env.rivhitWorkOrderType ||
    pickType(raw, [
      (t) => /הזמנת\s*עבודה/.test(t.document_name),
      (t) => /הזמנה/.test(t.document_name) && !/רכישה/.test(t.document_name),
      (t) => /order/i.test(t.document_name),
    ])
  const taxReceipt =
    env.rivhitTaxReceiptType ||
    pickType(raw, [
      (t) => Boolean(t.is_invoice_receipt),
      (t) => /חשבונית\s*מס\s*קבלה/.test(t.document_name),
    ])
  const creditNote =
    env.rivhitCreditNoteType ||
    pickType(raw, [
      (t) => /חשבונית\s*מס\s*זיכוי/.test(t.document_name),
      (t) => /זיכוי/.test(t.document_name),
    ])

  if (!workOrder || !taxReceipt || !creditNote) {
    throw new RivhitError(
      `לא זוהו סוגי מסמך בריווחית (הזמנה=${workOrder ?? '—'}, מס-קבלה=${taxReceipt ?? '—'}, זיכוי=${creditNote ?? '—'}). הגדירו RIVHIT_*_TYPE או בדקו Document.TypeList.`,
      400,
    )
  }
  return { workOrder, taxReceipt, creditNote, raw }
}

export type NewCustomerInput = {
  last_name: string
  first_name?: string
  address?: string
  city?: string
  zipcode?: number
  phone?: string
  phone2?: string
  fax?: string
  email?: string
  id_number?: number
  vat_number?: number
  agent_id?: number
  project_id?: number
  paying_customer_id?: number
  acc_ref?: string
  country?: string
  currency_id?: number
  comments?: string
  cust_id?: number
}

export async function rivhitCustomerNew(
  input: NewCustomerInput,
): Promise<{ customer_id: number }> {
  const body: Record<string, unknown> = {
    last_name: input.last_name.slice(0, 30),
    customer_type: 1,
  }
  if (input.first_name) body.first_name = input.first_name.slice(0, 20)
  if (input.address) body.address = input.address.slice(0, 30)
  if (input.city) body.city = input.city.slice(0, 20)
  if (input.zipcode) body.zipcode = input.zipcode
  if (input.phone) body.phone = input.phone.slice(0, 15)
  if (input.phone2) body.phone2 = input.phone2.slice(0, 15)
  if (input.fax) body.fax = input.fax.slice(0, 15)
  if (input.email) body.email = input.email.slice(0, 50)
  if (input.id_number) body.id_number = input.id_number
  if (input.vat_number) body.vat_number = input.vat_number
  if (input.agent_id) body.agent_id = input.agent_id
  if (input.project_id) body.project_id = input.project_id
  if (input.paying_customer_id) body.paying_customer_id = input.paying_customer_id
  if (input.acc_ref) body.acc_ref = input.acc_ref.slice(0, 20)
  if (input.country) body.country = input.country.slice(0, 39)
  if (input.currency_id) body.currency_id = input.currency_id
  if (input.comments) body.comments = input.comments.slice(0, 400)
  if (input.cust_id) body.cust_id = input.cust_id
  return rivhitPost('/Customer.New', body)
}

function digitsOnly(v: unknown): number | undefined {
  const s = String(v ?? '').replace(/\D/g, '')
  if (!s || s.length < 5) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

/** מיפוי לקוח Beo → Customer.New בריווחית */
export function clientToRivhitCustomerInput(
  client: Record<string, unknown>,
  clientId: string,
): NewCustomerInput {
  return {
    last_name: String(client.name || client.legal_name || 'לקוח').slice(0, 30),
    first_name: String(client.contact || '').slice(0, 20) || undefined,
    address: client.address_line ? String(client.address_line).slice(0, 30) : undefined,
    city: client.city ? String(client.city).slice(0, 20) : undefined,
    zipcode: digitsOnly(client.zipcode),
    phone: client.phone ? String(client.phone).slice(0, 15) : undefined,
    phone2: client.phone2 ? String(client.phone2).slice(0, 15) : undefined,
    fax: client.fax ? String(client.fax).slice(0, 15) : undefined,
    email: client.email ? String(client.email).slice(0, 50) : undefined,
    id_number: digitsOnly(client.id_number),
    vat_number: digitsOnly(client.tax_id),
    country: client.country ? String(client.country).slice(0, 39) : 'ישראל',
    currency_id: String(client.currency || 'ILS').toUpperCase() === 'USD' ? 2 : 1,
    project_id: digitsOnly(client.rivhit_project_ref),
    acc_ref: clientId.replace(/-/g, '').slice(0, 9),
    comments: 'נוצר מ-Beo OS',
  }
}

export type DocumentCreateData = {
  document_type: number
  document_number: number
  customer_id: number
  document_identity?: string
  document_link?: string
  print_status?: number
  amount?: number
  confirmation_number?: number
}

export async function rivhitDocumentNew(body: {
  document_type: number
  customer_id: number
  items: RivhitDocLine[]
  payments?: RivhitPayment[]
  comments?: string
  due_date?: string
  issue_date?: string
  price_include_vat?: boolean
  send_mail?: boolean
  closed_document_type?: number
  closed_document_number?: number
  create_items?: boolean
  order?: string
  reference?: number | string
  discount_type?: number
  discount_value?: number
      language?: string
  zipcode?: number
  last_name?: string
  first_name?: string
  address?: string
  city?: string
  phone?: string
  email_to?: string
}): Promise<DocumentCreateData> {
  const payload: Record<string, unknown> = {
    price_include_vat: body.price_include_vat ?? false,
    send_mail: body.send_mail ?? false,
    create_items: body.create_items ?? true,
    document_type: body.document_type,
    customer_id: body.customer_id,
    items: body.items.map((it) => ({
      catalog_number: it.catalog_number ?? '',
      description: it.description,
      quantity: it.quantity,
      price_nis: it.price_nis,
      bruto_price_nis: it.price_nis,
      exempt_vat: it.exempt_vat ?? false,
    })),
  }
  if (body.payments?.length) payload.payments = body.payments
  if (body.comments) payload.comments = body.comments
  if (body.due_date) payload.due_date = body.due_date
  if (body.issue_date) payload.issue_date = body.issue_date
  if (body.closed_document_type) payload.closed_document_type = body.closed_document_type
  if (body.closed_document_number) payload.closed_document_number = body.closed_document_number
  if (body.order) payload.order = body.order
  if (body.reference != null && body.reference !== '') payload.reference = body.reference
  if (body.discount_type) payload.discount_type = body.discount_type
  if (body.discount_value) payload.discount_value = body.discount_value
  if (body.language) payload.language = body.language
  if (body.zipcode) payload.zipcode = body.zipcode
  if (body.last_name) payload.last_name = body.last_name
  if (body.first_name) payload.first_name = body.first_name
  if (body.address) payload.address = body.address
  if (body.city) payload.city = body.city
  if (body.phone) payload.phone = body.phone
  if (body.email_to) payload.email_to = body.email_to

  return rivhitPost('/Document.New', payload)
}

export type CancelDocumentData = {
  status: number
  cancel_document_type: number
  cancel_document_number: number
  cancel_document_identity?: string
  cancel_document_link?: string
}

export async function rivhitDocumentCancel(body: {
  document_type: number
  document_number: number
  comments?: string
  cancellation_date?: string
}): Promise<CancelDocumentData> {
  return rivhitPost('/Document.Cancel', body)
}

export type RivhitCustomerRow = {
  customer_id: number
  last_name?: string
  first_name?: string
  address?: string
  city?: string
  zipcode?: number | string
  phone?: string
  phone2?: string
  fax?: string
  email?: string
  id_number?: number | string
  vat_number?: number | string
  country?: string
  currency_id?: number
  acc_ref?: string
}

export type RivhitDocumentListRow = {
  document_type: number
  document_number: number
  document_date?: string
  document_time?: string
  amount?: number
  amount_exempt?: number
  customer_id?: number
  customer_name?: string
  document_link?: string
  document_identity?: string
  is_cancelled?: boolean
  is_closed?: boolean
}

export type RivhitDocumentDetails = {
  customer_id?: number
  customer_name?: string
  customer_address?: string
  customer_city?: string
  customer_email?: string
  customer_phone?: string
  customer_zipcode?: number
  comments?: string
  document_date?: string
  document_due_date?: string
  document_number?: string | number
  document_type?: string | number
  document_total?: number
  discount_amount?: number
  is_cancelled?: boolean
  is_closed?: boolean
  items?: Array<{
    description?: string
    quantity?: number
    price_nis?: number
    catalog_number?: string
    total_line?: number
  }>
  payments?: Array<Record<string, unknown>>
}

export async function rivhitCustomerList(opts?: {
  customer_type?: number
  created_after?: string
}): Promise<RivhitCustomerRow[]> {
  const data = await rivhitPost<{ customer_list?: RivhitCustomerRow[] } | RivhitCustomerRow[]>(
    '/Customer.List',
    {
      customer_type: opts?.customer_type ?? 1,
      ...(opts?.created_after ? { created_after: opts.created_after } : {}),
    },
  )
  if (Array.isArray(data)) return data
  return data.customer_list ?? []
}

export async function rivhitCustomerGet(customer_id: number): Promise<RivhitCustomerRow> {
  return rivhitPost<RivhitCustomerRow>('/Customer.Get', { customer_id })
}

export async function rivhitDocumentList(opts: {
  from_date: string
  to_date: string
  from_document_type?: number
  to_document_type?: number
}): Promise<RivhitDocumentListRow[]> {
  const data = await rivhitPost<
    RivhitDocumentListRow[] | { document_list?: RivhitDocumentListRow[] }
  >('/Document.List', {
    from_date: opts.from_date,
    to_date: opts.to_date,
    ...(opts.from_document_type != null
      ? { from_document_type: opts.from_document_type }
      : {}),
    ...(opts.to_document_type != null ? { to_document_type: opts.to_document_type } : {}),
  })
  if (Array.isArray(data)) return data
  return data.document_list ?? []
}

export async function rivhitDocumentDetails(
  document_type: number,
  document_number: number,
): Promise<RivhitDocumentDetails> {
  return rivhitPost<RivhitDocumentDetails>('/Document.Details', {
    document_type,
    document_number,
  })
}

export async function rivhitDocumentCopy(
  document_type: number,
  document_number: number,
): Promise<{ document_link?: string; document_identity?: string }> {
  try {
    return await rivhitPost<{ document_link?: string; document_identity?: string }>(
      '/Document.Copy',
      { document_type, document_number },
    )
  } catch {
    return {}
  }
}

/**
 * דף הפקה/תצוגה בריווחית עצמה — מחזיר page_url של המסמך האמיתי (לא חיקוי).
 */
export async function rivhitDocumentPage(body: {
  document_type: number
  customer_id?: number
  last_name?: string
  first_name?: string
  address?: string
  city?: string
  zipcode?: number
  phone?: string
  comments?: string
  order?: string
  due_date?: string
  price_include_vat?: boolean
  discount_value?: number
  email_to?: string
  items: Array<{
    description: string
    quantity: number
    price: number
    catalog_number?: string
  }>
  payments?: Array<{
    payment_type: number
    amount: number
    due_date?: string
    description?: string
  }>
  redirect_url?: string
}): Promise<{ page_url: string }> {
  const payload: Record<string, unknown> = {
    document_type: body.document_type,
    price_include_vat: body.price_include_vat ?? false,
    items: body.items.map((it) => ({
      catalog_number: it.catalog_number ?? '',
      description: it.description,
      quantity: it.quantity,
      price: it.price,
    })),
  }
  if (body.customer_id) payload.customer_id = body.customer_id
  if (body.last_name) payload.last_name = body.last_name
  if (body.first_name) payload.first_name = body.first_name
  if (body.address) payload.address = body.address
  if (body.city) payload.city = body.city
  if (body.zipcode) payload.zipcode = body.zipcode
  if (body.phone) payload.phone = body.phone
  if (body.comments) payload.comments = body.comments
  if (body.order) payload.order = body.order
  if (body.due_date) payload.due_date = body.due_date
  if (body.discount_value) payload.discount_value = body.discount_value
  if (body.email_to) payload.email_to = body.email_to
  if (body.payments?.length) payload.payments = body.payments
  if (body.redirect_url) payload.redirect_url = body.redirect_url

  const data = await rivhitPost<{ page_url?: string }>('/Document.Page', payload)
  if (!data.page_url) {
    throw new RivhitError('ריווחית לא החזירה page_url לתצוגה מקדימה', 400)
  }
  return { page_url: data.page_url }
}

/** תאריך לריווחית: DD/MM/YYYY */
export function toRivhitDate(d: Date | string): string {
  if (typeof d === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(d)) return d
  if (typeof d === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(d)) return d.replace(/-/g, '/')
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) {
    const [y, m, day] = d.slice(0, 10).split('-')
    return `${day}/${m}/${y}`
  }
  const dt = typeof d === 'string' ? new Date(d) : d
  const day = String(dt.getDate()).padStart(2, '0')
  const month = String(dt.getMonth() + 1).padStart(2, '0')
  const year = dt.getFullYear()
  return `${day}/${month}/${year}`
}

export function parseRivhitDateToIso(raw?: string): string | null {
  if (!raw) return null
  const m = String(raw).trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
  if (!m) return null
  const day = m[1].padStart(2, '0')
  const month = m[2].padStart(2, '0')
  let year = m[3]
  if (year.length === 2) year = `20${year}`
  return `${year}-${month}-${day}`
}
