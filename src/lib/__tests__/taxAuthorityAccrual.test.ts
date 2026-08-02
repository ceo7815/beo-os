import { describe, expect, it } from 'vitest'
import {
  expenseAccrualMonth,
  isAccrualExpense,
  isTaxExpense,
  looksLikeTaxAuthorityPayment,
} from '../financeSalaryMonth'
import { suggestExpenseVatClass } from '../financeExpenseVat'

/**
 * גבייה של רשות המסים יורדת בחודש שאחרי התקופה שעבורה היא נגבית.
 * הרשומה בפועל נשמרה כהוצאה חד־פעמית פטורה, ולא כסוג "מסים".
 */
const VAT_COLLECTION = {
  type: 'one_time',
  name: 'גביית מעמ אינטרנט שע"מ',
  vatClass: 'exempt_supplier',
  billingMonth: '2026-07',
  paidDate: '2026-07-16',
}

describe('חוק: תשלום לרשות המסים נספר בחודש שעבורו נגבה', () => {
  it('גביית מע״מ מזוהה כתשלום רשות גם כשהיא פטורה וחד־פעמית', () => {
    expect(isTaxExpense(VAT_COLLECTION)).toBe(true)
    expect(isAccrualExpense(VAT_COLLECTION)).toBe(true)
  })

  it('תשלום ביולי משויך ליוני', () => {
    expect(expenseAccrualMonth(VAT_COLLECTION)).toBe('2026-06')
  })

  it('הייבוא מסווג גבייה כזו כתשלום חוקי ולא כתשומות', () => {
    expect(
      suggestExpenseVatClass({
        name: 'גביית מעמ אינטרנט שע"מ',
        amount: 6857,
      }),
    ).toBe('statutory')
  })

  it('ביטוח לאומי, ניכויים ומקדמות מס מזוהים אף הם', () => {
    expect(looksLikeTaxAuthorityPayment('ביטוח לאומי')).toBe(true)
    expect(looksLikeTaxAuthorityPayment('מ"ה ניכויים')).toBe(true)
    expect(looksLikeTaxAuthorityPayment('מקדמות מס הכנסה')).toBe(true)
    expect(looksLikeTaxAuthorityPayment('רשות המסים')).toBe(true)
  })
})

describe('חוק: ספק רגיל אינו נגרר לחודש הקודם', () => {
  it('תיאור שמזכיר מע״מ אינו הופך את ההוצאה לתשלום רשות', () => {
    expect(looksLikeTaxAuthorityPayment('שכירות משרד כולל מע"מ')).toBe(false)
    expect(looksLikeTaxAuthorityPayment('ANTHROPIC CLAUDE TEAM')).toBe(false)
  })

  it('הוצאת ספק עם מע״מ תשומות נשארת בחודש התשלום', () => {
    const supplier = {
      type: 'supplier',
      name: 'ספק ייעוץ מע"מ כלול',
      vatClass: 'vat_liable',
      billingMonth: '2026-07',
      paidDate: '2026-07-16',
    }
    expect(isTaxExpense(supplier)).toBe(false)
    expect(expenseAccrualMonth(supplier)).toBe('2026-07')
  })
})
