import { requireSupabase } from './supabase'

/**
 * קריאה ל-API של השרת (Fastify) עם JWT של Supabase.
 * ה-proxy ב-Vite מפנה /api → השרת בפיתוח.
 */
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { data: sessionData } = await requireSupabase().auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new ApiError('לא מחובר', 401)

  const method = (init.method ?? 'GET').toUpperCase()
  // POST/PUT/PATCH חייבים body כש-content-type הוא JSON — שולחים {} כברירת מחדל
  const body =
    init.body ??
    (method === 'POST' || method === 'PUT' || method === 'PATCH'
      ? '{}'
      : undefined)

  const res = await fetch(path, {
    ...init,
    body,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  })

  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }

  if (!res.ok) {
    const message =
      (data as { message?: string })?.message ??
      (data as { error?: string })?.error ??
      `שגיאת שרת (${res.status})`
    throw new ApiError(message, res.status, data)
  }

  return data as T
}

export class ApiError extends Error {
  readonly status: number
  readonly data: unknown
  constructor(message: string, status: number, data?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}
