import type { FinanceExpectedCollection, FinanceIncome } from '../types'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export type ExpectedCollectionRow = {
  id: string
  date: string
  amount: string
}

export function parseExpectedCollectionSchedule(
  raw: unknown,
): FinanceExpectedCollection[] {
  if (!Array.isArray(raw)) return []
  const out: FinanceExpectedCollection[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const x = item as Record<string, unknown>
    const date =
      typeof x.expectedDate === 'string'
        ? x.expectedDate.trim().slice(0, 10)
        : typeof x.date === 'string'
          ? x.date.trim().slice(0, 10)
          : ''
    const amount =
      typeof x.amount === 'number' ? x.amount : Number(x.amount)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (!Number.isFinite(amount) || amount <= 0) continue
    const id =
      typeof x.id === 'string' && x.id.trim() ? x.id.trim() : crypto.randomUUID()
    out.push({ id, expectedDate: date, amount: round2(amount) })
  }
  return out.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))
}

/** שורות לעריכה — ממיר מ־schedule / תאריך בודד / שורה ריקה */
export function expectedCollectionRowsFromIncome(
  inc: FinanceIncome,
  outstanding: number,
): ExpectedCollectionRow[] {
  const sched = parseExpectedCollectionSchedule(inc.expectedPaymentSchedule)
  if (sched.length > 0) {
    return sched.map((s) => ({
      id: s.id,
      date: s.expectedDate,
      amount: String(s.amount),
    }))
  }
  if (inc.expectedPaymentDate?.trim()) {
    return [
      {
        id: 'legacy',
        date: inc.expectedPaymentDate.slice(0, 10),
        amount: String(outstanding),
      },
    ]
  }
  return [
    {
      id: crypto.randomUUID(),
      date: '',
      amount: outstanding > 0 ? String(outstanding) : '',
    },
  ]
}

export function rowsToExpectedCollectionSchedule(
  rows: ExpectedCollectionRow[],
): FinanceExpectedCollection[] {
  const out: FinanceExpectedCollection[] = []
  for (const row of rows) {
    const date = row.date.trim().slice(0, 10)
    const amount = Number.parseFloat(row.amount.replace(/,/g, ''))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (!Number.isFinite(amount) || amount <= 0) continue
    out.push({
      id: row.id === 'legacy' ? crypto.randomUUID() : row.id,
      expectedDate: date,
      amount: round2(amount),
    })
  }
  return out.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))
}

export function scheduleRowsTotal(rows: ExpectedCollectionRow[]): number {
  return round2(
    rows.reduce((s, r) => {
      const n = Number.parseFloat(r.amount.replace(/,/g, ''))
      return s + (Number.isFinite(n) ? n : 0)
    }, 0),
  )
}

/** תנועות גבייה לתחזית — schedule קודם, אחרת תאריך בודד + יתרה מלאה */
export function resolveCollectionForecastEntries(
  inc: FinanceIncome,
  outstanding: number,
): { date: string; amount: number }[] {
  const sched = parseExpectedCollectionSchedule(inc.expectedPaymentSchedule)
  if (sched.length > 0) {
    return sched.map((s) => ({ date: s.expectedDate, amount: s.amount }))
  }
  const expected = inc.expectedPaymentDate?.trim().slice(0, 10)
  if (expected && outstanding > 0) {
    return [{ date: expected, amount: round2(outstanding) }]
  }
  return []
}

export function hasCollectionForecast(
  inc: FinanceIncome,
  outstanding: number,
): boolean {
  return resolveCollectionForecastEntries(inc, outstanding).length > 0
}

/** patch לשמירה — schedule בודד מסנכרן גם expectedPaymentDate לתאימות */
export function expectedCollectionPatchFromRows(
  rows: ExpectedCollectionRow[],
): {
  expectedPaymentSchedule: FinanceExpectedCollection[] | null
  expectedPaymentDate: string | null
} {
  const schedule = rowsToExpectedCollectionSchedule(rows)
  if (schedule.length === 0) {
    return { expectedPaymentSchedule: null, expectedPaymentDate: null }
  }
  if (schedule.length === 1) {
    return {
      expectedPaymentSchedule: schedule,
      expectedPaymentDate: schedule[0]!.expectedDate,
    }
  }
  return {
    expectedPaymentSchedule: schedule,
    expectedPaymentDate: null,
  }
}
