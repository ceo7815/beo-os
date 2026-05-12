"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clockifyProxy = exports.sendAssigneeTaskNotification = exports.updateManagedUserPassword = exports.updateManagedUserEmail = exports.createManagedUser = void 0;
require("./loadEnv.js");
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const taskAssignmentMail_js_1 = require("./taskAssignmentMail.js");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const adminAuth = (0, auth_1.getAuth)();
/** חובה לקשר ל־onCall — בלי זה אין הרשאת Secret Manager והפונקציה עלולה להיכשל ב־internal */
const resendApiKeySecret = (0, params_1.defineSecret)('RESEND_API_KEY');
const mailFromSecret = (0, params_1.defineSecret)('MAIL_FROM');
function ensureRole(value) {
    return value === 'admin' || value === 'superadmin' ? 'admin' : 'employee';
}
async function assertSuperadmin(uid) {
    const snap = await db.doc(`users/${uid}`).get();
    const role = snap.get('role');
    if (role !== 'admin' && role !== 'superadmin') {
        throw new https_1.HttpsError('permission-denied', 'נדרש מנהל מערכת לפעולה זו');
    }
}
function normalizeHubEmail(value) {
    if (typeof value !== 'string')
        return '';
    const t = value.trim();
    return t.includes('@') ? t : '';
}
/** מייל וברכה למוקצה — קודם Firebase Auth, גיבוי ממסמך users/{uid} (כמו בפרופיל באפליקציה). */
async function resolveAssigneeEmailAndGreeting(assigneeId) {
    let email = '';
    let greeting = '';
    try {
        const assignee = await adminAuth.getUser(assigneeId);
        email = normalizeHubEmail(assignee.email);
        const dn = assignee.displayName?.trim();
        if (dn)
            greeting = dn.split(/\s+/)[0] ?? dn;
        else if (email)
            greeting = email.split('@')[0] ?? '';
    }
    catch {
        // משתמש עלול להיות רק ב-Firestore או רישום Auth לא תואם — נמשיך ל-Firestore
    }
    const userDoc = await db.doc(`users/${assigneeId}`).get();
    if (userDoc.exists) {
        const docEmail = normalizeHubEmail(userDoc.get('email'));
        if (!email && docEmail)
            email = docEmail;
        const nm = userDoc.get('name');
        if (!greeting &&
            typeof nm === 'string' &&
            nm.trim()) {
            greeting = nm.trim().split(/\s+/)[0] ?? '';
        }
    }
    if (!email)
        return null;
    if (!greeting)
        greeting = email.split('@')[0] || 'שם';
    return { email, greeting };
}
function requireAuthUid(authUid) {
    if (!authUid) {
        throw new https_1.HttpsError('unauthenticated', 'יש להתחבר למערכת');
    }
    return authUid;
}
exports.createManagedUser = (0, https_1.onCall)(async (request) => {
    const callerUid = requireAuthUid(request.auth?.uid);
    await assertSuperadmin(callerUid);
    const data = request.data;
    const email = String(data.email ?? '').trim().toLowerCase();
    const password = String(data.password ?? '').trim();
    const name = String(data.name ?? '').trim();
    const role = ensureRole(data.role);
    if (!email || !password || !name) {
        throw new https_1.HttpsError('invalid-argument', 'יש למלא שם, אימייל וסיסמה');
    }
    if (password.length < 6) {
        throw new https_1.HttpsError('invalid-argument', 'הסיסמה חייבת לפחות 6 תווים');
    }
    const user = await adminAuth.createUser({
        email,
        password,
        displayName: name,
        disabled: false,
    });
    await db.doc(`users/${user.uid}`).set({
        name,
        email,
        role,
        avatar: name.slice(0, 2),
        color: '#2563EB',
        active: true,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { uid: user.uid };
});
exports.updateManagedUserEmail = (0, https_1.onCall)(async (request) => {
    const callerUid = requireAuthUid(request.auth?.uid);
    await assertSuperadmin(callerUid);
    const data = request.data;
    const uid = String(data.uid ?? '').trim();
    const email = String(data.email ?? '').trim().toLowerCase();
    if (!uid || !email) {
        throw new https_1.HttpsError('invalid-argument', 'uid ואימייל הם שדות חובה');
    }
    await adminAuth.updateUser(uid, { email });
    await db.doc(`users/${uid}`).set({
        email,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true };
});
exports.updateManagedUserPassword = (0, https_1.onCall)(async (request) => {
    const callerUid = requireAuthUid(request.auth?.uid);
    await assertSuperadmin(callerUid);
    const data = request.data;
    const uid = String(data.uid ?? '').trim();
    const password = String(data.password ?? '').trim();
    if (!uid || !password) {
        throw new https_1.HttpsError('invalid-argument', 'uid וסיסמה הם שדות חובה');
    }
    if (password.length < 6) {
        throw new https_1.HttpsError('invalid-argument', 'הסיסמה חייבת לפחות 6 תווים');
    }
    await adminAuth.updateUser(uid, { password });
    await db.doc(`users/${uid}`).set({
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true };
});
/** מקומי: functions/.env; פרודקשן: סודות מוזרקים ל־process.env לפי השם */
function readResendApiKey() {
    return String(process.env.RESEND_API_KEY ?? '').trim();
}
function readMailFrom() {
    return String(process.env.MAIL_FROM ?? '').trim();
}
/**
 * שליחת מייל למוקצה אחרי יצירת משימה או שינוי מוקצה.
 * כל משתמש מחובר יכול ליזום (מי שמעדכן את המשימה בפועל ב-Firestore).
 * עדיפות: סודות `RESEND_API_KEY` + `MAIL_FROM` (REST Resend).
 * אחרת: SMTP דרך `loadSmtpConfig`. ללא הגדרה — מחזיר skipped בלי שגיאה.
 */
exports.sendAssigneeTaskNotification = (0, https_1.onCall)({
    region: 'us-central1',
    /** חובה ל־Callable ב־Gen2: אימות Firebase נעשה בתוך הפרוטוקול; בלי public ה־Cloud Run דוחה עם Authorization ריק */
    invoker: 'public',
    secrets: [resendApiKeySecret, mailFromSecret],
}, async (request) => {
    try {
        const callerUid = requireAuthUid(request.auth?.uid);
        const data = request.data;
        const taskId = String(data.taskId ?? '').trim();
        if (!taskId) {
            throw new https_1.HttpsError('invalid-argument', 'חסר מזהה משימה');
        }
        const taskSnap = await db.doc(`tasks/${taskId}`).get();
        if (!taskSnap.exists) {
            throw new https_1.HttpsError('not-found', 'המשימה לא נמצאה');
        }
        const t = taskSnap.data();
        const assigneeId = String(t.assigneeId ?? '').trim();
        if (!assigneeId || assigneeId === callerUid) {
            return { ok: true, skipped: true, reason: 'self_or_empty' };
        }
        const resolvedAssignee = await resolveAssigneeEmailAndGreeting(assigneeId);
        if (!resolvedAssignee) {
            return { ok: true, skipped: true, reason: 'no_email' };
        }
        const assigneeEmail = resolvedAssignee.email;
        const assigneeGreeting = resolvedAssignee.greeting;
        let creatorName = 'משתמש';
        try {
            const creatorRecord = await adminAuth.getUser(callerUid);
            const dn = creatorRecord.displayName?.trim();
            if (dn) {
                creatorName = dn;
            }
            else {
                const creatorDoc = await db.doc(`users/${callerUid}`).get();
                const n = creatorDoc.get('name');
                if (typeof n === 'string' && n.trim())
                    creatorName = n.trim();
                else if (creatorRecord.email)
                    creatorName = creatorRecord.email.split('@')[0] ?? creatorName;
            }
        }
        catch {
            const creatorDoc = await db.doc(`users/${callerUid}`).get();
            const n = creatorDoc.get('name');
            if (typeof n === 'string' && n.trim())
                creatorName = n.trim();
        }
        const taskTitle = String(t.title ?? '').trim() || 'משימה';
        const taskDescription = String(t.description ?? '');
        const dueDate = String(t.dueDate ?? '').trim() || '—';
        const appBase = (0, taskAssignmentMail_js_1.defaultPublicAppUrl)().replace(/\/$/, '');
        const tasksUrl = `${appBase}/tasks`;
        const html = (0, taskAssignmentMail_js_1.buildTaskAssignedHtml)({
            assigneeGreeting,
            creatorName,
            taskTitle,
            taskDescription,
            dueDateLabel: dueDate,
            tasksUrl,
            appBaseUrl: appBase,
        });
        const subject = taskTitle.length > 55
            ? `נפתחה לך משימה חדשה — ${taskTitle.slice(0, 52)}…`
            : `נפתחה לך משימה חדשה — ${taskTitle}`;
        const resendKey = readResendApiKey();
        const mailFromEnv = readMailFrom();
        if (resendKey) {
            if (!mailFromEnv) {
                console.warn('sendAssigneeTaskNotification: RESEND_API_KEY set but MAIL_FROM missing');
                return {
                    ok: true,
                    skipped: true,
                    reason: 'no_smtp',
                };
            }
            const sent = await (0, taskAssignmentMail_js_1.sendEmailViaResendHttp)({
                apiKey: resendKey,
                from: mailFromEnv,
                to: assigneeEmail,
                subject,
                html,
            });
            if (!sent.ok) {
                console.error('sendAssigneeTaskNotification Resend HTTP', sent.message);
                return {
                    ok: true,
                    skipped: true,
                    reason: 'smtp_send_failed',
                };
            }
            return { ok: true, sent: true };
        }
        const smtp = (0, taskAssignmentMail_js_1.loadSmtpConfig)();
        if (!smtp) {
            console.warn('sendAssigneeTaskNotification: no RESEND_API_KEY and missing SMTP env (SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM)');
            return { ok: true, skipped: true, reason: 'no_smtp' };
        }
        const transport = (0, taskAssignmentMail_js_1.createMailTransport)(smtp);
        try {
            await transport.sendMail({
                from: smtp.from,
                to: assigneeEmail,
                subject,
                html,
            });
        }
        catch (sendErr) {
            console.error('sendAssigneeTaskNotification sendMail', sendErr);
            return {
                ok: true,
                skipped: true,
                reason: 'smtp_send_failed',
            };
        }
        return { ok: true, sent: true };
    }
    catch (e) {
        if (e instanceof https_1.HttpsError)
            throw e;
        console.error('sendAssigneeTaskNotification unexpected', e);
        return {
            ok: true,
            skipped: true,
            reason: 'function_error',
        };
    }
});
var clockifyProxy_js_1 = require("./clockifyProxy.js");
Object.defineProperty(exports, "clockifyProxy", { enumerable: true, get: function () { return clockifyProxy_js_1.clockifyProxy; } });
