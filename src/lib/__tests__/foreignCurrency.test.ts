import { describe, expect, it } from 'vitest'
import {
  documentComparisonAmounts,
  formatForeignAmount,
  isForeignCurrencyCode,
  normalizeCurrencyCode,
  parseForeignNote,
  resolveExpenseForeign,
} from '../foreignCurrency'
import { amountsIdentical } from '../financeMatchRules'

describe('חילוץ מטבע וסכום מהערת חברת האשראי', () => {
  it('מזהה עסקה בדולר', () => {
    expect(parseForeignNote('סכום העסקה הוא 20.00 $')).toEqual({
      currency: 'USD',
      amount: 20,
    })
  })

  it('מזהה עסקה באירו', () => {
    expect(parseForeignNote('סכום העסקה הוא 15.99 €')).toEqual({
      currency: 'EUR',
      amount: 15.99,
    })
  })

  it('מזהה סכום עם ספרה עשרונית אחת', () => {
    expect(parseForeignNote('סכום העסקה הוא 7.5 $')?.amount).toBe(7.5)
  })

  it('מזהה סכום עם מפריד אלפים', () => {
    expect(parseForeignNote('סכום העסקה הוא 1,250.00 $')?.amount).toBe(1250)
  })

  it('חיוב שקלי אינו נחשב מט״ח', () => {
    expect(parseForeignNote('סכום העסקה הוא 100.00 ₪')).toBeUndefined()
  })

  it('הערה ללא סכום מוחזרת ריקה', () => {
    expect(parseForeignNote('רכישה רגילה')).toBeUndefined()
  })

  it('קוד מטבע טקסטואלי מזוהה', () => {
    expect(parseForeignNote('סכום העסקה הוא 42.00 USD')?.currency).toBe('USD')
  })

  it('מזהה סמל לפני הסכום', () => {
    expect(parseForeignNote('סכום העסקה $20.00')).toEqual({
      currency: 'USD',
      amount: 20,
    })
  })

  it('מזהה USD לפני הסכום', () => {
    expect(parseForeignNote('USD 15.5')).toEqual({
      currency: 'USD',
      amount: 15.5,
    })
  })
})

describe('resolveExpenseForeign', () => {
  it('מעדיף שדות שמורים', () => {
    expect(
      resolveExpenseForeign({
        currency: 'USD',
        originalAmount: 20,
        description: 'סכום העסקה הוא 99 $',
      }),
    ).toEqual({ currency: 'USD', amount: 20 })
  })

  it('מחלץ מתיאור כשאין שדות', () => {
    expect(
      resolveExpenseForeign({
        description: 'סכום העסקה הוא 20.00 $',
      }),
    ).toEqual({ currency: 'USD', amount: 20 })
  })
})

describe('נרמול קוד מטבע', () => {
  it('סמל הופך לקוד', () => {
    expect(normalizeCurrencyCode('$')).toBe('USD')
    expect(normalizeCurrencyCode('€')).toBe('EUR')
  })

  it('מילה בעברית הופכת לקוד', () => {
    expect(normalizeCurrencyCode('דולר')).toBe('USD')
    expect(normalizeCurrencyCode('אירו')).toBe('EUR')
  })

  it('שקל אינו מטבע חוץ', () => {
    expect(isForeignCurrencyCode('ILS')).toBe(false)
    expect(isForeignCurrencyCode(undefined)).toBe(false)
    expect(isForeignCurrencyCode('USD')).toBe(true)
  })
})

describe('תצוגת סכום במטבע המקור', () => {
  it('דולר מוצג עם סמל', () => {
    expect(formatForeignAmount(20, 'USD')).toBe('$20')
    expect(formatForeignAmount(74.32, 'USD')).toBe('$74.32')
  })

  it('זיכוי מוצג עם מינוס', () => {
    expect(formatForeignAmount(-20, 'USD')).toBe('-$20')
  })

  it('מטבע לא מוכר מוצג עם הקוד', () => {
    expect(formatForeignAmount(10, 'CHF')).toBe('10 CHF')
  })
})

describe('חוק: חשבונית בדולר מזוהה כהתאמה מלאה', () => {
  const expense = { amount: 74.32, currency: 'USD', originalAmount: 20 }

  it('סכום המקור נכלל בסכומי ההשוואה', () => {
    expect(documentComparisonAmounts(expense)).toContain(20)
  })

  it('גם הסכום בשקלים נשאר בר-השוואה', () => {
    expect(documentComparisonAmounts(expense)).toContain(74.32)
  })

  it('הזנת 20 מול חיוב של 74.32 היא התאמה מלאה', () => {
    const matched = documentComparisonAmounts(expense).some((a) =>
      amountsIdentical(a, 20),
    )
    expect(matched).toBe(true)
  })

  it('הזנת סכום אחר אינה התאמה', () => {
    const matched = documentComparisonAmounts(expense).some((a) =>
      amountsIdentical(a, 25),
    )
    expect(matched).toBe(false)
  })

  it('הוצאה שקלית מושווית רק מול הסכום בשקלים', () => {
    expect(documentComparisonAmounts({ amount: 306 })).toEqual([306])
  })
})
