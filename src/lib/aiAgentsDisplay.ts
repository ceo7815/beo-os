import type { FleetAgent } from './aiAgentsFleet'
import { honestConnections } from './aiAgentsFleet'

/** אין API עלויות — מציגים אפס כנה, בלי סכומים מומצאים. */
export const AI_AGENT_COST_USD = 0
export const AI_AGENT_COST_LABEL = '$0.00'
export const AI_AGENT_COST_HINT =
  'טוקני OpenAI בלבד: מחקר, ניסוח טיוטות, טלגרם ולמידה. שליחת Gmail בלי עלות טוקנים.'
export const AI_AGENT_MODEL_PROVIDER = 'OpenAI'

export type DisplayTool = {
  kind: string
  label: string
  connected: boolean
  /** תווית קצרה ליד הסטטוס — לא «מחובר לפרסום» */
  hint?: string
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`
}

function findConn(agent: FleetAgent | null, kind: string) {
  if (!agent) return undefined
  return honestConnections(agent).find((c) => c.kind.toLowerCase() === kind)
}

/** כלים להצגה בקובייה / פס חיבורים — כנים לפי צי + כללי preview/dry_run. */
export function displayToolsForAgent(
  boardId: string,
  agent: FleetAgent | null,
  opts?: { dryRun?: boolean },
): DisplayTool[] {
  if (boardId === 'johnny-beo') {
    const tg = findConn(agent, 'telegram')
    const oa = findConn(agent, 'openai')
    const os = findConn(agent, 'beo_os')
    const gm = findConn(agent, 'gmail')
    const cal = findConn(agent, 'calendar')
    const web = findConn(agent, 'web')
    const rivhit = findConn(agent, 'rivhit')
    return [
      {
        kind: 'telegram',
        label: 'Telegram',
        connected: Boolean(tg?.connected),
        hint: tg?.connected ? 'המשרד · שיחה + קול' : 'בוט נפרד משי · xCloud: JOHNNY_TELEGRAM_BOT_TOKEN',
      },
      { kind: 'openai', label: 'OpenAI', connected: Boolean(oa?.connected) },
      {
        kind: 'beo_os',
        label: 'Beo OS',
        connected: Boolean(os?.connected),
        hint: os?.connected
          ? 'קריאה/כתיבה ל-OS אחרי כן בטלגרם'
          : 'בצי: BOT_API_KEY + BEO_OS_URL + JOHNNY_ACTOR_USER_ID',
      },
      {
        kind: 'gmail',
        label: 'ceo@',
        connected: Boolean(gm?.connected),
        hint: gm?.connected
          ? 'שליחה רק אחרי אישור'
          : 'בצי: CEO_GMAIL_REFRESH_TOKEN (לא מ-OS)',
      },
      {
        kind: 'calendar',
        label: 'Google Calendar + Meet',
        connected: Boolean(cal?.connected),
        hint: cal?.connected ? 'מקור היומן · Meet עם הפגישה' : 'אותו טוקן כמו ceo@ בצי',
      },
      {
        kind: 'web',
        label: 'חיפוש אינטרנט',
        connected: Boolean(web?.connected ?? true),
        hint: 'כמו ChatGPT — בלי מפתח נוסף',
      },
      {
        kind: 'rivhit',
        label: 'ריווחית אונליין',
        connected: Boolean(rivhit?.connected),
        hint: rivhit?.connected ? undefined : 'עתידי — בלי נתונים עד חיבור',
      },
    ]
  }

  if (boardId === 'social-beo') {
    const tg = findConn(agent, 'telegram')
    const oa = findConn(agent, 'openai')
    const ig = findConn(agent, 'instagram')
    const fb = findConn(agent, 'facebook')
    const preview = (agent?.publish ?? 'preview').toLowerCase() === 'preview'
    const dryRun = Boolean(opts?.dryRun) || preview
    return [
      {
        kind: 'telegram',
        label: 'Telegram',
        connected: Boolean(tg?.connected),
        hint: 'שיחה ועדכונים',
      },
      {
        kind: 'openai',
        label: 'OpenAI',
        connected: Boolean(oa?.connected),
      },
      {
        kind: 'instagram',
        label: 'Instagram',
        connected: dryRun ? false : Boolean(ig?.connected),
        hint: dryRun
          ? 'מצב תרגול · SOCIAL_DRY_RUN'
          : ig?.connected
            ? undefined
            : 'xCloud: META_PAGE_ID + TOKEN + META_IG_USER_ID',
      },
      {
        kind: 'facebook',
        label: 'Facebook',
        connected: dryRun ? false : Boolean(fb?.connected),
        hint: dryRun
          ? 'מצב תרגול · SOCIAL_DRY_RUN'
          : fb?.connected
            ? undefined
            : 'טוקני Meta של Beo · SOCIAL_DRY_RUN=0',
      },
    ]
  }

  // leads-beo / שי
  const oa = findConn(agent, 'openai')
  const gm = findConn(agent, 'gmail')
  const tg = findConn(agent, 'telegram')
  return [
    {
      kind: 'openai',
      label: 'OpenAI',
      connected: Boolean(oa?.connected),
    },
    {
      kind: 'gmail',
      label: 'Gmail',
      connected: Boolean(gm?.connected),
      hint: gm?.connected
        ? 'שליחה רק אחרי אישור ב-OS'
        : 'xCloud: GMAIL_REFRESH_TOKEN',
    },
    {
      kind: 'telegram',
      label: 'Telegram',
      connected: Boolean(tg?.connected),
      hint: tg?.connected ? 'עדכונים בלבד' : 'עד שיעלה בוט',
    },
  ]
}
