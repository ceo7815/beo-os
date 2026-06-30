import Fastify from 'fastify'
import cors from '@fastify/cors'
import { env } from './config/env.js'
import { registerHealthRoutes } from './routes/health.js'
import { registerApiRoutes } from './routes/api.js'
import { registerMorningRoutes } from './routes/morning.js'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.isDev ? 'info' : 'warn',
    },
  })

  await app.register(cors, {
    origin: env.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  await registerHealthRoutes(app)
  await registerApiRoutes(app)
  await registerMorningRoutes(app)

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ ok: false, error: 'not_found', message: 'נתיב לא קיים' })
  })

  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err)
    const message = err instanceof Error ? err.message : 'שגיאה פנימית'
    reply.code(500).send({
      ok: false,
      error: 'internal',
      message: env.isDev ? message : 'שגיאה פנימית',
    })
  })

  return app
}
