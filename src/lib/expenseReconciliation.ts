import type {
  ExpenseReconciliationStatus,
  FinanceExpense,
  GiExpenseDocKind,
} from '../types'
import { addMonths } from './financeCalc'
import { merchantKey } from './bankImport/matching'

export type ExpenseReconciliationSummary = {
  matched: number
  bankMissingDocument: number
  giUnpaid: number
  documentNotRequired: number
  manualPending: number
  manualOk: number
  totalBank: number
  totalGi: number
}

export const RECONCILIATION_STATUS_LABEL: Record<
  ExpenseReconciliationStatus,
  string
> = {
  matched: 'התאמה מלאה',
  bank_missing_document: 'חסר בחשבונית ירוקה',
  gi_unpaid: 'מסמך GI ללא תשלום בבנק',
  document_not_required: 'לא נדרש מסמך',
  manual_ok: 'ידני — תקין',
  manual_pending: 'ידני — חסר מסמך',
}

export const GI_DOC_KIND_LABEL: Record<GiExpenseDocKind, string> = {
  invoice: 'חשבונית מס',
  receipt: 'קבלה',
  invoice_receipt: 'חשבונית מס + קבלה',
  other: 'מסמך אחר',
}

/** סוגי הוצאה שבדרך כלל אין להם חשבונית מס ב-GI */
const GI_EXEMPT_TYPE_IDS = new Set(['bank_fee'])

const AMOUNT_TOLERANCE = 0.05
const AMOUNT_PERCENT_TOLERANCE = 0.025

export type ExpensePair = {
  bank: FinanceExpense
  gi: FinanceExpense
  score: number
}

export type ReconciledExpenseRow = {
  expense: FinanceExpense
  status: ExpenseReconciliationStatus
  linkedGi?: FinanceExpense
}

export function expenseMerchantKey(raw: string): string {
  let s = raw.trim().toLowerCase()
  s = s.split('*')[0] ?? s
  s = s.replace(/בע["״']?מ/g, '')
  s = s.replace(/בעמ/g, '')
  return merchantKey(s)
}

function expenseLabel(exp: FinanceExpense): string {
  return (
    exp.greenInvoiceSupplierName ??
    exp.supplierName ??
    exp.name ??
    exp.description ??
    ''
  )
}

function expenseDate(exp: FinanceExpense): string {
  return exp.paidDate ?? `${exp.billingMonth}-15`
}

function daysApart(a: string, b: string): number {
  const da = Date.parse(`${a.slice(0, 10)}T12:00:00`)
  const db = Date.parse(`${b.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(da) || Number.isNaN(db)) return 999
  return Math.abs(da - db) / (24 * 60 * 60 * 1000)
}

export function amountsMatch(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false
  if (Math.abs(a - b) <= AMOUNT_TOLERANCE) return true
  const base = Math.max(a, b)
  return Math.abs(a - b) / base <= AMOUNT_PERCENT_TOLERANCE
}

function amountCandidates(exp: FinanceExpense): number[] {
  const vals: number[] = []
  if (exp.amount > 0) vals.push(exp.amount)
  if (exp.amountBeforeVat && exp.amountBeforeVat > 0) {
    vals.push(exp.amountBeforeVat)
  }
  if (exp.vatAmount && exp.vatAmount > 0 && exp.amount > exp.vatAmount) {
    vals.push(Math.round((exp.amount - exp.vatAmount) * 100) / 100)
  }
  return [...new Set(vals.map((v) => Math.round(v * 100) / 100))]
}

export function amountsCompatible(
  bank: FinanceExpense,
  gi: FinanceExpense,
): boolean {
  for (const ba of amountCandidates(bank)) {
    for (const ga of amountCandidates(gi)) {
      if (amountsMatch(ba, ga)) return true
    }
  }
  return false
}

function monthsCompatible(a: string, b: string): boolean {
  if (a === b) return true
  return addMonths(a, -1) === b || addMonths(a, 1) === b
}

function ymInRange(ym: string, from: string, to: string): boolean {
  return ym >= from && ym <= to
}

function tokenOverlap(a: string, b: string): boolean {
  const ta = new Set(a.split(' ').filter((t) => t.length >= 3))
  const tb = new Set(b.split(' ').filter((t) => t.length >= 3))
  for (const t of ta) {
    if (tb.has(t)) return true
  }
  return false
}

function suppliersCompatible(
  bank: FinanceExpense,
  gi: FinanceExpense,
): boolean {
  const bk = expenseMerchantKey(expenseLabel(bank))
  const gk = expenseMerchantKey(expenseLabel(gi))
  if (!bk || !gk) return false
  return (
    bk === gk ||
    bk.includes(gk) ||
    gk.includes(bk) ||
    tokenOverlap(bk, gk)
  )
}

/** האם מותר להציג מסמך GI לשורת בנק — רק עם התאמה מאומתת לפי שם ספק */
export function canViewGiExpenseDocument(
  row: FinanceExpense,
  linkedGi?: FinanceExpense,
): boolean {
  if (!linkedGi?.greenInvoiceId) return false
  return suppliersCompatible(row, linkedGi)
}

export function scoreExpensePair(
  bank: FinanceExpense,
  gi: FinanceExpense,
  _allBank: FinanceExpense[],
  _allGi: FinanceExpense[],
): number {
  if (!amountsCompatible(bank, gi)) return -1
  if (!suppliersCompatible(bank, gi)) return -1

  const sameMonth = bank.billingMonth === gi.billingMonth
  const nearMonth = monthsCompatible(bank.billingMonth, gi.billingMonth)
  const dayDiff = daysApart(expenseDate(bank), expenseDate(gi))
  if (!nearMonth && dayDiff > 45) return -1

  let score = 100
  if (sameMonth) score += 50
  else if (nearMonth) score += 20
  score += 40
  score -= Math.min(dayDiff, 20)
  return score
}

/** רשומת GI טהורה — נשמרת רק להתאמה, לא מוצגת בטבלת הבנק */
export function isGiOnlyRecord(exp: FinanceExpense): boolean {
  return (
    (exp.source === 'green_invoice' || exp.id.startsWith('gi_')) &&
    !exp.bankRef
  )
}

export function isGiExpense(exp: FinanceExpense): boolean {
  return exp.source === 'green_invoice' || Boolean(exp.greenInvoiceId)
}

export function isBankExpense(exp: FinanceExpense): boolean {
  return Boolean(exp.bankRef) || exp.source === 'bank_import'
}

export function requiresGiDocument(exp: FinanceExpense): boolean {
  if (!isBankExpense(exp)) return false
  return !GI_EXEMPT_TYPE_IDS.has(exp.type)
}

export function computeExpensePairs(expenses: FinanceExpense[]): ExpensePair[] {
  const giRows = expenses.filter(isGiOnlyRecord)
  const bankRows = expenses.filter(isBankExpense)
  const candidates: ExpensePair[] = []

  for (const bank of bankRows) {
    for (const gi of giRows) {
      const score = scoreExpensePair(bank, gi, bankRows, giRows)
      if (score < 110) continue
      candidates.push({ bank, gi, score })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  const usedBank = new Set<string>()
  const usedGi = new Set<string>()
  const pairs: ExpensePair[] = []

  for (const c of candidates) {
    if (usedBank.has(c.bank.id) || usedGi.has(c.gi.id)) continue
    usedBank.add(c.bank.id)
    usedGi.add(c.gi.id)
    pairs.push(c)
  }

  return pairs
}

function statusForBankPayment(
  bank: FinanceExpense,
  pair: ExpensePair | undefined,
): ExpenseReconciliationStatus {
  if (!requiresGiDocument(bank)) return 'document_not_required'
  if (pair) return 'matched'
  if (bank.supplierInvoiceReceived) return 'manual_ok'
  return 'bank_missing_document'
}

/** התאמה מבוססת-בנק — רק תשלומים בפועל מוצגים בטבלה */
export function buildReconciledExpenseRows(
  expenses: FinanceExpense[],
  ymFrom?: string,
  ymTo?: string,
): ReconciledExpenseRow[] {
  const pairs = computeExpensePairs(expenses)
  const bankPair = new Map(pairs.map((p) => [p.bank.id, p]))
  const matchedGiIds = new Set(pairs.map((p) => p.gi.id))
  const rows: ReconciledExpenseRow[] = []

  for (const exp of expenses) {
    if (isGiOnlyRecord(exp)) continue

    const inPeriod =
      !ymFrom ||
      !ymTo ||
      ymInRange(exp.billingMonth, ymFrom, ymTo)

    if (!inPeriod) continue

    const pair = bankPair.get(exp.id)
    if (isBankExpense(exp)) {
      rows.push({
        expense: exp,
        status: statusForBankPayment(exp, pair),
        linkedGi: pair?.gi,
      })
      continue
    }

    rows.push({
      expense: exp,
      status: exp.supplierInvoiceReceived ? 'manual_ok' : 'manual_pending',
    })
  }

  // מסמכי GI בתקופה שלא שויכו לבנק — רק לסיכום, לא לטבלה
  if (ymFrom && ymTo) {
    for (const gi of expenses) {
      if (!isGiOnlyRecord(gi)) continue
      if (!ymInRange(gi.billingMonth, ymFrom, ymTo)) continue
      if (matchedGiIds.has(gi.id)) continue
      rows.push({ expense: gi, status: 'gi_unpaid' })
    }
  }

  return rows
}

export function hiddenGiExpenseIds(expenses: FinanceExpense[]): Set<string> {
  return new Set(expenses.filter(isGiOnlyRecord).map((e) => e.id))
}

export function reconciliationRowMap(
  expenses: FinanceExpense[],
  ymFrom?: string,
  ymTo?: string,
): Map<string, ReconciledExpenseRow> {
  const map = new Map<string, ReconciledExpenseRow>()
  for (const row of buildReconciledExpenseRows(expenses, ymFrom, ymTo)) {
    if (!isGiOnlyRecord(row.expense)) {
      map.set(row.expense.id, row)
    }
  }
  return map
}

export function summarizeExpenseReconciliation(
  expenses: FinanceExpense[],
  ymFrom?: string,
  ymTo?: string,
): ExpenseReconciliationSummary {
  const rows = buildReconciledExpenseRows(expenses, ymFrom, ymTo)
  const bankInPeriod = expenses.filter(
    (e) =>
      isBankExpense(e) &&
      (!ymFrom || !ymTo || ymInRange(e.billingMonth, ymFrom, ymTo)),
  )
  const giInPeriod = expenses.filter(
    (e) =>
      isGiOnlyRecord(e) &&
      (!ymFrom || !ymTo || ymInRange(e.billingMonth, ymFrom, ymTo)),
  )

  const summary: ExpenseReconciliationSummary = {
    matched: 0,
    bankMissingDocument: 0,
    giUnpaid: 0,
    documentNotRequired: 0,
    manualPending: 0,
    manualOk: 0,
    totalBank: bankInPeriod.length,
    totalGi: giInPeriod.length,
  }

  for (const row of rows) {
    if (isGiOnlyRecord(row.expense)) {
      if (row.status === 'gi_unpaid') summary.giUnpaid += 1
      continue
    }
    switch (row.status) {
      case 'matched':
        summary.matched += 1
        break
      case 'bank_missing_document':
        summary.bankMissingDocument += 1
        break
      case 'document_not_required':
        summary.documentNotRequired += 1
        break
      case 'manual_pending':
        summary.manualPending += 1
        break
      case 'manual_ok':
        summary.manualOk += 1
        break
      default:
        break
    }
  }

  return summary
}

export function reconciliationBadgeClass(
  status: ExpenseReconciliationStatus | undefined,
): string {
  switch (status) {
    case 'matched':
    case 'document_not_required':
      return 'bg-[#DCFCE7] text-[#166534]'
    case 'bank_missing_document':
    case 'manual_pending':
      return 'bg-[#FEF3C7] text-[#92400E]'
    case 'gi_unpaid':
      return 'bg-[#DBEAFE] text-[#1E40AF]'
    default:
      return 'bg-[var(--surface-muted)] text-[var(--text-mid)]'
  }
}
