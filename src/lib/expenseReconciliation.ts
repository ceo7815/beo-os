import type {
  ExpenseReconciliationStatus,
  FinanceExpense,
  FinanceExpenseTypeDef,
  GiExpenseDocKind,
} from '../types'
import { addMonths } from './financeMonthRange'
import { resolveExpenseType } from './financeExpenseTypes'
import { isSalaryLikeExpense, isPayrollGiExemptExpense } from './financeSalaryMonth'
import { isStatutoryGiExemptExpense } from './financeExpenseVat'
import {
  isBankExpense,
  isGiOnlyRecord,
  expensesForFinancialTotals,
} from './expenseSource'
import { merchantKey } from './bankImport/matching'

export { isGiOnlyRecord, isBankExpense } from './expenseSource'

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
const GI_EXEMPT_TYPE_IDS = new Set(['bank_fee', 'salary'])

const AMOUNT_TOLERANCE = 0.05
const AMOUNT_PERCENT_TOLERANCE = 0.04

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
  if (isSaasSupplierPair(bank, gi)) {
    for (const ba of amountCandidates(bank)) {
      for (const ga of amountCandidates(gi)) {
        if (amountsMatchPercent(ba, ga, SAAS_AMOUNT_PERCENT_TOLERANCE)) {
          return true
        }
      }
    }
  }
  return false
}

function monthsCompatible(a: string, b: string): boolean {
  if (a === b) return true
  return addMonths(a, -1) === b || addMonths(a, 1) === b
}

const SAAS_SUPPLIER_TOKENS = new Set([
  'cursor',
  'xcloud',
  'openai',
  'chatgpt',
  'anthropic',
  'claude',
  'hetzner',
  'hostinger',
  'suno',
])

const SAAS_AMOUNT_PERCENT_TOLERANCE = 0.1

function amountsMatchPercent(a: number, b: number, pct: number): boolean {
  if (a <= 0 || b <= 0) return false
  if (Math.abs(a - b) <= AMOUNT_TOLERANCE) return true
  return Math.abs(a - b) / Math.max(a, b) <= pct
}

function isSaasSupplierPair(
  bank: FinanceExpense,
  gi: FinanceExpense,
): boolean {
  if (!suppliersCompatible(bank, gi)) return false
  const tokens = new Set([
    ...extractSignificantTokens(expenseLabel(bank)),
    ...extractSignificantTokens(expenseLabel(gi)),
  ])
  for (const t of tokens) {
    if (SAAS_SUPPLIER_TOKENS.has(t)) return true
  }
  return false
}

function saasMonthsCompatible(a: string, b: string): boolean {
  if (a === b) return true
  for (let d = -2; d <= 2; d++) {
    if (d === 0) continue
    if (addMonths(a, d) === b) return true
  }
  return false
}

function monthsCompatibleForPair(
  bank: FinanceExpense,
  gi: FinanceExpense,
): boolean {
  if (monthsCompatible(bank.billingMonth, gi.billingMonth)) return true
  return (
    isSaasSupplierPair(bank, gi) &&
    saasMonthsCompatible(bank.billingMonth, gi.billingMonth)
  )
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

const SUPPLIER_ALIAS_GROUPS: string[][] = [
  ['019', 'mobile', 'טלזר', 'telzar'],
  ['google', 'workspace', 'commerce', 'ads'],
  ['hostinger'],
  ['cursor'],
  ['openai', 'chatgpt'],
  ['anthropic', 'claude'],
  ['hetzner'],
  ['xcloud', 'hosting'],
  ['בזק', 'bezeq'],
  ['ביטאיט', 'bitayit', 'paycall'],
  ['חשמל', 'electric'],
  ['suno'],
  ['דומיין', 'domain', 'dnet', 'dns', 'נט', 'dehenet'],
  ['כרמלטון', 'carmelton'],
  ['ימים', 'מים'],
  ['שטיינפלד', 'steinfeld'],
  ['טימופיי', 'timofey', 'אס.טי.טי', 'לפיצקי'],
  ['אמיל', 'emil'],
  ['פרימיום', 'premium', 'express', 'אקספרס'],
  ['ישראכרט', 'isracard'],
  ['ביטוח', 'ביטוח לאומי', 'national'],
]

function extractSignificantTokens(raw: string): Set<string> {
  let s = raw.trim().toLowerCase()
  s = s.split('*')[0] ?? s
  s = s.replace(/בע["״']?מ/g, '').replace(/בעמ/g, '')
  const tokens = new Set<string>()
  for (const p of s.split(/[^\p{L}\d]+/u).filter(Boolean)) {
    if (/^\d{2,4}$/.test(p)) tokens.add(p)
    else if (p.length >= 3) tokens.add(p)
  }
  return tokens
}

const ALIAS_SUBSTRING_MIN_LEN = 4

function aliasTokenMatches(token: string, needle: string): boolean {
  if (token === needle) return true
  if (
    needle.length >= ALIAS_SUBSTRING_MIN_LEN &&
    token.includes(needle)
  ) {
    return true
  }
  if (
    token.length >= ALIAS_SUBSTRING_MIN_LEN &&
    needle.includes(token)
  ) {
    return true
  }
  return false
}

function aliasGroupOverlap(ta: Set<string>, tb: Set<string>): boolean {
  const has = (tokens: Set<string>, needle: string) => {
    if (tokens.has(needle)) return true
    for (const t of tokens) {
      if (aliasTokenMatches(t, needle)) return true
    }
    return false
  }
  for (const group of SUPPLIER_ALIAS_GROUPS) {
    const inA = group.some((g) => has(ta, g))
    const inB = group.some((g) => has(tb, g))
    if (inA && inB) return true
  }
  return false
}

function significantTokenOverlap(a: string, b: string): boolean {
  const ta = extractSignificantTokens(a)
  const tb = extractSignificantTokens(b)
  for (const t of ta) {
    if (tb.has(t)) return true
  }
  return aliasGroupOverlap(ta, tb)
}

function normalizeTaxId(raw: string | undefined): string {
  if (!raw) return ''
  return raw.replace(/\D/g, '')
}

function suppliersCompatible(
  bank: FinanceExpense,
  gi: FinanceExpense,
): boolean {
  const giTax = normalizeTaxId(gi.greenInvoiceSupplierTaxId)
  const bankTax = normalizeTaxId(bank.supplierTaxId)
  if (giTax && bankTax && giTax === bankTax) return true

  const bk = expenseMerchantKey(expenseLabel(bank))
  const gk = expenseMerchantKey(expenseLabel(gi))
  if (!bk || !gk) return false
  return (
    bk === gk ||
    bk.includes(gk) ||
    gk.includes(bk) ||
    tokenOverlap(bk, gk) ||
    significantTokenOverlap(expenseLabel(bank), expenseLabel(gi))
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
  const nearMonth = monthsCompatibleForPair(bank, gi)
  const dayDiff = daysApart(expenseDate(bank), expenseDate(gi))
  const maxDayDiff = isSaasSupplierPair(bank, gi) ? 120 : 90
  if (!nearMonth && dayDiff > maxDayDiff) return -1

  let score = 100
  if (sameMonth) score += 50
  else if (nearMonth) score += 25
  else score += 10
  score += 40
  score -= Math.min(dayDiff, 35)
  return score
}

export function isGiExpense(exp: FinanceExpense): boolean {
  return exp.source === 'green_invoice' || Boolean(exp.greenInvoiceId)
}

export function requiresGiDocument(
  exp: FinanceExpense,
  typeById?: Map<string, FinanceExpenseTypeDef>,
): boolean {
  if (!isBankExpense(exp)) return false
  if (GI_EXEMPT_TYPE_IDS.has(exp.type)) return false
  const typeDef = typeById
    ? resolveExpenseType(exp.type, typeById)
    : undefined
  if (isSalaryLikeExpense(exp, typeDef)) return false
  if (isPayrollGiExemptExpense(exp)) return false
  if (isStatutoryGiExemptExpense(exp)) return false
  return true
}

function sumMatchesBank(bankAmount: number, giAmounts: number[]): boolean {
  const sum = Math.round(giAmounts.reduce((a, b) => a + b, 0) * 100) / 100
  return amountsMatch(bankAmount, sum)
}

function pairCombinedGiAmounts(
  bankRows: FinanceExpense[],
  giRows: FinanceExpense[],
  usedBank: Set<string>,
  usedGi: Set<string>,
  pairs: ExpensePair[],
): void {
  for (const bank of bankRows) {
    if (usedBank.has(bank.id) || bank.amount <= 0) continue

    const candidates = giRows.filter(
      (g) =>
        !usedGi.has(g.id) &&
        g.amount > 0 &&
        monthsCompatibleForPair(bank, g) &&
        suppliersCompatible(bank, g),
    )
    if (candidates.length < 2) continue

    let matched: FinanceExpense[] | null = null

    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const pair = [candidates[i]!, candidates[j]!]
        if (sumMatchesBank(bank.amount, pair.map((g) => g.amount))) {
          matched = pair
          break
        }
      }
      if (matched) break
    }

    if (!matched && candidates.length >= 3) {
      outer: for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          for (let k = j + 1; k < candidates.length; k++) {
            const trio = [candidates[i]!, candidates[j]!, candidates[k]!]
            if (sumMatchesBank(bank.amount, trio.map((g) => g.amount))) {
              matched = trio
              break outer
            }
          }
        }
      }
    }

    if (!matched) continue

    const comboAnchor = matched[0]!
    if (!matched.every((g) => suppliersCompatible(comboAnchor, g))) {
      continue
    }

    usedBank.add(bank.id)
    for (const gi of matched) {
      usedGi.add(gi.id)
      pairs.push({ bank, gi, score: 145 })
    }
  }
}

function isUniqueAmountPair(
  bank: FinanceExpense,
  gi: FinanceExpense,
  bankRows: FinanceExpense[],
  giRows: FinanceExpense[],
  usedBank: Set<string>,
  usedGi: Set<string>,
): boolean {
  if (!amountsCompatible(bank, gi)) return false
  if (!suppliersCompatible(bank, gi)) return false
  const bankMonth = bank.billingMonth
  const giMonth = gi.billingMonth
  if (bankMonth !== giMonth && !monthsCompatibleForPair(bank, gi)) return false

  const bankPeers = bankRows.filter(
    (b) =>
      !usedBank.has(b.id) &&
      (b.billingMonth === bankMonth ||
        monthsCompatibleForPair(b, gi)) &&
      amountsCompatible(b, gi),
  )
  const giPeers = giRows.filter(
    (g) =>
      !usedGi.has(g.id) &&
      (g.billingMonth === giMonth || monthsCompatibleForPair(bank, g)) &&
      amountsCompatible(bank, g),
  )
  return (
    bankPeers.length === 1 &&
    giPeers.length === 1 &&
    bankPeers[0]!.id === bank.id &&
    giPeers[0]!.id === gi.id
  )
}

function pairUniqueAmounts(
  bankRows: FinanceExpense[],
  giRows: FinanceExpense[],
  usedBank: Set<string>,
  usedGi: Set<string>,
  pairs: ExpensePair[],
): void {
  for (const bank of bankRows) {
    if (usedBank.has(bank.id)) continue
    for (const gi of giRows) {
      if (usedGi.has(gi.id)) continue
      if (
        !isUniqueAmountPair(bank, gi, bankRows, giRows, usedBank, usedGi)
      ) {
        continue
      }
      usedBank.add(bank.id)
      usedGi.add(gi.id)
      pairs.push({ bank, gi, score: 130 })
      break
    }
  }
}

export function computeExpensePairs(expenses: FinanceExpense[]): ExpensePair[] {
  const giRows = expenses.filter(isGiOnlyRecord)
  const bankRows = expenses.filter(isBankExpense)
  const giById = new Map(giRows.map((g) => [g.id, g]))
  const giByInvoiceId = new Map(
    giRows
      .filter((g) => g.greenInvoiceId)
      .map((g) => [g.greenInvoiceId!, g]),
  )

  const usedBank = new Set<string>()
  const usedGi = new Set<string>()
  const pairs: ExpensePair[] = []

  for (const bank of bankRows) {
    let gi: FinanceExpense | undefined
    if (bank.matchedExpenseId && giById.has(bank.matchedExpenseId)) {
      gi = giById.get(bank.matchedExpenseId)
    } else if (bank.linkedGreenInvoiceId) {
      gi = giByInvoiceId.get(bank.linkedGreenInvoiceId)
    }
    if (!gi || usedBank.has(bank.id) || usedGi.has(gi.id)) continue
    if (!amountsCompatible(bank, gi) || !suppliersCompatible(bank, gi)) {
      continue
    }
    usedBank.add(bank.id)
    usedGi.add(gi.id)
    pairs.push({ bank, gi, score: 250 })
  }

  pairCombinedGiAmounts(bankRows, giRows, usedBank, usedGi, pairs)
  pairUniqueAmounts(bankRows, giRows, usedBank, usedGi, pairs)

  const candidates: ExpensePair[] = []

  for (const bank of bankRows) {
    if (usedBank.has(bank.id)) continue
    for (const gi of giRows) {
      if (usedGi.has(gi.id)) continue
      const score = scoreExpensePair(bank, gi, bankRows, giRows)
      if (score < 95) continue
      candidates.push({ bank, gi, score })
    }
  }

  candidates.sort((a, b) => b.score - a.score)

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
  const bankPair = new Map<string, ExpensePair>()
  for (const p of pairs) {
    const prev = bankPair.get(p.bank.id)
    if (!prev || p.score > prev.score) bankPair.set(p.bank.id, p)
  }
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

/** תשלומי בנק שחסר להם מסמך ב-GI — ממוינים לפי תאריך */
export function listMissingGiBankExpenses(
  expenses: FinanceExpense[],
  ymFrom?: string,
  ymTo?: string,
): FinanceExpense[] {
  const rows = buildReconciledExpenseRows(expenses, ymFrom, ymTo)
  return rows
    .filter(
      (r) =>
        r.status === 'bank_missing_document' && !isGiOnlyRecord(r.expense),
    )
    .map((r) => r.expense)
    .sort((a, b) => {
      const da = a.paidDate ?? `${a.billingMonth}-01`
      const db = b.paidDate ?? `${b.billingMonth}-01`
      return db.localeCompare(da)
    })
}

/** מסמכי GI בתקופה ללא תשלום בנק מותאם — ממוינים לפי תאריך מסמך */
export function listUnpaidGiExpenses(
  expenses: FinanceExpense[],
  ymFrom?: string,
  ymTo?: string,
): FinanceExpense[] {
  const rows = buildReconciledExpenseRows(expenses, ymFrom, ymTo)
  return rows
    .filter((r) => r.status === 'gi_unpaid' && isGiOnlyRecord(r.expense))
    .filter((r) => r.expense.amount > 0)
    .map((r) => r.expense)
    .sort((a, b) => {
      const da = a.paidDate ?? `${a.billingMonth}-01`
      const db = b.paidDate ?? `${b.billingMonth}-01`
      return db.localeCompare(da)
    })
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

export type ExpenseDuplicateAudit = {
  firestoreTotal: number
  countedInReports: number
  giHiddenCount: number
  giHiddenGrossInPeriod: number
  matchedPairs: number
  duplicateBankRefGroups: number
  duplicateBankRefRows: number
}

/** בדיקת כפילויות — מסמכי GI לא נספרים בדוחות; רק בנק/ידני */
export function auditExpenseDuplicates(
  expenses: FinanceExpense[],
  ymFrom?: string,
  ymTo?: string,
): ExpenseDuplicateAudit {
  const pairs = computeExpensePairs(expenses)
  const giHidden = expenses.filter(isGiOnlyRecord)
  const counted = expensesForFinancialTotals(expenses)

  let giHiddenGrossInPeriod = 0
  for (const g of giHidden) {
    if (ymFrom && ymTo && (g.billingMonth < ymFrom || g.billingMonth > ymTo)) {
      continue
    }
    if (g.amount > 0) giHiddenGrossInPeriod += g.amount
  }

  const byRef = new Map<string, number>()
  for (const e of expenses) {
    if (!isBankExpense(e) || !e.bankRef?.trim()) continue
    const ref = e.bankRef.trim()
    byRef.set(ref, (byRef.get(ref) ?? 0) + 1)
  }
  let duplicateBankRefGroups = 0
  let duplicateBankRefRows = 0
  for (const n of byRef.values()) {
    if (n > 1) {
      duplicateBankRefGroups += 1
      duplicateBankRefRows += n
    }
  }

  return {
    firestoreTotal: expenses.length,
    countedInReports: counted.length,
    giHiddenCount: giHidden.length,
    giHiddenGrossInPeriod: Math.round(giHiddenGrossInPeriod * 100) / 100,
    matchedPairs: pairs.length,
    duplicateBankRefGroups,
    duplicateBankRefRows,
  }
}
