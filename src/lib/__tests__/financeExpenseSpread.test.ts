import { describe, expect, it } from 'vitest'
import type { FinanceExpense } from '../../types'
import {
  expenseRowForMonth,
  isSpreadExpense,
  spreadMonthList,
  spreadPortion,
} from '../financeExpenseSpread'

function expense(over: Partial<FinanceExpense> = {}): FinanceExpense {
  return {
    id: 'exp-annual',
    type: 'supplier',
    amount: 12000,
    amountIncludesVat: true,
    vatClass: 'vat_liable',
    recurring: false,
    billingMonth: '2026-07',
    paidDate: '2026-07-01',
    source: 'bank_import',
    createdAt: '2026-07-01T00:00:00.000Z',
    ...over,
  }
}

describe('חוק: תשלום שנתי נפרס על פני שנה', () => {
  it('הוצאה בלי פריסה אינה נחשבת פרוסה', () => {
    expect(isSpreadExpense(expense())).toBe(false)
  })

  it('פריסה ל-12 חודשים מתחילה בחודש התשלום', () => {
    const months = spreadMonthList(expense({ spreadMonths: 12 }))
    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2026-07')
    expect(months[11]).toBe('2027-06')
  })

  it('אפשר להתחיל את הפריסה בחודש אחר מחודש התשלום', () => {
    const months = spreadMonthList(
      expense({ spreadMonths: 12, spreadStartMonth: '2026-08' }),
    )
    expect(months[0]).toBe('2026-08')
    expect(months[11]).toBe('2027-07')
  })
})

describe('חוק: סכום המנות שווה בדיוק לתשלום שירד מהבנק', () => {
  it('סכום מתחלק — כל חודש מקבל חלק זהה', () => {
    const parts = Array.from({ length: 12 }, (_, i) => spreadPortion(12000, 12, i))
    expect(parts.every((p) => p === 1000)).toBe(true)
    expect(parts.reduce((a, b) => a + b, 0)).toBe(12000)
  })

  it('סכום שאינו מתחלק — השארית נספגת בחודש האחרון ולא נעלמת', () => {
    const parts = Array.from({ length: 12 }, (_, i) => spreadPortion(1000, 12, i))
    const sum = Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100

    expect(sum).toBe(1000)
    expect(parts[0]).toBe(83.33)
    expect(parts[11]).toBe(83.37)
  })

  it('גם בסכומים אקראיים אין אובדן אגורות', () => {
    for (const total of [999.99, 4321.07, 17.05, 88888.88]) {
      for (const n of [2, 3, 7, 12, 24]) {
        const parts = Array.from({ length: n }, (_, i) => spreadPortion(total, n, i))
        const sum = Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100
        expect(sum).toBe(Math.round(total * 100) / 100)
      }
    }
  })
})

describe('חוק: הפריסה היא תצוגה, השורה נשארת אחת', () => {
  it('החודש הראשון מציג את המנה ולא את מלוא הסכום', () => {
    const row = expenseRowForMonth(expense({ spreadMonths: 12 }), '2026-07')
    expect(row?.amount).toBe(1000)
    expect(row?.isSpreadOccurrence).toBe(true)
    expect(row?.sourceBillingMonth).toBe('2026-07')
  })

  it('חודש מחוץ לטווח הפריסה אינו מציג כלום', () => {
    expect(expenseRowForMonth(expense({ spreadMonths: 12 }), '2027-08')).toBeNull()
    expect(expenseRowForMonth(expense({ spreadMonths: 12 }), '2026-06')).toBeNull()
  })

  it('פירוט המע״מ מתחלק יחד עם הסכום', () => {
    const row = expenseRowForMonth(
      expense({ spreadMonths: 12, vatAmount: 1830.51, amountBeforeVat: 10169.49 }),
      '2026-07',
    )
    expect(row?.vatAmount).toBe(152.54)
    expect(row?.amountBeforeVat).toBe(847.46)
  })
})
