import type { FastifyInstance } from 'fastify'
import { env, morningConfigured } from '../config/env.js'
import { getFirebaseAdmin } from '../lib/firebaseAdmin.js'

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  const handler = async () => {
    const fb = getFirebaseAdmin()
    return {
      ok: true,
      service: 'hub-pos-server',
      env: env.nodeEnv,
      uptimeSec: Math.floor(process.uptime()),
      integrations: {
        firebase: fb.status,
        firebaseReason: fb.status === 'not_configured' ? fb.reason : undefined,
        morning: morningConfigured() ? 'configured' : 'not_configured',
      },
    }
  }

  app.get('/health', handler)
  app.get('/api/health', handler)
}
