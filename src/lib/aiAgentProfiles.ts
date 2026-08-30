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
  'johnny-beo': {
    id: 'johnny-beo',
    personName: 'ג׳וני',
    title: 'מנכ״ל דיגיטלי / עוזר אישי',
    tagline:
      'הסוכן הראשי. טלגרם כולל קול. Beo OS מלא. Google Calendar. ceo@. חשבונית ירוקה. בוס על שי ועדי אחרי אישור שלך.',
    email: 'ceo@beosystem.co.il',
    emailNote: 'שליחה רק אחרי כן בטלגרם',
    department: 'Beo Agents · Chief',
    capabilities: [
      'שיחה שוטפת בטלגרם, כולל הודעות קול דו־כיווניות',
      'משימות, לידים, לקוחות, פרויקטים — לפי שדות Beo OS',
      'יומן: Google Calendar מקור, שיקוף ל-OS, פגישות Meet',
      'מייל מ-ceo@ אחרי אישור',
      'הנפקת חשבונית ירוקה אחרי «תנפיק»',
      'אישור שי/עדי מהצ׳אט אחרי כן מפורש',
    ],
    tools: ['OpenAI', 'Telegram', 'Beo OS', 'Gmail ceo@', 'Google Calendar', 'חשבונית ירוקה'],
    defaultAvatarSrc: '/ai-agents/johnny-beo.jpg',
  },
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
      'יומן ואישור ב-Beo OS. מעלה לאינסטגרם ולפייסבוק אחרי אישור. טלגרם לשיחה ועדכונים.',
    email: 'social@beosystem.com',
    emailNote: 'פרסום רק אחרי אישור ב-Beo OS',
    department: 'Beo Agents · Social',
    capabilities: [
      'יומן תוכן חודשי ב-Beo OS',
      'אישור ותזמון לפני עלייה לרשתות',
      'פרסום לאינסטגרם ולפייסבוק (Meta)',
      'כותרת מותאמת לכל רשת, אותו ויזואל',
      'טלגרם: שיחה חופשית ועדכונים — בלי אישור משם',
      'תיבת תגובות לתצוגה בלבד',
    ],
    tools: ['OpenAI', 'Telegram', 'Instagram', 'Facebook'],
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
