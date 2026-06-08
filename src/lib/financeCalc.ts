import { todayYmd } from './dates'
import {
  isTaxReceiptIncome,
  isTransactionInvoiceIncome,
} from './financeIncomeDocument'
import {
  monthsInRange,
  normalizeYmRange,
} from './financeMonthRange'
import {
  incomeFilterAnchorDate,
  incomeOutstandingAmount,
  incomeRecognizedPaid,
} from './financeIncomePayment'
import { resolveExpenseRowVat, resolveIncomeVat } from './israeliVat'
import { resolveExpenseVatClass } from './financeExpenseVat'
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

/** יתרה לגבייה — סכום שלא נגבה, על כל החודשים (לא לפי פילטר תאריך) */
export function computeCollectionBalance(
  incomes: FinanceIncome[],
  filters: Pick<FinanceFilters, 'projectId' | 'clientId'>,
  projectIdsForClient: Set<string>,
): number {
  let total = 0
  for (const row of incomes) {
    if (!isTransactionInvoiceIncome(row)) continue
    if (filters.projectId && row.projectId !== filters.projectId) continue
    if (filters.clientId) {
      const matchClient =
        row.clientId === filters.clientId ||
        (row.projectId && projectIdsForClient.has(row.projectId))
      if (!matchClient) continue
    }
    total += incomeOutstandingAmount(row)
  }
  return Math.round(total * 100) / 100
}

export function filterIncomes(
  incomes: FinanceIncome[],
  filters: FinanceFilters,
  today = todayYmd(),
): FinanceIncome[] {
  return expandIncomesForFilters(incomes, filters, today)
}

/** מס קבלה — סינון לפי תאריך תשלום */
export function filterTaxReceiptIncomes(
  incomes: FinanceIncome[],
  filters: FinanceFilters,
  today = todayYmd(),
): FinanceIncome[] {
  return filterIncomes(
    incomes.filter(isTaxReceiptIncome),
    filters,
    today,
  )
}

/** יתרה לגבייה — סינון לפי תאריך מסמך */
export function filterCollectionIncomes(
  incomes: FinanceIncome[],
  filters: FinanceFilters,
  today = todayYmd(),
): FinanceIncome[] {
  return filterIncomes(
    incomes.filter(isTransactionInvoiceIncome),
    filters,
    today,
  )
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

/** מע״מ על הכנסה — סכום מלא של מס קבלה בלבד (לא חלקי, לא חשבונית עסקה) */
export function incomeVatForDocument(inc: FinanceIncome): number {
  if (!isTaxReceiptIncome(inc)) return 0
  return resolveIncomeVat(inc).vat
}

/** @deprecated השתמשו ב-incomeVatForDocument — נשמר לתאימות */
export function incomeVatOnPaid(inc: FinanceIncome): number {
  return incomeVatForDocument(inc)
}

export function incomeAppliesToMonth(
  inc: FinanceIncome,
  targetYm: string,
): boolean {
  const anchor = incomeFilterAnchorDate(inc)
  if (ymFromDate(anchor) === targetYm) return true
  if (!inc.monthlyRetainer) return false

  const start = parseYm(ymFromDate(anchor))
  const target = parseYm(targetYm)
  if (!start || !target) return false
  if (target.y !== start.y) return false
  if (target.m < start.m) return false
  return true
}

function incomeDateForMonth(inc: FinanceIncome, targetYm: string): string {
  const anchor = incomeFilterAnchorDate(inc)
  const day = anchor.slice(8, 10)
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

    const anchor = incomeFilterAnchorDate(inc)
    if (ymFromDate(anchor) === ym) {
      out.push(applyOverdueToIncome(inc, today))
      continue
    }

    out.push(
      applyOverdueToIncome(
        {
          ...inc,
          invoiceDate: incomeDateForMonth(inc, ym),
          sourceInvoiceDate: anchor,
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
  /** הכנסות ברוטו (מס קבלה) */
  incomeGross: number
  /** מע״מ עסקאות */
  incomeVat: number
  /** הכנסות נטו (שלי) */
  incomeNet: number

  /** הוצאות חייבות מע״מ — ברוטו */
  expenseVatLiableGross: number
  /** מע״מ תשומות (ניתן לקיזוז) */
  expenseInputVat: number
  /** הוצאות חייבות — נטו */
  expenseVatLiableNet: number
  /** הוצאות statutory + פטור — סכום מלא (= נטו) */
  expenseNonVatTotal: number

  /** סה״כ הוצאות נטו */
  expenseNetTotal: number
  /** מע״מ לתשלום = עסקאות − תשומות */
  vatPayable: number
  /** רווח גולמי = הכנסות נטו − הוצאות נטו */
  grossProfit: number
  /** רווח נקי אמיתי = גולמי − מע״מ לתשלום */
  trueNetProfit: number

  /** יתרה לגבייה — גלובלי */
  collectionBalance: number
  pendingCollection: number

  /** @deprecated — alias ל-incomeGross */
  totalTaxReceipts: number
  /** @deprecated */
  openTransactionInvoices: number
  /** @deprecated */
  totalTransactionInvoices: number
  /** @deprecated */
  totalTransactions: number
  /** @deprecated */
  totalPaidIncome: number
  /** @deprecated — gross */
  totalExpenses: number
  /** @deprecated */
  netProfit: number
  /** @deprecated — alias ל-expenseInputVat */
  expenseVat: number
  /** @deprecated */
  vatNet: number
  /** @deprecated — alias ל-trueNetProfit */
  realProfit: number
  /** @deprecated */
  profitAfterVat: number
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function computeSummary(
  incomes: FinanceIncome[],
  expenses: FinanceExpense[],
  filters: FinanceFilters,
  projectIdsForClient: Set<string>,
  expenseTypes: FinanceExpenseTypeDef[],
): FinanceSummary {
  const filteredTaxReceipts = filterTaxReceiptIncomes(incomes, filters)
  const filteredCollectionInPeriod = filterCollectionIncomes(incomes, filters)
  const filteredExpenses = filterExpensesByClient(
    expenses,
    filters,
    projectIdsForClient,
    expenseTypes,
    incomes,
  )

  let incomeGross = 0
  let incomeVat = 0
  let incomeNet = 0
  let totalPaidIncome = 0
  let pendingCollection = 0

  for (const row of filteredTaxReceipts) {
    const vat = resolveIncomeVat(row)
    incomeGross += vat.gross
    incomeVat += vat.vat
    incomeNet += vat.net
    totalPaidIncome += incomeRecognizedPaid(row)
  }
  for (const row of filteredCollectionInPeriod) {
    pendingCollection += incomeOutstandingAmount(row)
  }

  const collectionBalance = computeCollectionBalance(
    incomes,
    { projectId: filters.projectId, clientId: filters.clientId },
    projectIdsForClient,
  )

  let expenseVatLiableGross = 0
  let expenseInputVat = 0
  let expenseVatLiableNet = 0
  let expenseNonVatTotal = 0

  for (const row of filteredExpenses) {
    const vatClass = resolveExpenseVatClass(row)
    const breakdown = resolveExpenseRowVat(row)
    if (vatClass === 'vat_liable') {
      expenseVatLiableGross += breakdown.gross
      expenseInputVat += breakdown.vat
      expenseVatLiableNet += breakdown.net
    } else {
      expenseNonVatTotal += breakdown.gross
    }
  }

  incomeGross = roundMoney(incomeGross)
  incomeVat = roundMoney(incomeVat)
  incomeNet = roundMoney(incomeNet)
  expenseVatLiableGross = roundMoney(expenseVatLiableGross)
  expenseInputVat = roundMoney(expenseInputVat)
  expenseVatLiableNet = roundMoney(expenseVatLiableNet)
  expenseNonVatTotal = roundMoney(expenseNonVatTotal)

  const expenseNetTotal = roundMoney(expenseVatLiableNet + expenseNonVatTotal)
  const vatPayable = roundMoney(Math.max(0, incomeVat - expenseInputVat))
  const grossProfit = roundMoney(incomeNet - expenseNetTotal)
  const trueNetProfit = roundMoney(grossProfit - vatPayable)

  return {
    incomeGross,
    incomeVat,
    incomeNet,
    expenseVatLiableGross,
    expenseInputVat,
    expenseVatLiableNet,
    expenseNonVatTotal,
    expenseNetTotal,
    vatPayable,
    grossProfit,
    trueNetProfit,
    collectionBalance,
    pendingCollection,
    totalTaxReceipts: incomeGross,
    openTransactionInvoices: collectionBalance,
    totalTransactionInvoices: collectionBalance,
    totalTransactions: incomeGross,
    totalPaidIncome,
    totalExpenses: roundMoney(expenseVatLiableGross + expenseNonVatTotal),
    netProfit: grossProfit,
    expenseVat: expenseInputVat,
    vatNet: roundMoney(incomeVat - expenseInputVat),
    realProfit: trueNetProfit,
    profitAfterVat: trueNetProfit,
  }
}

export type ProfitLossRow = {
  ym: string
  label: string
  incomeNet: number
  expenseNet: number
  vatPayable: number
  trueNetProfit: number
  /** @deprecated */
  totalTaxReceipts: number
  fixedExpenses: number
  supplierExpenses: number
  platformExpenses: number
  totalExpenses: number
  realProfit: number
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

  for (let month = 1; month <= 12; month += 1) {
    const ym = `${year}-${String(month).padStart(2, '0')}`

    let incomeNet = 0
    let incomeVat = 0
    for (const inc of incomes) {
      if (!incomeAppliesToMonth(inc, ym)) continue
      if (isTaxReceiptIncome(inc)) {
        const vat = resolveIncomeVat(inc)
        incomeNet += vat.net
        incomeVat += vat.vat
      }
    }

    let expenseNet = 0
    let expenseInputVat = 0
    let fixedExpenses = 0
    let supplierExpenses = 0
    let platformExpenses = 0
    for (const exp of expenses) {
      const def = resolveExpenseType(exp.type, typeMap)
      if (!expenseAppliesToMonth(exp, ym, def, incomes)) continue
      const breakdown = resolveExpenseRowVat(exp)
      expenseNet += breakdown.net
      if (resolveExpenseVatClass(exp) === 'vat_liable') {
        expenseInputVat += breakdown.vat
      }
      if (def.pnlCategory === 'fixed') fixedExpenses += breakdown.net
      else if (def.pnlCategory === 'supplier') supplierExpenses += breakdown.net
      else platformExpenses += breakdown.net
    }

    incomeNet = roundMoney(incomeNet)
    incomeVat = roundMoney(incomeVat)
    expenseNet = roundMoney(expenseNet)
    expenseInputVat = roundMoney(expenseInputVat)
    const vatPayable = roundMoney(Math.max(0, incomeVat - expenseInputVat))
    const grossProfit = roundMoney(incomeNet - expenseNet)
    const trueNetProfit = roundMoney(grossProfit - vatPayable)
    const totalExpenses = expenseNet
    const profitMargin =
      incomeNet > 0 ? roundMoney((trueNetProfit / incomeNet) * 1000) / 10 : 0

    rows.push({
      ym,
      label: monthLabelHe(ym),
      incomeNet,
      expenseNet,
      vatPayable,
      trueNetProfit,
      totalTaxReceipts: incomeNet,
      fixedExpenses,
      supplierExpenses,
      platformExpenses,
      totalExpenses,
      realProfit: trueNetProfit,
      netProfit: grossProfit,
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
