import type { FastifyReply, FastifyRequest } from 'fastify'
import { getAdminAuth } from '../lib/firebaseAdmin.js'

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

/** דורש Firebase ID token — מחזיר 503 אם Admin SDK לא מוגדר */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const auth = getAdminAuth()
  if (!auth) {
    reply.code(503).send({
      ok: false,
      error: 'firebase_not_configured',
      message: 'Firebase Admin לא מוגדר — הוסף FIREBASE_SERVICE_ACCOUNT_PATH',
    })
    return
  }

  const token = readBearerToken(req)
  if (!token) {
    reply.code(401).send({
      ok: false,
      error: 'unauthenticated',
      message: 'חסר Authorization: Bearer <Firebase ID token>',
    })
    return
  }

  try {
    const decoded = await auth.verifyIdToken(token)
    req.authUser = {
      uid: decoded.uid,
      email: decoded.email,
    }
  } catch {
    reply.code(401).send({
      ok: false,
      error: 'invalid_token',
      message: 'טוקן Firebase לא תקין או שפג תוקף',
    })
  }
}
