/** לוחות ניהול מקומיים ב-Beo OS — לא תלויים ב-Beo-agents להיות למעלה. */
export type AiAgentBoardDef = {
  id: string
  displayName: string
  handle: string
  role: string
  purpose: string
  path: string
  /** מתוכנן ב-OS גם לפני runtime בצי */
  plannedByDefault?: boolean
}

export const AI_AGENT_BOARDS: readonly AiAgentBoardDef[] = [
  {
    id: 'social-beo',
    displayName: 'Beo Social',
    handle: 'social.beo',
    role: 'עדי · סושיאל ורשתות',
    purpose:
      'עדי, מנהלת סושיאל ורשתות חברתיות של Beo. אינסטגרם, פייסבוק, וטלגרם מול אור.',
    path: '/ai-agents/social-beo',
  },
  {
    id: 'leads-beo',
    displayName: 'Beo Leads',
    handle: 'leads.beo',
    role: 'שי · גיוס לידים',
    purpose:
      'מוצא עסקים בישראל עם מייל מהאתר, טיוטות לאישור כאן, שולח מ-sales@beosystem.com אחרי אישור. בלי follow-up.',
    path: '/ai-agents/leads-beo',
    plannedByDefault: true,
  },
] as const


export function getAiAgentBoard(id: string | undefined): AiAgentBoardDef | undefined {
  if (!id) return undefined
  return AI_AGENT_BOARDS.find((b) => b.id === id)
}

export function isKnownAiAgentId(id: string | undefined): boolean {
  return Boolean(getAiAgentBoard(id))
}
