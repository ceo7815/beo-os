import {
  collection,
  deleteField,
  doc,
  getDocs,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore'
import { db } from './firebase'

/** אותם שדות שהשרת מחזיר מ-mapMorningClient / mapMorningDocument */
export type MappedGiClient = {
  greenInvoiceId: string
  name: string
  active: boolean
  email: string
  phone: string
  contact: string
  taxId: string
  addressLine: string
  city: string
}

export type MappedGiIncome = {
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
  /** תשלומים חלקיים בתוך חשבון עסקה פתוח */
  paidAmount?: number
  greenInvoiceStatus?: number
  description?: string
  clientName: string
  clientTaxId: string
  clientEmail: string
  source: 'green_invoice'
  clientGreenInvoiceId: string
  cancelled: boolean
}

export type MappedGiRecurringPayment = {
  greenInvoiceId: string
  clientName: string
  clientGreenInvoiceId: string
  amount: number
  intervalMonths: number
  status: string
  nextChargeDate?: string
  startDate?: string
  endDate?: string
}

export type MappedGiRetainer = {
  greenInvoiceId: string
  clientName: string
  clientGreenInvoiceId: string
  amount: number
  interval: string
  status: string
  nextJobDate?: string
  startDate?: string
  endDate?: string
}

export type MorningSyncPayload = {
  ok: true
  mode: 'client_write'
  fromDate: string
  toDate: string
  clients: MappedGiClient[]
  incomes: MappedGiIncome[]
  recurringPayments?: MappedGiRecurringPayment[]
  retainers?: MappedGiRetainer[]
  recurringFetchError?: string
  retainersFetchError?: string
}

const GI_PREFIX = 'gi_'
const BATCH = 400

function normalizeTaxId(raw: string): string {
  return raw.replace(/\D/g, '')
}

function normalizeName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

type ClientIndex = {
  byGreenInvoiceId: Map<string, string>
  byTaxId: Map<string, string>
  byEmail: Map<string, string>
  byName: Map<string, string>
}

function buildIndex(rows: { id: string; data: DocumentData }[]): ClientIndex {
  const byGreenInvoiceId = new Map<string, string>()
  const byTaxId = new Map<string, string>()
  const byEmail = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const { id, data } of rows) {
    const giId = String(data.greenInvoiceId ?? '').trim()
    if (giId) byGreenInvoiceId.set(giId, id)
    const taxId = normalizeTaxId(
      String(data.taxId ?? data.companyId ?? data.businessId ?? data.vatId ?? ''),
    )
    if (taxId) byTaxId.set(taxId, id)
    const email = String(data.email ?? '').trim().toLowerCase()
    if (email) byEmail.set(email, id)
    const name = normalizeName(String(data.name ?? data.companyName ?? ''))
    if (name) byName.set(name, id)
  }
  return { byGreenInvoiceId, byTaxId, byEmail, byName }
}

function matchIncomeClient(index: ClientIndex, m: MappedGiIncome): string {
  const giId = m.clientGreenInvoiceId.trim()
  if (giId && index.byGreenInvoiceId.has(giId)) {
    return index.byGreenInvoiceId.get(giId)!
  }
  const taxId = normalizeTaxId(m.clientTaxId)
  if (taxId && index.byTaxId.has(taxId)) return index.byTaxId.get(taxId)!
  const email = m.clientEmail.trim().toLowerCase()
  if (email && index.byEmail.has(email)) return index.byEmail.get(email)!
  const name = normalizeName(m.clientName)
  if (name && index.byName.has(name)) return index.byName.get(name)!
  return ''
}

function matchGiClient(
  index: ClientIndex,
  clientGreenInvoiceId: string,
  clientName: string,
): string {
  const giId = clientGreenInvoiceId.trim()
  if (giId && index.byGreenInvoiceId.has(giId)) {
    return index.byGreenInvoiceId.get(giId)!
  }
  const name = normalizeName(clientName)
  if (name && index.byName.has(name)) return index.byName.get(name)!
  return ''
}

async function commitChunks(
  ops: Array<(batch: ReturnType<typeof writeBatch>) => void>,
): Promise<void> {
  for (let i = 0; i < ops.length; i += BATCH) {
    const batch = writeBatch(db)
    for (const op of ops.slice(i, i + BATCH)) op(batch)
    await batch.commit()
  }
}

export type ApplyClientsResult = {
  fetched: number
  created: number
  updated: number
  active: number
  inactive: number
}

/** שמירת לקוחות GI ב-Firestore עם המשתמש המחובר */
export async function applyMorningClients(
  clients: MappedGiClient[],
): Promise<ApplyClientsResult> {
  const snap = await getDocs(collection(db, 'clients'))
  const existing = snap.docs.map((d) => ({ id: d.id, data: d.data() }))
  const index = buildIndex(existing)
  const claimed = new Set<string>()

  let created = 0
  let updated = 0
  let active = 0
  let inactive = 0
  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = []

  for (const m of clients) {
    if (m.active) active += 1
    else inactive += 1

    const taxId = normalizeTaxId(m.taxId)
    const email = m.email.trim().toLowerCase()
    const name = normalizeName(m.name)
    let existingId =
      index.byGreenInvoiceId.get(m.greenInvoiceId) ??
      (taxId ? index.byTaxId.get(taxId) : undefined) ??
      (email ? index.byEmail.get(email) : undefined) ??
      (name ? index.byName.get(name) : undefined)

    if (existingId && claimed.has(existingId)) existingId = undefined

    if (existingId) {
      claimed.add(existingId)
      const id = existingId
      const patch: Record<string, unknown> = {
        greenInvoiceId: m.greenInvoiceId,
        status: m.active ? 'active' : 'inactive',
      }
      if (m.name) patch.name = m.name
      if (m.email) patch.email = m.email
      if (m.phone) patch.phone = m.phone
      if (m.contact) patch.contact = m.contact
      if (m.taxId) patch.taxId = m.taxId
      if (m.addressLine) patch.addressLine = m.addressLine
      if (m.city) patch.city = m.city
      ops.push((batch) => {
        batch.set(doc(db, 'clients', id), patch, { merge: true })
      })
      updated += 1
      index.byGreenInvoiceId.set(m.greenInvoiceId, id)
    } else {
      const id = GI_PREFIX + m.greenInvoiceId
      claimed.add(id)
      const row: Record<string, unknown> = {
        name: m.name,
        contact: m.contact,
        phone: m.phone,
        email: m.email,
        status: m.active ? 'active' : 'inactive',
        greenInvoiceId: m.greenInvoiceId,
        source: 'green_invoice',
        createdAt: new Date().toISOString(),
      }
      if (m.taxId) row.taxId = m.taxId
      if (m.addressLine) row.addressLine = m.addressLine
      if (m.city) row.city = m.city
      ops.push((batch) => {
        batch.set(doc(db, 'clients', id), row, { merge: true })
      })
      created += 1
      index.byGreenInvoiceId.set(m.greenInvoiceId, id)
      if (taxId) index.byTaxId.set(taxId, id)
      if (email) index.byEmail.set(email, id)
      if (name) index.byName.set(name, id)
    }
  }

  await commitChunks(ops)
  return {
    fetched: clients.length,
    created,
    updated,
    active,
    inactive,
  }
}

export type ApplySyncResult = {
  ok: true
  fromDate: string
  toDate: string
  fetched: number
  imported: number
  updated: number
  removed: number
  unmatchedClients: number
  durationMs: number
  clients: ApplyClientsResult & { ok: true; durationMs: number }
  recurringImported: number
  recurringRemoved: number
  retainersImported: number
  retainersRemoved: number
  recurringFetchError?: string
  retainersFetchError?: string
}

const GI_RECURRING_COLLECTION = 'financeGiRecurringPayments'
const GI_RETAINER_COLLECTION = 'financeGiRetainers'

async function applyMorningGiRecurring(
  index: ClientIndex,
  rows: MappedGiRecurringPayment[],
): Promise<{ imported: number; removed: number }> {
  const snap = await getDocs(collection(db, GI_RECURRING_COLLECTION))
  const syncedIds = new Set(rows.map((r) => r.greenInvoiceId))
  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = []
  let removed = 0

  for (const d of snap.docs) {
    const giId = String(d.data().greenInvoiceId ?? d.id.replace(/^gi_/, ''))
    if (!syncedIds.has(giId)) {
      ops.push((batch) => {
        batch.delete(d.ref)
      })
      removed += 1
    }
  }

  const syncedAt = new Date().toISOString()
  for (const m of rows) {
    const matchedClientId = matchGiClient(
      index,
      m.clientGreenInvoiceId,
      m.clientName,
    )
    const ref = doc(db, GI_RECURRING_COLLECTION, GI_PREFIX + m.greenInvoiceId)
    const row: Record<string, unknown> = {
      greenInvoiceId: m.greenInvoiceId,
      clientName: m.clientName,
      amount: m.amount,
      intervalMonths: m.intervalMonths,
      status: m.status,
      source: 'green_invoice',
      syncedAt,
    }
    if (matchedClientId) row.clientId = matchedClientId
    if (m.nextChargeDate) row.nextChargeDate = m.nextChargeDate
    if (m.startDate) row.startDate = m.startDate
    if (m.endDate) row.endDate = m.endDate
    ops.push((batch) => {
      batch.set(ref, row, { merge: true })
    })
  }

  await commitChunks(ops)
  return { imported: rows.length, removed }
}

async function applyMorningGiRetainers(
  index: ClientIndex,
  rows: MappedGiRetainer[],
): Promise<{ imported: number; removed: number }> {
  const snap = await getDocs(collection(db, GI_RETAINER_COLLECTION))
  const syncedIds = new Set(rows.map((r) => r.greenInvoiceId))
  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = []
  let removed = 0

  for (const d of snap.docs) {
    const giId = String(d.data().greenInvoiceId ?? d.id.replace(/^gi_/, ''))
    if (!syncedIds.has(giId)) {
      ops.push((batch) => {
        batch.delete(d.ref)
      })
      removed += 1
    }
  }

  const syncedAt = new Date().toISOString()
  for (const m of rows) {
    const matchedClientId = matchGiClient(
      index,
      m.clientGreenInvoiceId,
      m.clientName,
    )
    const ref = doc(db, GI_RETAINER_COLLECTION, GI_PREFIX + m.greenInvoiceId)
    const row: Record<string, unknown> = {
      greenInvoiceId: m.greenInvoiceId,
      clientName: m.clientName,
      amount: m.amount,
      interval: m.interval,
      status: m.status,
      source: 'green_invoice',
      syncedAt,
    }
    if (matchedClientId) row.clientId = matchedClientId
    if (m.nextJobDate) row.nextJobDate = m.nextJobDate
    if (m.startDate) row.startDate = m.startDate
    if (m.endDate) row.endDate = m.endDate
    ops.push((batch) => {
      batch.set(ref, row, { merge: true })
    })
  }

  await commitChunks(ops)
  return { imported: rows.length, removed }
}

/** שמירת לקוחות + הכנסות — כתיבה מהדפדפן, בלי Admin SDK */
export async function applyMorningSyncPayload(
  payload: MorningSyncPayload,
): Promise<ApplySyncResult> {
  const startedAt = Date.now()
  const clientsStarted = Date.now()
  const clientsResult = await applyMorningClients(payload.clients)
  const clientsDuration = Date.now() - clientsStarted

  const snap = await getDocs(collection(db, 'clients'))
  const index = buildIndex(snap.docs.map((d) => ({ id: d.id, data: d.data() })))

  let imported = 0
  let removed = 0
  let unmatchedClients = 0
  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = []

  for (const m of payload.incomes) {
    const ref = doc(db, 'financeIncomes', GI_PREFIX + m.greenInvoiceId)
    if (m.cancelled) {
      ops.push((batch) => {
        batch.delete(ref)
      })
      removed += 1
      continue
    }
    const matchedClientId = matchIncomeClient(index, m)
    if (!matchedClientId) unmatchedClients += 1

    const row: Record<string, unknown> = {
      clientId: matchedClientId,
      amount: m.amount,
      amountIncludesVat: m.amountIncludesVat,
      documentKind: m.documentKind,
      invoiceNumber: m.invoiceNumber,
      invoiceDate: m.invoiceDate,
      status: m.status,
      source: m.source,
      greenInvoiceId: m.greenInvoiceId,
      greenInvoiceType: m.greenInvoiceType,
      greenInvoiceNumber: m.greenInvoiceNumber,
      greenInvoiceClientName: m.clientName,
      syncedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }
    if (m.greenInvoiceStatus !== undefined) {
      row.greenInvoiceStatus = m.greenInvoiceStatus
    }
    if (m.vatAmount !== undefined) row.vatAmount = m.vatAmount
    if (m.description) row.description = m.description
    if (m.status === 'paid') {
      row.paidAmount = m.amount
      row.paidDate = m.invoiceDate
      row.paymentMethod = 'bank_transfer'
    } else if (
      m.status === 'partial' &&
      typeof m.paidAmount === 'number' &&
      m.paidAmount > 0
    ) {
      row.paidAmount = m.paidAmount
    } else {
      // מונע יתרה שגויה מ-paidAmount ישן אחרי סנכרון מחדש
      row.paidAmount = deleteField()
    }
    ops.push((batch) => {
      batch.set(ref, row, { merge: true })
    })
    imported += 1
  }

  await commitChunks(ops)

  const recurringResult = Array.isArray(payload.recurringPayments)
    ? await applyMorningGiRecurring(index, payload.recurringPayments)
    : { imported: 0, removed: 0 }
  const retainersResult = Array.isArray(payload.retainers)
    ? await applyMorningGiRetainers(index, payload.retainers)
    : { imported: 0, removed: 0 }

  return {
    ok: true,
    fromDate: payload.fromDate,
    toDate: payload.toDate,
    fetched: payload.incomes.length,
    imported,
    updated: 0,
    removed,
    unmatchedClients,
    durationMs: Date.now() - startedAt,
    clients: {
      ok: true,
      ...clientsResult,
      durationMs: clientsDuration,
    },
    recurringImported: recurringResult.imported,
    recurringRemoved: recurringResult.removed,
    retainersImported: retainersResult.imported,
    retainersRemoved: retainersResult.removed,
    recurringFetchError: payload.recurringFetchError,
    retainersFetchError: payload.retainersFetchError,
  }
}

/** איפוס הכנסות — מחיקה מהדפדפן (בלי Admin) */
export async function resetIncomesClientSide(): Promise<number> {
  const snap = await getDocs(collection(db, 'financeIncomes'))
  if (snap.empty) return 0
  const refs = snap.docs.map((d) => d.ref)
  for (let i = 0; i < refs.length; i += BATCH) {
    const batch = writeBatch(db)
    for (const ref of refs.slice(i, i + BATCH)) batch.delete(ref)
    await batch.commit()
  }
  return refs.length
}
