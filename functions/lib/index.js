"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.difyHubData = exports.clockifyProxy = exports.sendMeetingInviteNotifications = exports.sendAssigneeTaskNotification = exports.updateManagedUserPassword = exports.updateManagedUserEmail = exports.createManagedUser = void 0;
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
async function resolveUserDisplayName(uid) {
    let fallback = 'משתמש';
    try {
        const rec = await adminAuth.getUser(uid);
        const dn = rec.displayName?.trim();
        if (dn)
            return dn;
        const userDoc = await db.doc(`users/${uid}`).get();
        const n = userDoc.get('name');
        if (typeof n === 'string' && n.trim())
            return n.trim();
        const em = normalizeHubEmail(rec.email);
        if (em)
            return em.split('@')[0] ?? fallback;
    }
    catch {
        const userDoc = await db.doc(`users/${uid}`).get();
        const n = userDoc.get('name');
        if (typeof n === 'string' && n.trim())
            return n.trim();
    }
    return fallback;
}
function requireAuthUid(authUid) {
    if (!authUid) {
        throw new https_1.HttpsError('unauthenticated', 'יש להתחבר למערכת');
    }
    return authUid;
}
const callableGen2Base = {
    region: 'us-central1',
    /** Gen2 + Cloud Run: ה-Callable שולח Bearer דרך Firebase; invoker public נדרש לרוב הפריסות */
    invoker: 'public',
};
function mapAuthCreateUserError(e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/email-already-exists|EMAIL_EXISTS/i.test(msg)) {
        return new https_1.HttpsError('already-exists', 'כבר קיים משתמש Auth עם אימייל זה');
    }
    if (/invalid-email/i.test(msg)) {
        return new https_1.HttpsError('invalid-argument', 'כתובת אימייל לא תקינה');
    }
    if (/weak-password|password/i.test(msg) && /6|length/i.test(msg)) {
        return new https_1.HttpsError('invalid-argument', 'הסיסמה חלשה מדי או קצרה מדי');
    }
    return null;
}
exports.createManagedUser = (0, https_1.onCall)(callableGen2Base, async (request) => {
    try {
        const callerUid = requireAuthUid(request.auth?.uid);
        await assertSuperadmin(callerUid);
        const data = request.data;
        const email = String(data.email ?? '').trim().toLowerCase();
        const password = String(data.password ?? '').trim();
        const name = String(data.name ?? '').trim();
        const role = ensureRole(data.role);
        const isAgent = Boolean(data.isAgent);
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
            isAgent,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        return { uid: user.uid };
    }
    catch (e) {
        if (e instanceof https_1.HttpsError)
            throw e;
        const mapped = mapAuthCreateUserError(e);
        if (mapped)
            throw mapped;
        console.error('createManagedUser', e);
        const detail = e instanceof Error ? e.message : String(e);
        throw new https_1.HttpsError('internal', detail || 'יצירת משתמש נכשלה');
    }
});
exports.updateManagedUserEmail = (0, https_1.onCall)(callableGen2Base, async (request) => {
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
exports.updateManagedUserPassword = (0, https_1.onCall)(callableGen2Base, async (request) => {
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
        const mode = data.kind === 'transfer' ? 'transfer' : 'new';
        const html = (0, taskAssignmentMail_js_1.buildTaskAssignedHtml)({
            assigneeGreeting,
            creatorName,
            taskTitle,
            taskDescription,
            dueDateLabel: dueDate,
            tasksUrl,
            appBaseUrl: appBase,
            mode,
        });
        const creatorForSubject = creatorName.length > 32 ? `${creatorName.slice(0, 29)}…` : creatorName;
        const subjectPrefix = mode === 'transfer'
            ? `הועברה אליך משימה מאת ${creatorForSubject}`
            : 'נפתחה לך משימה חדשה';
        const subject = taskTitle.length > 55
            ? `${subjectPrefix} — ${taskTitle.slice(0, 52)}…`
            : `${subjectPrefix} — ${taskTitle}`;
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
/**
 * שליחת מייל הזמנה לכל משתתפי הפגישה (attendeeUserIds), כולל המזמין אם הוא ברשימה.
 * דורש שהמזמין יהיה ב-attendeeUserIds או יוצר/מאורגן / אדמין.
 */
exports.sendMeetingInviteNotifications = (0, https_1.onCall)({
    region: 'us-central1',
    invoker: 'public',
    secrets: [resendApiKeySecret, mailFromSecret],
}, async (request) => {
    try {
        const callerUid = requireAuthUid(request.auth?.uid);
        const data = request.data;
        const meetingId = String(data.meetingId ?? '').trim();
        if (!meetingId) {
            throw new https_1.HttpsError('invalid-argument', 'חסר מזהה פגישה');
        }
        const snap = await db.doc(`meetings/${meetingId}`).get();
        if (!snap.exists) {
            throw new https_1.HttpsError('not-found', 'הפגישה לא נמצאה');
        }
        const m = snap.data();
        const attendeeIdsRaw = m.attendeeUserIds;
        const attendeeUserIds = Array.isArray(attendeeIdsRaw)
            ? attendeeIdsRaw.map((id) => String(id)).filter(Boolean)
            : [];
        const callerIsAdmin = await (async () => {
            const u = await db.doc(`users/${callerUid}`).get();
            const r = u.get('role');
            return (r === 'admin' ||
                r === 'superadmin' ||
                r === 'Admin' ||
                r === 'Superadmin');
        })();
        if (!callerIsAdmin &&
            !attendeeUserIds.includes(callerUid) &&
            String(m.createdBy ?? '') !== callerUid &&
            String(m.organizerUserId ?? '') !== callerUid) {
            throw new https_1.HttpsError('permission-denied', 'אין הרשאה לשלוח הזמנות לפגישה זו');
        }
        const createdByUid = String(m.createdBy ?? '').trim() || callerUid;
        const creatorName = await resolveUserDisplayName(createdByUid);
        const meetingTitle = String(m.title ?? '').trim() || 'פגישה';
        const purpose = String(m.purpose ?? '');
        const agenda = String(m.agenda ?? '');
        const startYmdRaw = String(m.startDate ?? '').trim().slice(0, 10);
        const startDateOk = /^\d{4}-\d{2}-\d{2}$/.test(startYmdRaw)
            ? startYmdRaw
            : '';
        const startDateForCal = startDateOk || new Date().toISOString().slice(0, 10);
        const startTime = String(m.startTime ?? '').trim();
        const endTime = String(m.endTime ?? '').trim();
        let whenLabel = startDateOk || '—';
        if (startDateOk && startTime) {
            whenLabel = endTime
                ? `${startDateOk} · ${startTime}–${endTime}`
                : `${startDateOk} · ${startTime}`;
        }
        const clientId = String(m.clientId ?? '').trim();
        const projectId = String(m.projectId ?? '').trim();
        const supplierId = String(m.supplierId ?? '').trim();
        const leadId = String(m.leadId ?? '').trim();
        const locationRaw = String(m.location ?? '').trim();
        let clientName = '';
        let projectName = '';
        const extraContextLines = [];
        if (clientId) {
            const c = await db.doc(`clients/${clientId}`).get();
            const nm = c.get('name');
            clientName =
                typeof nm === 'string' && nm.trim() ? nm.trim() : clientId;
        }
        if (projectId) {
            const p = await db.doc(`projects/${projectId}`).get();
            const nm = p.get('name');
            projectName =
                typeof nm === 'string' && nm.trim() ? nm.trim() : projectId;
        }
        if (supplierId) {
            const s = await db.doc(`suppliers/${supplierId}`).get();
            const nm = s.get('name');
            extraContextLines.push(`ספק: ${typeof nm === 'string' && nm.trim() ? nm.trim() : supplierId}`);
        }
        if (leadId) {
            const l = await db.doc(`leads/${leadId}`).get();
            const nm = l.get('name');
            extraContextLines.push(`ליד: ${typeof nm === 'string' && nm.trim() ? nm.trim() : leadId}`);
        }
        if (locationRaw) {
            extraContextLines.push(`מיקום / קישור: ${locationRaw}`);
        }
        const appBase = (0, taskAssignmentMail_js_1.defaultPublicAppUrl)().replace(/\/$/, '');
        const hubCalendarUrl = `${appBase}/calendar?openMeeting=${encodeURIComponent(meetingId)}`;
        const gCalDetails = [
            meetingTitle,
            '',
            `מועד: ${whenLabel}`,
            purpose.trim() ? `מטרה:\n${purpose}` : '',
            agenda.trim() ? `תוכן / סדר יום:\n${agenda}` : '',
            clientName ? `לקוח: ${clientName}` : '',
            projectName ? `פרויקט: ${projectName}` : '',
            ...extraContextLines,
            '',
            `פתיחה ביומן הארגון: ${hubCalendarUrl}`,
        ]
            .filter((x) => x.length > 0)
            .join('\n\n');
        const googleCalendarUrl = (0, taskAssignmentMail_js_1.buildGoogleCalendarEventUrl)({
            title: meetingTitle,
            startDateYmd: startDateForCal,
            startTimeHm: startTime || undefined,
            endTimeHm: endTime || undefined,
            details: gCalDetails,
            location: locationRaw || undefined,
        });
        const resendKey = readResendApiKey();
        const mailFromEnv = readMailFrom();
        const smtp = (0, taskAssignmentMail_js_1.loadSmtpConfig)();
        let sentCount = 0;
        let skipped = 0;
        for (const uid of attendeeUserIds) {
            const resolved = await resolveAssigneeEmailAndGreeting(uid);
            if (!resolved) {
                skipped++;
                continue;
            }
            const html = (0, taskAssignmentMail_js_1.buildMeetingInviteHtml)({
                recipientGreeting: resolved.greeting,
                creatorName,
                meetingTitle,
                purpose,
                agenda,
                whenLabel,
                extraContextLines,
                clientName: clientName || undefined,
                projectName: projectName || undefined,
                hubCalendarUrl,
                googleCalendarUrl,
                appBaseUrl: appBase,
            });
            const subject = meetingTitle.length > 50
                ? `פגישה ביומן — ${meetingTitle.slice(0, 47)}…`
                : `פגישה ביומן — ${meetingTitle}`;
            if (resendKey) {
                if (!mailFromEnv) {
                    return {
                        ok: true,
                        skipped: true,
                        reason: 'no_smtp',
                    };
                }
                const sent = await (0, taskAssignmentMail_js_1.sendEmailViaResendHttp)({
                    apiKey: resendKey,
                    from: mailFromEnv,
                    to: resolved.email,
                    subject,
                    html,
                });
                if (!sent.ok) {
                    console.error('sendMeetingInviteNotifications Resend', sent.message);
                    continue;
                }
                sentCount++;
                continue;
            }
            if (!smtp) {
                return {
                    ok: true,
                    skipped: true,
                    reason: 'no_smtp',
                };
            }
            const transport = (0, taskAssignmentMail_js_1.createMailTransport)(smtp);
            try {
                await transport.sendMail({
                    from: smtp.from,
                    to: resolved.email,
                    subject,
                    html,
                });
                sentCount++;
            }
            catch (sendErr) {
                console.error('sendMeetingInviteNotifications sendMail', sendErr);
            }
        }
        return {
            ok: true,
            sent: sentCount > 0,
            sentCount,
            skippedRecipients: skipped,
        };
    }
    catch (e) {
        if (e instanceof https_1.HttpsError)
            throw e;
        console.error('sendMeetingInviteNotifications unexpected', e);
        return {
            ok: true,
            skipped: true,
            reason: 'function_error',
        };
    }
});
var clockifyProxy_js_1 = require("./clockifyProxy.js");
Object.defineProperty(exports, "clockifyProxy", { enumerable: true, get: function () { return clockifyProxy_js_1.clockifyProxy; } });
var difyHubData_js_1 = require("./difyHubData.js");
Object.defineProperty(exports, "difyHubData", { enumerable: true, get: function () { return difyHubData_js_1.difyHubData; } });
