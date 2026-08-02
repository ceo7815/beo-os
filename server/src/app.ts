import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { env } from './config/env.js'
import { MAX_DOCUMENT_BYTES } from './lib/financeDocumentStore.js'
import { registerFinanceDocumentRoutes } from './routes/financeDocuments.js'
import { registerHealthRoutes } from './routes/health.js'
import { registerApiRoutes } from './routes/api.js'
import { registerMorningRoutes } from './routes/morning.js'
import { registerBotApiRoutes } from './routes/botApi.js'
import { registerFinanceAgentRoutes } from './routes/financeAgent.js'

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

  await app.register(multipart, {
    limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
  })

  await registerHealthRoutes(app)
  await registerApiRoutes(app)
  await registerMorningRoutes(app)
  await registerBotApiRoutes(app)
  await registerFinanceAgentRoutes(app)
  await registerFinanceDocumentRoutes(app)

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ ok: false, error: 'not_found', message: 'נתיב לא קיים' })
  })

  /**
   * קוד השגיאה נשמר כפי שהוא. קודם כל שגיאה הוחזרה כ-500, ולכן קובץ גדול
   * מדי או סוג תוכן שגוי הוצגו למשתמש כ"שגיאה פנימית" — הודעה שאי אפשר
   * לפעול לפיה. שגיאות 4xx נובעות מהבקשה עצמה וההודעה שלהן בטוחה להצגה.
   */
  app.setErrorHandler((err: unknown, _req, reply) => {
    const known = err as { statusCode?: number; code?: string } | null
    const status =
      typeof known?.statusCode === 'number' && known.statusCode >= 400
        ? known.statusCode
        : 500
    if (status >= 500) app.log.error(err)
    const message = err instanceof Error ? err.message : 'שגיאה פנימית'
    reply.code(status).send({
      ok: false,
      error: status >= 500 ? 'internal' : (known?.code ?? 'bad_request'),
      message: status < 500 || env.isDev ? message : 'שגיאה פנימית',
    })
  })

  return app
}
