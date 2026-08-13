import type { FastifyReply, FastifyRequest } from 'fastify'
import { env } from '../config/env.js'

export type AuthUser = {
  uid: string
  email?: string
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser
  }
}

function readBearerToken(req: FastifyRequest): string | null {
  const h = req.headers.authorization
  if (typeof h !== 'string' || !h.startsWith('Bearer ')) return null
  const token = h.slice('Bearer '.length).trim()
  return token || null
}

type SupabaseUserResponse = {
  id?: string
  email?: string
}

async function verifySupabaseAccessToken(token: string): Promise<AuthUser | null> {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null
  const res = await fetch(`${env.supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.supabaseAnonKey,
    },
  })
  if (!res.ok) return null
  const body = (await res.json()) as SupabaseUserResponse
  if (!body.id) return null
  return { uid: body.id, email: body.email }
}

/** דורש JWT של Supabase Auth */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    reply.code(503).send({
      ok: false,
      error: 'supabase_not_configured',
      message: 'חסרים SUPABASE_URL / SUPABASE_ANON_KEY בשרת',
    })
    return
  }

  const token = readBearerToken(req)
  if (!token) {
    reply.code(401).send({
      ok: false,
      error: 'unauthenticated',
      message: 'חסר Authorization: Bearer <Supabase access token>',
    })
    return
  }

  try {
    const user = await verifySupabaseAccessToken(token)
    if (!user) {
      reply.code(401).send({
        ok: false,
        error: 'invalid_token',
        message: 'טוקן Supabase לא תקין או שפג תוקף',
      })
      return
    }
    req.authUser = user
  } catch {
    reply.code(401).send({
      ok: false,
      error: 'invalid_token',
      message: 'טוקן Supabase לא תקין או שפג תוקף',
    })
  }
}
