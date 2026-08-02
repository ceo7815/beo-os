import type { FinanceExpenseVatClass } from '../types'
import {
  expenseSearchBlob,
  matchMonthlyRecurringExpense,
} from './financeRecurringCatalog'
import { looksLikeTaxAuthorityPayment } from './financeSalaryMonth'

export const EXPENSE_VAT_CLASS_LABEL: Record<FinanceExpenseVatClass, string> = {
  vat_liable: 'תשומות (חייב מע״מ)',
  statutory: 'חוקי (statutory)',
  exempt_supplier: 'ספק פטור',
}

export const EXPENSE_VAT_CLASS_SHORT: Record<FinanceExpenseVatClass, string> = {
  vat_liable: 'תשומות',
  statutory: 'חוקי',
  exempt_supplier: 'פטור',
}

/** סיווג מע״מ — תומך ברשומות ישנות עם vatLiable בלבד */
export function resolveExpenseVatClass(exp: {
  vatClass?: FinanceExpenseVatClass
  vatLiable?: boolean
  type?: string
}): FinanceExpenseVatClass {
  if (
    exp.vatClass === 'vat_liable' ||
    exp.vatClass === 'statutory' ||
    exp.vatClass === 'exempt_supplier'
  ) {
    return exp.vatClass
  }
  if (exp.vatLiable === true) return 'vat_liable'
  if (exp.type === 'salary') return 'statutory'
  if (exp.type === 'supplier' || exp.type === 'platform' || exp.type === 'fixed') {
    return 'vat_liable'
  }
  return 'exempt_supplier'
}

export function vatClassToLiable(vatClass: FinanceExpenseVatClass): boolean {
  return vatClass === 'vat_liable'
}

export function defaultVatClassForExpenseType(typeId: string): FinanceExpenseVatClass {
  if (typeId === 'salary') return 'statutory'
  if (typeId === 'supplier' || typeId === 'platform') return 'vat_liable'
  if (typeId === 'fixed') return 'vat_liable'
  return 'exempt_supplier'
}

const STATUTORY_TERMS = ['ביטוח לאומי', 'ניכויים', 'מ"ה ניכויים', 'מס הכנסה ניכויים']

/** תשלומים חוקיים/ממשלתיים — אין להם חשבונית מס ב-GI */
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

function expenseGiExemptBlob(exp: {
  name?: string
  description?: string
  supplierName?: string
  platformName?: string
  employeeName?: string
}): string {
  return [
    exp.name,
    exp.description,
    exp.supplierName,
    exp.platformName,
    exp.employeeName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/** ביטוח לאומי, מיטב דש, מיסים — לא נדרש מסמך בחשבונית ירוקה */
export function isStatutoryGiExemptExpense(exp: {
  vatClass?: FinanceExpenseVatClass
  type?: string
  name?: string
  description?: string
  supplierName?: string
  platformName?: string
  employeeName?: string
  amount?: number
}): boolean {
  if (exp.vatClass === 'statutory') return true
  const text = expenseGiExemptBlob(exp)
  if (GI_EXEMPT_STATUTORY_TERMS.some((t) => text.includes(t.toLowerCase()))) {
    return true
  }
  if (exp.amount != null && Number.isFinite(exp.amount)) {
    const recurring = matchMonthlyRecurringExpense({
      ...exp,
      amount: exp.amount,
    })
    if (
      recurring?.id === 'bituach-leumi' ||
      recurring?.id === 'income-tax-withholding' ||
      recurring?.id === 'meitav-dash'
    ) {
      return true
    }
  }
  return false
}

/** סיווג מע״מ מומלץ לפי שם, סוג וקטלוג הוצאות חוזרות */
export function suggestExpenseVatClass(exp: {
  type?: string
  name?: string
  description?: string
  supplierName?: string
  platformName?: string
  employeeName?: string
  amount: number
  vatClass?: FinanceExpenseVatClass
}): FinanceExpenseVatClass {
  const text = expenseSearchBlob(exp)
  if (STATUTORY_TERMS.some((t) => text.includes(t.toLowerCase()))) {
    return 'statutory'
  }
  /** גבייה של רשות המסים — אין מולה חשבונית מס, ולכן אינה תשומות */
  if (looksLikeTaxAuthorityPayment(text)) {
    return 'statutory'
  }
  if (
    text.includes('מיטב דש') ||
    text.includes('מיטב') ||
    text.includes('meitav') ||
    text.includes('נציבות מס') ||
    text.includes('מיסים')
  ) {
    return 'statutory'
  }

  const recurring = matchMonthlyRecurringExpense(exp)
  if (recurring) {
    if (
      recurring.id === 'bituach-leumi' ||
      recurring.id === 'income-tax-withholding' ||
      recurring.id === 'meitav-dash'
    ) {
      return 'statutory'
    }
    return 'vat_liable'
  }

  if (exp.type === 'salary') return 'statutory'
  if (exp.type === 'supplier' || exp.type === 'platform') return 'vat_liable'
  if (exp.type === 'one_time') return 'exempt_supplier'

  if (
    text.includes('רואה חשבון') ||
    text.includes('שכטר') ||
    text.includes('hostinger') ||
    text.includes('hetzner') ||
    text.includes('hosting') ||
    text.includes('google')
  ) {
    return 'vat_liable'
  }

  if (exp.type === 'fixed') return 'vat_liable'

  return exp.vatClass ?? 'exempt_supplier'
}
