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
    id: 'johnny-beo',
    displayName: 'Beo Chief',
    handle: 'johnny.beo',
    role: 'ג׳וני · מנכ״ל דיגיטלי',
    purpose:
      'ג׳וני חי בטלגרם בלבד — כמו עובד שמדברים איתו על הכל. הלוח הזה סטטוס וחיבורים, לא צ׳אט.',
    path: '/ai-agents/johnny-beo',
  },
  {
    id: 'leads-beo',
    displayName: 'Beo Leads',
    handle: 'leads.beo',
    role: 'שי · גיוס לידים',
    purpose:
      'מוצא עסקים בישראל עם מייל מהאתר, טיוטות לאישור כאן, שולח מ-sales@ אחרי אישור. וואטסאפ לטלפון שלהם (אתה שולח) ופולואפ אחד באותו שרשור.',
    path: '/ai-agents/leads-beo',
    plannedByDefault: true,
  },
  {
    id: 'social-beo',
    displayName: 'Beo Social',
    handle: 'social.beo',
    role: 'עדי · סושיאל ורשתות',
    purpose:
      'עדי. יומן ואישור ב-Beo OS, פרסום לאינסטגרם ופייסבוק, טלגרם לשיחה ועדכונים.',
    path: '/ai-agents/social-beo',
  },
] as const


export function getAiAgentBoard(id: string | undefined): AiAgentBoardDef | undefined {
  if (!id) return undefined
  return AI_AGENT_BOARDS.find((b) => b.id === id)
}

export function isKnownAiAgentId(id: string | undefined): boolean {
  return Boolean(getAiAgentBoard(id))
}
