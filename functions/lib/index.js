"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAssigneeTaskNotification = exports.enforceAttendanceDiscipline = exports.submitProgressCheckIn = exports.updateManagedUserPassword = exports.updateManagedUserEmail = exports.createManagedUser = void 0;
require("./loadEnv.js");
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const taskAssignmentMail_js_1 = require("./taskAssignmentMail.js");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const adminAuth = (0, auth_1.getAuth)();
const ENFORCE_IDLE_MINUTES = 10;
const ENFORCE_HEARTBEAT_MINUTES = 3;
const CHECKIN_MIN_MINUTES = 50;
const CHECKIN_MAX_MINUTES = 70;
const CHECKIN_GRACE_MINUTES = 5;
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
function requireAuthUid(authUid) {
    if (!authUid) {
        throw new https_1.HttpsError('unauthenticated', 'יש להתחבר למערכת');
    }
    return authUid;
}
function parseIsoMs(value) {
    if (typeof value !== 'string' || !value.trim())
        return null;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
}
function nextRandomCheckInIso(fromMs = Date.now()) {
    const minutes = Math.floor(Math.random() * (CHECKIN_MAX_MINUTES - CHECKIN_MIN_MINUTES + 1)) + CHECKIN_MIN_MINUTES;
    return new Date(fromMs + minutes * 60_000).toISOString();
}
function normalizeProgressText(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
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
exports.submitProgressCheckIn = (0, https_1.onCall)(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    const data = request.data;
    const text = normalizeProgressText(data.text);
    const responseMs = typeof data.responseMs === 'number' && Number.isFinite(data.responseMs) ? data.responseMs : 0;
    if (text.length < 20) {
        throw new https_1.HttpsError('invalid-argument', 'יש להזין לפחות 20 תווים בסיכום ההתקדמות');
    }
    const presenceRef = db.collection('attendancePresence').doc(uid);
    const presenceSnap = await presenceRef.get();
    if (!presenceSnap.exists) {
        throw new https_1.HttpsError('failed-precondition', 'לא נמצאה משמרת פעילה לעובד');
    }
    const presence = presenceSnap.data();
    if (presence.status !== 'active') {
        throw new https_1.HttpsError('failed-precondition', 'העובד אינו במצב נוכחות פעיל');
    }
    const recentCheckIns = await db
        .collection('checkIns')
        .where('userId', '==', uid)
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();
    const duplicate = recentCheckIns.docs.some((d) => normalizeProgressText(d.get('text')) === text);
    if (duplicate) {
        throw new https_1.HttpsError('already-exists', 'הטקסט זהה לדיווח קודם. יש להזין עדכון ייחודי');
    }
    const nowMs = Date.now();
    const dueMs = parseIsoMs(presence.nextCheckInDueAt);
    const isLate = dueMs ? nowMs - dueMs > CHECKIN_GRACE_MINUTES * 60_000 : false;
    const suspiciousFast = responseMs > 0 && responseMs < 2000;
    const lastVerifiedMs = parseIsoMs(presence.lastVerifiedAt) ?? parseIsoMs(presence.lastCheckInAt) ?? nowMs;
    const atRiskMinutes = isLate ? Math.max(0, Math.round((nowMs - lastVerifiedMs) / 60000)) : 0;
    const batch = db.batch();
    batch.create(db.collection('checkIns').doc(), {
        userId: uid,
        sessionId: typeof presence.activeLogId === 'string' ? presence.activeLogId : null,
        text,
        responseMs,
        suspiciousFast,
        isLate,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    batch.set(presenceRef, {
        status: 'active',
        lastCheckInAt: new Date(nowMs).toISOString(),
        lastVerifiedAt: new Date(nowMs).toISOString(),
        nextCheckInDueAt: nextRandomCheckInIso(nowMs),
        unverifiedMinutes: firestore_1.FieldValue.increment(atRiskMinutes),
        missedCheckIns: firestore_1.FieldValue.increment(isLate ? 1 : 0),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
    if (isLate || suspiciousFast) {
        batch.create(db.collection('activityLogs').doc(), {
            userId: uid,
            kind: isLate ? 'late_checkin' : 'suspicious_fast_checkin',
            detail: isLate
                ? `צ'ק-אין באיחור. זמן בסיכון: ${atRiskMinutes} דקות`
                : `צ'ק-אין מהיר חשוד (${responseMs}ms)`,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
    await batch.commit();
    return { ok: true, isLate, suspiciousFast, atRiskMinutes };
});
exports.enforceAttendanceDiscipline = (0, scheduler_1.onSchedule)('every 2 minutes', async () => {
    const activeSnap = await db.collection('attendancePresence').where('status', '==', 'active').get();
    if (activeSnap.empty)
        return;
    const nowMs = Date.now();
    const batch = db.batch();
    let writes = 0;
    for (const docSnap of activeSnap.docs) {
        const presence = docSnap.data();
        const userId = docSnap.id;
        const statusBefore = presence.status === 'active' || presence.status === 'paused_idle' ? presence.status : 'offline';
        const activeLogId = typeof presence.activeLogId === 'string' && presence.activeLogId.trim()
            ? presence.activeLogId
            : null;
        const hbMs = parseIsoMs(presence.lastHeartbeatAt);
        const activityMs = parseIsoMs(presence.lastActivityAt);
        const hbLagMinutes = hbMs ? Math.round((nowMs - hbMs) / 60000) : 999;
        const idleLagMinutes = activityMs ? Math.round((nowMs - activityMs) / 60000) : 999;
        const missingHeartbeat = hbLagMinutes >= ENFORCE_HEARTBEAT_MINUTES;
        const missingActivity = idleLagMinutes >= ENFORCE_IDLE_MINUTES;
        const dueMs = parseIsoMs(presence.nextCheckInDueAt);
        const missedCheckIn = dueMs ? nowMs - dueMs > CHECKIN_GRACE_MINUTES * 60_000 : false;
        if (missingHeartbeat || missingActivity) {
            batch.set(db.collection('attendancePresence').doc(userId), {
                status: 'suspected_inactive',
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
            writes += 1;
            batch.create(db.collection('attendanceAnomalies').doc(), {
                userId,
                statusBefore,
                type: missingHeartbeat ? 'missing_heartbeat' : 'missing_activity',
                hbLagMinutes,
                idleLagMinutes,
                note: missingHeartbeat
                    ? 'לא התקבל heartbeat; הטאב נסגר/מחשב במצב שינה או נטישה'
                    : 'אין פעילות משתמש מעל הסף',
                enforcedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            writes += 1;
        }
        if (missedCheckIn) {
            const lastVerifiedMs = parseIsoMs(presence.lastVerifiedAt) ?? parseIsoMs(presence.lastCheckInAt) ?? nowMs;
            const atRiskMinutes = Math.max(0, Math.round((nowMs - lastVerifiedMs) / 60000));
            batch.set(db.collection('attendancePresence').doc(userId), {
                unverifiedMinutes: firestore_1.FieldValue.increment(atRiskMinutes),
                missedCheckIns: firestore_1.FieldValue.increment(1),
                nextCheckInDueAt: nextRandomCheckInIso(nowMs),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
            writes += 1;
            batch.create(db.collection('activityLogs').doc(), {
                userId,
                kind: 'missed_checkin',
                detail: `הוחמץ צ'ק-אין. סומן זמן לא מאומת: ${atRiskMinutes} דקות`,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
            writes += 1;
        }
        if ((missingHeartbeat || missingActivity) && activeLogId) {
            batch.set(db.collection('attendanceLogs').doc(activeLogId), {
                endAt: firestore_1.FieldValue.serverTimestamp(),
                endReason: 'idle_auto',
            }, { merge: true });
            writes += 1;
            batch.set(db.collection('attendancePresence').doc(userId), {
                activeLogId: null,
                activeProjectId: null,
                activeClientId: null,
                activeTaskId: null,
                shiftEndedAt: new Date().toISOString(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
            writes += 1;
        }
    }
    if (writes > 0) {
        await batch.commit();
    }
});
/**
 * שליחת מייל למוקצה כשנוצרת משימה (נקרא מהלקוח אחרי יצירת מסמך).
 * דורש משתני SMTP בסביבת ה-Function. ללא הגדרה — מחזיר skipped בלי שגיאה.
 */
exports.sendAssigneeTaskNotification = (0, https_1.onCall)(async (request) => {
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
    const createdBy = String(t.createdBy ?? '').trim();
    if (createdBy !== callerUid) {
        throw new https_1.HttpsError('permission-denied', 'רק יוצר המשימה יכול ליזום שליחת המייל');
    }
    if (!assigneeId || assigneeId === callerUid) {
        return { ok: true, skipped: true, reason: 'self_or_empty' };
    }
    const smtp = (0, taskAssignmentMail_js_1.loadSmtpConfig)();
    if (!smtp) {
        console.warn('sendAssigneeTaskNotification: missing SMTP env (SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM)');
        return { ok: true, skipped: true, reason: 'no_smtp' };
    }
    let assigneeEmail = '';
    let assigneeGreeting = 'שם';
    try {
        const assignee = await adminAuth.getUser(assigneeId);
        assigneeEmail = assignee.email ?? '';
        const dn = assignee.displayName?.trim();
        if (dn)
            assigneeGreeting = dn.split(/\s+/)[0] ?? dn;
        else if (assigneeEmail)
            assigneeGreeting = assigneeEmail.split('@')[0] ?? 'שם';
    }
    catch {
        return { ok: true, skipped: true, reason: 'assignee_auth' };
    }
    if (!assigneeEmail) {
        return { ok: true, skipped: true, reason: 'no_email' };
    }
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
    const tasksUrl = `${(0, taskAssignmentMail_js_1.defaultPublicAppUrl)()}/tasks`;
    const html = (0, taskAssignmentMail_js_1.buildTaskAssignedHtml)({
        assigneeGreeting,
        creatorName,
        taskTitle,
        taskDescription,
        dueDateLabel: dueDate,
        tasksUrl,
    });
    const transport = (0, taskAssignmentMail_js_1.createMailTransport)(smtp);
    const subject = taskTitle.length > 55
        ? `נפתחה לך משימה חדשה — ${taskTitle.slice(0, 52)}…`
        : `נפתחה לך משימה חדשה — ${taskTitle}`;
    await transport.sendMail({
        from: smtp.from,
        to: assigneeEmail,
        subject,
        html,
    });
    return { ok: true, sent: true };
});
