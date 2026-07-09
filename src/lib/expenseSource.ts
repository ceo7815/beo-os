import type { FinanceExpense } from '../types'

/** מסמך GI טהור — ללא תשלום בנק; משמש להתאמה בלבד */
export function isGiOnlyRecord(exp: FinanceExpense): boolean {
  return (
    (exp.source === 'green_invoice' || exp.id.startsWith('gi_')) &&
    !exp.bankRef
  )
}

export function isBankExpense(exp: FinanceExpense): boolean {
  return Boolean(exp.bankRef) || exp.source === 'bank_import'
}

/**
 * הוצאות שנספרות בטבלה, ב-KPI ובדוח רווח והפסד.
 * הבנק = מקור האמת לסכום; מסמכי GI לא נספרים פעמיים.
 */
export function expensesForFinancialTotals(
  expenses: FinanceExpense[],
): FinanceExpense[] {
  return expenses.filter((e) => !isGiOnlyRecord(e))
}
