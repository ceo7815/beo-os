import type { FinanceExpense, FinanceHostingType, FinanceIncome } from '../types'
import { resolveExpenseRowVat, resolveIncomeVat } from './israeliVat'
import { resolveExpenseVatClass } from './financeExpenseVat'
import { isHostingIncome, resolveHostingType } from './financeHostingTypes'
import { incomeDocumentKind, isActualIncome } from './financeIncomeDocument'
import { incomePaymentDate } from './financeIncomePayment'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** תאריך עוגן להכנסת אחסון — תשלום למסמכי מס-קבלה/קבלה, אחרת תאריך החשבונית */
function hostingIncomeDate(inc: FinanceIncome): string {
  const kind = incomeDocumentKind(inc)
  if (kind === 'tax_invoice_receipt' || kind === 'receipt') {
    return incomePaymentDate(inc)
  }
  return inc.invoiceDate
}

export type HostingClientRow = {
  clientId: string
  gross: number
  net: number
  monthlyGross: number
  yearlyGross: number
  portalGross: number
  /** הכנסה חודשית חוזרת מוערכת (run-rate) ללקוח */
  mrr: number
  count: number
  lastDate: string
}

export type HostingFinance = {
  /** מסמכי הכנסת אחסון (כל הסוגים — לתצוגה) */
  incomeRows: FinanceIncome[]
  /** הוצאות אחסון */
  expenseRows: FinanceExpense[]

  incomeGross: number
  incomeVat: number
  incomeNet: number
  byType: Record<FinanceHostingType, number>

  /** הכנסה חודשית חוזרת (run-rate) + שנתית */
  mrr: number
  arr: number
  activeClients: number

  expenseGross: number
  expenseInputVat: number
  expenseNet: number

  vatPayable: number
  grossProfit: number
  trueNetProfit: number

  clients: HostingClientRow[]
}

export type HostingFinanceOptions = {
  /** סינון לפי סוגי אחסון (ברירת מחדל: כל הסוגים) */
  types?: FinanceHostingType[]
  /** האם לכלול הוצאות מתויגות כאחסון (ברירת מחדל: true) */
  includeExpenses?: boolean
}

/**
 * מחשב את התמונה הפיננסית של האחסון: הכנסות אחסון (לפי סוג), MRR/ARR,
 * הוצאות מתויגות כאחסון, רווח, ופירוט לקוחות.
 * ניתן לסנן לפי סוגי אחסון (למשל פורטל בלבד מול אחסון אתרים).
 */
export function computeHostingFinance(
  incomes: FinanceIncome[],
  expenses: FinanceExpense[],
  options?: HostingFinanceOptions,
): HostingFinance {
  const allowed = new Set<FinanceHostingType>(
    options?.types ?? ['monthly', 'yearly', 'portal_monthly'],
  )
  const includeExpenses = options?.includeExpenses !== false

  const incomeRows = incomes.filter((i) => {
    if (!isHostingIncome(i)) return false
    const t = resolveHostingType(i)
    return t ? allowed.has(t) : false
  })
  // לחישובי הכנסה — רק מסמכי הכנסה אמיתיים (מס-קבלה / מס / זיכוי), בלי כפל קבלות
  const revenueRows = incomeRows.filter((i) => isActualIncome(i))
  const expenseRows = includeExpenses
    ? expenses.filter((e) => e.hostingExpense === true)
    : []

  let incomeGross = 0
  let incomeVat = 0
  let incomeNet = 0
  const byType: Record<FinanceHostingType, number> = {
    monthly: 0,
    yearly: 0,
    portal_monthly: 0,
  }

  // צבירת MRR — לפי המסמך האחרון של כל (לקוח × סוג)
  const latestByKey = new Map<string, { date: string; gross: number; type: FinanceHostingType }>()
  // צבירת לקוחות
  const clientMap = new Map<string, HostingClientRow>()

  for (const row of revenueRows) {
    const vat = resolveIncomeVat(row)
    incomeGross += vat.gross
    incomeVat += vat.vat
    incomeNet += vat.net

    const type = resolveHostingType(row)
    if (type) byType[type] += vat.gross

    const date = hostingIncomeDate(row)
    const clientId = row.clientId || ''

    if (type) {
      const key = `${clientId}|${type}`
      const prev = latestByKey.get(key)
      if (!prev || date > prev.date) {
        latestByKey.set(key, { date, gross: vat.gross, type })
      }
    }

    const c =
      clientMap.get(clientId) ?? {
        clientId,
        gross: 0,
        net: 0,
        monthlyGross: 0,
        yearlyGross: 0,
        portalGross: 0,
        mrr: 0,
        count: 0,
        lastDate: '',
      }
    c.gross += vat.gross
    c.net += vat.net
    c.count += 1
    if (date > c.lastDate) c.lastDate = date
    if (type === 'monthly') c.monthlyGross += vat.gross
    else if (type === 'yearly') c.yearlyGross += vat.gross
    else if (type === 'portal_monthly') c.portalGross += vat.gross
    clientMap.set(clientId, c)
  }

  // MRR לפי run-rate מהמסמך האחרון בכל סוג
  let mrr = 0
  for (const [key, v] of latestByKey) {
    const clientId = key.split('|')[0] ?? ''
    const monthly =
      v.type === 'yearly' ? v.gross / 12 : v.gross
    mrr += monthly
    const c = clientMap.get(clientId)
    if (c) c.mrr += monthly
  }

  let expenseGross = 0
  let expenseInputVat = 0
  let expenseNet = 0
  for (const row of expenseRows) {
    const breakdown = resolveExpenseRowVat(row)
    expenseGross += breakdown.gross
    expenseNet += breakdown.net
    if (resolveExpenseVatClass(row) === 'vat_liable') {
      expenseInputVat += breakdown.vat
    }
  }

  incomeGross = round2(incomeGross)
  incomeVat = round2(incomeVat)
  incomeNet = round2(incomeNet)
  expenseGross = round2(expenseGross)
  expenseInputVat = round2(expenseInputVat)
  expenseNet = round2(expenseNet)

  // מע״מ שלילי הוא החזר שמגיע מהמדינה ולא אפס — זהה לחישוב בדוח הראשי
  const vatPayable = round2(incomeVat - expenseInputVat)
  const grossProfit = round2(incomeGross - expenseGross)
  const trueNetProfit = round2(grossProfit - vatPayable)

  const clients = [...clientMap.values()]
    .map((c) => ({
      ...c,
      gross: round2(c.gross),
      net: round2(c.net),
      monthlyGross: round2(c.monthlyGross),
      yearlyGross: round2(c.yearlyGross),
      portalGross: round2(c.portalGross),
      mrr: round2(c.mrr),
    }))
    .sort((a, b) => b.gross - a.gross)

  return {
    incomeRows,
    expenseRows,
    incomeGross,
    incomeVat,
    incomeNet,
    byType: {
      monthly: round2(byType.monthly),
      yearly: round2(byType.yearly),
      portal_monthly: round2(byType.portal_monthly),
    },
    mrr: round2(mrr),
    arr: round2(mrr * 12),
    activeClients: clientMap.size,
    expenseGross,
    expenseInputVat,
    expenseNet,
    vatPayable,
    grossProfit,
    trueNetProfit,
    clients,
  }
}
