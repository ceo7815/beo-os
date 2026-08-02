import type { FastifyReply, FastifyRequest } from 'fastify'
import { env } from '../config/env.js'
import { getAdminDb } from '../lib/firebaseAdmin.js'
import { requireAuth } from './requireAuth.js'

const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000
const adminRoleCache = new Map<
  string,
  { isAdmin: boolean; expiresAt: number }
>()

function isAdminRole(role: unknown): boolean {
  const r = String(role ?? '')
    .trim()
    .toLowerCase()
  return r === 'admin' || r === 'superadmin'
}

function readCachedAdmin(uid: string): boolean | null {
  const hit = adminRoleCache.get(uid)
  if (!hit) return null
  if (Date.now() > hit.expiresAt) {
    adminRoleCache.delete(uid)
    return null
  }
  return hit.isAdmin
}

function writeCachedAdmin(uid: string, isAdmin: boolean): void {
  adminRoleCache.set(uid, {
    isAdmin,
    expiresAt: Date.now() + ADMIN_CACHE_TTL_MS,
  })
}

function adminByEmail(email?: string): boolean {
  if (!email || env.adminEmails.length === 0) return false
  return env.adminEmails.includes(email.trim().toLowerCase())
}

async function readAdminRole(uid: string): Promise<string | undefined> {
  const db = getAdminDb()
  if (!db) return undefined
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const snap = await db.collection('users').doc(uid).get()
      return snap.exists ? (snap.data()?.role as string | undefined) : undefined
    } catch (e) {
      lastErr = e
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('RESOURCE_EXHAUSTED') && !msg.includes('Quota')) {
        throw e
      }
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
    }
  }
  throw lastErr
}

/**
 * דורש Firebase ID token + תפקיד admin/superadmin (מ-users/{uid}).
 * רץ אחרי requireAuth — אם הוא כבר ענה (reply.sent) נעצרים.
 */
export async function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await requireAuth(req, reply)
  if (reply.sent) return

  const uid = req.authUser?.uid
  if (!uid) {
    reply.code(401).send({ ok: false, error: 'unauthenticated' })
    return
  }

  const cached = readCachedAdmin(uid)
  if (cached === false) {
    reply.code(403).send({
      ok: false,
      error: 'forbidden',
      message: 'נדרשת הרשאת מנהל',
    })
    return
  }
  if (cached === true) return

  // מייל מורשה — בלי לגעת ב-Firestore (קריטי כשיש מכסת Admin)
  if (adminByEmail(req.authUser?.email)) {
    writeCachedAdmin(uid, true)
    return
  }

  const db = getAdminDb()
  if (!db) {
    reply.code(503).send({
      ok: false,
      error: 'firebase_not_configured',
      message:
        'Firebase Admin לא מוגדר — או הוסף את המייל ל-ADMIN_EMAILS',
    })
    return
  }

  try {
    const role = await readAdminRole(uid)
    const isAdmin = isAdminRole(role)
    writeCachedAdmin(uid, isAdmin)
    if (!isAdmin) {
      reply.code(403).send({
        ok: false,
        error: 'forbidden',
        message: 'נדרשת הרשאת מנהל',
      })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (adminByEmail(req.authUser?.email)) {
      writeCachedAdmin(uid, true)
      return
    }
    reply.code(503).send({
      ok: false,
      error: 'admin_check_failed',
      message: `בדיקת הרשאות מנהל נכשלה — ${msg}`,
    })
  }
}
