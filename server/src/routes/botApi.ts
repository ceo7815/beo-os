import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  apiCatalog,
  handleDelete,
  handleGet,
  handlePatch,
  handlePost,
  normalizeEntity,
  HubApiDbNotReadyError,
} from '../lib/hubApiRegistry.js'
import {
  isSchemaCatalogRequest,
  isValidApiKey,
  parseBody,
  parseEntity,
  parseId,
  parseSub,
  unauthorized,
  type ApiResult,
} from '../lib/hubApiHttpUtil.js'

// Bot/agent-facing CRM API, served directly from this already-running Fastify server instead of
// the difyHubData Cloud Function (which requires GCP billing to be enabled on hub-pos-f399c -
// see PROJECT_HANDOFF.md in the ceo-digital-ai repo, 2026-07-10). Same query-param shape and
// X-Hub-Api-Key auth as the original Cloud Function, so bot-side code barely changes.

function send(reply: FastifyReply, result: ApiResult): void {
  reply.code(result.status).send(result.body)
}

export async function registerBotApiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/bot-data', async (req, reply) => {
    const query = req.query as Record<string, unknown>

    if (!isValidApiKey(req.headers as Record<string, string | string[] | undefined>)) {
      send(reply, unauthorized())
      return
    }

    if (isSchemaCatalogRequest(query)) {
      send(reply, { status: 200, body: { ok: true, catalog: apiCatalog() } })
      return
    }

    const entity = normalizeEntity(parseEntity(query))
    if (!entity) {
      send(reply, { status: 400, body: { ok: false, error: 'unknown_or_blocked_entity' } })
      return
    }

    try {
      const result = await handleGet(entity, parseId(query), query)
      send(reply, result)
    } catch (e) {
      if (e instanceof HubApiDbNotReadyError) {
        reply.code(503).send({ ok: false, error: 'firebase_not_configured', message: e.message })
        return
      }
      throw e
    }
  })

  app.post('/api/bot-data', async (req, reply) => {
    const query = req.query as Record<string, unknown>

    if (!isValidApiKey(req.headers as Record<string, string | string[] | undefined>)) {
      send(reply, unauthorized())
      return
    }

    const entity = normalizeEntity(parseEntity(query))
    if (!entity) {
      send(reply, { status: 400, body: { ok: false, error: 'unknown_or_blocked_entity' } })
      return
    }

    const body = parseBody(req.body)
    try {
      const result = await handlePost(entity, parseId(query), body, parseSub(query))
      send(reply, result)
    } catch (e) {
      if (e instanceof HubApiDbNotReadyError) {
        reply.code(503).send({ ok: false, error: 'firebase_not_configured', message: e.message })
        return
      }
      throw e
    }
  })

  app.patch('/api/bot-data', async (req, reply) => {
    const query = req.query as Record<string, unknown>

    if (!isValidApiKey(req.headers as Record<string, string | string[] | undefined>)) {
      send(reply, unauthorized())
      return
    }

    const entity = normalizeEntity(parseEntity(query))
    if (!entity) {
      send(reply, { status: 400, body: { ok: false, error: 'unknown_or_blocked_entity' } })
      return
    }

    const body = parseBody(req.body)
    try {
      const result = await handlePatch(entity, parseId(query), body)
      send(reply, result)
    } catch (e) {
      if (e instanceof HubApiDbNotReadyError) {
        reply.code(503).send({ ok: false, error: 'firebase_not_configured', message: e.message })
        return
      }
      throw e
    }
  })

  app.delete('/api/bot-data', async (req, reply) => {
    const query = req.query as Record<string, unknown>

    if (!isValidApiKey(req.headers as Record<string, string | string[] | undefined>)) {
      send(reply, unauthorized())
      return
    }

    const entity = normalizeEntity(parseEntity(query))
    if (!entity) {
      send(reply, { status: 400, body: { ok: false, error: 'unknown_or_blocked_entity' } })
      return
    }

    try {
      const result = await handleDelete(entity, parseId(query))
      send(reply, result)
    } catch (e) {
      if (e instanceof HubApiDbNotReadyError) {
        reply.code(503).send({ ok: false, error: 'firebase_not_configured', message: e.message })
        return
      }
      throw e
    }
  })
}
