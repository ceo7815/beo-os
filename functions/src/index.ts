import './loadEnv.js'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import {
  buildTaskAssignedHtml,
  createMailTransport,
  defaultPublicAppUrl,
  loadSmtpConfig,
  sendEmailViaResendHttp,
} from './taskAssignmentMail.js'

initializeApp()

const db = getFirestore()
const adminAuth = getAuth()
const ENFORCE_IDLE_MINUTES = 10
const ENFORCE_HEARTBEAT_MINUTES = 3
const CHECKIN_MIN_MINUTES = 50
const CHECKIN_MAX_MINUTES = 70
const CHECKIN_GRACE_MINUTES = 5

/** חובה לקשר ל־onCall — בלי זה אין הרשאת Secret Manager והפונקציה עלולה להיכשל ב־internal */
const resendApiKeySecret = defineSecret('RESEND_API_KEY')
const mailFromSecret = defineSecret('MAIL_FROM')

type TeamRole = 'admin' | 'employee'

function ensureRole(value: unknown): TeamRole {
  return value === 'admin' || value === 'superadmin' ? 'admin' : 'employee'
}

async function assertSuperadmin(uid: string): Promise<void> {
  const snap = await db.doc(`users/${uid}`).get()
  const role = snap.get('role')
  if (role !== 'admin' && role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'נדרש מנהל מערכת לפעולה זו')
  }
}

function normalizeHubEmail(value: unknown): string {
  if (typeof value !== 'string') return ''
  const t = value.trim()
  return t.includes('@') ? t : ''
}

/** מייל וברכה למוקצה — קודם Firebase Auth, גיבוי ממסמך users/{uid} (כמו בפרופיל באפליקציה). */
async function resolveAssigneeEmailAndGreeting(assigneeId: string): Promise<{
  email: string
  greeting: string
} | null> {
  let email = ''
  let greeting = ''

  try {
    const assignee = await adminAuth.getUser(assigneeId)
    email = normalizeHubEmail(assignee.email)
    const dn = assignee.displayName?.trim()
    if (dn) greeting = dn.split(/\s+/)[0] ?? dn
    else if (email) greeting = email.split('@')[0] ?? ''
  } catch {
    // משתמש עלול להיות רק ב-Firestore או רישום Auth לא תואם — נמשיך ל-Firestore
  }

  const userDoc = await db.doc(`users/${assigneeId}`).get()
  if (userDoc.exists) {
    const docEmail = normalizeHubEmail(userDoc.get('email'))
    if (!email && docEmail) email = docEmail
    const nm = userDoc.get('name')
    if (
      !greeting &&
      typeof nm === 'string' &&
      nm.trim()
    ) {
      greeting = nm.trim().split(/\s+/)[0] ?? ''
    }
  }

  if (!email) return null
  if (!greeting) greeting = email.split('@')[0] || 'שם'

  return { email, greeting }
}

function requireAuthUid(authUid: string | undefined): string {
  if (!authUid) {
    throw new HttpsError('unauthenticated', 'יש להתחבר למערכת')
  }
  return authUid
}

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

function nextRandomCheckInIso(fromMs = Date.now()): string {
  const minutes = Math.floor(Math.random() * (CHECKIN_MAX_MINUTES - CHECKIN_MIN_MINUTES + 1)) + CHECKIN_MIN_MINUTES
  return new Date(fromMs + minutes * 60_000).toISOString()
}

function normalizeProgressText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

export const createManagedUser = onCall(async (request) => {
  const callerUid = requireAuthUid(request.auth?.uid)
  await assertSuperadmin(callerUid)

  const data = request.data as {
    email?: string
    password?: string
    name?: string
    role?: TeamRole
  }

  const email = String(data.email ?? '').trim().toLowerCase()
  const password = String(data.password ?? '').trim()
  const name = String(data.name ?? '').trim()
  const role = ensureRole(data.role)

  if (!email || !password || !name) {
    throw new HttpsError('invalid-argument', 'יש למלא שם, אימייל וסיסמה')
  }
  if (password.length < 6) {
    throw new HttpsError('invalid-argument', 'הסיסמה חייבת לפחות 6 תווים')
  }

  const user = await adminAuth.createUser({
    email,
    password,
    displayName: name,
    disabled: false,
  })

  await db.doc(`users/${user.uid}`).set(
    {
      name,
      email,
      role,
      avatar: name.slice(0, 2),
      color: '#2563EB',
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  return { uid: user.uid }
})

export const updateManagedUserEmail = onCall(async (request) => {
  const callerUid = requireAuthUid(request.auth?.uid)
  await assertSuperadmin(callerUid)

  const data = request.data as { uid?: string; email?: string }
  const uid = String(data.uid ?? '').trim()
  const email = String(data.email ?? '').trim().toLowerCase()
  if (!uid || !email) {
    throw new HttpsError('invalid-argument', 'uid ואימייל הם שדות חובה')
  }

  await adminAuth.updateUser(uid, { email })
  await db.doc(`users/${uid}`).set(
    {
      email,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  return { ok: true as const }
})

export const updateManagedUserPassword = onCall(async (request) => {
  const callerUid = requireAuthUid(request.auth?.uid)
  await assertSuperadmin(callerUid)

  const data = request.data as { uid?: string; password?: string }
  const uid = String(data.uid ?? '').trim()
  const password = String(data.password ?? '').trim()
  if (!uid || !password) {
    throw new HttpsError('invalid-argument', 'uid וסיסמה הם שדות חובה')
  }
  if (password.length < 6) {
    throw new HttpsError('invalid-argument', 'הסיסמה חייבת לפחות 6 תווים')
  }

  await adminAuth.updateUser(uid, { password })
  await db.doc(`users/${uid}`).set(
    {
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  return { ok: true as const }
})

export const submitProgressCheckIn = onCall(async (request) => {
  const uid = requireAuthUid(request.auth?.uid)
  const data = request.data as { text?: string; responseMs?: number }
  const text = normalizeProgressText(data.text)
  const responseMs = typeof data.responseMs === 'number' && Number.isFinite(data.responseMs) ? data.responseMs : 0
  if (text.length < 20) {
    throw new HttpsError('invalid-argument', 'יש להזין לפחות 20 תווים בסיכום ההתקדמות')
  }

  const presenceRef = db.collection('attendancePresence').doc(uid)
  const presenceSnap = await presenceRef.get()
  if (!presenceSnap.exists) {
    throw new HttpsError('failed-precondition', 'לא נמצאה משמרת פעילה לעובד')
  }
  const presence = presenceSnap.data() as Record<string, unknown>
  if (presence.status !== 'active') {
    throw new HttpsError('failed-precondition', 'העובד אינו במצב נוכחות פעיל')
  }

  const recentCheckIns = await db
    .collection('checkIns')
    .where('userId', '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get()
  const duplicate = recentCheckIns.docs.some((d) => normalizeProgressText(d.get('text')) === text)
  if (duplicate) {
    throw new HttpsError('already-exists', 'הטקסט זהה לדיווח קודם. יש להזין עדכון ייחודי')
  }

  const nowMs = Date.now()
  const dueMs = parseIsoMs(presence.nextCheckInDueAt)
  const isLate = dueMs ? nowMs - dueMs > CHECKIN_GRACE_MINUTES * 60_000 : false
  const suspiciousFast = responseMs > 0 && responseMs < 2000
  const lastVerifiedMs = parseIsoMs(presence.lastVerifiedAt) ?? parseIsoMs(presence.lastCheckInAt) ?? nowMs
  const atRiskMinutes = isLate ? Math.max(0, Math.round((nowMs - lastVerifiedMs) / 60000)) : 0

  const batch = db.batch()
  batch.create(db.collection('checkIns').doc(), {
    userId: uid,
    sessionId: typeof presence.activeLogId === 'string' ? presence.activeLogId : null,
    text,
    responseMs,
    suspiciousFast,
    isLate,
    createdAt: FieldValue.serverTimestamp(),
  })

  batch.set(
    presenceRef,
    {
      status: 'active',
      lastCheckInAt: new Date(nowMs).toISOString(),
      lastVerifiedAt: new Date(nowMs).toISOString(),
      nextCheckInDueAt: nextRandomCheckInIso(nowMs),
      unverifiedMinutes: FieldValue.increment(atRiskMinutes),
      missedCheckIns: FieldValue.increment(isLate ? 1 : 0),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  if (isLate || suspiciousFast) {
    batch.create(db.collection('activityLogs').doc(), {
      userId: uid,
      kind: isLate ? 'late_checkin' : 'suspicious_fast_checkin',
      detail: isLate
        ? `צ'ק-אין באיחור. זמן בסיכון: ${atRiskMinutes} דקות`
        : `צ'ק-אין מהיר חשוד (${responseMs}ms)`,
      createdAt: FieldValue.serverTimestamp(),
    })
  }

  await batch.commit()
  return { ok: true as const, isLate, suspiciousFast, atRiskMinutes }
})

export const enforceAttendanceDiscipline = onSchedule('every 2 minutes', async () => {
  const activeSnap = await db.collection('attendancePresence').where('status', '==', 'active').get()
  if (activeSnap.empty) return

  const nowMs = Date.now()
  const batch = db.batch()
  let writes = 0

  for (const docSnap of activeSnap.docs) {
    const presence = docSnap.data() as Record<string, unknown>
    const userId = docSnap.id
    const statusBefore =
      presence.status === 'active' || presence.status === 'paused_idle' ? presence.status : 'offline'
    const activeLogId =
      typeof presence.activeLogId === 'string' && presence.activeLogId.trim()
        ? presence.activeLogId
        : null
    const hbMs = parseIsoMs(presence.lastHeartbeatAt)
    const activityMs = parseIsoMs(presence.lastActivityAt)
    const hbLagMinutes = hbMs ? Math.round((nowMs - hbMs) / 60000) : 999
    const idleLagMinutes = activityMs ? Math.round((nowMs - activityMs) / 60000) : 999
    const missingHeartbeat = hbLagMinutes >= ENFORCE_HEARTBEAT_MINUTES
    const missingActivity = idleLagMinutes >= ENFORCE_IDLE_MINUTES
    const dueMs = parseIsoMs(presence.nextCheckInDueAt)
    const missedCheckIn = dueMs ? nowMs - dueMs > CHECKIN_GRACE_MINUTES * 60_000 : false

    if (missingHeartbeat || missingActivity) {
      batch.set(
        db.collection('attendancePresence').doc(userId),
        {
          status: 'suspected_inactive',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      writes += 1

      batch.create(db.collection('attendanceAnomalies').doc(), {
        userId,
        statusBefore,
        type: missingHeartbeat ? 'missing_heartbeat' : 'missing_activity',
        hbLagMinutes,
        idleLagMinutes,
        note: missingHeartbeat
          ? 'לא התקבל heartbeat; הטאב נסגר/מחשב במצב שינה או נטישה'
          : 'אין פעילות משתמש מעל הסף',
        enforcedAt: FieldValue.serverTimestamp(),
      })
      writes += 1
    }

    if (missedCheckIn) {
      const lastVerifiedMs = parseIsoMs(presence.lastVerifiedAt) ?? parseIsoMs(presence.lastCheckInAt) ?? nowMs
      const atRiskMinutes = Math.max(0, Math.round((nowMs - lastVerifiedMs) / 60000))
      batch.set(
        db.collection('attendancePresence').doc(userId),
        {
          unverifiedMinutes: FieldValue.increment(atRiskMinutes),
          missedCheckIns: FieldValue.increment(1),
          nextCheckInDueAt: nextRandomCheckInIso(nowMs),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      writes += 1
      batch.create(db.collection('activityLogs').doc(), {
        userId,
        kind: 'missed_checkin',
        detail: `הוחמץ צ'ק-אין. סומן זמן לא מאומת: ${atRiskMinutes} דקות`,
        createdAt: FieldValue.serverTimestamp(),
      })
      writes += 1
    }

    if ((missingHeartbeat || missingActivity) && activeLogId) {
      batch.set(
        db.collection('attendanceLogs').doc(activeLogId),
        {
          endAt: FieldValue.serverTimestamp(),
          endReason: 'idle_auto',
        },
        { merge: true },
      )
      writes += 1
      batch.set(
        db.collection('attendancePresence').doc(userId),
        {
          activeLogId: null,
          activeProjectId: null,
          activeClientId: null,
          activeTaskId: null,
          shiftEndedAt: new Date().toISOString(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      writes += 1
    }
  }

  if (writes > 0) {
    await batch.commit()
  }
})

/** מקומי: functions/.env; פרודקשן: סודות מוזרקים ל־process.env לפי השם */
function readResendApiKey(): string {
  return String(process.env.RESEND_API_KEY ?? '').trim()
}

function readMailFrom(): string {
  return String(process.env.MAIL_FROM ?? '').trim()
}

/**
 * שליחת מייל למוקצה אחרי יצירת משימה או שינוי מוקצה.
 * כל משתמש מחובר יכול ליזום (מי שמעדכן את המשימה בפועל ב-Firestore).
 * עדיפות: סודות `RESEND_API_KEY` + `MAIL_FROM` (REST Resend).
 * אחרת: SMTP דרך `loadSmtpConfig`. ללא הגדרה — מחזיר skipped בלי שגיאה.
 */
export const sendAssigneeTaskNotification = onCall(
  {
    region: 'us-central1',
    /** חובה ל־Callable ב־Gen2: אימות Firebase נעשה בתוך הפרוטוקול; בלי public ה־Cloud Run דוחה עם Authorization ריק */
    invoker: 'public',
    secrets: [resendApiKeySecret, mailFromSecret],
  },
  async (request) => {
  try {
    const callerUid = requireAuthUid(request.auth?.uid)
    const data = request.data as { taskId?: string }
    const taskId = String(data.taskId ?? '').trim()
    if (!taskId) {
      throw new HttpsError('invalid-argument', 'חסר מזהה משימה')
    }

    const taskSnap = await db.doc(`tasks/${taskId}`).get()
    if (!taskSnap.exists) {
      throw new HttpsError('not-found', 'המשימה לא נמצאה')
    }

    const t = taskSnap.data() as Record<string, unknown>
    const assigneeId = String(t.assigneeId ?? '').trim()

    if (!assigneeId || assigneeId === callerUid) {
      return { ok: true as const, skipped: true as const, reason: 'self_or_empty' as const }
    }

    const resolvedAssignee = await resolveAssigneeEmailAndGreeting(assigneeId)
    if (!resolvedAssignee) {
      return { ok: true as const, skipped: true as const, reason: 'no_email' as const }
    }
    const assigneeEmail = resolvedAssignee.email
    const assigneeGreeting = resolvedAssignee.greeting

    let creatorName = 'משתמש'
    try {
      const creatorRecord = await adminAuth.getUser(callerUid)
      const dn = creatorRecord.displayName?.trim()
      if (dn) {
        creatorName = dn
      } else {
        const creatorDoc = await db.doc(`users/${callerUid}`).get()
        const n = creatorDoc.get('name')
        if (typeof n === 'string' && n.trim()) creatorName = n.trim()
        else if (creatorRecord.email)
          creatorName = creatorRecord.email.split('@')[0] ?? creatorName
      }
    } catch {
      const creatorDoc = await db.doc(`users/${callerUid}`).get()
      const n = creatorDoc.get('name')
      if (typeof n === 'string' && n.trim()) creatorName = n.trim()
    }

    const taskTitle = String(t.title ?? '').trim() || 'משימה'
    const taskDescription = String(t.description ?? '')
    const dueDate = String(t.dueDate ?? '').trim() || '—'
    const appBase = defaultPublicAppUrl().replace(/\/$/, '')
    const tasksUrl = `${appBase}/tasks`

    const html = buildTaskAssignedHtml({
      assigneeGreeting,
      creatorName,
      taskTitle,
      taskDescription,
      dueDateLabel: dueDate,
      tasksUrl,
      appBaseUrl: appBase,
    })

    const subject =
      taskTitle.length > 55
        ? `נפתחה לך משימה חדשה — ${taskTitle.slice(0, 52)}…`
        : `נפתחה לך משימה חדשה — ${taskTitle}`

    const resendKey = readResendApiKey()
    const mailFromEnv = readMailFrom()

    if (resendKey) {
      if (!mailFromEnv) {
        console.warn(
          'sendAssigneeTaskNotification: RESEND_API_KEY set but MAIL_FROM missing',
        )
        return {
          ok: true as const,
          skipped: true as const,
          reason: 'no_smtp' as const,
        }
      }
      const sent = await sendEmailViaResendHttp({
        apiKey: resendKey,
        from: mailFromEnv,
        to: assigneeEmail,
        subject,
        html,
      })
      if (!sent.ok) {
        console.error('sendAssigneeTaskNotification Resend HTTP', sent.message)
        return {
          ok: true as const,
          skipped: true as const,
          reason: 'smtp_send_failed' as const,
        }
      }
      return { ok: true as const, sent: true as const }
    }

    const smtp = loadSmtpConfig()
    if (!smtp) {
      console.warn(
        'sendAssigneeTaskNotification: no RESEND_API_KEY and missing SMTP env (SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM)',
      )
      return { ok: true as const, skipped: true as const, reason: 'no_smtp' as const }
    }

    const transport = createMailTransport(smtp)

    try {
      await transport.sendMail({
        from: smtp.from,
        to: assigneeEmail,
        subject,
        html,
      })
    } catch (sendErr) {
      console.error('sendAssigneeTaskNotification sendMail', sendErr)
      return {
        ok: true as const,
        skipped: true as const,
        reason: 'smtp_send_failed' as const,
      }
    }

    return { ok: true as const, sent: true as const }
  } catch (e) {
    if (e instanceof HttpsError) throw e
    console.error('sendAssigneeTaskNotification unexpected', e)
    return {
      ok: true as const,
      skipped: true as const,
      reason: 'function_error' as const,
    }
  }
  },
)
