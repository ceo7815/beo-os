import { todayYmd } from './dates'
import {
  monthsInRange,
  normalizeYmRange,
} from './financeMonthRange'
import {
  incomeOutstandingAmount,
  incomeRecognizedPaid,
} from './financeIncomePayment'
import { resolveExpenseRowVat, resolveIncomeVat, prorateVatBreakdown } from './israeliVat'
import {
  expandExpensesForFilters,
  expenseAppliesToMonth,
  expenseTypeMap,
  resolveExpenseType,
} from './financeExpenseTypes'
import type {
  FinanceExpense,
  FinanceExpenseTypeDef,
  FinanceIncome,
  FinanceIncomeStatus,
} from '../types'

export function formatNis(amount: number): string {
  return `₪${Math.round(amount).toLocaleString('he-IL')}`
}

export function ymFromDate(dateStr: string): string {
  return dateStr.slice(0, 7)
}

export function currentYm(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabelHe(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  const names = [
    'ינואר',
    'פברואר',
    'מרץ',
    'אפריל',
    'מאי',
    'יוני',
    'יולי',
    'אוגוסט',
    'ספטמבר',
    'אוקטובר',
    'נובמבר',
    'דצמבר',
  ]
  return `${names[m - 1] ?? ym} ${y}`
}

export function monthOptions(count = 24): { value: string; label: string }[] {
  const rows: { value: string; label: string }[] = []
  const d = new Date()
  for (let i = 0; i < count; i += 1) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1)
    const ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    rows.push({ value: ym, label: monthLabelHe(ym) })
  }
  return rows
}

export function withDisplayOverdueIncomes(
  list: FinanceIncome[],
  today = todayYmd(),
): FinanceIncome[] {
  return list.map((row) => {
    const due = row.invoiceDate.slice(0, 10)
    if (
      row.status === 'pending' &&
      /^\d{4}-\d{2}-\d{2}$/.test(due) &&
      due < today
    ) {
      return { ...row, status: 'overdue' as FinanceIncomeStatus }
    }
    return row
  })
}

export type FinanceFilters = {
  ymFrom: string
  ymTo: string
  projectId: string
  clientId: string
}

export function filterIncomes(
  incomes: FinanceIncome[],
  filters: FinanceFilters,
  today = todayYmd(),
): FinanceIncome[] {
  return expandIncomesForFilters(incomes, filters, today)
}

function parseYm(ym: string): { y: number; m: number } | null {
  const [ys, ms] = ym.split('-')
  const y = Number(ys)
  const m = Number(ms)
  if (!y || !m || m < 1 || m > 12) return null
  return { y, m }
}

export { addMonths, compareYm, monthsInRange, normalizeYmRange } from './financeMonthRange'

export function formatYmRangeLabel(from: string, to: string): string {
  const { from: f, to: t } = normalizeYmRange(from, to)
  if (!f && !t) return 'כל התקופות'
  if (f === t) return monthLabelHe(f)
  return `${monthLabelHe(f)} – ${monthLabelHe(t)}`
}

function incomePortionBreakdown(
  inc: FinanceIncome,
  portionGross: number,
): ReturnType<typeof resolveIncomeVat> {
  return prorateVatBreakdown(resolveIncomeVat(inc), portionGross, inc.amount)
}

/** מע״מ על סכום ששולם בפועל בלבד — יתרה ממתינה לא נכנסת למשוואה */
export function incomeVatOnPaid(inc: FinanceIncome): number {
  const paid = incomeRecognizedPaid(inc)
  if (paid <= 0) return 0
  return incomePortionBreakdown(inc, paid).vat
}

export function incomeAppliesToMonth(
  inc: FinanceIncome,
  targetYm: string,
): boolean {
  if (ymFromDate(inc.invoiceDate) === targetYm) return true
  if (!inc.monthlyRetainer) return false

  const start = parseYm(ymFromDate(inc.invoiceDate))
  const target = parseYm(targetYm)
  if (!start || !target) return false
  if (target.y !== start.y) return false
  if (target.m < start.m) return false
  return true
}

function incomeDateForMonth(inc: FinanceIncome, targetYm: string): string {
  const day = inc.invoiceDate.slice(8, 10)
  const safeDay =
    /^\d{2}$/.test(day) && Number(day) >= 1 && Number(day) <= 28
      ? day
      : '01'
  return `${targetYm}-${safeDay}`
}

function applyOverdueToIncome(row: FinanceIncome, today: string): FinanceIncome {
  const due = row.invoiceDate.slice(0, 10)
  if (
    row.status === 'pending' &&
    /^\d{4}-\d{2}-\d{2}$/.test(due) &&
    due < today
  ) {
    return { ...row, status: 'overdue' as FinanceIncomeStatus }
  }
  return row
}

function expandIncomesForMonth(
  incomes: FinanceIncome[],
  ym: string,
  filters: Pick<FinanceFilters, 'projectId' | 'clientId'>,
  today: string,
): FinanceIncome[] {
  const out: FinanceIncome[] = []

  for (const inc of incomes) {
    if (filters.projectId && inc.projectId !== filters.projectId) continue
    if (filters.clientId && inc.clientId !== filters.clientId) continue
    if (!incomeAppliesToMonth(inc, ym)) continue

    if (ymFromDate(inc.invoiceDate) === ym) {
      out.push(applyOverdueToIncome(inc, today))
      continue
    }

    out.push(
      applyOverdueToIncome(
        {
          ...inc,
          invoiceDate: incomeDateForMonth(inc, ym),
          sourceInvoiceDate: inc.invoiceDate,
          isAutoOccurrence: true,
        },
        today,
      ),
    )
  }

  return out
}

export function expandIncomesForFilters(
  incomes: FinanceIncome[],
  filters: FinanceFilters,
  today = todayYmd(),
): FinanceIncome[] {
  const { ymFrom, ymTo, projectId, clientId } = filters
  const { from, to } = normalizeYmRange(ymFrom, ymTo)

  if (!from && !to) {
    const out: FinanceIncome[] = []
    for (const inc of incomes) {
      if (projectId && inc.projectId !== projectId) continue
      if (clientId && inc.clientId !== clientId) continue
      out.push(inc)
    }
    return out
  }

  const months = monthsInRange(from, to)
  const out: FinanceIncome[] = []
  for (const ym of months) {
    out.push(...expandIncomesForMonth(incomes, ym, { projectId, clientId }, today))
  }
  return out
}

export function filterExpensesByClient(
  expenses: FinanceExpense[],
  filters: FinanceFilters,
  projectIdsForClient: Set<string>,
  expenseTypes: FinanceExpenseTypeDef[],
  incomes: FinanceIncome[] = [],
): FinanceExpense[] {
  return expandExpensesForFilters(
    expenses,
    filters,
    projectIdsForClient,
    expenseTypeMap(expenseTypes),
    incomes,
  )
}

export type FinanceSummary = {
  /** סכום כל חשבונות העסקה בחודש (כולל ממתין) */
  totalTransactions: number
  /** סכום שהתקבל בפועל (שולם + חלקי) */
  totalPaidIncome: number
  totalExpenses: number
  /** עסקאות פחות הוצאות (לא לפי תשלום בפועל) */
  netProfit: number
  /** סכום שלא נגבה עדיין */
  pendingCollection: number
  /** מע״מ על הכנסות — רק מסכום ששולם בפועל (ממתין/יתרה לא נספרים) */
  incomeVat: number
  /** מע״מ תשומות — הוצאות חייבות במע״מ בלבד */
  expenseVat: number
  /** מע״מ עסקאות − מע״מ תשומות (חיובי = לשלם לרשות) */
  vatNet: number
  /** רווח נקי − מע״מ לתשלום (אם קיזוז חיובי) */
  profitAfterVat: number
}

export function computeSummary(
  incomes: FinanceIncome[],
  expenses: FinanceExpense[],
  filters: FinanceFilters,
  projectIdsForClient: Set<string>,
  expenseTypes: FinanceExpenseTypeDef[],
): FinanceSummary {
  const filteredIncomes = filterIncomes(incomes, filters)
  const filteredExpenses = filterExpensesByClient(
    expenses,
    filters,
    projectIdsForClient,
    expenseTypes,
    incomes,
  )

  let totalTransactions = 0
  let totalPaidIncome = 0
  let pendingCollection = 0
  let incomeVat = 0
  for (const row of filteredIncomes) {
    totalTransactions += row.amount
    totalPaidIncome += incomeRecognizedPaid(row)
    pendingCollection += incomeOutstandingAmount(row)
    incomeVat += incomeVatOnPaid(row)
  }

  const totalExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0)
  let expenseVat = 0
  for (const row of filteredExpenses) {
    expenseVat += resolveExpenseRowVat(row).vat
  }
  incomeVat = Math.round(incomeVat * 100) / 100
  expenseVat = Math.round(expenseVat * 100) / 100
  const netProfit = totalTransactions - totalExpenses
  const vatNet = Math.round((incomeVat - expenseVat) * 100) / 100
  const vatPayable = Math.max(0, vatNet)
  const profitAfterVat = Math.round((netProfit - vatPayable) * 100) / 100

  return {
    totalTransactions,
    totalPaidIncome,
    totalExpenses,
    netProfit,
    pendingCollection,
    incomeVat,
    expenseVat,
    vatNet,
    profitAfterVat,
  }
}

export type ProfitLossRow = {
  ym: string
  label: string
  /** סכום כל העסקאות בחודש (כולל ממתין) */
  totalTransactions: number
  /** סכום שלא נגבה עדיין */
  pendingCollection: number
  fixedExpenses: number
  supplierExpenses: number
  platformExpenses: number
  totalExpenses: number
  netProfit: number
  profitMargin: number
}

export function computeProfitLossRows(
  incomes: FinanceIncome[],
  expenses: FinanceExpense[],
  expenseTypes: FinanceExpenseTypeDef[],
  year = new Date().getFullYear(),
): ProfitLossRow[] {
  const typeMap = expenseTypeMap(expenseTypes)
  const rows: ProfitLossRow[] = []

  for (let month = 4; month <= 12; month += 1) {
    const ym = `${year}-${String(month).padStart(2, '0')}`

    let totalTransactions = 0
    let pendingCollection = 0
    for (const inc of incomes) {
      if (!incomeAppliesToMonth(inc, ym)) continue
      totalTransactions += inc.amount
      pendingCollection += incomeOutstandingAmount(inc)
    }

    let fixedExpenses = 0
    let supplierExpenses = 0
    let platformExpenses = 0
    for (const exp of expenses) {
      const def = resolveExpenseType(exp.type, typeMap)
      if (!expenseAppliesToMonth(exp, ym, def, incomes)) continue
      if (def.pnlCategory === 'fixed') fixedExpenses += exp.amount
      else if (def.pnlCategory === 'supplier') supplierExpenses += exp.amount
      else platformExpenses += exp.amount
    }

    const totalExpenses = fixedExpenses + supplierExpenses + platformExpenses
    const netProfit = totalTransactions - totalExpenses
    const profitMargin =
      totalTransactions > 0
        ? Math.round((netProfit / totalTransactions) * 1000) / 10
        : 0

    rows.push({
      ym,
      label: monthLabelHe(ym),
      totalTransactions,
      pendingCollection,
      fixedExpenses,
      supplierExpenses,
      platformExpenses,
      totalExpenses,
      netProfit,
      profitMargin,
    })
  }

  return rows.reverse()
}

export const INCOME_STATUS_LABEL: Record<FinanceIncomeStatus, string> = {
  paid: 'שולם',
  pending: 'ממתין',
  overdue: 'באיחור',
  partial: 'שולם חלקית',
}

export const INCOME_STATUS_STYLE: Record<
  FinanceIncomeStatus,
  { bg: string; color: string }
> = {
  paid: { bg: '#10B981', color: '#fff' },
  pending: { bg: '#F59E0B', color: '#fff' },
  overdue: { bg: '#EF4444', color: '#fff' },
  partial: { bg: '#3B82F6', color: '#fff' },
}

export const PLATFORM_OPTIONS = [
  { value: 'Google Ads', label: 'Google Ads' },
  { value: 'Meta', label: 'Meta' },
  { value: 'TikTok', label: 'TikTok' },
  { value: 'Other', label: 'אחר' },
] as const
