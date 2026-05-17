import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

export type SmtpConfig = {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

/** משתני סביבה — Resend: SMTP_HOST=smtp.resend.com, SMTP_USER=resend, SMTP_PASS=api_key */
export function loadSmtpConfig(): SmtpConfig | null {
  const host = String(process.env.SMTP_HOST ?? '').trim()
  const user = String(process.env.SMTP_USER ?? '').trim()
  const pass = String(process.env.SMTP_PASS ?? '').trim()
  const from = String(process.env.MAIL_FROM ?? '').trim() || user
  if (!host || !user || !pass || !from) return null
  const port = Number(process.env.SMTP_PORT ?? '587')
  const secure =
    String(process.env.SMTP_SECURE ?? '').toLowerCase() === 'true' ||
    port === 465
  return { host, port, secure, user, pass, from }
}

export function createMailTransport(cfg: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    /** מונע תלייה ארוכה על חיבור SMTP חסום ב־Cloud (שגורמת ל־functions/internal בלי החזרת תגובה). */
    connectionTimeout: 12_000,
    greetingTimeout: 10_000,
    socketTimeout: 18_000,
  })
}

/**
 * שליחה דרך Resend HTTP — מומלץ ב־Cloud Functions (לעיתים יציאת SMTP נחסמת).
 * https://resend.com/docs/api-reference/emails/send-email
 */
export async function sendEmailViaResendHttp(args: {
  apiKey: string
  from: string
  to: string
  subject: string
  html: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: args.from,
        to: [args.to],
        subject: args.subject,
        html: args.html,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    const body = (await res.json().catch(() => ({}))) as {
      message?: string
      name?: string
    }
    if (!res.ok) {
      const msg =
        body.message ||
        body.name ||
        `${res.status} ${res.statusText}`.trim() ||
        'Resend API error'
      return { ok: false, message: msg }
    }
    return { ok: true }
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : typeof e === 'string' ? e : 'Resend fetch failed'
    return { ok: false, message: msg }
  }
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function nlToBr(s: string): string {
  return escapeHtml(s).replace(/\r\n|\n|\r/g, '<br/>')
}

export function buildTaskAssignedHtml(args: {
  assigneeGreeting: string
  creatorName: string
  taskTitle: string
  taskDescription: string
  dueDateLabel: string
  tasksUrl: string
  /** בסיס האפליקציה (למשל https://….web.app) — ללוגו מ-/public/logo-hub-pos.png */
  appBaseUrl: string
  /** העברת מוקצה — ניסוח מייל שונה ממשימה חדשה */
  mode?: 'new' | 'transfer'
}): string {
  const mode = args.mode ?? 'new'
  const title = escapeHtml(args.taskTitle)
  const creator = escapeHtml(args.creatorName)
  const greeting = escapeHtml(args.assigneeGreeting)
  const due = escapeHtml(args.dueDateLabel)
  const desc = nlToBr(args.taskDescription.trim() || '—')
  const url = escapeHtml(args.tasksUrl)
  const base = args.appBaseUrl.replace(/\/$/, '')
  const logoUrl = escapeHtml(`${base}/logo-hub-pos.png`)

  /** פס לוגו — אפור פחם כמו סרגל האפליקציה; גוף לבן; כפתור כתום מותג */
  const BG_MAIN = '#f3f4f6'
  const CHARCOAL = '#454545'
  const WHITE = '#ffffff'
  const ORANGE = '#f97316'
  const ORANGE_LIGHT = '#fff3e8'
  const TEXT_DARK = '#0f172a'
  const TEXT_MID = '#334155'
  const TEXT_LIGHT = '#64748b'
  const BORDER = '#e2e8f0'
  const BORDER_ORANGE_SOFT = 'rgba(249, 115, 22, 0.55)'
  const BLUE_MID = '#2563eb'

  const pageTitle = mode === 'transfer' ? 'העברת משימה' : 'משימה חדשה'
  const h1 =
    mode === 'transfer'
      ? 'המשימה הועברה אליך לטיפול'
      : 'נפתחה לך משימה חדשה'
  const leadPara =
    mode === 'transfer'
      ? `<p style="margin:0 0 20px;font-size:14px;color:${TEXT_MID};line-height:1.7;">המשימה הועברה אליך <strong style="color:${TEXT_DARK};">מאת ${creator}</strong> לטיפולך במערכת — נא לעדכן סטטוס ולשמור על רצף העבודה.</p>`
      : `<p style="margin:0 0 20px;font-size:14px;color:${TEXT_MID};line-height:1.7;"><strong style="color:${TEXT_DARK};">${creator}</strong> יצר/ה עבורך משימה חדשה במערכת.</p>`

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(pageTitle)}</title>
</head>
<body style="margin:0;padding:0;background:${BG_MAIN};font-family:'Rubik','Segoe UI',Tahoma,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BG_MAIN};padding:28px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:${WHITE};border-radius:16px;overflow:hidden;box-shadow:0 12px 36px rgba(15,23,42,0.1);">
          <tr>
            <td style="background:${CHARCOAL};padding:24px 20px;text-align:center;direction:rtl;">
              <img src="${logoUrl}" alt="Hub POS" width="196" height="72" style="display:block;margin:0 auto;max-width:196px;height:auto;border:0;outline:none;text-decoration:none;" />
            </td>
          </tr>
          <tr>
            <td style="background:${WHITE};padding:26px 24px 10px;text-align:right;direction:rtl;">
              <h1 style="margin:0 0 8px;padding:0;font-size:22px;font-weight:800;color:${TEXT_DARK};line-height:1.35;letter-spacing:-0.02em;text-align:right;">${h1}</h1>
              <p style="margin:0 0 20px;font-size:12px;font-weight:600;color:${TEXT_LIGHT};text-align:right;">האב · ניהול סוכנות</p>
              <p style="margin:0 0 14px;font-size:15px;color:${TEXT_DARK};line-height:1.65;">שלום ${greeting},</p>
              ${leadPara}
              <div style="border-radius:14px;border:2px dashed ${BORDER_ORANGE_SOFT};background:${ORANGE_LIGHT};padding:18px 20px;margin-bottom:22px;text-align:right;">
                <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:${TEXT_LIGHT};letter-spacing:0.06em;">כותרת</p>
                <p style="margin:0 0 16px;font-size:18px;font-weight:800;color:${TEXT_DARK};line-height:1.35;">${title}</p>
                <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:${TEXT_LIGHT};letter-spacing:0.06em;">תיאור</p>
                <div style="margin:0 0 14px;font-size:14px;color:${TEXT_MID};line-height:1.7;">${desc}</div>
                <p style="margin:0;font-size:13px;color:${TEXT_MID};"><strong style="color:${TEXT_DARK};">תאריך יעד:</strong> ${due}</p>
              </div>
              <table role="presentation" cellspacing="0" cellpadding="0" align="center" dir="rtl" style="margin:0 auto 10px;">
                <tr>
                  <td style="border-radius:12px;background:${ORANGE};box-shadow:0 4px 14px rgba(249,115,22,0.35);">
                    <a href="${url}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">פתיחת דף המשימות</a>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-size:12px;color:${TEXT_LIGHT};line-height:1.6;text-align:right;">אם הכפתור לא עובד, העתק את הקישור לדפדפן:<br/><a href="${url}" style="color:${BLUE_MID};word-break:break-all;">${url}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 24px 22px;border-top:1px solid ${BORDER};background:#fafafa;text-align:center;direction:rtl;">
              <p style="margin:0;font-size:11px;color:${TEXT_LIGHT};line-height:1.5;">הודעה אוטומטית ממערכת האב · אין להשיב למייל זה</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function defaultPublicAppUrl(): string {
  const fromEnv = String(process.env.APP_PUBLIC_URL ?? '').trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  const pid = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'hub-pos-f399c'
  return `https://${pid}.web.app`
}

const pad2 = (n: number) => String(Math.max(0, Math.min(99, n))).padStart(2, '0')

function parseYmdParts(ymd: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim().slice(0, 10))
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!y || !mo || !d) return null
  return { y, m: mo, d }
}

function parseHmParts(hm: string): { h: number; min: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm ?? '').trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (Number.isNaN(h) || Number.isNaN(min)) return null
  return { h: Math.min(23, Math.max(0, h)), min: Math.min(59, Math.max(0, min)) }
}

/** קישור «הוסף לאירוע» ל-Google Calendar (Asia/Jerusalem). */
export function buildGoogleCalendarEventUrl(args: {
  title: string
  startDateYmd: string
  startTimeHm?: string
  endTimeHm?: string
  details: string
  location?: string
}): string {
  const base = 'https://www.google.com/calendar/render'
  const parsed = parseYmdParts(args.startDateYmd)
  if (!parsed) {
    const p = new URLSearchParams({
      action: 'TEMPLATE',
      text: args.title.slice(0, 500),
      ctz: 'Asia/Jerusalem',
    })
    return `${base}?${p.toString()}`
  }
  const { y, m: mo, d: da } = parsed
  const compact = `${y}${pad2(mo)}${pad2(da)}`
  const stRaw = String(args.startTimeHm ?? '').trim()
  const etRaw = String(args.endTimeHm ?? '').trim()

  let datesParam: string
  if (!stRaw) {
    const startUtc = Date.UTC(y, mo - 1, da)
    const endUtc = startUtc + 86400000
    const end = new Date(endUtc)
    datesParam = `${compact}/${end.getUTCFullYear()}${pad2(end.getUTCMonth() + 1)}${pad2(end.getUTCDate())}`
  } else {
    const sh = parseHmParts(stRaw) ?? { h: 9, min: 0 }
    let eh = etRaw ? parseHmParts(etRaw) : null
    if (!eh) {
      const startMin = sh.h * 60 + sh.min
      const endMin = Math.min(23 * 60 + 59, startMin + 60)
      eh = { h: Math.floor(endMin / 60), min: endMin % 60 }
    }
    const startTotal = sh.h * 60 + sh.min
    const endTotal = eh.h * 60 + eh.min
    if (endTotal <= startTotal) {
      const endMin = Math.min(23 * 60 + 59, startTotal + 60)
      eh = { h: Math.floor(endMin / 60), min: endMin % 60 }
    }
    datesParam = `${compact}T${pad2(sh.h)}${pad2(sh.min)}00/${compact}T${pad2(eh.h)}${pad2(eh.min)}00`
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: args.title.slice(0, 900),
    dates: datesParam,
    details: args.details.slice(0, 3800),
    ctz: 'Asia/Jerusalem',
  })
  const loc = String(args.location ?? '').trim()
  if (loc) params.set('location', loc.slice(0, 800))
  return `${base}?${params.toString()}`
}

export function buildMeetingInviteHtml(args: {
  recipientGreeting: string
  creatorName: string
  meetingTitle: string
  purpose: string
  agenda: string
  whenLabel: string
  /** שורות נוספות (ספק, ליד וכו') */
  extraContextLines: string[]
  clientName?: string
  projectName?: string
  hubCalendarUrl: string
  googleCalendarUrl: string
  appBaseUrl: string
}): string {
  const title = escapeHtml(args.meetingTitle)
  const creator = escapeHtml(args.creatorName)
  const greeting = escapeHtml(args.recipientGreeting)
  const when = escapeHtml(args.whenLabel)
  const purpose = nlToBr(args.purpose.trim() || '—')
  const agenda = nlToBr(args.agenda.trim() || '—')
  const hubUrl = escapeHtml(args.hubCalendarUrl)
  const gCalUrl = escapeHtml(args.googleCalendarUrl)
  const base = args.appBaseUrl.replace(/\/$/, '')
  const logoUrl = escapeHtml(`${base}/logo-hub-pos.png`)
  const BG_MAIN = '#f3f4f6'
  const CHARCOAL = '#454545'
  const WHITE = '#ffffff'
  const ORANGE = '#f97316'
  const ORANGE_LIGHT = '#fff3e8'
  const TEXT_DARK = '#0f172a'
  const TEXT_MID = '#334155'
  const TEXT_LIGHT = '#64748b'
  const BORDER = '#e2e8f0'
  const BORDER_ORANGE_SOFT = 'rgba(249, 115, 22, 0.55)'
  const BLUE_MID = '#2563eb'

  const clientN = (args.clientName ?? '').trim()
  const projectN = (args.projectName ?? '').trim()
  const clientHtml = clientN
    ? `<p style="margin:0 0 8px;font-size:11px;font-weight:700;color:${TEXT_LIGHT};letter-spacing:0.06em;">לקוח</p><p style="margin:0 0 14px;font-size:15px;font-weight:700;color:${TEXT_DARK};">${escapeHtml(clientN)}</p>`
    : ''
  const projectHtml = projectN
    ? `<p style="margin:0 0 8px;font-size:11px;font-weight:700;color:${TEXT_LIGHT};letter-spacing:0.06em;">פרויקט</p><p style="margin:0 0 14px;font-size:15px;font-weight:700;color:${TEXT_DARK};">${escapeHtml(projectN)}</p>`
    : ''
  const extra = args.extraContextLines
    .map((line) => escapeHtml(line))
    .join('<br/>')
  const extraBlock =
    extra.length > 0
      ? `<p style="margin:16px 0 0 0;padding-top:14px;border-top:1px dashed rgba(249,115,22,0.35);margin-top:14px;font-size:11px;font-weight:700;color:${TEXT_LIGHT};letter-spacing:0.06em;">פרטים נוספים</p><p style="margin:8px 0 0;font-size:13px;color:${TEXT_MID};line-height:1.65;">${extra}</p>`
      : ''
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>פגישה ביומן</title>
</head>
<body style="margin:0;padding:0;background:${BG_MAIN};font-family:'Rubik','Segoe UI',Tahoma,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BG_MAIN};padding:28px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:${WHITE};border-radius:16px;overflow:hidden;box-shadow:0 12px 36px rgba(15,23,42,0.1);">
          <tr>
            <td style="background:${CHARCOAL};padding:24px 20px;text-align:center;direction:rtl;">
              <img src="${logoUrl}" alt="Hub POS" width="196" height="72" style="display:block;margin:0 auto;max-width:196px;height:auto;border:0;outline:none;text-decoration:none;" />
            </td>
          </tr>
          <tr>
            <td style="background:${WHITE};padding:26px 24px 10px;text-align:right;direction:rtl;">
              <h1 style="margin:0 0 8px;padding:0;font-size:22px;font-weight:800;color:${TEXT_DARK};line-height:1.35;letter-spacing:-0.02em;text-align:right;">נקבעה לך פגישה ביומן</h1>
              <p style="margin:0 0 20px;font-size:12px;font-weight:600;color:${TEXT_LIGHT};text-align:right;">האב · ניהול סוכנות</p>
              <p style="margin:0 0 14px;font-size:15px;color:${TEXT_DARK};line-height:1.65;">שלום ${greeting},</p>
              <p style="margin:0 0 20px;font-size:14px;color:${TEXT_MID};line-height:1.7;"><strong style="color:${TEXT_DARK};">${creator}</strong> קבע/ה עבורך פגישה במערכת — להלן הפרטים.</p>
              <div style="border-radius:14px;border:2px dashed ${BORDER_ORANGE_SOFT};background:${ORANGE_LIGHT};padding:18px 20px;margin-bottom:22px;text-align:right;">
                <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:${TEXT_LIGHT};letter-spacing:0.06em;">נושא</p>
                <p style="margin:0 0 16px;font-size:18px;font-weight:800;color:${TEXT_DARK};line-height:1.35;">${title}</p>
                <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:${TEXT_LIGHT};letter-spacing:0.06em;">מועד</p>
                <p style="margin:0 0 16px;font-size:15px;font-weight:700;color:${TEXT_DARK};">${when}</p>
                ${clientHtml}
                ${projectHtml}
                <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:${TEXT_LIGHT};letter-spacing:0.06em;">מטרה</p>
                <div style="margin:0 0 14px;font-size:14px;color:${TEXT_MID};line-height:1.7;">${purpose}</div>
                <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:${TEXT_LIGHT};letter-spacing:0.06em;">תוכן / סדר יום</p>
                <div style="margin:0 0 0;font-size:14px;color:${TEXT_MID};line-height:1.7;">${agenda}</div>
                ${extraBlock}
              </div>
              <table role="presentation" cellspacing="0" cellpadding="0" align="center" dir="rtl" style="margin:0 auto 14px;">
                <tr>
                  <td style="padding:6px;">
                    <table role="presentation" cellspacing="0" cellpadding="0"><tr>
                      <td style="border-radius:12px;background:${ORANGE};box-shadow:0 4px 14px rgba(249,115,22,0.35);">
                        <a href="${hubUrl}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">פתיחת היומן במערכת</a>
                      </td>
                    </tr></table>
                  </td>
                  <td style="padding:6px;">
                    <table role="presentation" cellspacing="0" cellpadding="0"><tr>
                      <td style="border-radius:12px;border:2px solid ${ORANGE};background:${WHITE};">
                        <a href="${gCalUrl}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;color:${ORANGE};text-decoration:none;">הוספה ליומן Google</a>
                      </td>
                    </tr></table>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:12px;color:${TEXT_LIGHT};line-height:1.6;text-align:right;">קישורים ישירים:</p>
              <p style="margin:0 0 4px;font-size:11px;color:${TEXT_LIGHT};text-align:right;">מערכת:<br/><a href="${hubUrl}" style="color:${BLUE_MID};word-break:break-all;">${hubUrl}</a></p>
              <p style="margin:0;font-size:11px;color:${TEXT_LIGHT};text-align:right;">Google Calendar:<br/><a href="${gCalUrl}" style="color:${BLUE_MID};word-break:break-all;">${gCalUrl}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 24px 22px;border-top:1px solid ${BORDER};background:#fafafa;text-align:center;direction:rtl;">
              <p style="margin:0;font-size:11px;color:${TEXT_LIGHT};line-height:1.5;">הודעה אוטומטית ממערכת האב · אין להשיב למייל זה</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
