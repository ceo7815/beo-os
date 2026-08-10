import type { MorningDocument } from './morningClient.js'

/** סטטוסים פעילים — הוראת קבע (10=created, 20=started) */
const ACTIVE_RECURRING = new Set([10, 20, '10', '20', 'started', 'created'])

/** סטטוסים פעילים — ריטיינר (1=created, 2=started) */
const ACTIVE_RETAINER = new Set([1, 2, '1', '2', 'started', 'created'])

function firstString(doc: MorningDocument, keys: string[]): string {
  for (const k of keys) {
    const parts = k.split('.')
    let cur: unknown = doc
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') {
        cur = undefined
        break
      }
      cur = (cur as Record<string, unknown>)[p]
    }
    if (typeof cur === 'string' && cur.trim()) return cur.trim()
  }
  return ''
}

function firstNumber(doc: MorningDocument, keys: string[]): number | undefined {
  for (const k of keys) {
    const parts = k.split('.')
    let cur: unknown = doc
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') {
        cur = undefined
        break
      }
      cur = (cur as Record<string, unknown>)[p]
    }
    if (typeof cur === 'number' && Number.isFinite(cur)) return cur
    if (typeof cur === 'string' && cur.trim()) {
      const n = Number(cur)
      if (Number.isFinite(n)) return n
    }
  }
  return undefined
}

function normalizeDate(raw: string | undefined): string | undefined {
  const s = raw?.trim().slice(0, 10) ?? ''
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined
}

function clientBlock(doc: MorningDocument): MorningDocument {
  const c = doc.client
  return c != null && typeof c === 'object' ? (c as MorningDocument) : {}
}

function retainerClientBlock(raw: MorningDocument): MorningDocument {
  const doc = raw.doc
  if (doc != null && typeof doc === 'object') {
    const c = (doc as MorningDocument).client
    if (c != null && typeof c === 'object') return c as MorningDocument
  }
  return clientBlock(raw)
}

function isActiveRecurringStatus(status: unknown): boolean {
  if (status == null) return true
  return ACTIVE_RECURRING.has(status as string | number)
}

function isActiveRetainerStatus(status: unknown): boolean {
  if (status == null) return true
  return ACTIVE_RETAINER.has(status as string | number)
}

function resolveAmount(doc: MorningDocument): number {
  const direct =
    firstNumber(doc, ['amount', 'price', 'total', 'sum']) ??
    firstNumber(doc, ['data.amount', 'doc.amount'])
  if (direct != null && direct > 0) return Math.round(direct * 100) / 100

  const income = doc.income
  if (Array.isArray(income) && income.length > 0) {
    let sum = 0
    for (const row of income) {
      if (row == null || typeof row !== 'object') continue
      const r = row as MorningDocument
      const price = firstNumber(r, ['price', 'amount']) ?? 0
      const qty = firstNumber(r, ['quantity', 'qty']) ?? 1
      sum += price * qty
    }
    if (sum > 0) return Math.round(sum * 100) / 100
  }
  return 0
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

export function mapMorningRecurringPayment(
  raw: MorningDocument,
): MappedGiRecurringPayment | null {
  const id =
    firstString(raw, ['id', '_id', 'recurringId']) ||
    firstString(raw, ['paymentRecurringId'])
  if (!id) return null

  const statusRaw = firstNumber(raw, ['status']) ?? firstString(raw, ['status'])
  if (!isActiveRecurringStatus(statusRaw)) return null

  const client = clientBlock(raw)
  const clientName =
    firstString(raw, ['clientName']) ||
    firstString(client, ['name', 'companyName']) ||
    firstString(raw, ['name'])
  const clientGiId =
    firstString(raw, ['clientId']) ||
    firstString(client, ['id', '_id'])

  const intervalRaw =
    firstNumber(raw, ['interval', 'intervalMonths', 'months']) ??
    Number(firstString(raw, ['interval']))
  const interval = Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : 1
  const amount = resolveAmount(raw)
  if (amount <= 0) return null

  return {
    greenInvoiceId: id,
    clientName: clientName || 'לקוח',
    clientGreenInvoiceId: clientGiId,
    amount,
    intervalMonths: interval > 0 ? interval : 1,
    status: String(statusRaw ?? ''),
    nextChargeDate: normalizeDate(
      firstString(raw, [
        'nextChargeDate',
        'nextPaymentDate',
        'nextDate',
        'nextRunDate',
      ]),
    ),
    startDate: normalizeDate(
      firstString(raw, ['startDate', 'fromDate', 'createdDate']),
    ),
    endDate: normalizeDate(firstString(raw, ['endDate', 'toDate', 'untilDate'])),
  }
}

export function mapMorningRetainer(raw: MorningDocument): MappedGiRetainer | null {
  const id = firstString(raw, ['id', '_id', 'retainerId'])
  if (!id) return null

  const statusRaw = firstNumber(raw, ['status']) ?? firstString(raw, ['status'])
  if (!isActiveRetainerStatus(statusRaw)) return null

  const client = retainerClientBlock(raw)
  const docBlock =
    raw.doc != null && typeof raw.doc === 'object'
      ? (raw.doc as MorningDocument)
      : {}

  const clientName =
    firstString(client, ['name', 'companyName']) ||
    firstString(raw, ['name']) ||
    firstString(raw, ['clientName'])
  const clientGiId =
    firstString(client, ['id', '_id']) || firstString(raw, ['clientId'])

  const interval =
    firstString(raw, ['interval', 'billingInterval']) ||
    firstString(raw, ['data.interval']) ||
    '1m'

  const amount = resolveAmount({ ...raw, ...docBlock })
  if (amount <= 0) {
    const docAmount = firstNumber(docBlock, ['amount', 'total'])
    if (docAmount != null && docAmount > 0) {
      return {
        greenInvoiceId: id,
        clientName: clientName || 'לקוח',
        clientGreenInvoiceId: clientGiId,
        amount: docAmount,
        interval,
        status: String(statusRaw ?? ''),
        nextJobDate: normalizeDate(
          firstString(raw, ['nextJobDate', 'nextDate', 'nextRunDate', 'nextChargeDate']),
        ),
        startDate: normalizeDate(firstString(raw, ['startDate', 'fromDate'])),
        endDate: normalizeDate(firstString(raw, ['endDate', 'toDate'])),
      }
    }
    return null
  }

  return {
    greenInvoiceId: id,
    clientName: clientName || 'לקוח',
    clientGreenInvoiceId: clientGiId,
    amount,
    interval,
    status: String(statusRaw ?? ''),
    nextJobDate: normalizeDate(
      firstString(raw, ['nextJobDate', 'nextDate', 'nextRunDate', 'nextChargeDate']),
    ),
    startDate: normalizeDate(firstString(raw, ['startDate', 'fromDate'])),
    endDate: normalizeDate(firstString(raw, ['endDate', 'toDate'])),
  }
}
