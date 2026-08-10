import type { FinanceGiRecurringPayment, FinanceGiRetainer } from '../types'

const GI_RECURRING_INACTIVE = new Set([
  '30',
  '50',
  '60',
  '70',
  'finished',
  'canceled',
  'cancelled',
  'suspended',
  'expired',
])

const GI_RETAINER_INACTIVE = new Set([
  '3',
  '10',
  '20',
  'finished',
  'paused',
  'deleted',
])

export function isGiRecurringActive(row: FinanceGiRecurringPayment): boolean {
  const st = String(row.status ?? '').trim().toLowerCase()
  if (!st) return row.amount > 0
  return !GI_RECURRING_INACTIVE.has(st)
}

export function isGiRetainerActive(row: FinanceGiRetainer): boolean {
  const st = String(row.status ?? '').trim().toLowerCase()
  if (!st) return row.amount > 0
  return !GI_RETAINER_INACTIVE.has(st)
}

export function formatStandingOrderInterval(months: number): string {
  if (months === 1) return 'חודשי'
  if (months === 12) return 'שנתי'
  return `כל ${months} חודשים`
}

export function formatRetainerInterval(interval: string): string {
  const map: Record<string, string> = {
    '1m': 'חודשי',
    '2m': 'דו-חודשי',
    '3m': 'רבעוני',
    '6m': 'חצי שנתי',
    '1y': 'שנתי',
  }
  return map[interval.trim().toLowerCase()] ?? interval
}

export function giRecurringStatusLabel(status: string): string {
  const st = String(status ?? '').trim()
  const map: Record<string, string> = {
    '5': 'ממתין',
    '10': 'נוצר',
    '20': 'פעיל',
    started: 'פעיל',
    created: 'נוצר',
  }
  return map[st] ?? map[st.toLowerCase()] ?? (st || 'פעיל')
}

export function giRetainerStatusLabel(status: string): string {
  const st = String(status ?? '').trim()
  const map: Record<string, string> = {
    '1': 'נוצר',
    '2': 'פעיל',
    started: 'פעיל',
    created: 'נוצר',
  }
  return map[st] ?? map[st.toLowerCase()] ?? (st || 'פעיל')
}
