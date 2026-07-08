import type { FastifyReply, FastifyRequest } from 'fastify'
import { getAdminDb } from '../lib/firebaseAdmin.js'
import { requireAuth } from './requireAuth.js'

function isAdminRole(role: unknown): boolean {
  const r = String(role ?? '')
    .trim()
    .toLowerCase()
  return r === 'admin' || r === 'superadmin'
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

  const db = getAdminDb()
  if (!db) {
    reply.code(503).send({
      ok: false,
      error: 'firebase_not_configured',
      message: 'Firebase Admin לא מוגדר',
    })
    return
  }

  try {
    const snap = await db.collection('users').doc(uid).get()
    const role = snap.exists ? snap.data()?.role : undefined
    if (!isAdminRole(role)) {
      reply.code(403).send({
        ok: false,
        error: 'forbidden',
        message: 'נדרשת הרשאת מנהל',
      })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    reply.code(503).send({
      ok: false,
      error: 'admin_check_failed',
      message: `בדיקת הרשאות מנהל נכשלה — ${msg}`,
    })
  }
}
