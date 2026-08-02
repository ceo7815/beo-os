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
 *
 * כל רשומה שהוזנה במערכת נספרת מיד — אין מצב ביניים של "ממתין לאישור",
 * מפני שההזנה עצמה היא האישור. היוצא היחיד הוא מסמך GI ללא תשלום בנק,
 * שמשמש להתאמה בלבד ואינו נספר פעמיים.
 */
export function expensesForFinancialTotals(
  expenses: FinanceExpense[],
): FinanceExpense[] {
  return expenses.filter((e) => !isGiOnlyRecord(e))
}
