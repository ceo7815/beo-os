import { todayYmd } from './dates'
import {
  isActualIncome,
  isIncomePageDoc,
  isOpenTransactionAccount,
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
import { ISRAEL_VAT_RATE, resolveExpenseRowVat, resolveIncomeVat } from './israeliVat'
import { resolveExpenseVatClass } from './financeExpenseVat'
import {
  expandExpensesForFilters,
  expenseAppliesToMonth,
  expenseTypeMap,
  resolveExpenseType,
} from './financeExpenseTypes'
import { expensesForFinancialTotals } from './expenseSource'
import { expenseRowForMonth, isSpreadExpense } from './financeExpenseSpread'
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
    if (!isOpenTransactionAccount(row)) continue
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

/** הכנסות בפועל (מס קבלה + קבלה + זיכוי) — סינון לפי תאריך תשלום */
export function filterActualIncomes(
  incomes: FinanceIncome[],
  filters: FinanceFilters,
  today = todayYmd(),
): FinanceIncome[] {
  return filterIncomes(
    incomes.filter(isActualIncome),
    filters,
    today,
  )
}

/** @deprecated — השתמשו ב-filterActualIncomes */
export function filterTaxReceiptIncomes(
  incomes: FinanceIncome[],
  filters: FinanceFilters,
  today = todayYmd(),
): FinanceIncome[] {
  return filterActualIncomes(incomes, filters, today)
}

/** חשבונות עסקה פתוחים לגבייה (תואם לסטטוס GI) — סינון לפי תאריך מסמך */
export function filterCollectionIncomes(
  incomes: FinanceIncome[],
  filters: FinanceFilters,
  today = todayYmd(),
): FinanceIncome[] {
  return filterIncomes(
    incomes.filter(isOpenTransactionAccount),
    filters,
    today,
  )
}

/** כל מסמכי דף הכנסות (לא חשבון עסקה) */
export function filterIncomePageDocs(
  incomes: FinanceIncome[],
  filters: FinanceFilters,
  today = todayYmd(),
): FinanceIncome[] {
  return filterIncomes(
    incomes.filter(isIncomePageDoc),
    filters,
    today,
  )
}

export { addMonths, compareYm, monthsInRange, normalizeYmRange } from './financeMonthRange'

export function formatYmRangeLabel(from: string, to: string): string {
  const { from: f, to: t } = normalizeYmRange(from, to)
  if (!f && !t) return 'כל התקופות'
  if (f === t) return monthLabelHe(f)
  return `${monthLabelHe(f)} – ${monthLabelHe(t)}`
}

/** מע״מ על הכנסה בפועל */
export function incomeVatForDocument(inc: FinanceIncome): number {
  if (!isActualIncome(inc)) return 0
  return resolveIncomeVat(inc).vat
}

/** @deprecated השתמשו ב-incomeVatForDocument — נשמר לתאימות */
export function incomeVatOnPaid(inc: FinanceIncome): number {
  return incomeVatForDocument(inc)
}

/**
 * הכנסה נספרת בחודש המסמך שלה בלבד.
 * חשבונית ירוקה היא מקור האמת — לכל חודש יש מסמך משלו, ולכן אין ייצור
 * מופעים חודשיים נוספים מהכנסה אחת.
 */
export function incomeAppliesToMonth(
  inc: FinanceIncome,
  targetYm: string,
): boolean {
  return ymFromDate(incomeFilterAnchorDate(inc)) === targetYm
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

    out.push(applyOverdueToIncome(inc, today))
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
): FinanceExpense[] {
  return expensesForFinancialTotals(
    expandExpensesForFilters(
      expenses,
      filters,
      projectIdsForClient,
      expenseTypeMap(expenseTypes),
    ),
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
  /** רווח גולמי = הכנסות ברוטו − הוצאות ברוטו (לפני קיזוז מע״מ) */
  grossProfit: number
  /** רווח נקי אמיתי = רווח גולמי − מע״מ לתשלום */
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

export type BreakEven = {
  /** הוצאות נטו בתקופה (העלות האמיתית לכיסוי) */
  expenseNetTotal: number
  /** הכנסה (כולל מע"מ) הדרושה כדי שרווח נקי אמיתי = 0 */
  breakEvenGross: number
  /** הכנסה (כולל מע"מ) שכבר נרשמה בתקופה */
  incomeGross: number
  /** כמה עוד צריך להכניס כדי להגיע לאיזון (0 אם כבר עברנו) */
  remainingGross: number
  /** האם עברנו את נקודת האיזון */
  reached: boolean
}

/**
 * נקודת איזון — מחזירה את ההכנסה (כולל מע"מ) הדרושה כדי לא להפסיד.
 * בנוסחת הרווח הנקי האמיתי המע"מ מתקזז, ולכן ההכנסה נטו הדרושה = ההוצאות נטו,
 * וההכנסה ברוטו הדרושה = הוצאות נטו × (1 + מע"מ).
 */
export function computeBreakEven(
  summary: Pick<FinanceSummary, 'expenseNetTotal' | 'incomeGross'>,
): BreakEven {
  const breakEvenGross = roundMoney(
    summary.expenseNetTotal * (1 + ISRAEL_VAT_RATE),
  )
  const remainingGross = roundMoney(
    Math.max(0, breakEvenGross - summary.incomeGross),
  )
  return {
    expenseNetTotal: summary.expenseNetTotal,
    breakEvenGross,
    incomeGross: summary.incomeGross,
    remainingGross,
    reached: summary.incomeGross >= breakEvenGross,
  }
}

export function computeSummary(
  incomes: FinanceIncome[],
  expenses: FinanceExpense[],
  filters: FinanceFilters,
  projectIdsForClient: Set<string>,
  expenseTypes: FinanceExpenseTypeDef[],
): FinanceSummary {
  const filteredTaxReceipts = filterActualIncomes(incomes, filters)
  const filteredCollectionInPeriod = filterCollectionIncomes(incomes, filters)
  const filteredExpenses = filterExpensesByClient(
    expenses,
    filters,
    projectIdsForClient,
    expenseTypes,
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
  const expenseGrossTotal = roundMoney(expenseVatLiableGross + expenseNonVatTotal)
  // מע״מ לתשלום = עסקאות − תשומות. ערך שלילי = החזר שמגיע מהמדינה, ולא אפס.
  const vatPayable = roundMoney(incomeVat - expenseInputVat)
  // רווח גולמי = הכנסות (כולל מע״מ) − הוצאות (כולל מע״מ), לפני קיזוז מע״מ מול המדינה
  const grossProfit = roundMoney(incomeGross - expenseGrossTotal)
  // רווח נקי אמיתי = הכנסות נטו − הוצאות נטו. המע״מ אינו חלק מהרווח.
  const trueNetProfit = roundMoney(incomeNet - expenseNetTotal)

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
  /** הכנסות כולל מע״מ */
  incomeGross: number
  /** הוצאות כולל מע״מ */
  expenseGross: number
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
  const countableExpenses = expensesForFinancialTotals(expenses)
  const rows: ProfitLossRow[] = []

  // עד החודש הנוכחי בלבד — בשנה הנוכחית לא מציגים חודשים עתידיים
  const now = new Date()
  const lastMonth =
    year === now.getFullYear() ? now.getMonth() + 1 : 12

  for (let month = 1; month <= lastMonth; month += 1) {
    const ym = `${year}-${String(month).padStart(2, '0')}`

    let incomeGross = 0
    let incomeNet = 0
    let incomeVat = 0
    for (const inc of incomes) {
      if (!incomeAppliesToMonth(inc, ym)) continue
      if (isActualIncome(inc)) {
        const vat = resolveIncomeVat(inc)
        incomeGross += vat.gross
        incomeNet += vat.net
        incomeVat += vat.vat
      }
    }

    let expenseGross = 0
    let expenseNet = 0
    let expenseInputVat = 0
    let fixedExpenses = 0
    let supplierExpenses = 0
    let platformExpenses = 0
    for (const raw of countableExpenses) {
      const def = resolveExpenseType(raw.type, typeMap)
      if (!expenseAppliesToMonth(raw, ym, def)) continue
      // תשלום פרוס נספר לפי המנה החודשית שלו, לא במלוא הסכום
      const exp = isSpreadExpense(raw) ? expenseRowForMonth(raw, ym) : raw
      if (!exp) continue
      const breakdown = resolveExpenseRowVat(exp)
      expenseGross += breakdown.gross
      expenseNet += breakdown.net
      if (resolveExpenseVatClass(exp) === 'vat_liable') {
        expenseInputVat += breakdown.vat
      }
      if (def.pnlCategory === 'fixed') fixedExpenses += breakdown.net
      else if (def.pnlCategory === 'supplier') supplierExpenses += breakdown.net
      else platformExpenses += breakdown.net
    }

    incomeGross = roundMoney(incomeGross)
    incomeNet = roundMoney(incomeNet)
    incomeVat = roundMoney(incomeVat)
    expenseGross = roundMoney(expenseGross)
    expenseNet = roundMoney(expenseNet)
    expenseInputVat = roundMoney(expenseInputVat)
    // ערך שלילי = החזר מע״מ שמגיע מהמדינה
    const vatPayable = roundMoney(incomeVat - expenseInputVat)
    const grossProfit = roundMoney(incomeGross - expenseGross)
    // רווח נקי = הכנסות נטו − הוצאות נטו. המע״מ אינו חלק מהרווח.
    const trueNetProfit = roundMoney(incomeNet - expenseNet)
    const totalExpenses = expenseNet
    const profitMargin =
      incomeNet > 0 ? roundMoney((trueNetProfit / incomeNet) * 1000) / 10 : 0

    rows.push({
      ym,
      label: monthLabelHe(ym),
      incomeGross,
      expenseGross,
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

  // חיתוך חודשים מובילים ריקים — מתחילים מהחודש הראשון עם פעילות
  const firstActive = rows.findIndex(
    (r) => r.incomeGross !== 0 || r.expenseGross !== 0,
  )
  const trimmed = firstActive > 0 ? rows.slice(firstActive) : rows

  return trimmed.reverse()
}

/** הכנסות שנספרו בדוח רווח והפסד לחודש — אותה לוגיקה כמו computeProfitLossRows */
export function profitLossIncomesForMonth(
  incomes: FinanceIncome[],
  ym: string,
): FinanceIncome[] {
  return incomes.filter(
    (inc) => incomeAppliesToMonth(inc, ym) && isActualIncome(inc),
  )
}

/** הוצאות שנספרו בדוח רווח והפסד לחודש — אותה לוגיקה כמו computeProfitLossRows */
export function profitLossExpensesForMonth(
  expenses: FinanceExpense[],
  expenseTypes: FinanceExpenseTypeDef[],
  ym: string,
): FinanceExpense[] {
  const typeMap = expenseTypeMap(expenseTypes)
  return expensesForFinancialTotals(expenses).filter((exp) => {
    const def = resolveExpenseType(exp.type, typeMap)
    return expenseAppliesToMonth(exp, ym, def)
  })
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
