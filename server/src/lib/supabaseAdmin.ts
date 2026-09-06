import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'

let cached: SupabaseClient | null | undefined

function isAnonJwt(key: string): boolean {
  const parts = key.split('.')
  if (parts.length < 2) return false
  try {
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8',
    )
    const payload = JSON.parse(json) as { role?: string }
    return payload.role === 'anon'
  } catch {
    return false
  }
}

/**
 * לקוח service_role ל-/api/bot-data — עוקף RLS.
 * חובה ב-xCloud: SUPABASE_SERVICE_ROLE_KEY (לא anon).
 */
export function getServiceSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached
  const url = env.supabaseUrl
  const key = env.supabaseServiceRoleKey
  if (!url || !key || isAnonJwt(key)) {
    cached = null
    return null
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}

export function supabaseServiceConfigured(): boolean {
  return Boolean(
    env.supabaseUrl && env.supabaseServiceRoleKey && !isAnonJwt(env.supabaseServiceRoleKey),
  )
}

/**
 * לקוח Supabase עם JWT של המשתמש — עובר RLS (staff).
 * מאפשר כתיבת finance_documents גם בלי SERVICE_ROLE.
 */
export function getUserSupabase(accessToken: string): SupabaseClient | null {
  const url = env.supabaseUrl
  const anon = env.supabaseAnonKey
  if (!url || !anon || !accessToken) return null
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  })
}

export function readBearerFromRequest(authorization?: string): string | null {
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return null
  const token = authorization.slice('Bearer '.length).trim()
  return token || null
}
