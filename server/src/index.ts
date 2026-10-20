import './config/loadEnv.js'
import { buildApp } from './app.js'
import { env } from './config/env.js'
import { getServiceSupabase } from './lib/supabaseAdmin.js'
import { syncShayReplies } from './routes/pipelineExtras.js'

async function main() {
  const app = await buildApp()

  try {
    await app.listen({ host: env.host, port: env.port })
    app.log.info(
      `Beo OS server — http://${env.host}:${env.port}  (health: /api/health)`,
    )
    if (env.shaySyncIntervalMinutes > 0) {
      const tick = () => {
        const sb = getServiceSupabase()
        if (!sb || !env.defaultLeadOwnerId) return
        void syncShayReplies(sb, env.beoAgentsBaseUrl, env.defaultLeadOwnerId).catch((err) => {
          app.log.warn({ err }, 'shay reply sync failed')
        })
      }
      const timer = setInterval(tick, env.shaySyncIntervalMinutes * 60 * 1000)
      timer.unref?.()
    }
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }

  const shutdown = async (signal: string) => {
    app.log.info(`מקבל ${signal} — סגירה`)
    await app.close()
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

void main()
