import { describe, expect, it } from 'vitest'
import {
  attributionForInvoiceDate,
  checkInvoiceDate,
  invoiceAmountMatches,
} from '../invoiceDateAttribution'
import type { FinanceExpense } from '../../types'

function expense(over: Partial<FinanceExpense> = {}): FinanceExpense {
  return {
    id: 'exp-1',
    type: 'supplier',
    amount: 590,
    amountIncludesVat: true,
    vatClass: 'vat_liable',
    recurring: false,
    billingMonth: '2026-08',
    paidDate: '2026-08-05',
    source: 'bank_import',
    createdAt: '2026-08-05T00:00:00.000Z',
    ...over,
  }
}

describe('חוק: תאריך החשבונית קובע את חודש הרווח וההפסד', () => {
  it('תשלום ב-5 באוגוסט עבור חשבונית מ-31 ביולי נכנס ליולי', () => {
    // 5.8 — יולי עדיין פתוח, הדיווח למע״מ הוא ב-19.8
    const a = attributionForInvoiceDate(expense(), '2026-07-31', '2026-08-05')
    expect(a.month).toBe('2026-07')
    expect(a.moves).toBe(true)
    expect(a.late).toBe(false)
    expect(a.currentMonth).toBe('2026-08')
  })

  it('חשבונית מאותו חודש אינה מזיזה את ההוצאה', () => {
    const a = attributionForInvoiceDate(expense(), '2026-08-03', '2026-08-05')
    expect(a.month).toBe('2026-08')
    expect(a.moves).toBe(false)
  })

  it('חודש שכבר דווח למע״מ עדיין נספר לפי תאריך החשבונית ומסומן כמאחר', () => {
    // 25.8 — יולי כבר דווח ב-19.8, אבל הרו״ה נשאר בחודש החשבונית
    const a = attributionForInvoiceDate(expense(), '2026-07-31', '2026-08-25')
    expect(a.month).toBe('2026-07')
    expect(a.late).toBe(true)
    expect(a.documentMonth).toBe('2026-07')
  })

  it('תשלום ביולי עבור חשבונית מיוני נכנס ליוני', () => {
    const a = attributionForInvoiceDate(
      expense({ billingMonth: '2026-07', paidDate: '2026-07-05' }),
      '2026-06-29',
      '2026-08-02',
    )
    expect(a.month).toBe('2026-06')
    expect(a.late).toBe(true)
    expect(a.moves).toBe(true)
  })

  it('החודש הנוכחי נלקח מ-pnlMonth כשהוא קיים', () => {
    const a = attributionForInvoiceDate(
      expense({ pnlMonth: '2026-06' }),
      '2026-06-30',
      '2026-07-10',
    )
    expect(a.currentMonth).toBe('2026-06')
    expect(a.moves).toBe(false)
  })
})

describe('חוק: התאמה בתאריך בין החשבונית לתשלום', () => {
  it('חשבונית שקודמת לתשלום בכמה ימים תקינה', () => {
    expect(checkInvoiceDate('2026-07-31', '2026-08-05')).toEqual({ status: 'ok' })
  })

  it('חשבונית שמתוארכת אחרי התשלום נחסמת', () => {
    expect(checkInvoiceDate('2026-08-20', '2026-08-05').status).toBe('future')
  })

  it('פער של חודשים מסומן כחשוד', () => {
    const r = checkInvoiceDate('2026-04-01', '2026-08-05')
    expect(r.status).toBe('far')
    expect(r.status === 'far' && r.days).toBeGreaterThan(45)
  })

  it('בלי תאריך אין חסימה', () => {
    expect(checkInvoiceDate('', '2026-08-05')).toEqual({ status: 'ok' })
  })
})

describe('חוק: התאמה בסכום בין החשבונית לתשלום', () => {
  it('סכום זהה בשקלים מתאים', () => {
    expect(invoiceAmountMatches(expense(), 590)).toBe(true)
  })

  it('פער של אגורה אינו נחשב התאמה', () => {
    expect(invoiceAmountMatches(expense(), 590.5)).toBe(false)
  })

  it('בעסקת מט״ח חשבונית בסכום המקור מתאימה', () => {
    const exp = expense({ amount: 75.4, currency: 'USD', originalAmount: 20 })
    expect(invoiceAmountMatches(exp, 20)).toBe(true)
    expect(invoiceAmountMatches(exp, 75.4)).toBe(true)
  })

  it('זיכוי נבדק לפי הערך המוחלט', () => {
    expect(invoiceAmountMatches(expense({ amount: -590 }), 590)).toBe(true)
  })
})
