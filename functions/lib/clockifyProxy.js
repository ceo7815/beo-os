"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clockifyProxy = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const CLOCKIFY_BASE_DEFAULT = 'https://api.clockify.me/api/v1';
function normalizeClockifyBaseUrl(raw) {
    const t = (raw ?? '').trim();
    const base = t || CLOCKIFY_BASE_DEFAULT;
    return base.replace(/\/+$/, '');
}
function requireAuthUid(authUid) {
    if (!authUid) {
        throw new https_1.HttpsError('unauthenticated', 'יש להתחבר למערכת');
    }
    return authUid;
}
function isSafeClockifyPath(path, workspaceId) {
    const p = path.replace(/^\/+/, '');
    if (!p || p.includes('..') || p.includes('//'))
        return false;
    const prefix = `workspaces/${workspaceId}/`;
    if (!p.startsWith(prefix))
        return false;
    const rest = p.slice(prefix.length);
    if (rest.length === 0)
        return false;
    return (rest === 'users' ||
        rest.startsWith('users/') ||
        rest.startsWith('user/') ||
        rest === 'projects' ||
        rest.startsWith('projects/'));
}
function flattenParams(params) {
    const out = {};
    if (params == null || typeof params !== 'object')
        return out;
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null)
            continue;
        out[k] = String(v);
    }
    return out;
}
function apiKeyLogHint(apiKey) {
    if (!apiKey)
        return '(ריק)';
    const len = apiKey.length;
    if (len <= 4)
        return `אורך=${len}`;
    return `אורך=${len}, סיומת=...${apiKey.slice(-4)}`;
}
function readStringField(data, key) {
    if (!data)
        return '';
    const v = data[key];
    return typeof v === 'string' ? v.trim() : '';
}
async function loadClockifyCredentials() {
    const db = (0, firestore_1.getFirestore)((0, app_1.getApp)());
    const [clockifySnap, settingsSnap] = await Promise.all([
        db.doc('attendanceConfig/clockify').get(),
        db.doc('attendanceConfig/settings').get(),
    ]);
    const clockifyData = clockifySnap.exists ? clockifySnap.data() : undefined;
    const settingsData = settingsSnap.exists ? settingsSnap.data() : undefined;
    const apiKey = readStringField(clockifyData, 'apiKey');
    let workspaceId = readStringField(clockifyData, 'workspaceId');
    if (!workspaceId) {
        workspaceId = readStringField(settingsData, 'workspaceId');
    }
    console.log('[clockifyProxy] Firestore:', {
        clockifyDocExists: clockifySnap.exists,
        settingsDocExists: settingsSnap.exists,
        apiKey: apiKeyLogHint(apiKey),
        workspaceId: workspaceId || '(ריק)',
        workspaceFromClockify: Boolean(readStringField(clockifyData, 'workspaceId')),
        workspaceFromSettingsFallback: Boolean(workspaceId && !readStringField(clockifyData, 'workspaceId')),
    });
    const apiBaseUrl = normalizeClockifyBaseUrl(readStringField(clockifyData, 'apiBaseUrl'));
    return { apiKey, workspaceId, apiBaseUrl };
}
/**
 * Gen2 Callable — כמו שאר הפונקציות בפרויקט.
 * `invoker: 'public'` — נדרש ל־`httpsCallable` מהדפדפן (כולל localhost); האימות נשאר ב־`request.auth`.
 */
exports.clockifyProxy = (0, https_1.onCall)({
    region: 'us-central1',
    invoker: 'public',
    /** דוח אדמין מושך time-entries לכל העובדים — צריך יותר מ-60 שניות */
    timeoutSeconds: 300,
    memory: '512MiB',
}, async (request) => {
    try {
        requireAuthUid(request.auth?.uid);
        const data = request.data;
        const path = typeof data.path === 'string' ? data.path.trim() : '';
        if (!path) {
            throw new https_1.HttpsError('invalid-argument', 'חסר path');
        }
        const { apiKey, workspaceId, apiBaseUrl } = await loadClockifyCredentials();
        if (!apiKey) {
            console.error('[clockifyProxy] חסר apiKey ב-attendanceConfig/clockify');
            throw new https_1.HttpsError('failed-precondition', 'חסר API Key ב-Firestore (attendanceConfig/clockify)');
        }
        if (!workspaceId) {
            console.error('[clockifyProxy] חסר workspaceId ב-clockify וב-settings');
            throw new https_1.HttpsError('failed-precondition', 'חסר Workspace ID ב-Firestore (attendanceConfig/clockify או attendanceConfig/settings)');
        }
        const normalized = path.replace(/^\/+/, '');
        if (!isSafeClockifyPath(normalized, workspaceId)) {
            console.error('[clockifyProxy] path לא עבר ולידציה', {
                normalized,
                expectedPrefix: `workspaces/${workspaceId}/`,
            });
            throw new https_1.HttpsError('invalid-argument', 'path לא מורשה — רק תחת workspaces/{workspaceId}/users|user/...|projects');
        }
        const flat = flattenParams(data.params);
        const qs = new URLSearchParams(flat).toString();
        const url = `${apiBaseUrl}/${normalized}${qs ? `?${qs}` : ''}`;
        console.log('[clockifyProxy] Clockify בקשה', { path: normalized, hasQuery: Boolean(qs) });
        let clockifyRes;
        try {
            clockifyRes = await fetch(url, {
                method: 'GET',
                headers: {
                    'X-Api-Key': apiKey,
                    Accept: 'application/json',
                },
            });
        }
        catch (fetchErr) {
            console.error('[clockifyProxy] שגיאת רשת ב-fetch ל-Clockify', {
                url: url.split('?')[0],
                error: fetchErr,
                message: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
                stack: fetchErr instanceof Error ? fetchErr.stack : undefined,
            });
            throw new https_1.HttpsError('internal', fetchErr instanceof Error ? fetchErr.message : 'שגיאת רשת בקריאה ל-Clockify');
        }
        const text = await clockifyRes.text();
        let body = text;
        try {
            body = text ? JSON.parse(text) : null;
        }
        catch (parseErr) {
            console.error('[clockifyProxy] תשובה שאינה JSON תקין', {
                status: clockifyRes.status,
                preview: text.slice(0, 500),
                parseErr,
            });
        }
        if (!clockifyRes.ok) {
            if (clockifyRes.status === 404 && normalized.endsWith('/time-entries/in-progress')) {
                return { status: 404, body: null };
            }
            const clockifyMsg = typeof body === 'object' && body && 'message' in body
                ? String(body.message)
                : text.slice(0, 500);
            console.error('[clockifyProxy] Clockify החזיר שגיאה', {
                status: clockifyRes.status,
                statusText: clockifyRes.statusText,
                path: normalized,
                clockifyMessage: clockifyMsg,
            });
            throw new https_1.HttpsError('internal', `Clockify ${clockifyRes.status}: ${clockifyMsg}`);
        }
        return { status: clockifyRes.status, body };
    }
    catch (e) {
        if (e instanceof https_1.HttpsError) {
            console.error('[clockifyProxy] HttpsError', { code: e.code, message: e.message, details: e.details });
            throw e;
        }
        const err = e;
        console.error('[clockifyProxy] שגיאה לא צפויה', {
            name: err?.name,
            message: err?.message,
            stack: err?.stack,
            raw: e,
        });
        throw new https_1.HttpsError('internal', err?.message ?? 'שגיאה פנימית ב-clockifyProxy');
    }
});
