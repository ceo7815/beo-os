import type { Deal, DealKind, DealScheduledPayment } from '../types'
import { ymFromYmd } from './agentRevenue'

export function normalizeYmd(raw: string | undefined): string | undefined {
  const s = raw?.trim().slice(0, 10) ?? ''
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined
}

function dealAgreedAmount(d: Deal): number {
  const a = d.agreedAmount
  return typeof a === 'number' && Number.isFinite(a) && a >= 0 ? a : 0
}

/** תאריך תשלום ראשון (שדה ישן / סנכרון) */
export function dealFirstPaymentYmd(d: Deal): string | undefined {
  const first = normalizeYmd(d.firstPaymentYmd)
  if (first) return first
  if (d.dealKind === 'retainer_yearly') {
    const annual = normalizeYmd(d.annualBillingYmd)
    if (annual) return annual
  }
  if (Array.isArray(d.scheduledPayments) && d.scheduledPayments.length > 0) {
    const parsed: DealScheduledPayment[] = []
    for (let i = 0; i < d.scheduledPayments.length; i++) {
      const item = d.scheduledPayments[i]
      const ymd = normalizeYmd(item?.expectedPaymentYmd)
      const amount =
        typeof item?.amount === 'number' && Number.isFinite(item.amount) && item.amount >= 0
          ? item.amount
          : 0
      if (!ymd || amount <= 0) continue
      parsed.push({
        id: typeof item?.id === 'string' ? item.id : `sp-${i}`,
        expectedPaymentYmd: ymd,
        amount,
      })
    }
    return earliestPaymentYmdFromSchedule(parsed)
  }
  return undefined
}

/** תשלומים מתוכננים לעסקה — מקור אמת לחישוב הכנסה משוערת לפי חודש */
export function normalizedScheduledPayments(d: Deal): DealScheduledPayment[] {
  const raw = d.scheduledPayments
  if (Array.isArray(raw) && raw.length > 0) {
    const out: DealScheduledPayment[] = []
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i]
      const ymd = normalizeYmd(item?.expectedPaymentYmd)
      const amount =
        typeof item?.amount === 'number' && Number.isFinite(item.amount) && item.amount >= 0
          ? item.amount
          : 0
      if (!ymd || amount <= 0) continue
      const id =
        typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : `sp-${i}-${ymd}`
      const label =
        typeof item?.label === 'string' && item.label.trim() ? item.label.trim() : undefined
      out.push({ id, expectedPaymentYmd: ymd, amount, ...(label ? { label } : {}) })
    }
    return out.sort((a, b) => a.expectedPaymentYmd.localeCompare(b.expectedPaymentYmd))
  }
  return legacyScheduledPayments(d)
}

function legacyScheduledPayments(d: Deal): DealScheduledPayment[] {
  if (d.status !== 'active') return []
  const amt = dealAgreedAmount(d)
  if (amt <= 0) return []

  if (d.dealKind === 'one_time') {
    const ymd = normalizeYmd(d.expectedPaymentYmd)
    return ymd ? [{ id: 'legacy-0', amount: amt, expectedPaymentYmd: ymd }] : []
  }

  const first =
    normalizeYmd(d.firstPaymentYmd) ||
    (d.dealKind === 'retainer_yearly' ? normalizeYmd(d.annualBillingYmd) : undefined)
  if (!first) return []

  if (d.dealKind === 'retainer_monthly' || d.isHostingDeal || d.dealKind === 'retainer_yearly') {
    return [{ id: 'legacy-0', amount: amt, expectedPaymentYmd: first }]
  }
  return []
}

/** הכנסה משוערת לחודש — סכום כל התשלומים שצפי לתשלום שלהם בחודש זה */
export function activeDealRevenueInMonth(d: Deal, monthYm: string): number {
  if (d.status !== 'active') return 0
  let s = 0
  for (const p of normalizedScheduledPayments(d)) {
    if (ymFromYmd(p.expectedPaymentYmd) === monthYm) s += p.amount
  }
  return Math.round(s * 100) / 100
}

/** החודש המוקדם ביותר עם תשלום מתוכנן */
export function earliestScheduledPaymentYm(d: Deal): string | undefined {
  let min: string | undefined
  for (const p of normalizedScheduledPayments(d)) {
    const ym = ymFromYmd(p.expectedPaymentYmd)
    if (!min || ym < min) min = ym
  }
  return min
}

/** @deprecated — השתמשו ב-earliestScheduledPaymentYm */
export function monthlyDealStartYm(d: Deal): string | undefined {
  return earliestScheduledPaymentYm(d)
}

/** @deprecated */
export function yearlyDealStartYm(d: Deal): string | undefined {
  return earliestScheduledPaymentYm(d)
}

export function dealScheduleHint(kind: DealKind, isHosting?: boolean): string {
  if (isHosting) {
    return 'עסקת אחסון — הוסיפו תשלום(ים) עם תאריך צפי וסכום; ההכנסה תופיע בחודש של כל תאריך בנפרד.'
  }
  if (kind === 'retainer_monthly') {
    return 'ריטיינר — הוסיפו שורת תשלום לכל חודש (תאריך צפי + סכום). ההכנסה משוערת לחודש = סכום התשלומים באותו חודש.'
  }
  if (kind === 'retainer_yearly') {
    return 'ריטיינר שנתי — הוסיפו תשלום לכל מועד חיוב (תאריך + סכום שנתי).'
  }
  return 'חד־פעמי — תשלום אחד עם תאריך צפי וסכום.'
}

export function dealRequiresPaymentSchedule(_d: Pick<Deal, 'dealKind' | 'isHostingDeal'>): boolean {
  return true
}

/** @deprecated */
export function dealRequiresFirstPaymentDate(d: Pick<Deal, 'dealKind' | 'isHostingDeal'>): boolean {
  return dealRequiresPaymentSchedule(d)
}

/** יוצר תשלומים חודשיים רצופים (לאחר תאריך התחלה) */
export function buildMonthlyScheduledPayments(
  startYmd: string,
  count: number,
  amount: number,
): DealScheduledPayment[] {
  const start = normalizeYmd(startYmd)
  if (!start || count < 1 || amount <= 0) return []
  const [y0, m0] = start.split('-').map(Number)
  if (!y0 || !m0) return []
  const out: DealScheduledPayment[] = []
  let y = y0
  let m = m0
  for (let i = 0; i < count; i++) {
    const ymd = `${y}-${String(m).padStart(2, '0')}-${start.slice(8, 10)}`
    out.push({
      id: `gen-${i}-${ymd}`,
      expectedPaymentYmd: ymd,
      amount,
    })
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

export function validateScheduledPayments(
  payments: DealScheduledPayment[],
): { ok: true } | { ok: false; message: string } {
  if (payments.length === 0) {
    return { ok: false, message: 'יש להוסיף לפחות תשלום מתוכנן אחד (תאריך + סכום)' }
  }
  for (const p of payments) {
    if (!normalizeYmd(p.expectedPaymentYmd)) {
      return { ok: false, message: 'כל תשלום חייב תאריך צפי תקין' }
    }
    if (!(p.amount > 0)) {
      return { ok: false, message: 'כל תשלום חייב סכום חיובי' }
    }
  }
  return { ok: true }
}

/** סנכרון firstPaymentYmd מהתשלום המוקדם ביותר */
export function earliestPaymentYmdFromSchedule(payments: DealScheduledPayment[]): string | undefined {
  let min: string | undefined
  for (const p of payments) {
    const ymd = normalizeYmd(p.expectedPaymentYmd)
    if (!ymd) continue
    if (!min || ymd < min) min = ymd
  }
  return min
}
