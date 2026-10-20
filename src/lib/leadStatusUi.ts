import type { LeadSourceKind, LeadStatus } from '../types'

/** סדר קוביות סינון בדף לידים — קר ראשון, ארכיון בסוף */
export const LEAD_STATUSES_ORDERED: LeadStatus[] = [
  'cold',
  'new',
  'contacted',
  'follow_up',
  'replied',
  'meeting_scheduled',
  'specification',
  'quote_sent',
  'negotiation',
  'no_answer',
  'nurture',
  'lost',
  'not_relevant',
  'closed',
]

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  cold: 'ליד קר',
  new: 'חדש',
  contacted: 'נוצר קשר',
  follow_up: 'יש לבצע פולואפ',
  replied: 'חזר אלינו',
  meeting_scheduled: 'פגישה נקבעה',
  specification: 'בתהליך אפיון',
  quote_sent: 'נשלחה הצעת מחיר',
  negotiation: 'משא ומתן',
  no_answer: 'אין מענה',
  nurture: 'להמשך מעקב',
  lost: 'לא נסגר',
  not_relevant: 'לא רלוונטי',
  closed: 'נסגרה',
}

/** תוויות קצרות לדשבורד ולצנרת */
export const LEAD_STATUS_LABELS_SHORT: Record<LeadStatus, string> = {
  cold: 'ליד קר',
  new: 'חדש',
  contacted: 'קשר',
  follow_up: 'פולואפ',
  replied: 'חזר',
  meeting_scheduled: 'פגישה',
  specification: 'אפיון',
  quote_sent: 'הצעת מחיר',
  negotiation: 'מו״מ',
  no_answer: 'אין מענה',
  nurture: 'מעקב',
  lost: 'לא נסגר',
  not_relevant: 'לא רלוונטי',
  closed: 'נסגר',
}

export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  cold: '#5B7C99',
  new: '#5828A0',
  contacted: '#0EA5E9',
  follow_up: '#F59E0B',
  replied: '#0891B2',
  meeting_scheduled: '#4F46E5',
  specification: '#7C3AED',
  quote_sent: '#D97706',
  negotiation: '#C2410C',
  no_answer: '#64748B',
  nurture: '#78716C',
  lost: '#B91C1C',
  not_relevant: '#DC2626',
  closed: '#16A34A',
}

/**
 * צינור מכירות חם בדף הלידים.
 * lost / nurture / cold / closed / not_relevant נשארים מחוץ ל«צינור פתוח».
 */
export const WARM_LEAD_PIPELINE: ReadonlySet<LeadStatus> = new Set([
  'new',
  'contacted',
  'follow_up',
  'replied',
  'meeting_scheduled',
  'specification',
  'quote_sent',
  'negotiation',
  'no_answer',
])

export function isWarmLeadStatus(status: LeadStatus): boolean {
  return WARM_LEAD_PIPELINE.has(status)
}

export const LOST_REASON_OPTIONS = [
  { id: 'price', label: 'מחיר' },
  { id: 'timing', label: 'תזמון' },
  { id: 'no_reply', label: 'אין מענה' },
  { id: 'chose_competitor', label: 'בחר מתחרה' },
  { id: 'not_fit', label: 'לא מתאים' },
  { id: 'other', label: 'אחר' },
] as const

export function lostReasonLabel(id: string | undefined): string {
  if (!id) return ''
  return LOST_REASON_OPTIONS.find((o) => o.id === id)?.label ?? id
}

export const LEAD_SOURCE_OPTIONS: { id: LeadSourceKind; label: string }[] = [
  { id: 'meta_ads', label: 'מודעות מטא' },
  { id: 'google_ads', label: 'גוגל אדס' },
  { id: 'organic_seo', label: 'אורגני / אתר' },
  { id: 'whatsapp', label: 'וואטסאפ' },
  { id: 'cold_email', label: 'מייל קר (שי)' },
  { id: 'facebook_groups', label: 'קבוצות פייסבוק' },
  { id: 'referral', label: 'הפניה' },
  { id: 'phone', label: 'טלפון' },
  { id: 'manual', label: 'ידני' },
  { id: 'other', label: 'אחר' },
]

export function leadSourceLabel(source: string | undefined): string {
  if (!source?.trim()) return ''
  return LEAD_SOURCE_OPTIONS.find((o) => o.id === source)?.label ?? source.trim()
}

export const BEO_AI_LEAD_SOURCE = 'Beo AI Lead Agent'

export const COLD_LEAD_NEEDS = 'פנייה קרה משי — ממתין לתשובה'
