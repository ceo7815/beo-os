import type { LeadStatus } from '../types'

/** סדר קוביות סינון בדף לידים — קר ראשון */
export const LEAD_STATUSES_ORDERED: LeadStatus[] = [
  'cold',
  'new',
  'specification',
  'quote_sent',
  'follow_up',
  'no_answer',
  'not_relevant',
  'closed',
]

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  cold: 'ליד קר',
  new: 'חדש',
  specification: 'בתהליך אפיון',
  quote_sent: 'נשלחה הצעת מחיר',
  follow_up: 'יש לבצע פולואפ',
  no_answer: 'אין מענה',
  not_relevant: 'לא רלוונטי',
  closed: 'נסגרה',
}

/** תוויות קצרות לדשבורד */
export const LEAD_STATUS_LABELS_SHORT: Record<LeadStatus, string> = {
  cold: 'ליד קר',
  new: 'חדש',
  specification: 'אפיון',
  quote_sent: 'הצעת מחיר',
  follow_up: 'פולואפ',
  no_answer: 'אין מענה',
  not_relevant: 'לא רלוונטי',
  closed: 'נסגר',
}

/** סגול-קר / אפור-כחלחל — לא סגול «חדש», לא ירוק, לא אדום */
export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  cold: '#5B7C99',
  new: '#5828A0',
  specification: '#7C3AED',
  quote_sent: '#D97706',
  follow_up: '#F59E0B',
  no_answer: '#64748B',
  not_relevant: '#DC2626',
  closed: '#16A34A',
}

/** צינור מכירות חם — בלי cold / closed / not_relevant */
export const WARM_LEAD_PIPELINE: ReadonlySet<LeadStatus> = new Set([
  'new',
  'specification',
  'quote_sent',
  'follow_up',
  'no_answer',
])

export function isWarmLeadStatus(status: LeadStatus): boolean {
  return WARM_LEAD_PIPELINE.has(status)
}

export const BEO_AI_LEAD_SOURCE = 'Beo AI Lead Agent'

export const COLD_LEAD_NEEDS =
  'פנייה קרה משי — ממתין לתשובה'
