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
import { getServiceSupabase } from '../lib/supabaseAdmin.js'
import { MorningClient, MorningError } from '../lib/morningClient.js'
import { loadMorningCredentials } from '../lib/morningCredentials.js'

// Bot/agent-facing CRM API, served directly from this already-running Fastify server instead of
// the difyHubData Cloud Function (which requires GCP billing to be enabled on hub-pos-f399c -
// see PROJECT_HANDOFF.md in the ceo-digital-ai repo, 2026-07-10). Same query-param shape and
// X-Hub-Api-Key auth as the original Cloud Function, so bot-side code barely changes.

function send(reply: FastifyReply, result: ApiResult): void {
  reply.code(result.status).send(result.body)
}

function sendCaught(reply: FastifyReply, e: unknown): boolean {
  if (e instanceof HubApiDbNotReadyError) {
    reply.code(503).send({ ok: false, error: 'supabase_not_configured', message: e.message })
    return true
  }
  if (e instanceof Error) {
    reply.code(400).send({ ok: false, error: e.message })
    return true
  }
  return false
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
      if (!sendCaught(reply, e)) throw e
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
      if (!sendCaught(reply, e)) throw e
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
      if (!sendCaught(reply, e)) throw e
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
      if (!sendCaught(reply, e)) throw e
    }
  })

  app.post('/api/bot-morning/documents', async (req, reply) => {
    if (!isValidApiKey(req.headers as Record<string, string | string[] | undefined>)) {
      send(reply, unauthorized())
      return
    }
    const body = parseBody(req.body)
    const amount = Number(body.amount)
    const description = String(body.description || '').trim()
    if (!description || !Number.isFinite(amount) || amount <= 0) {
      reply.code(400).send({ ok: false, error: 'חסרים description ו-amount' })
      return
    }
    const creds = await loadMorningCredentials()
    if (!creds) {
      reply.code(400).send({ ok: false, error: 'חשבונית ירוקה לא מחוברת בשרת' })
      return
    }

    let clientBlock: Record<string, unknown> = {}
    const clientId = String(body.clientId || '').trim()
    const sb = getServiceSupabase()
    if (clientId && sb) {
      const { data: row } = await sb.from('clients').select('*').eq('id', clientId).maybeSingle()
      const gi =
        typeof row?.green_invoice_id === 'string' ? row.green_invoice_id.trim() : ''
      if (gi) clientBlock = { id: gi }
      else {
        clientBlock = {
          name: String(body.clientName || row?.name || '').trim(),
          emails: [String(body.email || row?.email || '').trim()].filter(Boolean),
          taxId: String(body.taxId || row?.tax_id || '').trim() || undefined,
        }
      }
    } else {
      clientBlock = {
        name: String(body.clientName || '').trim(),
        emails: [String(body.email || '').trim()].filter(Boolean),
        taxId: String(body.taxId || '').trim() || undefined,
      }
    }
    if (!clientBlock.id && !clientBlock.name) {
      reply.code(400).send({ ok: false, error: 'חסר לקוח (clientId או clientName)' })
      return
    }

    const docType = Number(body.docType) === 305 ? 305 : 320
    const payload = {
      type: docType,
      lang: 'he',
      currency: 'ILS',
      client: clientBlock,
      income: [
        {
          description,
          quantity: 1,
          price: amount,
          currency: 'ILS',
          vatType: 1,
        },
      ],
    }
    try {
      const client = new MorningClient(creds)
      const created = await client.createDocument(payload)
      reply.code(201).send({ ok: true, document: created })
    } catch (e) {
      const status = e instanceof MorningError ? e.status : 502
      reply.code(status >= 400 && status < 600 ? status : 502).send({
        ok: false,
        error: e instanceof Error ? e.message : 'הנפקה נכשלה',
        detail: e instanceof MorningError ? e.detail : undefined,
      })
    }
  })
}
