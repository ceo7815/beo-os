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
  })
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
}): string {
  const title = escapeHtml(args.taskTitle)
  const creator = escapeHtml(args.creatorName)
  const greeting = escapeHtml(args.assigneeGreeting)
  const due = escapeHtml(args.dueDateLabel)
  const desc = nlToBr(args.taskDescription.trim() || '—')
  const url = escapeHtml(args.tasksUrl)

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>משימה חדשה</title>
</head>
<body style="margin:0;padding:24px;background:#f0f4ff;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 12px 36px rgba(15,23,42,0.12);">
    <tr>
      <td style="background:linear-gradient(135deg,#1a2b5e 0%,#2563eb 100%);padding:22px 24px;">
        <p style="margin:0;font-size:13px;font-weight:700;color:#fff;opacity:0.95;">האב — ניהול סוכנות</p>
        <h1 style="margin:10px 0 0;font-size:20px;font-weight:800;color:#fff;line-height:1.35;">נפתחה לך משימה חדשה</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:22px 24px 8px;">
        <p style="margin:0 0 14px;font-size:15px;color:#0f172a;line-height:1.6;">שלום ${greeting},</p>
        <p style="margin:0 0 18px;font-size:14px;color:#475569;line-height:1.65;"><strong style="color:#0f172a;">${creator}</strong> יצר/ה עבורך משימה חדשה במערכת.</p>
        <div style="border-radius:12px;border:1px solid #e2e8f0;background:#f8fafc;padding:16px 18px;margin-bottom:18px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">כותרת</p>
          <p style="margin:0 0 14px;font-size:17px;font-weight:700;color:#0f172a;line-height:1.4;">${title}</p>
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">תיאור</p>
          <div style="margin:0;font-size:14px;color:#334155;line-height:1.65;">${desc}</div>
          <p style="margin:16px 0 0;font-size:13px;color:#475569;"><strong style="color:#0f172a;">תאריך יעד:</strong> ${due}</p>
        </div>
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 8px;">
          <tr>
            <td style="border-radius:10px;background:#2563eb;">
              <a href="${url}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">פתיחת דף המשימות</a>
            </td>
          </tr>
        </table>
        <p style="margin:14px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">אם הכפתור לא עובד, העתק את הקישור לדפדפן:<br/><span style="word-break:break-all;color:#64748b;">${url}</span></p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px 22px;border-top:1px solid #e2e8f0;background:#fafafa;">
        <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">הודעה אוטומטית ממערכת האב · אין להשיב למייל זה</p>
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
