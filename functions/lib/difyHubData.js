"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.difyHubData = void 0;
const https_1 = require("firebase-functions/v2/https");
const httpUtil_js_1 = require("./difyApi/httpUtil.js");
const registry_js_1 = require("./difyApi/registry.js");
const REGION = 'us-central1';
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
exports.difyHubData = (0, https_1.onRequest)({
    region: REGION,
    invoker: 'public',
    cors: true,
}, async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (!(0, httpUtil_js_1.assertApiKey)(req, res))
        return;
    if (req.method === 'GET' && (0, httpUtil_js_1.isSchemaCatalogRequest)(req)) {
        (0, httpUtil_js_1.json)(res, 200, { ok: true, catalog: (0, registry_js_1.apiCatalog)() });
        return;
    }
    const entityRaw = (0, httpUtil_js_1.parseEntity)(req);
    if (!entityRaw) {
        (0, httpUtil_js_1.badRequest)(res, 'חסר query entity (לדוגמה: tasks, leads, clients)', {
            hint: 'GET ?meta=schema לרשימה מלאה',
            catalog: (0, registry_js_1.apiCatalog)(),
        });
        return;
    }
    const entity = (0, registry_js_1.normalizeEntity)(entityRaw);
    if (!entity) {
        (0, httpUtil_js_1.badRequest)(res, `entity לא מוכר: ${entityRaw}`, { catalog: (0, registry_js_1.apiCatalog)() });
        return;
    }
    const id = (0, httpUtil_js_1.parseId)(req);
    const sub = typeof req.query.sub === 'string' ? req.query.sub.trim().toLowerCase() : '';
    const body = (0, httpUtil_js_1.parseBody)(req);
    try {
        switch (req.method) {
            case 'GET':
                await (0, registry_js_1.handleGet)(entity, id, req.query, res);
                return;
            case 'POST':
                await (0, registry_js_1.handlePost)(entity, id, body, sub, res);
                return;
            case 'PATCH':
            case 'PUT':
                await (0, registry_js_1.handlePatch)(entity, id, body, res);
                return;
            case 'DELETE':
                await (0, registry_js_1.handleDelete)(entity, id, res);
                return;
            default:
                (0, httpUtil_js_1.json)(res, 405, { ok: false, error: 'method_not_allowed', allowed: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] });
        }
    }
    catch (e) {
        console.error('[difyHubData]', req.method, entity, id, e);
        (0, httpUtil_js_1.json)(res, 500, { ok: false, error: 'internal_error' });
    }
});
