import type { FastifyInstance } from 'fastify'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { verifyFirebaseAdmin } from '../lib/firebaseAdmin.js'
import { MorningClient, MorningError } from '../lib/morningClient.js'
import {
  credentialsFromEnv,
  loadMorningCredentials,
  readSyncState,
  saveMorningCredentials,
  type MorningEnv,
} from '../lib/morningCredentials.js'
import { runMorningSync, resetAllIncomes, syncClients } from '../lib/morningSync.js'
import { env } from '../config/env.js'

function normalizeEnv(raw: unknown): MorningEnv {
  return raw === 'sandbox' ? 'sandbox' : 'production'
}

export async function registerMorningRoutes(app: FastifyInstance): Promise<void> {
  /** מצב האינטגרציה — האם Admin SDK מוגדר, האם יש מפתחות, ומתי סונכרן לאחרונה */
  app.get(
    '/api/integrations/morning/status',
    { preHandler: requireAdmin },
    async () => {
      const verify = await verifyFirebaseAdmin()
      const firebaseReady = verify.ok
      const creds = firebaseReady ? await loadMorningCredentials() : null
      const syncState = firebaseReady ? await readSyncState() : null
      return {
        ok: true,
        firebaseReady,
        firebaseReason: firebaseReady ? null : verify.reason ?? null,
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

  /** סנכרון מלא — מושך את כל מסמכי ההכנסה מ-fromDate עד היום */
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
        const result = await runMorningSync({ fromDate })
        return result
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

  /** סנכרון לקוחות בלבד — מושך פעילים + לא פעילים מחשבונית ירוקה */
  app.post(
    '/api/integrations/morning/sync-clients',
    { preHandler: requireAdmin },
    async (_req, reply) => {
      try {
        return await syncClients()
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
