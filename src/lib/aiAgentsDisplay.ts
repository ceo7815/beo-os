import type { FleetAgent } from './aiAgentsFleet'
import { honestConnections } from './aiAgentsFleet'

/** אין API עלויות — מציגים אפס כנה, בלי סכומים מומצאים. */
export const AI_AGENT_COST_USD = 0
export const AI_AGENT_COST_LABEL = '$0.00'
export const AI_AGENT_COST_HINT =
  'אין דיווח עלויות עדיין — יופיע כשהצי ידווח'
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

/** כלים להצגה בקובייה / פס חיבורים — כנים לפי צי + כללי preview. */
export function displayToolsForAgent(
  boardId: string,
  agent: FleetAgent | null,
): DisplayTool[] {
  if (boardId === 'social-beo') {
    const tg = findConn(agent, 'telegram')
    const oa = findConn(agent, 'openai')
    const ig = findConn(agent, 'instagram')
    const fb = findConn(agent, 'facebook')
    const preview = (agent?.publish ?? 'preview').toLowerCase() === 'preview'
    return [
      {
        kind: 'telegram',
        label: 'Telegram',
        connected: Boolean(tg?.connected),
        hint: 'עדכונים בלבד',
      },
      {
        kind: 'openai',
        label: 'OpenAI',
        connected: Boolean(oa?.connected),
      },
      {
        kind: 'instagram',
        label: 'Instagram',
        connected: preview ? false : Boolean(ig?.connected),
        hint: preview ? 'תצוגה מקדימה' : undefined,
      },
      {
        kind: 'facebook',
        label: 'Facebook',
        connected: preview ? false : Boolean(fb?.connected),
        hint: preview ? 'תצוגה מקדימה' : undefined,
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
      hint: gm?.connected ? undefined : 'sales@beosystem.com',
    },
    {
      kind: 'telegram',
      label: 'Telegram',
      connected: Boolean(tg?.connected),
      hint: tg?.connected ? 'עדכונים בלבד' : 'עד שיעלה בוט',
    },
  ]
}
