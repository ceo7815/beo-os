"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_KEY = void 0;
exports.json = json;
exports.badRequest = badRequest;
exports.unauthorized = unauthorized;
exports.readApiKeyFromRequest = readApiKeyFromRequest;
exports.assertApiKey = assertApiKey;
exports.parseEntity = parseEntity;
exports.isSchemaCatalogRequest = isSchemaCatalogRequest;
exports.parseId = parseId;
exports.parseLimit = parseLimit;
exports.parseBody = parseBody;
exports.parseDataPayload = parseDataPayload;
exports.parseActor = parseActor;
exports.stripUndefined = stripUndefined;
exports.timestampToIso = timestampToIso;
exports.serializeDoc = serializeDoc;
exports.requireString = requireString;
exports.optionalString = optionalString;
exports.requireEnum = requireEnum;
exports.requireYmd = requireYmd;
exports.requireNumber = requireNumber;
exports.mergeErrors = mergeErrors;
exports.okData = okData;
exports.failErrors = failErrors;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
/** DEBUG — להחזיר ל-Secret Manager אחרי ש-Dify יציב */
exports.VALID_KEY = 'a1a2a3a4a5a6a7a8a9Eve0n';
function json(res, status, body) {
    res.status(status).json(body);
}
function badRequest(res, errors, extra) {
    const list = Array.isArray(errors) ? errors : [errors];
    json(res, 400, { ok: false, error: 'validation_error', errors: list, ...extra });
}
function unauthorized(res) {
    json(res, 401, { ok: false, error: 'unauthorized' });
}
function headerFirstValue(headers, name) {
    const raw = headers[name.toLowerCase()];
    if (typeof raw === 'string' && raw.trim())
        return raw.trim();
    if (Array.isArray(raw)) {
        for (const part of raw) {
            if (typeof part === 'string' && part.trim())
                return part.trim();
        }
    }
    return '';
}
function readApiKeyFromRequest(req) {
    const custom = headerFirstValue(req.headers, 'x-hub-api-key');
    if (custom)
        return custom;
    const auth = headerFirstValue(req.headers, 'authorization');
    if (!auth)
        return '';
    const bearer = auth.match(/^Bearer\s+(.+)$/i);
    if (bearer?.[1]?.trim())
        return bearer[1].trim();
    return auth;
}
function assertApiKey(req, res) {
    const provided = readApiKeyFromRequest(req);
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(exports.VALID_KEY, 'utf8');
    if (a.length !== b.length || !(0, node_crypto_1.timingSafeEqual)(a, b)) {
        unauthorized(res);
        return false;
    }
    return true;
}
function parseEntity(req) {
    const q = req.query;
    const raw = (typeof q.entity === 'string' && q.entity) || (typeof q.resource === 'string' && q.resource) || '';
    return raw.trim().toLowerCase();
}
/** GET ?meta=schema — קטלוג API בלי entity (למשל בדיקת Schema ב-Dify) */
function isSchemaCatalogRequest(req) {
    const meta = req.query.meta;
    return typeof meta === 'string' && meta.trim().toLowerCase() === 'schema';
}
function parseId(req) {
    return typeof req.query.id === 'string' ? req.query.id.trim() : '';
}
function parseLimit(req, max = 200, fallback = 100) {
    const raw = req.query.limit;
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isFinite(n) || n < 1)
        return fallback;
    return Math.min(Math.floor(n), max);
}
function parseBody(req) {
    const b = req.body;
    if (b && typeof b === 'object' && !Array.isArray(b))
        return b;
    return {};
}
function parseDataPayload(body) {
    const data = body.data;
    if (data && typeof data === 'object' && !Array.isArray(data))
        return data;
    return body;
}
function parseActor(body) {
    const a = body.actor;
    if (a && typeof a === 'object' && !Array.isArray(a)) {
        const o = a;
        const userId = typeof o.userId === 'string' ? o.userId.trim() : '';
        if (userId) {
            return {
                userId,
                userName: typeof o.userName === 'string' ? o.userName.trim() : undefined,
            };
        }
    }
    const uid = typeof body.actorUserId === 'string' ? body.actorUserId.trim() : '';
    if (uid) {
        return {
            userId: uid,
            userName: typeof body.actorUserName === 'string' ? body.actorUserName.trim() : undefined,
        };
    }
    return null;
}
function stripUndefined(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined)
            out[k] = v;
    }
    return out;
}
function timestampToIso(value) {
    if (value instanceof firestore_1.Timestamp)
        return value.toDate().toISOString();
    if (typeof value === 'string' && value.trim())
        return value.trim();
    return undefined;
}
function serializeDoc(id, data) {
    const out = { id };
    for (const [k, v] of Object.entries(data)) {
        if (v instanceof firestore_1.Timestamp)
            out[k] = v.toDate().toISOString();
        else
            out[k] = v;
    }
    return out;
}
function requireString(data, field, label) {
    const v = data[field];
    if (typeof v !== 'string' || !v.trim()) {
        return { errors: [`${label ?? field} — שדה חובה (מחרוזת לא ריקה)`] };
    }
    return { value: v.trim(), errors: [] };
}
function optionalString(data, field) {
    const v = data[field];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
function requireEnum(data, field, allowed, label) {
    const v = data[field];
    if (typeof v !== 'string' || !allowed.includes(v)) {
        return {
            errors: [
                `${label ?? field} — חייב להיות אחד מ: ${allowed.join(', ')}`,
            ],
        };
    }
    return { value: v, errors: [] };
}
function requireYmd(data, field, label) {
    const r = requireString(data, field, label);
    if (r.errors.length || !r.value)
        return r;
    if (!/^\d{4}-\d{2}-\d{2}/.test(r.value)) {
        return { errors: [`${label ?? field} — פורמט תאריך חובה YYYY-MM-DD`] };
    }
    return { value: r.value.slice(0, 10), errors: [] };
}
function requireNumber(data, field, label, min = 0) {
    const v = data[field];
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
    if (!Number.isFinite(n) || n < min) {
        return { errors: [`${label ?? field} — מספר חובה${min > 0 ? ` (מינימום ${min})` : ''}`] };
    }
    return { value: n, errors: [] };
}
function mergeErrors(...parts) {
    return parts.flatMap((p) => p.errors);
}
function okData(data) {
    return { ok: true, data };
}
function failErrors(errors) {
    return { ok: false, errors };
}
