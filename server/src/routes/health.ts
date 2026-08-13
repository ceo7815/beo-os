import type { FastifyInstance } from 'fastify'
import { env, morningConfigured } from '../config/env.js'
import { getFirebaseAdmin, verifyFirebaseAdmin } from '../lib/firebaseAdmin.js'

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  const handler = async () => {
    const fb = getFirebaseAdmin()
    // initializeApp succeeds with credentials that cannot actually reach
    // Firestore, and every admin route then fails with 503 while this endpoint
    // still reported "ready". Probe the real dependency instead.
    const firestore = fb.status === 'ready' ? await verifyFirebaseAdmin() : null
    return {
      ok: true,
      service: 'beo-os-server',
      env: env.nodeEnv,
      uptimeSec: Math.floor(process.uptime()),
      integrations: {
        firebase: fb.status,
        firebaseReason: fb.status === 'not_configured' ? fb.reason : undefined,
        firestore: firestore ? (firestore.ok ? 'ok' : 'unreachable') : undefined,
        firestoreReason: firestore && !firestore.ok ? firestore.reason : undefined,
        morning: morningConfigured() ? 'configured' : 'not_configured',
      },
    }
  }

  app.get('/health', handler)
  app.get('/api/health', handler)
}
