import type { FastifyInstance } from 'fastify'
import { env, morningConfigured } from '../config/env.js'
import { supabaseServiceConfigured } from '../lib/supabaseAdmin.js'

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  const handler = async () => {
    return {
      ok: true,
      service: 'beo-os-server',
      env: env.nodeEnv,
      uptimeSec: Math.floor(process.uptime()),
      integrations: {
        supabase:
          env.supabaseUrl && env.supabaseAnonKey
            ? supabaseServiceConfigured()
              ? 'service_role_configured'
              : 'url_only_missing_service_role'
            : 'not_configured',
        botApiKey: env.botApiKey ? 'configured' : 'not_configured',
        morning: morningConfigured() ? 'configured' : 'not_configured',
      },
    }
  }

  app.get('/health', handler)
  app.get('/api/health', handler)
}
