import { FieldValue } from 'firebase/firestore'

export function stripUndefined<T extends Record<string, unknown>>(
  obj: T,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  )
}

/**
 * מסיר `undefined` רקורסיבית — נדרש ל-Firestore (לא מקבל undefined במסמך).
 * שומר על `FieldValue` (למשל deleteField).
 */
export function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object') return value
  if (value instanceof FieldValue) return value
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeep(item))
      .filter((item) => item !== undefined)
  }
  const obj = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue
    const cleaned = stripUndefinedDeep(v)
    if (cleaned !== undefined) out[k] = cleaned
  }
  return out
}
