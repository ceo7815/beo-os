"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSmtpConfig = loadSmtpConfig;
exports.createMailTransport = createMailTransport;
exports.sendEmailViaResendHttp = sendEmailViaResendHttp;
exports.buildTaskAssignedHtml = buildTaskAssignedHtml;
exports.defaultPublicAppUrl = defaultPublicAppUrl;
const nodemailer_1 = __importDefault(require("nodemailer"));
/** משתני סביבה — Resend: SMTP_HOST=smtp.resend.com, SMTP_USER=resend, SMTP_PASS=api_key */
function loadSmtpConfig() {
    const host = String(process.env.SMTP_HOST ?? '').trim();
    const user = String(process.env.SMTP_USER ?? '').trim();
    const pass = String(process.env.SMTP_PASS ?? '').trim();
    const from = String(process.env.MAIL_FROM ?? '').trim() || user;
    if (!host || !user || !pass || !from)
        return null;
    const port = Number(process.env.SMTP_PORT ?? '587');
    const secure = String(process.env.SMTP_SECURE ?? '').toLowerCase() === 'true' ||
        port === 465;
    return { host, port, secure, user, pass, from };
}
function createMailTransport(cfg) {
    return nodemailer_1.default.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: { user: cfg.user, pass: cfg.pass },
        /** מונע תלייה ארוכה על חיבור SMTP חסום ב־Cloud (שגורמת ל־functions/internal בלי החזרת תגובה). */
        connectionTimeout: 12_000,
        greetingTimeout: 10_000,
        socketTimeout: 18_000,
    });
}
/**
 * שליחה דרך Resend HTTP — מומלץ ב־Cloud Functions (לעיתים יציאת SMTP נחסמת).
 * https://resend.com/docs/api-reference/emails/send-email
 */
async function sendEmailViaResendHttp(args) {
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
        });
        const body = (await res.json().catch(() => ({})));
        if (!res.ok) {
            const msg = body.message ||
                body.name ||
                `${res.status} ${res.statusText}`.trim() ||
                'Resend API error';
            return { ok: false, message: msg };
        }
        return { ok: true };
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Resend fetch failed';
        return { ok: false, message: msg };
    }
}
function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function nlToBr(s) {
    return escapeHtml(s).replace(/\r\n|\n|\r/g, '<br/>');
}
function buildTaskAssignedHtml(args) {
    const title = escapeHtml(args.taskTitle);
    const creator = escapeHtml(args.creatorName);
    const greeting = escapeHtml(args.assigneeGreeting);
    const due = escapeHtml(args.dueDateLabel);
    const desc = nlToBr(args.taskDescription.trim() || '—');
    const url = escapeHtml(args.tasksUrl);
    const base = args.appBaseUrl.replace(/\/$/, '');
    const logoUrl = escapeHtml(`${base}/logo-hub-pos.png`);
    /** פס לוגו — אפור פחם כמו סרגל האפליקציה; גוף לבן; כפתור כתום מותג */
    const BG_MAIN = '#f3f4f6';
    const CHARCOAL = '#454545';
    const WHITE = '#ffffff';
    const ORANGE = '#f97316';
    const ORANGE_LIGHT = '#fff3e8';
    const TEXT_DARK = '#0f172a';
    const TEXT_MID = '#334155';
    const TEXT_LIGHT = '#64748b';
    const BORDER = '#e2e8f0';
    const BORDER_ORANGE_SOFT = 'rgba(249, 115, 22, 0.55)';
    const BLUE_MID = '#2563eb';
    return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>משימה חדשה</title>
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
              <h1 style="margin:0 0 8px;padding:0;font-size:22px;font-weight:800;color:${TEXT_DARK};line-height:1.35;letter-spacing:-0.02em;text-align:right;">נפתחה לך משימה חדשה</h1>
              <p style="margin:0 0 20px;font-size:12px;font-weight:600;color:${TEXT_LIGHT};text-align:right;">האב · ניהול סוכנות</p>
              <p style="margin:0 0 14px;font-size:15px;color:${TEXT_DARK};line-height:1.65;">שלום ${greeting},</p>
              <p style="margin:0 0 20px;font-size:14px;color:${TEXT_MID};line-height:1.7;"><strong style="color:${TEXT_DARK};">${creator}</strong> יצר/ה עבורך משימה חדשה במערכת.</p>
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
</html>`;
}
function defaultPublicAppUrl() {
    const fromEnv = String(process.env.APP_PUBLIC_URL ?? '').trim().replace(/\/$/, '');
    if (fromEnv)
        return fromEnv;
    const pid = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'hub-pos-f399c';
    return `https://${pid}.web.app`;
}
