import type { FastifyInstance } from 'fastify'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { getAdminAuth, getAdminDb } from '../lib/firebaseAdmin.js'
import { MorningClient, MorningError } from '../lib/morningClient.js'
import {
  credentialsFromEnv,
  loadMorningCredentials,
  readSyncState,
  saveMorningCredentials,
  writeSyncState,
  type MorningEnv,
} from '../lib/morningCredentials.js'
import { runExpenseReconcile } from '../lib/morningExpenseSync.js'
import { fetchExpenseDocumentBuffer } from '../lib/expenseDocument.js'
import {
  fetchMorningClients,
  fetchMorningSyncPayload,
  resetAllIncomes,
} from '../lib/morningSync.js'
import { env } from '../config/env.js'

function normalizeEnv(raw: unknown): MorningEnv {
  return raw === 'sandbox' ? 'sandbox' : 'production'
}

export async function registerMorningRoutes(app: FastifyInstance): Promise<void> {
  /**
   * מצב האינטגרציה — מפתחות + syncState מהשרת (דיסק/env), בלי קריאת Firestore.
   * firebaseReady = אפשר לאמת טוקן + לכתוב הכנסות (Admin מוגדר).
   */
  app.get(
    '/api/integrations/morning/status',
    { preHandler: requireAdmin },
    async () => {
      const creds = await loadMorningCredentials()
      const syncState = await readSyncState()
      const authReady = Boolean(getAdminAuth())
      const dbReady = Boolean(getAdminDb())
      return {
        ok: true,
        firebaseReady: authReady && dbReady,
        firebaseReason:
          authReady && dbReady
            ? null
            : 'Firebase Admin לא מוגדר לכתיבת הכנסות — בדוק FIREBASE_SERVICE_ACCOUNT_B64',
        connected: Boolean(creds),
        env: creds?.env ?? null,
        credentialsFromEnv: credentialsFromEnv(),
        fromDate: env.sync.fromDate,
        syncState,
      }
    },
  )

  /** שמירת מפתח API + אימות מול Morning */
  app.post(
    '/api/integrations/morning/connect',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, unknown>
      const keyId = String(body.keyId ?? '').trim()
      const keySecret = String(body.keySecret ?? '').trim()
      const giEnv = normalizeEnv(body.env)
      if (!keyId || !keySecret) {
        reply.code(400).send({
          ok: false,
          error: 'missing_credentials',
          message: 'חסר מזהה מפתח או סוד',
        })
        return
      }

      const client = new MorningClient({ keyId, keySecret, env: giEnv })
      try {
        await client.verifyConnection()
      } catch (e) {
        const status = e instanceof MorningError ? e.status : 500
        reply.code(status === 401 ? 400 : 502).send({
          ok: false,
          error: 'morning_auth_failed',
          message:
            e instanceof MorningError
              ? e.message
              : 'אימות מול חשבונית ירוקה נכשל',
        })
        return
      }

      await saveMorningCredentials({ keyId, keySecret, env: giEnv })
      return { ok: true, connected: true, env: giEnv }
    },
  )

  /** בדיקת חיבור מהיר ללא שמירה */
  app.post(
    '/api/integrations/morning/test',
    { preHandler: requireAdmin },
    async (_req, reply) => {
      const creds = await loadMorningCredentials()
      if (!creds) {
        reply.code(400).send({ ok: false, error: 'not_connected' })
        return
      }
      const client = new MorningClient(creds)
      try {
        await client.verifyConnection()
        return { ok: true, connected: true }
      } catch (e) {
        reply.code(502).send({
          ok: false,
          error: 'morning_unreachable',
          message: e instanceof MorningError ? e.message : 'שגיאת חיבור',
        })
      }
    },
  )

  /**
   * משיכת לקוחות + הכנסות מחשבונית ירוקה בלבד (בלי כתיבת Admin ל-Firestore).
   * השמירה מתבצעת בדפדפן עם המשתמש המחובר.
   */
  app.post(
    '/api/integrations/morning/sync',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, unknown>
      const fromDate =
        typeof body.fromDate === 'string' && body.fromDate.trim()
          ? body.fromDate.trim()
          : undefined
      try {
        return await fetchMorningSyncPayload({ fromDate })
      } catch (e) {
        const status = e instanceof MorningError ? e.status : 500
        reply.code(status >= 400 && status < 500 ? status : 502).send({
          ok: false,
          error: 'sync_failed',
          message: e instanceof Error ? e.message : 'הסנכרון נכשל',
        })
      }
    },
  )

  /** משיכת לקוחות בלבד — בלי כתיבת Admin ל-Firestore */
  app.post(
    '/api/integrations/morning/sync-clients',
    { preHandler: requireAdmin },
    async (_req, reply) => {
      try {
        const clients = await fetchMorningClients()
        return { ok: true, mode: 'client_write' as const, clients }
      } catch (e) {
        const status = e instanceof MorningError ? e.status : 500
        reply.code(status >= 400 && status < 500 ? status : 502).send({
          ok: false,
          error: 'client_sync_failed',
          message: e instanceof Error ? e.message : 'סנכרון הלקוחות נכשל',
        })
      }
    },
  )

  /** שמירת סיכום סנכרון על דיסק השרת (אחרי שהדפדפן סיים לכתוב ל-Firestore) */
  app.post(
    '/api/integrations/morning/ack-sync',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, unknown>
      try {
        await writeSyncState(body)
        return { ok: true }
      } catch (e) {
        reply.code(500).send({
          ok: false,
          error: 'ack_failed',
          message: e instanceof Error ? e.message : 'שמירת מצב הסנכרון נכשלה',
        })
      }
    },
  )

  // משיכת הוצאות מחשבונית ירוקה הוסרה במכוון: חשבונית ירוקה היא מקור האמת
  // להכנסות בלבד. הוצאות נכנסות דרך הסוכן, אחרי אישור המשתמש.

  /** התאמה מחדש של הוצאות קיימות מול תנועות הבנק */
  app.post(
    '/api/integrations/morning/reconcile-expenses',
    { preHandler: requireAdmin },
    async (_req, reply) => {
      try {
        return await runExpenseReconcile()
      } catch (e) {
        const status = e instanceof MorningError ? e.status : 500
        reply.code(status >= 400 && status < 500 ? status : 502).send({
          ok: false,
          error: 'reconcile_failed',
          message: e instanceof Error ? e.message : 'ההתאמה נכשלה',
        })
      }
    },
  )

  /** צפייה / הורדה במסמך הוצאה מצורף ב-GI (PDF) */
  app.get(
    '/api/integrations/morning/expenses/:greenInvoiceId/document',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const greenInvoiceId = String(
        (req.params as { greenInvoiceId?: string }).greenInvoiceId ?? '',
      ).trim()
      if (!greenInvoiceId) {
        reply.code(400).send({ ok: false, message: 'חסר מזהה הוצאה' })
        return
      }
      const creds = await loadMorningCredentials()
      if (!creds) {
        reply.code(400).send({ ok: false, message: 'חיבור GI לא מוגדר' })
        return
      }
      try {
        const client = new MorningClient(creds)
        const doc = await fetchExpenseDocumentBuffer(client, greenInvoiceId)
        reply
          .header('Content-Type', doc.mimeType)
          .header(
            'Content-Disposition',
            `inline; filename="${encodeURIComponent(doc.fileName)}"`,
          )
          .send(doc.buffer)
      } catch (e) {
        const status = e instanceof MorningError ? e.status : 404
        reply.code(status >= 400 && status < 500 ? status : 404).send({
          ok: false,
          message:
            e instanceof Error
              ? e.message
              : 'לא ניתן לטעון את המסמך מחשבונית ירוקה',
        })
      }
    },
  )

  /** מחיקת כל ההכנסות הקיימות — איפוס לפני סנכרון מלא */
  app.post(
    '/api/integrations/morning/reset-incomes',
    { preHandler: requireAdmin },
    async (_req, reply) => {
      try {
        const deleted = await resetAllIncomes()
        return { ok: true, deleted }
      } catch (e) {
        reply.code(500).send({
          ok: false,
          error: 'reset_failed',
          message: e instanceof Error ? e.message : 'מחיקת ההכנסות נכשלה',
        })
      }
    },
  )
}
