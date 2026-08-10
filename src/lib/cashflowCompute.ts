import { formatDateIL, todayYmd } from './dates'
import { isOpenTransactionAccount } from './financeIncomeDocument'
import { incomeOutstandingAmount } from './financeIncomePayment'
import { resolveCollectionForecastEntries } from './expectedCollectionSchedule'
import { computeProfitLossRows } from './financeCalc'
import { addMonths, compareYm, monthsInRange } from './financeMonthRange'
import type {
  FinanceCashflowExpectedExpense,
  FinanceCashflowVatEstimate,
  FinanceExpense,
  FinanceExpenseTypeDef,
  FinanceFixedExpenseCatalogItem,
  FinanceGiRecurringPayment,
  FinanceGiRetainer,
  FinanceIncome,
} from '../types'
import {
  catalogItemCashflowDate,
  catalogItemLabel,
  isCreditCardCatalogItem,
} from './fixedExpenses'

export type CashflowLineKind =
  | 'opening_balance'
  | 'gi_standing_order'
  | 'gi_retainer'
  | 'collection_txn'
  | 'expense_recurring'
  | 'expense_expected'
  | 'vat_payment'

export type CashflowConfidence = 'high' | 'medium' | 'manual'

export type CashflowLine = {
  id: string
  date: string
  amount: number
  kind: CashflowLineKind
  label: string
  clientId?: string
  sourceId?: string
  confidence: CashflowConfidence
}

export type CashflowDailyBalance = {
  date: string
  balance: number
  inflow: number
  outflow: number
}

export type CashflowForecast = {
  lines: CashflowLine[]
  dailyBalances: CashflowDailyBalance[]
  summary: {
    openingBalance: number
    endBalance: number
    minBalance: number
    minBalanceDate: string
    totalIn: number
    totalOut: number
  }
  missingExpectedDates: number
}

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

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function ymLastDay(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  const last = new Date(y, m, 0)
  const day = String(last.getDate()).padStart(2, '0')
  return `${y}-${String(m).padStart(2, '0')}-${day}`
}

function addMonthsToYmd(ymd: string, deltaMonths: number): string {
  const part = ymd.slice(0, 10)
  const [y, m, d] = part.split('-').map(Number)
  if (!y || !m || !d) return ymd
  const target = new Date(y, m - 1 + deltaMonths, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  const day = Math.min(d, lastDay)
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function subtractMonthsFromYmd(ymd: string, deltaMonths: number): string {
  return addMonthsToYmd(ymd, -deltaMonths)
}

function parseRetainerIntervalMonths(interval: string): number {
  const s = interval.trim().toLowerCase()
  const m = s.match(/^(\d+)m$/)
  if (m) return Math.max(1, Number(m[1]))
  const y = s.match(/^(\d+)y$/)
  if (y) return Math.max(1, Number(y[1]) * 12)
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : 1
}

function isGiRecurringActive(row: FinanceGiRecurringPayment): boolean {
  const st = String(row.status ?? '').trim().toLowerCase()
  if (!st) return row.amount > 0
  return !GI_RECURRING_INACTIVE.has(st)
}

function isGiRetainerActive(row: FinanceGiRetainer): boolean {
  const st = String(row.status ?? '').trim().toLowerCase()
  if (!st) return row.amount > 0
  return !GI_RETAINER_INACTIVE.has(st)
}

function projectDates(
  anchorYmd: string,
  intervalMonths: number,
  asOfDate: string,
  horizonEnd: string,
  endDate?: string,
): string[] {
  const out: string[] = []
  let cur = anchorYmd.slice(0, 10)
  const cap = endDate?.slice(0, 10) ?? horizonEnd
  let guard = 0
  while (cur <= horizonEnd && cur <= cap && guard < 120) {
    if (cur >= asOfDate) out.push(cur)
    cur = addMonthsToYmd(cur, intervalMonths)
    guard += 1
  }
  return out
}

/** הוצאה בכרטיס — יורדת מהבנק ב-2 לחודש שלאחר חודש החיוב */
function isCreditCardExpense(exp: FinanceExpense): boolean {
  if (exp.paymentMethod === 'credit_card') return true
  const billingYm = exp.billingMonth?.slice(0, 7)
  const chargeYmd = exp.chargeDate?.trim().slice(0, 10)
  if (billingYm && chargeYmd && chargeYmd.slice(0, 7) > billingYm) return true
  return false
}

/** תאריך יציאה מהבנק להוצאה צפויה ידנית */
function expectedExpenseCashflowDate(exp: FinanceCashflowExpectedExpense): string {
  const txnDate = exp.expectedDate.trim().slice(0, 10)
  if (exp.paymentMethod === 'credit_card') {
    return `${addMonths(txnDate.slice(0, 7), 1)}-02`
  }
  return txnDate
}

/** מע״מ: חיוב בכרטיס ב-15 לחודש שלאחר חודש העסקאות, ירידה מהבנק ב-2 לחודש שאחריו */
function vatPaymentCashflowDates(vatYm: string): {
  bankDate: string
  cardChargeDate: string
} {
  const cardChargeYm = addMonths(vatYm, 1)
  return {
    cardChargeDate: `${cardChargeYm}-15`,
    bankDate: `${addMonths(cardChargeYm, 1)}-02`,
  }
}

function vatPayableByMonth(
  incomes: FinanceIncome[],
  expenses: FinanceExpense[],
  expenseTypes: FinanceExpenseTypeDef[],
  ymFrom: string,
  ymTo: string,
): Map<string, number> {
  const map = new Map<string, number>()
  const years = new Set<number>()
  for (const ym of monthsInRange(ymFrom, ymTo, 36)) {
    years.add(Number(ym.slice(0, 4)))
  }
  for (const year of years) {
    for (const row of computeProfitLossRows(incomes, expenses, expenseTypes, year)) {
      if (compareYm(row.ym, ymFrom) >= 0 && compareYm(row.ym, ymTo) <= 0) {
        map.set(row.ym, row.vatPayable)
      }
    }
  }
  return map
}

function aggregateDaily(
  lines: CashflowLine[],
  openingBalance: number,
  asOfDate: string,
  rangeEnd: string,
): CashflowDailyBalance[] {
  const byDay = new Map<string, { inflow: number; outflow: number }>()
  for (const line of lines) {
    if (line.kind === 'opening_balance') continue
    if (line.date < asOfDate || line.date > rangeEnd) continue
    const slot = byDay.get(line.date) ?? { inflow: 0, outflow: 0 }
    if (line.amount >= 0) slot.inflow += line.amount
    else slot.outflow += Math.abs(line.amount)
    byDay.set(line.date, slot)
  }

  const days: string[] = []
  let cur = asOfDate
  while (cur <= rangeEnd) {
    days.push(cur)
    const next = new Date(`${cur}T12:00:00`)
    next.setDate(next.getDate() + 1)
    cur = next.toISOString().slice(0, 10)
  }

  let balance = openingBalance
  const daily: CashflowDailyBalance[] = []

  for (const date of days) {
    const slot = byDay.get(date)
    const inflow = slot?.inflow ?? 0
    const outflow = slot?.outflow ?? 0
    balance = roundMoney(balance + inflow - outflow)
    daily.push({ date, balance, inflow: roundMoney(inflow), outflow: roundMoney(outflow) })
  }

  return daily
}

function collectionClientLabel(
  inc: FinanceIncome,
  clientNames?: Map<string, string>,
): string {
  const fromMap =
    inc.clientId?.trim() && clientNames?.get(inc.clientId.trim())
  return (
    fromMap?.trim() ||
    inc.greenInvoiceClientName?.trim() ||
    'לקוח'
  )
}

export function computeCashflowForecast(input: {
  openingBalance: number
  asOfDate: string
  ymFrom: string
  ymTo: string
  giRecurring: FinanceGiRecurringPayment[]
  giRetainers: FinanceGiRetainer[]
  incomes: FinanceIncome[]
  expenses: FinanceExpense[]
  expenseTypes: FinanceExpenseTypeDef[]
  /** שמות לקוחות לפי clientId — לתצוגת גבייה ביומן */
  clientNames?: Map<string, string>
  /** הוצאות צפויות ידניות */
  expectedExpenses?: FinanceCashflowExpectedExpense[]
  /** ערכי אומדן מע״מ — דורסים את החישוב האוטומטי */
  vatEstimates?: FinanceCashflowVatEstimate[]
  /** קטלוג הוצאות קבועות מאושר — מקור יחיד לתזרים */
  fixedExpenseCatalog?: FinanceFixedExpenseCatalogItem[]
}): CashflowForecast {
  const asOfDate = input.asOfDate.slice(0, 10) || todayYmd()
  const { from: ymFrom, to: ymTo } = {
    from: input.ymFrom.slice(0, 7),
    to: input.ymTo.slice(0, 7),
  }
  const rangeStart = ymFrom ? `${ymFrom}-01` : asOfDate
  const rangeEnd = ymTo ? ymLastDay(ymTo) : addMonthsToYmd(asOfDate, 6)
  const horizonRecurringEnd = addMonthsToYmd(asOfDate, 6)
  const horizonRetainerEnd = addMonthsToYmd(asOfDate, 12)
  const txnCutoff = subtractMonthsFromYmd(asOfDate, 6)

  const lines: CashflowLine[] = []

  lines.push({
    id: 'opening',
    date: asOfDate,
    amount: 0,
    kind: 'opening_balance',
    label: 'יתרת פתיחה',
    confidence: 'manual',
  })

  for (const row of input.giRecurring) {
    if (!isGiRecurringActive(row) || row.amount <= 0) continue
    const interval = row.intervalMonths > 0 ? row.intervalMonths : 1
    const anchor =
      row.nextChargeDate?.slice(0, 10) ||
      row.startDate?.slice(0, 10) ||
      asOfDate
    const dates = projectDates(
      anchor,
      interval,
      asOfDate,
      horizonRecurringEnd,
      row.endDate,
    )
    for (const [i, date] of dates.entries()) {
      if (date < rangeStart || date > rangeEnd) continue
      lines.push({
        id: `so-${row.id}-${i}`,
        date,
        amount: roundMoney(row.amount),
        kind: 'gi_standing_order',
        label: `הוראת קבע · ${row.clientName}`,
        clientId: row.clientId,
        sourceId: row.greenInvoiceId,
        confidence: row.nextChargeDate ? 'high' : 'medium',
      })
    }
  }

  for (const row of input.giRetainers) {
    if (!isGiRetainerActive(row) || row.amount <= 0) continue
    const intervalMonths = parseRetainerIntervalMonths(row.interval)
    const anchor =
      row.nextJobDate?.slice(0, 10) ||
      row.startDate?.slice(0, 10) ||
      asOfDate
    const dates = projectDates(
      anchor,
      intervalMonths,
      asOfDate,
      horizonRetainerEnd,
      row.endDate,
    )
    for (const [i, date] of dates.entries()) {
      if (date < rangeStart || date > rangeEnd) continue
      lines.push({
        id: `rt-${row.id}-${i}`,
        date,
        amount: roundMoney(row.amount),
        kind: 'gi_retainer',
        label: `ריטיינר · ${row.clientName}`,
        clientId: row.clientId,
        sourceId: row.greenInvoiceId,
        confidence: row.nextJobDate ? 'high' : 'medium',
      })
    }
  }

  let missingExpectedDates = 0
  for (const inc of input.incomes) {
    if (!isOpenTransactionAccount(inc)) continue
    if (inc.invoiceDate.slice(0, 10) < txnCutoff) continue
    const outstanding = incomeOutstandingAmount(inc)
    if (outstanding <= 0) continue
    const entries = resolveCollectionForecastEntries(inc, outstanding)
    if (entries.length === 0) {
      missingExpectedDates += 1
      continue
    }
    const clientLabel = collectionClientLabel(inc, input.clientNames)
    entries.forEach((entry, i) => {
      if (entry.date < rangeStart || entry.date > rangeEnd) return
      lines.push({
        id: `txn-${inc.id}-${i}`,
        date: entry.date,
        amount: roundMoney(entry.amount),
        kind: 'collection_txn',
        label:
          entries.length > 1
            ? `גבייה (${i + 1}/${entries.length}) · ${clientLabel}`
            : `גבייה · ${clientLabel}`,
        clientId: inc.clientId || undefined,
        sourceId: inc.id,
        confidence: 'manual',
      })
    })
  }

  for (const item of input.fixedExpenseCatalog ?? []) {
    if (item.amount <= 0) continue
    for (const ym of monthsInRange(ymFrom || asOfDate.slice(0, 7), ymTo, 36)) {
      const date = catalogItemCashflowDate(item, ym)
      if (date < asOfDate || date < rangeStart || date > rangeEnd) continue
      lines.push({
        id: `exp-catalog-${item.id}-${ym}`,
        date,
        amount: -roundMoney(item.amount),
        kind: 'expense_recurring',
        label: `הוצאה קבועה · ${catalogItemLabel(item)}`,
        sourceId: item.id,
        confidence: isCreditCardCatalogItem(item) ? 'high' : 'medium',
      })
    }
  }

  for (const exp of input.expectedExpenses ?? []) {
    if (exp.amount <= 0) continue
    const date = expectedExpenseCashflowDate(exp)
    if (!date || date < asOfDate || date < rangeStart || date > rangeEnd) continue
    lines.push({
      id: `exp-expected-${exp.id}`,
      date,
      amount: -roundMoney(exp.amount),
      kind: 'expense_expected',
      label: `הוצאה צפויה · ${exp.name.trim() || 'ללא שם'}`,
      sourceId: exp.id,
      confidence: exp.paymentMethod === 'credit_card' ? 'high' : 'manual',
    })
  }

  const vatOverrideByYm = new Map(
    (input.vatEstimates ?? []).map((e) => [e.vatYm.slice(0, 7), e]),
  )
  const vatYmFrom = addMonths(ymFrom || asOfDate.slice(0, 7), -2)
  const vatMap = vatPayableByMonth(
    input.incomes,
    input.expenses,
    input.expenseTypes,
    vatYmFrom,
    ymTo || addMonths(asOfDate.slice(0, 7), 12),
  )
  for (const [ym, computedVat] of vatMap) {
    const override = vatOverrideByYm.get(ym)
    const payable = override?.amount ?? Math.max(0, computedVat)
    if (payable <= 0) continue
    const { bankDate } = vatPaymentCashflowDates(ym)
    if (bankDate < asOfDate || bankDate < rangeStart || bankDate > rangeEnd) continue
    lines.push({
      id: `vat-${ym}`,
      date: bankDate,
      amount: -roundMoney(payable),
      kind: 'vat_payment',
      label: `אומדן מע״מ · ${ym}`,
      sourceId: ym,
      confidence: override ? 'manual' : 'medium',
    })
  }

  lines.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label, 'he'))

  const dailyBalances = aggregateDaily(lines, input.openingBalance, asOfDate, rangeEnd)
  const endBalance =
    dailyBalances.length > 0
      ? dailyBalances[dailyBalances.length - 1]!.balance
      : input.openingBalance
  let minBalance = input.openingBalance
  let minBalanceDate = asOfDate
  for (const d of dailyBalances) {
    if (d.balance < minBalance) {
      minBalance = d.balance
      minBalanceDate = d.date
    }
  }

  let totalIn = 0
  let totalOut = 0
  for (const line of lines) {
    if (line.kind === 'opening_balance') continue
    if (line.amount >= 0) totalIn += line.amount
    else totalOut += Math.abs(line.amount)
  }

  return {
    lines,
    dailyBalances,
    summary: {
      openingBalance: roundMoney(input.openingBalance),
      endBalance: roundMoney(endBalance),
      minBalance: roundMoney(minBalance),
      minBalanceDate,
      totalIn: roundMoney(totalIn),
      totalOut: roundMoney(totalOut),
    },
    missingExpectedDates,
  }
}

export const CASHFLOW_KIND_LABEL: Record<CashflowLineKind, string> = {
  opening_balance: 'יתרת פתיחה',
  gi_standing_order: 'הוראת קבע',
  gi_retainer: 'ריטיינר',
  collection_txn: 'גבייה',
  expense_recurring: 'הוצאה קבועה',
  expense_expected: 'הוצאה צפויה',
  vat_payment: 'מע״מ',
}

const CONFIDENCE_NOTE: Record<CashflowConfidence, string> = {
  high: 'צפי גבוה',
  medium: 'צפי משוער',
  manual: 'תאריך צפי ידני',
}

const DEFAULT_PAYMENT_METHOD: Record<CashflowLineKind, string> = {
  opening_balance: '—',
  gi_standing_order: 'כרטיס אשראי (הוראת קבע)',
  gi_retainer: 'חשבונית ירוקה',
  collection_txn: 'העברה בנקאית',
  expense_recurring: 'הוראת קבע / העברה',
  expense_expected: 'העברה בנקאית',
  vat_payment: 'כרטיס אשראי',
}

export type CashflowLedgerRow = {
  id: string
  date: string
  kind: CashflowLineKind
  category: string
  description: string
  inflow: number
  outflow: number
  balance: number
  paymentMethod: string
  notes: string
  /** חודש מע״מ — לעריכה ישירה בטבלה */
  sourceId?: string
  editable?: boolean
}

const PAYMENT_LABEL: Record<string, string> = {
  bank_transfer: 'העברה בנקאית',
  credit_card: 'כרטיס אשראי',
}

/** טבלת יומן — כל התנועות לפי תאריך עם יתרה רצה */
export function buildCashflowLedger(input: {
  forecast: CashflowForecast
  asOfDate: string
  incomes?: FinanceIncome[]
  expenses?: FinanceExpense[]
  expectedExpenses?: FinanceCashflowExpectedExpense[]
  vatEstimates?: FinanceCashflowVatEstimate[]
  fixedExpenseCatalog?: FinanceFixedExpenseCatalogItem[]
}): CashflowLedgerRow[] {
  const asOf = input.asOfDate.slice(0, 10)
  const incomeById = new Map((input.incomes ?? []).map((i) => [i.id, i]))
  const expenseById = new Map((input.expenses ?? []).map((e) => [e.id, e]))
  const expectedExpenseById = new Map(
    (input.expectedExpenses ?? []).map((e) => [e.id, e]),
  )
  const vatOverrideByYm = new Map(
    (input.vatEstimates ?? []).map((e) => [e.vatYm.slice(0, 7), e]),
  )
  const catalogById = new Map(
    (input.fixedExpenseCatalog ?? []).map((item) => [item.id, item]),
  )

  let balance = input.forecast.summary.openingBalance
  const rows: CashflowLedgerRow[] = [
    {
      id: 'ledger-opening',
      date: asOf,
      kind: 'opening_balance',
      category: CASHFLOW_KIND_LABEL.opening_balance,
      description: 'יתרת פתיחה',
      inflow: 0,
      outflow: 0,
      balance: roundMoney(balance),
      paymentMethod: '—',
      notes: '',
    },
  ]

  const txLines = input.forecast.lines.filter((l) => l.kind !== 'opening_balance')
  for (const line of txLines) {
    const inflow = line.amount >= 0 ? line.amount : 0
    const outflow = line.amount < 0 ? Math.abs(line.amount) : 0
    balance = roundMoney(balance + inflow - outflow)

    let paymentMethod = DEFAULT_PAYMENT_METHOD[line.kind]
    const noteParts: string[] =
      line.kind === 'vat_payment' ? [] : [CONFIDENCE_NOTE[line.confidence]]

    if (line.kind === 'collection_txn' && line.sourceId) {
      const inc = incomeById.get(line.sourceId)
      if (inc?.paymentMethod) {
        paymentMethod = PAYMENT_LABEL[inc.paymentMethod] ?? paymentMethod
      }
      if (inc?.description?.trim()) noteParts.push(inc.description.trim())
    }
    if (line.kind === 'expense_recurring' && line.sourceId) {
      const catalogItem = catalogById.get(line.sourceId)
      if (catalogItem) {
        paymentMethod =
          PAYMENT_LABEL[catalogItem.paymentMethod] ?? paymentMethod
        if (isCreditCardCatalogItem(catalogItem)) {
          noteParts.push(`חיוב כרטיס ${formatDateIL(line.date)}`)
        } else {
          noteParts.push(`יום ${catalogItem.dayOfMonth} בחודש`)
        }
        noteParts.push(catalogItemLabel(catalogItem))
      } else {
        const exp = expenseById.get(line.sourceId)
        if (exp?.paymentMethod) {
          paymentMethod = PAYMENT_LABEL[exp.paymentMethod] ?? paymentMethod
        }
        if (exp && isCreditCardExpense(exp)) {
          noteParts.push(`חיוב כרטיס ${formatDateIL(line.date)}`)
        } else if (exp?.chargeDate?.trim()) {
          noteParts.push(`חיוב ${formatDateIL(exp.chargeDate.slice(0, 10))}`)
        }
        const expNote =
          exp?.description?.trim() ||
          exp?.name?.trim() ||
          exp?.supplierName?.trim()
        if (expNote) noteParts.push(expNote)
      }
    }
    if (line.kind === 'expense_expected' && line.sourceId) {
      const manual = expectedExpenseById.get(line.sourceId)
      if (manual?.paymentMethod) {
        paymentMethod = PAYMENT_LABEL[manual.paymentMethod] ?? paymentMethod
      }
      if (manual?.paymentMethod === 'credit_card' && manual.expectedDate?.trim()) {
        noteParts.push(
          `עסקה ${formatDateIL(manual.expectedDate.slice(0, 10))} · חיוב כרטיס ${formatDateIL(line.date)}`,
        )
      } else if (manual?.expectedDate?.trim()) {
        noteParts.push(`תאריך צפוי ${formatDateIL(manual.expectedDate.slice(0, 10))}`)
      }
      if (manual?.notes?.trim()) noteParts.push(manual.notes.trim())
    }
    if (line.kind === 'vat_payment' && line.sourceId) {
      paymentMethod = PAYMENT_LABEL.credit_card ?? paymentMethod
      const { cardChargeDate } = vatPaymentCashflowDates(line.sourceId)
      noteParts.push('אומדן בלבד')
      noteParts.push(`חיוב כרטיס ${formatDateIL(cardChargeDate)}`)
      noteParts.push(`מע״מ חודש ${line.sourceId}`)
      const override = vatOverrideByYm.get(line.sourceId)
      if (override) noteParts.push('סכום עודכן ידנית')
      if (override?.notes?.trim()) noteParts.push(override.notes.trim())
    }

    rows.push({
      id: line.id,
      date: line.date,
      kind: line.kind,
      category: CASHFLOW_KIND_LABEL[line.kind],
      description: line.label,
      inflow: roundMoney(inflow),
      outflow: roundMoney(outflow),
      balance,
      paymentMethod,
      notes: noteParts.filter(Boolean).join(' · '),
      sourceId: line.sourceId,
      editable: line.kind === 'vat_payment',
    })
  }

  return rows
}
