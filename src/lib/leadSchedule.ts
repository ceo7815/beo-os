import { addDaysYmd } from './dates'
import type { Lead } from '../types'

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** דחיפות לפי תאריך יעד (אותה לוגיקה כמו בעמוד לידים) */
export function leadScheduleUrgency(
  scheduleYmd: string,
  today: string,
): { label: string; color: string } | null {
  const next = scheduleYmd.slice(0, 10)
  if (!YMD.test(next)) return null
  if (next < today) return { label: 'דחוף מאוד', color: '#DC2626' }
  if (next === today) return { label: 'דחוף היום', color: '#EA580C' }
  if (next <= addDaysYmd(today, 2)) return { label: 'לטיפול בקרוב', color: '#D97706' }
  return { label: 'מתוכנן', color: '#64748B' }
}

export function leadScheduleFuQr(lead: Pick<Lead, 'nextFollowUpDate' | 'quoteReturnByDate'>) {
  const fu = lead.nextFollowUpDate?.slice(0, 10)
  const qr = lead.quoteReturnByDate?.slice(0, 10)
  const fuV = fu && YMD.test(fu) ? fu : undefined
  const qrV = qr && YMD.test(qr) ? qr : undefined
  return { fuV, qrV, scheduleYmd: fuV ?? qrV }
}

/** תאריך יעד לתצוגת דחיפות — פולואפ נשאר עדיפות על תאריך חזרה להצעה */
export function leadScheduleYmd(
  lead: Pick<Lead, 'nextFollowUpDate' | 'quoteReturnByDate'>,
): string | undefined {
  return leadScheduleFuQr(lead).scheduleYmd
}

export function leadScheduleCaption(
  lead: Pick<Lead, 'nextFollowUpDate' | 'quoteReturnByDate'>,
): string {
  return leadScheduleFuQr(lead).fuV ? 'חזרה' : 'תאריך חזרה ללקוח'
}

/** איזה שדה ב־Firestore לעדכן לפי הליד הנוכחי */
export function leadScheduleEditField(
  lead: Pick<Lead, 'nextFollowUpDate' | 'quoteReturnByDate' | 'status'>,
): 'nextFollowUpDate' | 'quoteReturnByDate' {
  const { fuV, qrV } = leadScheduleFuQr(lead)
  if (fuV) return 'nextFollowUpDate'
  if (qrV) return 'quoteReturnByDate'
  return lead.status === 'quote_sent' ? 'quoteReturnByDate' : 'nextFollowUpDate'
}
