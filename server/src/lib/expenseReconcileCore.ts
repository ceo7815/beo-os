const AMOUNT_TOLERANCE = 0.05
const AMOUNT_PERCENT_TOLERANCE = 0.025

/** מינימום שדות להתאמה — משותף לשרת */
export type ReconcileExpense = {
  id: string
  type?: string
  amount: number
  amountBeforeVat?: number
  vatAmount?: number
  billingMonth: string
  paidDate?: string
  bankRef?: string
  source?: string
  greenInvoiceId?: string
  greenInvoiceNumber?: string
  supplierName?: string
  greenInvoiceSupplierName?: string
  greenInvoiceSupplierTaxId?: string
  supplierTaxId?: string
  name?: string
  description?: string
  supplierInvoiceReceived?: boolean
}

export type ExpensePair = {
  bank: ReconcileExpense
  gi: ReconcileExpense
  score: number
}

function ymAdd(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function expenseMerchantKey(raw: string): string {
  let s = raw.trim().toLowerCase()
  s = s.split('*')[0] ?? s
  s = s.replace(/בע["״']?מ/g, '')
  s = s.replace(/בעמ/g, '')
  s = s.replace(/[0-9]+/g, ' ')
  s = s.replace(/[^\p{L}\s]/gu, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s.split(' ').filter(Boolean).slice(0, 4).join(' ')
}

function expenseLabel(exp: ReconcileExpense): string {
  return (
    exp.greenInvoiceSupplierName ??
    exp.supplierName ??
    exp.name ??
    exp.description ??
    ''
  )
}

function expenseDate(exp: ReconcileExpense): string {
  return exp.paidDate ?? `${exp.billingMonth}-15`
}

function daysApart(a: string, b: string): number {
  const da = Date.parse(`${a.slice(0, 10)}T12:00:00`)
  const db = Date.parse(`${b.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(da) || Number.isNaN(db)) return 999
  return Math.abs(da - db) / (24 * 60 * 60 * 1000)
}

function amountsMatch(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false
  if (Math.abs(a - b) <= AMOUNT_TOLERANCE) return true
  const base = Math.max(a, b)
  return Math.abs(a - b) / base <= AMOUNT_PERCENT_TOLERANCE
}

function amountCandidates(exp: ReconcileExpense): number[] {
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

function amountsCompatible(a: ReconcileExpense, b: ReconcileExpense): boolean {
  for (const ba of amountCandidates(a)) {
    for (const ga of amountCandidates(b)) {
      if (amountsMatch(ba, ga)) return true
    }
  }
  return false
}

function monthsCompatible(a: string, b: string): boolean {
  if (a === b) return true
  return ymAdd(a, -1) === b || ymAdd(a, 1) === b
}

function tokenOverlap(a: string, b: string): boolean {
  const ta = new Set(a.split(' ').filter((t) => t.length >= 3))
  const tb = new Set(b.split(' ').filter((t) => t.length >= 3))
  for (const t of ta) {
    if (tb.has(t)) return true
  }
  return false
}

function normalizeTaxId(raw: string | undefined): string {
  if (!raw) return ''
  return raw.replace(/\D/g, '')
}

function suppliersCompatible(
  bank: ReconcileExpense,
  gi: ReconcileExpense,
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
    tokenOverlap(bk, gk)
  )
}

export function isGiOnlyRecord(exp: ReconcileExpense): boolean {
  return (
    (exp.source === 'green_invoice' || exp.id.startsWith('gi_')) && !exp.bankRef
  )
}

export function isBankExpense(exp: ReconcileExpense): boolean {
  return Boolean(exp.bankRef) || exp.source === 'bank_import'
}

export function isGiExpense(exp: ReconcileExpense): boolean {
  return exp.source === 'green_invoice' || Boolean(exp.greenInvoiceId)
}

function scoreExpensePair(
  bank: ReconcileExpense,
  gi: ReconcileExpense,
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

export function computeExpensePairs(expenses: ReconcileExpense[]): ExpensePair[] {
  const giRows = expenses.filter(isGiOnlyRecord)
  const bankRows = expenses.filter(isBankExpense)
  const candidates: ExpensePair[] = []

  for (const bank of bankRows) {
    for (const gi of giRows) {
      const score = scoreExpensePair(bank, gi)
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
