import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/requireAuth.js'
import { loadMorningCredentials } from '../lib/morningCredentials.js'
import { getFirebaseAdmin } from '../lib/firebaseAdmin.js'

export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/me', { preHandler: requireAuth }, async (req) => ({
    ok: true,
    uid: req.authUser!.uid,
    email: req.authUser!.email ?? null,
  }))

  app.get('/api/integrations/status', { preHandler: requireAuth }, async () => {
    const firebaseReady = getFirebaseAdmin().status === 'ready'
    const morningConnected = firebaseReady
      ? Boolean(await loadMorningCredentials())
      : false
    return {
      ok: true,
      integrations: {
        morning: morningConnected ? 'connected' : 'pending',
        clockify: 'pending',
      },
    }
  })
}
