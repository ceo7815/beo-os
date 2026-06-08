import type { FinanceExpenseVatClass } from '../types'
import {
  expenseSearchBlob,
  matchMonthlyRecurringExpense,
} from './financeRecurringCatalog'

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

  const recurring = matchMonthlyRecurringExpense(exp)
  if (recurring) {
    if (
      recurring.id === 'bituach-leumi' ||
      recurring.id === 'income-tax-withholding'
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
    text.includes('google') ||
    text.includes('מיטב')
  ) {
    return 'vat_liable'
  }

  if (exp.type === 'fixed') return 'vat_liable'

  return exp.vatClass ?? 'exempt_supplier'
}
