const AMOUNT_TOLERANCE = 0.05
const AMOUNT_PERCENT_TOLERANCE = 0.04

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
  matchedExpenseId?: string
  linkedGreenInvoiceId?: string
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

function amountsMatchPercent(a: number, b: number, pct: number): boolean {
  if (a <= 0 || b <= 0) return false
  if (Math.abs(a - b) <= AMOUNT_TOLERANCE) return true
  return Math.abs(a - b) / Math.max(a, b) <= pct
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

function isSaasSupplierPair(
  bank: ReconcileExpense,
  gi: ReconcileExpense,
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
    if (ymAdd(a, d) === b) return true
  }
  return false
}

function monthsCompatibleForPair(
  bank: ReconcileExpense,
  gi: ReconcileExpense,
): boolean {
  if (monthsCompatible(bank.billingMonth, gi.billingMonth)) return true
  return (
    isSaasSupplierPair(bank, gi) &&
    saasMonthsCompatible(bank.billingMonth, gi.billingMonth)
  )
}

function amountsCompatible(a: ReconcileExpense, b: ReconcileExpense): boolean {
  for (const ba of amountCandidates(a)) {
    for (const ga of amountCandidates(b)) {
      if (amountsMatch(ba, ga)) return true
    }
  }
  if (isSaasSupplierPair(a, b)) {
    for (const ba of amountCandidates(a)) {
      for (const ga of amountCandidates(b)) {
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

/** קבוצות ספקים שמופיעים בשמות שונים בבנק מול GI */
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
    tokenOverlap(bk, gk) ||
    significantTokenOverlap(expenseLabel(bank), expenseLabel(gi))
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

const GI_EXEMPT_TYPE_IDS = new Set(['bank_fee', 'salary'])

const GI_EXEMPT_STATUTORY_TERMS = [
  'ביטוח לאומי',
  'מיטב דש',
  'מיטב',
  'meitav',
  'מס הכנסה',
  'נציבות מס הכנסה',
  'מס הכנסה ומיסים',
  'מיסים',
  'ניכויים',
  'מ"ה ניכויים',
  'מס הכנסה ניכויים',
  'מע"מ לתשלום',
  'מע״מ לתשלום',
  'רשות המיסים',
  'מס ערך מוסף',
]

function expenseGiExemptBlob(exp: ReconcileExpense): string {
  return [
    exp.name,
    exp.description,
    exp.supplierName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function isStatutoryGiExemptExpense(exp: ReconcileExpense): boolean {
  const text = expenseGiExemptBlob(exp)
  return GI_EXEMPT_STATUTORY_TERMS.some((t) => text.includes(t.toLowerCase()))
}

function isPayrollGiExempt(exp: ReconcileExpense): boolean {
  const text = expenseGiExemptBlob(exp)
  if (/יובל\s*שכטר|yuval\s*shechter/i.test(text)) return true
  return false
}

function looksLikeSalary(exp: ReconcileExpense): boolean {
  const text = `${exp.name ?? ''} ${exp.description ?? ''} ${exp.supplierName ?? ''}`
  return /משכורת|הו["״']?ק|שכר/i.test(text)
}

export function requiresGiDocument(exp: ReconcileExpense): boolean {
  if (!isBankExpense(exp)) return false
  if (GI_EXEMPT_TYPE_IDS.has(exp.type ?? '')) return false
  if (looksLikeSalary(exp)) return false
  if (isPayrollGiExempt(exp)) return false
  if (isStatutoryGiExemptExpense(exp)) return false
  return true
}

function scoreExpensePair(
  bank: ReconcileExpense,
  gi: ReconcileExpense,
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

function sumMatchesBank(bankAmount: number, giAmounts: number[]): boolean {
  const sum = Math.round(giAmounts.reduce((a, b) => a + b, 0) * 100) / 100
  return amountsMatch(bankAmount, sum)
}

/** תשלום בנק אחד שמכסה 2–3 חשבוניות GI מאותו ספק (למשל 019: 304+124.5=428.5) */
function pairCombinedGiAmounts(
  bankRows: ReconcileExpense[],
  giRows: ReconcileExpense[],
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

    let matched: ReconcileExpense[] | null = null

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
    if (
      !matched.every((g) => suppliersCompatible(comboAnchor, g))
    ) {
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
  bank: ReconcileExpense,
  gi: ReconcileExpense,
  bankRows: ReconcileExpense[],
  giRows: ReconcileExpense[],
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
  bankRows: ReconcileExpense[],
  giRows: ReconcileExpense[],
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

export function computeExpensePairs(expenses: ReconcileExpense[]): ExpensePair[] {
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

  // קישורים שמורים ב-Firestore — רק אם עדיין תואמים סכום וספק
  for (const bank of bankRows) {
    let gi: ReconcileExpense | undefined
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
      const score = scoreExpensePair(bank, gi)
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
