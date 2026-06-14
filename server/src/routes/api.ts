import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/requireAuth.js'

/** Routes לבדיקת auth — מחר יורחבו ל-Morning / Clockify */
export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/me', { preHandler: requireAuth }, async (req) => ({
    ok: true,
    uid: req.authUser!.uid,
    email: req.authUser!.email ?? null,
  }))

  app.get('/api/integrations/status', { preHandler: requireAuth }, async () => ({
    ok: true,
    message: 'תשתית API מוכנה — חיבור Morning יתווסף בשלב הבא',
    integrations: {
      morning: 'pending',
      clockify: 'pending',
    },
  }))
}
