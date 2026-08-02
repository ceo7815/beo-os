import { describe, expect, it } from 'vitest'
import { refundLinkMap } from '../expenseRefunds'
import { reconciliationRowDate } from '../expenseReconciliation'
import type { FinanceExpense } from '../../types'

function expense(over: Partial<FinanceExpense> = {}): FinanceExpense {
  return {
    id: 'exp-1',
    type: 'supplier',
    amount: 651,
    amountIncludesVat: true,
    vatClass: 'exempt_supplier',
    recurring: false,
    billingMonth: '2026-07',
    paidDate: '2026-07-06',
    source: 'bank_import',
    createdAt: '2026-07-06T00:00:00.000Z',
    ...over,
  }
}

const CHARGE = expense({ id: 'charge-1', name: 'Wise', amount: 651 })
const REFUND = expense({
  id: 'refund-1',
  name: 'זיכוי — Wise',
  amount: -651,
  refundForExpenseId: 'charge-1',
})

describe('חוק: שני צדי ההתאמה בין זיכוי לחיוב מסומנים', () => {
  const links = refundLinkMap([CHARGE, REFUND])

  it('החיוב מצביע על הזיכוי שביטל אותו', () => {
    const link = links.get('charge-1')
    expect(link?.role).toBe('charge')
    expect(link?.counterparts.map((c) => c.id)).toEqual(['refund-1'])
  })

  it('הזיכוי מצביע על החיוב שהוא מבטל', () => {
    const link = links.get('refund-1')
    expect(link?.role).toBe('refund')
    expect(link?.counterparts.map((c) => c.id)).toEqual(['charge-1'])
  })

  it('צמד שהתאזן מסומן כסגור', () => {
    expect(links.get('charge-1')?.fully).toBe(true)
    expect(links.get('refund-1')?.fully).toBe(true)
  })

  it('הפרש שער קטן עדיין נחשב סגור', () => {
    const partial = refundLinkMap([
      CHARGE,
      { ...REFUND, amount: -647 },
    ])
    expect(partial.get('charge-1')?.fully).toBe(true)
  })

  it('זיכוי חלקי משאיר יתרה פתוחה', () => {
    const partial = refundLinkMap([CHARGE, { ...REFUND, amount: -200 }])
    const link = partial.get('charge-1')
    expect(link?.fully).toBe(false)
    expect(link?.remaining).toBe(451)
  })

  it('כמה זיכויים על חיוב אחד נאספים יחד', () => {
    const links2 = refundLinkMap([
      CHARGE,
      { ...REFUND, id: 'r1', amount: -300 },
      { ...REFUND, id: 'r2', amount: -351 },
    ])
    expect(links2.get('charge-1')?.counterparts).toHaveLength(2)
    expect(links2.get('charge-1')?.fully).toBe(true)
  })

  it('הוצאה בלי זיכוי אינה מופיעה במפה', () => {
    expect(refundLinkMap([CHARGE]).get('charge-1')).toBeUndefined()
  })

  it('זיכוי שמצביע על חיוב שאינו קיים אינו מייצר קישור', () => {
    const orphan = refundLinkMap([
      { ...REFUND, refundForExpenseId: 'missing' },
    ])
    expect(orphan.size).toBe(0)
  })
})

describe('חוק: ההוצאות ממוינות לפי תאריך, ה-1 בחודש בתחתית', () => {
  const rows = [
    expense({ id: 'a', paidDate: '2026-07-01' }),
    expense({ id: 'b', paidDate: '2026-07-18' }),
    expense({ id: 'c', paidDate: '2026-07-06' }),
  ]

  it('הסדר יורד לפי התאריך המדויק', () => {
    const sorted = [...rows].sort((a, b) =>
      reconciliationRowDate(b).localeCompare(reconciliationRowDate(a)),
    )
    expect(sorted.map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('הוצאה בלי תאריך תשלום נופלת לתחילת החודש', () => {
    const noDate = expense({ id: 'd', paidDate: undefined })
    expect(reconciliationRowDate(noDate)).toBe('2026-07-01')
  })
})
