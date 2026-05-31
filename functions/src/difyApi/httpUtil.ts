import { timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { Timestamp } from 'firebase-admin/firestore'

/** DEBUG — להחזיר ל-Secret Manager אחרי ש-Dify יציב */
export const VALID_KEY = 'a1a2a3a4a5a6a7a8a9Eve0n'

export type Actor = { userId: string; userName?: string }

export type ValidationResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; errors: string[] }

export function json(res: Response, status: number, body: Record<string, unknown>): void {
  res.status(status).json(body)
}

export function badRequest(res: Response, errors: string[] | string, extra?: Record<string, unknown>): void {
  const list = Array.isArray(errors) ? errors : [errors]
  json(res, 400, { ok: false, error: 'validation_error', errors: list, ...extra })
}

export function unauthorized(res: Response): void {
  json(res, 401, { ok: false, error: 'unauthorized' })
}

function headerFirstValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string {
  const raw = headers[name.toLowerCase()]
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (Array.isArray(raw)) {
    for (const part of raw) {
      if (typeof part === 'string' && part.trim()) return part.trim()
    }
  }
  return ''
}

export function readApiKeyFromRequest(req: Request): string {
  const custom = headerFirstValue(req.headers as Record<string, string | string[] | undefined>, 'x-hub-api-key')
  if (custom) return custom
  const auth = headerFirstValue(req.headers as Record<string, string | string[] | undefined>, 'authorization')
  if (!auth) return ''
  const bearer = auth.match(/^Bearer\s+(.+)$/i)
  if (bearer?.[1]?.trim()) return bearer[1].trim()
  return auth
}

export function assertApiKey(req: Request, res: Response): boolean {
  const provided = readApiKeyFromRequest(req)
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(VALID_KEY, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    unauthorized(res)
    return false
  }
  return true
}

export function parseEntity(req: Request): string {
  const q = req.query
  const raw = (typeof q.entity === 'string' && q.entity) || (typeof q.resource === 'string' && q.resource) || ''
  return raw.trim().toLowerCase()
}

/** GET ?meta=schema — קטלוג API בלי entity (למשל בדיקת Schema ב-Dify) */
export function isSchemaCatalogRequest(req: Request): boolean {
  const meta = req.query.meta
  return typeof meta === 'string' && meta.trim().toLowerCase() === 'schema'
}

export function parseId(req: Request): string {
  return typeof req.query.id === 'string' ? req.query.id.trim() : ''
}

export function parseLimit(req: Request, max = 200, fallback = 100): number {
  const raw = req.query.limit
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(Math.floor(n), max)
}

export function parseBody(req: Request): Record<string, unknown> {
  const b = req.body
  if (b && typeof b === 'object' && !Array.isArray(b)) return b as Record<string, unknown>
  return {}
}

export function parseDataPayload(body: Record<string, unknown>): Record<string, unknown> {
  const data = body.data
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>
  return body
}

export function parseActor(body: Record<string, unknown>): Actor | null {
  const a = body.actor
  if (a && typeof a === 'object' && !Array.isArray(a)) {
    const o = a as Record<string, unknown>
    const userId = typeof o.userId === 'string' ? o.userId.trim() : ''
    if (userId) {
      return {
        userId,
        userName: typeof o.userName === 'string' ? o.userName.trim() : undefined,
      }
    }
  }
  const uid = typeof body.actorUserId === 'string' ? body.actorUserId.trim() : ''
  if (uid) {
    return {
      userId: uid,
      userName: typeof body.actorUserName === 'string' ? body.actorUserName.trim() : undefined,
    }
  }
  return null
}

export function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v
  }
  return out
}

export function timestampToIso(value: unknown): string | undefined {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

export function serializeDoc(id: string, data: FirebaseFirestore.DocumentData): Record<string, unknown> {
  const out: Record<string, unknown> = { id }
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Timestamp) out[k] = v.toDate().toISOString()
    else out[k] = v
  }
  return out
}

export function requireString(
  data: Record<string, unknown>,
  field: string,
  label?: string,
): { value?: string; errors: string[] } {
  const v = data[field]
  if (typeof v !== 'string' || !v.trim()) {
    return { errors: [`${label ?? field} — שדה חובה (מחרוזת לא ריקה)`] }
  }
  return { value: v.trim(), errors: [] }
}

export function optionalString(data: Record<string, unknown>, field: string): string | undefined {
  const v = data[field]
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export function requireEnum<T extends string>(
  data: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
  label?: string,
): { value?: T; errors: string[] } {
  const v = data[field]
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    return {
      errors: [
        `${label ?? field} — חייב להיות אחד מ: ${allowed.join(', ')}`,
      ],
    }
  }
  return { value: v as T, errors: [] }
}

export function requireYmd(
  data: Record<string, unknown>,
  field: string,
  label?: string,
): { value?: string; errors: string[] } {
  const r = requireString(data, field, label)
  if (r.errors.length || !r.value) return r
  if (!/^\d{4}-\d{2}-\d{2}/.test(r.value)) {
    return { errors: [`${label ?? field} — פורמט תאריך חובה YYYY-MM-DD`] }
  }
  return { value: r.value.slice(0, 10), errors: [] }
}

export function requireNumber(
  data: Record<string, unknown>,
  field: string,
  label?: string,
  min = 0,
): { value?: number; errors: string[] } {
  const v = data[field]
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN
  if (!Number.isFinite(n) || n < min) {
    return { errors: [`${label ?? field} — מספר חובה${min > 0 ? ` (מינימום ${min})` : ''}`] }
  }
  return { value: n, errors: [] }
}

export function mergeErrors(...parts: Array<{ errors: string[] }>): string[] {
  return parts.flatMap((p) => p.errors)
}

export function okData(data: Record<string, unknown>): ValidationResult {
  return { ok: true, data }
}

export function failErrors(errors: string[]): ValidationResult {
  return { ok: false, errors }
}
