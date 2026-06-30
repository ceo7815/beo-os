import type { MorningDocument } from './morningClient.js'

/**
 * מיפוי לקוח חשבונית ירוקה → שדות Client (כפי שנשמר ב-Firestore).
 * סלחני לשמות שדות שונים שה-API עשוי להחזיר.
 */

export type MappedClient = {
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

function firstString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return ''
}

function extractEmail(c: Record<string, unknown>): string {
  if (Array.isArray(c.emails) && c.emails.length > 0) {
    const first = c.emails.find((e) => typeof e === 'string' && e.trim())
    if (typeof first === 'string') return first.trim()
  }
  return firstString(c, ['email', 'emailAddress'])
}

/** ממפה לקוח Morning לשדות Client. מחזיר null אם אין מזהה/שם */
export function mapMorningClient(c: MorningDocument): MappedClient | null {
  const greenInvoiceId = firstString(c, ['id', '_id'])
  const name = firstString(c, ['name', 'companyName'])
  if (!greenInvoiceId || !name) return null

  // active — ברירת מחדל פעיל אם השדה חסר
  const active = c.active === false ? false : true

  return {
    greenInvoiceId,
    name,
    active,
    email: extractEmail(c),
    phone: firstString(c, ['phone', 'mobile', 'fax']),
    contact: firstString(c, ['contactPerson', 'contact', 'contactName']),
    taxId: firstString(c, ['taxId', 'vatId', 'idNumber']),
    addressLine: firstString(c, ['address', 'addressLine', 'street']),
    city: firstString(c, ['city']),
  }
}
