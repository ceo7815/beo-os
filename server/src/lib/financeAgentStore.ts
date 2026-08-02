import { getAdminDb } from './firebaseAdmin.js'
import { serializeDoc } from './hubApiHttpUtil.js'

/**
 * גישת קריאה בלבד של הסוכן לעולם הפיננסי.
 *
 * הרישום כולו נעשה במערכת בידי בעל העסק. לסוכן אין ולא תהיה דרך לכתוב:
 * זו ההחלטה שמונעת שני מקורות שיוצרים את אותה רשומה, ואיתה את ההתאמות
 * והכפילויות שנבעו מכך.
 */

const EXPENSES = 'financeExpenses'
const INCOMES = 'financeIncomes'

export class FinanceAgentDbNotReadyError extends Error {}

function db() {
  const instance = getAdminDb()
  if (!instance) throw new FinanceAgentDbNotReadyError('Firebase Admin לא מוגדר בשרת')
  return instance
}

export type MonthFilter = {
  /** YYYY-MM — חודש בודד */
  month?: string
  /** YYYY-MM — תחילת טווח (כולל) */
  from?: string
  /** YYYY-MM — סוף טווח (כולל) */
  to?: string
  limit: number
}

function withinRange(ym: string, filter: MonthFilter): boolean {
  if (filter.month) return ym === filter.month
  if (filter.from && ym < filter.from) return false
  if (filter.to && ym > filter.to) return false
  return true
}

/**
 * הסינון נעשה בזיכרון ולא בשאילתה מפני שחודש הרווח של רשומה נגזר מכמה
 * שדות (חודש חיוב, חודש רווח ידני, פריסה) — צמצום לשדה אחד בשאילתה היה
 * מחזיר תשובה חלקית, וזו בדיוק הטעות שאנחנו מונעים.
 */
async function listByMonth(
  collection: string,
  monthOf: (d: Record<string, unknown>) => string,
  filter: MonthFilter,
): Promise<Record<string, unknown>[]> {
  const snap = await db().collection(collection).get()
  const rows: Record<string, unknown>[] = []
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>
    if (!withinRange(monthOf(data), filter)) continue
    rows.push(serializeDoc(doc.id, data))
    if (rows.length >= filter.limit) break
  }
  return rows
}

function expenseMonth(d: Record<string, unknown>): string {
  return String(d.pnlMonth ?? d.billingMonth ?? '').slice(0, 7)
}

function incomeMonth(d: Record<string, unknown>): string {
  return String(d.pnlMonth ?? d.billingMonth ?? d.documentDate ?? '').slice(0, 7)
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

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * מצאי גולמי לכל חודש — כמה רשומות יש וכמה הן מסתכמות.
 *
 * זו במכוון אינה תמונת רווח והפסד: הרווח מחושב בכללי הייחוס, המע״מ
 * והפריסה של המערכת, ולכן הוא נמסר מנקודה אחת בלבד. מספר מקביל שהיה
 * מחושב כאן היה יכול לסטות מהדשבורד, וזה בדיוק מה שאסור שיקרה.
 */
export async function monthInventory(): Promise<MonthInventory[]> {
  const [expenseSnap, incomeSnap] = await Promise.all([
    db().collection(EXPENSES).get(),
    db().collection(INCOMES).get(),
  ])

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

  for (const doc of expenseSnap.docs) {
    const d = doc.data() as Record<string, unknown>
    const s = slot(expenseMonth(d) || 'unknown')
    s.expenseCount += 1
    s.expenseTotal = round2(s.expenseTotal + Number(d.amount ?? 0))
  }
  for (const doc of incomeSnap.docs) {
    const d = doc.data() as Record<string, unknown>
    const s = slot(incomeMonth(d) || 'unknown')
    s.incomeCount += 1
    s.incomeTotal = round2(s.incomeTotal + Number(d.amount ?? 0))
  }

  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month))
}
