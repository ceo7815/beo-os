/** פרופיל סוכן — מטא־נתונים מקומיים ב-OS (לא runtime של Beo-agents). */

export type AgentProfileMeta = {
  id: string
  personName: string
  title: string
  /** משפט קצר — מה הסוכן עושה */
  tagline: string
  email: string
  emailNote?: string
  department: string
  capabilities: string[]
  tools: string[]
  /** תמונה קבועה מ-public (jpg / png / webp) */
  defaultAvatarSrc?: string
}

const AVATAR_KEY = (id: string) => `beo-os:agent-avatar:${id}`

export const AGENT_PROFILES: Record<string, AgentProfileMeta> = {
  'leads-beo': {
    id: 'leads-beo',
    personName: 'שי',
    title: 'סוכן גיוס לידים',
    tagline:
      'מוצא עסקים בישראל עם מייל מהאתר, מכין טיוטות לאישור כאן, ושולח מ-sales@ אחרי אישור.',
    email: 'sales@beosystem.com',
    emailNote: 'שליחה רק אחרי אישור ב-Beo OS',
    department: 'Beo Agents · Sales',
    capabilities: [
      'איתור עסקים בישראל עם מייל גלוי באתר',
      'ניקוד Lead Score והתאמת שירות Beo',
      'טיוטות עברית לאישור אנושי ב-OS',
      'שליחה מ-sales@beosystem.com אחרי אישור',
      'טיוטת וואטסאפ לטלפון שלהם — אור שולח ידנית',
      'פולואפ אחד אחרי ~48 שעות בלי תשובה (אישור ב-OS)',
      'למידה מאישורים, דחיות ותשובות',
    ],
    tools: ['OpenAI', 'Gmail', 'Telegram (עדכונים)', 'סריקת אתרים'],
    defaultAvatarSrc: '/ai-agents/leads-beo.jpg',
  },
  'social-beo': {
    id: 'social-beo',
    personName: 'עדי',
    title: 'מנהלת סושיאל ורשתות חברתיות',
    tagline:
      'מנהלת הסושיאל של Beo — אינסטגרם ופייסבוק. מדברים איתה בטלגרם.',
    email: 'social@beosystem.com',
    emailNote: 'פרסום דרך הצי · טלגרם לשיחה',
    department: 'Beo Agents · Social',
    capabilities: [
      'ניהול סושיאל ורשתות של Beo',
      'כתיבה ועיצוב לאינסטגרם ולפייסבוק',
      'שיחה בטלגרם מול אור',
      'תצוגה מקדימה לפני פרסום חי',
    ],
    tools: ['OpenAI', 'Telegram', 'Instagram (תצוגה)', 'Facebook (תצוגה)'],
    defaultAvatarSrc: '/ai-agents/social-beo.jpg',
  },
}

export function getAgentProfile(id: string): AgentProfileMeta | undefined {
  return AGENT_PROFILES[id]
}

export function loadAgentAvatar(id: string): string | null {
  try {
    return localStorage.getItem(AVATAR_KEY(id))
  } catch {
    return null
  }
}

export function saveAgentAvatar(id: string, dataUrl: string) {
  try {
    localStorage.setItem(AVATAR_KEY(id), dataUrl)
  } catch (e) {
    const name = e instanceof DOMException ? e.name : ''
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      throw new Error('אין מקום לשמור את התמונה בדפדפן — נסו קובץ קטן יותר (עד כ־800KB)')
    }
    throw new Error('שמירת התמונה נכשלה בדפדפן')
  }
}

export function clearAgentAvatar(id: string) {
  localStorage.removeItem(AVATAR_KEY(id))
}
