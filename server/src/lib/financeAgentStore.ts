import { getServiceSupabase } from './supabaseAdmin.js'

/**
 * גישת קריאה בלבד של הסוכן לעולם הפיננסי (Supabase).
 * טבלאות finance_* שומרות שדות ב-payload JSON.
 */

const EXPENSES = 'finance_expenses'
const INCOMES = 'finance_incomes'

export class FinanceAgentDbNotReadyError extends Error {}

function sb() {
  const client = getServiceSupabase()
  if (!client) {
    throw new FinanceAgentDbNotReadyError(
      'Supabase service_role לא מוגדר בשרת (SUPABASE_SERVICE_ROLE_KEY)',
    )
  }
  return client
}

export type MonthFilter = {
  month?: string
  from?: string
  to?: string
  limit: number
}

function withinRange(ym: string, filter: MonthFilter): boolean {
  if (!ym) return false
  if (filter.month) return ym === filter.month
  if (filter.from && ym < filter.from) return false
  if (filter.to && ym > filter.to) return false
  return true
}

function flattenRow(id: string, row: Record<string, unknown>): Record<string, unknown> {
  const payload =
    row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {}
  return { id, ...payload, createdAt: row.created_at, updatedAt: row.updated_at }
}

function expenseMonth(d: Record<string, unknown>): string {
  return String(d.pnlMonth ?? d.billingMonth ?? '').slice(0, 7)
}

function incomeMonth(d: Record<string, unknown>): string {
  return String(d.pnlMonth ?? d.billingMonth ?? d.documentDate ?? '').slice(0, 7)
}

async function listByMonth(
  table: string,
  monthOf: (d: Record<string, unknown>) => string,
  filter: MonthFilter,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await sb().from(table).select('*').limit(2000)
  if (error) throw new Error(error.message)
  const rows: Record<string, unknown>[] = []
  for (const raw of data ?? []) {
    const flat = flattenRow(String(raw.id), raw as Record<string, unknown>)
    if (!withinRange(monthOf(flat), filter)) continue
    rows.push(flat)
    if (rows.length >= filter.limit) break
  }
  return rows
}

export function listExpenses(filter: MonthFilter): Promise<Record<string, unknown>[]> {
  return listByMonth(EXPENSES, expenseMonth, filter)
}

export function listIncomes(filter: MonthFilter): Promise<Record<string, unknown>[]> {
  return listByMonth(INCOMES, incomeMonth, filter)
}

export type MonthInventory = {
  month: string
  expenseCount: number
  expenseTotal: number
  incomeCount: number
  incomeTotal: number
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : 0
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function monthInventory(): Promise<MonthInventory[]> {
  const client = sb()
  const [{ data: expRaw, error: e1 }, { data: incRaw, error: e2 }] = await Promise.all([
    client.from(EXPENSES).select('*').limit(5000),
    client.from(INCOMES).select('*').limit(5000),
  ])
  if (e1) throw new Error(e1.message)
  if (e2) throw new Error(e2.message)

  const months = new Map<string, MonthInventory>()
  const slot = (ym: string): MonthInventory => {
    const found = months.get(ym)
    if (found) return found
    const created: MonthInventory = {
      month: ym,
      expenseCount: 0,
      expenseTotal: 0,
      incomeCount: 0,
      incomeTotal: 0,
    }
    months.set(ym, created)
    return created
  }

  for (const raw of expRaw ?? []) {
    const flat = flattenRow(String(raw.id), raw as Record<string, unknown>)
    const s = slot(expenseMonth(flat) || 'unknown')
    s.expenseCount += 1
    s.expenseTotal = round2(s.expenseTotal + num(flat.amount ?? flat.total))
  }
  for (const raw of incRaw ?? []) {
    const flat = flattenRow(String(raw.id), raw as Record<string, unknown>)
    const s = slot(incomeMonth(flat) || 'unknown')
    s.incomeCount += 1
    s.incomeTotal = round2(s.incomeTotal + num(flat.amount ?? flat.total))
  }

  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month))
}
