import { onRequest } from 'firebase-functions/v2/https'
import {
  assertApiKey,
  badRequest,
  isSchemaCatalogRequest,
  json,
  parseBody,
  parseEntity,
  parseId,
} from './difyApi/httpUtil.js'
import {
  apiCatalog,
  handleDelete,
  handleGet,
  handlePatch,
  handlePost,
  normalizeEntity,
} from './difyApi/registry.js'

const REGION = 'us-central1' as const

/**
 * Unified Hub POS API ל-Dify.ai — Firestore Admin SDK.
 *
 * אימות: X-Hub-Api-Key או Authorization: Bearer (VALID_KEY ב-httpUtil.ts)
 *
 * ניתוב:
 *   ?entity=tasks|projects|leads|clients|...  (או resource= לתאימות לאחור)
 *   ?id=<docId>  — GET/PATCH/DELETE יחיד
 *   ?sub=notes   — POST הערה למשימה (עם id=taskId)
 *   ?meta=schema — GET קטלוג API
 */
export const difyHubData = onRequest(
  {
    region: REGION,
    invoker: 'public',
    cors: true,
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (!assertApiKey(req, res)) return

    if (req.method === 'GET' && isSchemaCatalogRequest(req)) {
      json(res, 200, { ok: true, catalog: apiCatalog() })
      return
    }

    const entityRaw = parseEntity(req)
    if (!entityRaw) {
      badRequest(res, 'חסר query entity (לדוגמה: tasks, leads, clients)', {
        hint: 'GET ?meta=schema לרשימה מלאה',
        catalog: apiCatalog(),
      })
      return
    }

    const entity = normalizeEntity(entityRaw)
    if (!entity) {
      badRequest(res, `entity לא מוכר: ${entityRaw}`, { catalog: apiCatalog() })
      return
    }

    const id = parseId(req)
    const sub = typeof req.query.sub === 'string' ? req.query.sub.trim().toLowerCase() : ''
    const body = parseBody(req)

    try {
      switch (req.method) {
        case 'GET':
          await handleGet(entity, id, req.query as Record<string, unknown>, res)
          return
        case 'POST':
          await handlePost(entity, id, body, sub, res)
          return
        case 'PATCH':
        case 'PUT':
          await handlePatch(entity, id, body, res)
          return
        case 'DELETE':
          await handleDelete(entity, id, res)
          return
        default:
          json(res, 405, { ok: false, error: 'method_not_allowed', allowed: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] })
      }
    } catch (e) {
      console.error('[difyHubData]', req.method, entity, id, e)
      json(res, 500, { ok: false, error: 'internal_error' })
    }
  },
)
