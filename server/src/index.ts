import './config/loadEnv.js'
import { buildApp } from './app.js'
import { env } from './config/env.js'

async function main() {
  const app = await buildApp()

  try {
    await app.listen({ host: env.host, port: env.port })
    app.log.info(
      `Hub POS server — http://${env.host}:${env.port}  (health: /api/health)`,
    )
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
