import { describe, expect, it } from 'vitest'
import {
  listUnlinkedRefunds,
  pairConfidentRefunds,
  refundCandidates,
  refundStatusFor,
  suggestedRefundMatch,
} from '../expenseRefunds'
import {
  isInvoiceWorkflowRow,
  isOpenReconciliationRow,
  listInvoiceWorkflowRows,
  listReconciliationRows,
} from '../expenseReconciliation'
import type { FinanceExpense } from '../../types'

function expense(over: Partial<FinanceExpense> & { id: string }): FinanceExpense {
  const paidDate = over.paidDate ?? '2026-07-05'
  return {
    type: 'general',
    amount: 100,
    recurring: false,
    billingMonth: paidDate.slice(0, 7),
    paidDate,
    paymentMethod: 'credit_card',
    source: 'bank_import',
    bankRef: `ref-${over.id}`,
    createdAt: '2026-07-05T00:00:00.000Z',
    ...over,
  }
}

const CHARGE = expense({
  id: 'charge',
  name: 'RESPOND.IO',
  amount: 306,
  paidDate: '2026-06-10',
  billingMonth: '2026-06',
})

const REFUND = expense({
  id: 'refund',
  name: 'זיכוי — RESPOND.IO',
  amount: -306,
  paidDate: '2026-07-02',
  billingMonth: '2026-07',
})

describe('חוק: זיכוי משויך לחיוב שהוא מבטל', () => {
  it('אותו ספק ואותו סכום מוצעים כהתאמה ודאית', () => {
    expect(suggestedRefundMatch(REFUND, [CHARGE, REFUND])?.charge.id).toBe(
      'charge',
    )
  })

  it('חיוב שקדם לזיכוי בחודש נכנס לרשימת המועמדים', () => {
    const ids = refundCandidates(REFUND, [CHARGE, REFUND]).map((c) => c.charge.id)
    expect(ids).toContain('charge')
  })

  it('חיוב שנרשם אחרי הזיכוי אינו מועמד', () => {
    const later = expense({
      id: 'later',
      name: 'RESPOND.IO',
      amount: 306,
      paidDate: '2026-07-20',
    })
    const ids = refundCandidates(REFUND, [later, REFUND]).map((c) => c.charge.id)
    expect(ids).not.toContain('later')
  })

  it('חיוב באמצעי תשלום אחר אינו מועמד', () => {
    const bank = expense({
      id: 'bank',
      name: 'RESPOND.IO',
      amount: 306,
      paidDate: '2026-06-10',
      paymentMethod: 'bank_transfer',
    })
    const ids = refundCandidates(REFUND, [bank, REFUND]).map((c) => c.charge.id)
    expect(ids).not.toContain('bank')
  })

  it('חיוב ישן מ-120 יום אינו מועמד', () => {
    const old = expense({
      id: 'old',
      name: 'RESPOND.IO',
      amount: 306,
      paidDate: '2026-01-01',
    })
    const ids = refundCandidates(REFUND, [old, REFUND]).map((c) => c.charge.id)
    expect(ids).not.toContain('old')
  })

  it('חיוב קטן מהזיכוי אינו מועמד — זיכוי אינו יכול לעלות על החיוב', () => {
    const small = expense({
      id: 'small',
      name: 'RESPOND.IO',
      amount: 100,
      paidDate: '2026-06-10',
    })
    const ids = refundCandidates(REFUND, [small, REFUND]).map((c) => c.charge.id)
    expect(ids).not.toContain('small')
  })

  it('זיכוי אחד מול שני חיובים זהים — לא משייכים אוטומטית (דו-משמעי)', () => {
    const twin = expense({
      id: 'twin',
      name: 'RESPOND.IO',
      amount: 306,
      paidDate: '2026-06-11',
    })
    expect(suggestedRefundMatch(REFUND, [CHARGE, twin, REFUND])).toBeNull()
  })

  it('N זיכויים מול N חיובים זהים — שיוך 1:1 בלי חשבונית', () => {
    const c1 = expense({
      id: 'wise-1',
      name: 'Wise',
      amount: 651,
      paidDate: '2026-06-01',
    })
    const c2 = expense({
      id: 'wise-2',
      name: 'Wise',
      amount: 651,
      paidDate: '2026-06-02',
    })
    const c3 = expense({
      id: 'wise-3',
      name: 'Wise',
      amount: 651,
      paidDate: '2026-06-03',
    })
    const r1 = expense({
      id: 'wr-1',
      name: 'זיכוי — Wise',
      amount: -651,
      paidDate: '2026-07-06',
    })
    const r2 = expense({
      id: 'wr-2',
      name: 'זיכוי — Wise',
      amount: -651,
      paidDate: '2026-07-06',
    })
    const r3 = expense({
      id: 'wr-3',
      name: 'זיכוי — Wise',
      amount: -651,
      paidDate: '2026-07-06',
    })
    const all = [c1, c2, c3, r1, r2, r3]
    const pairs = pairConfidentRefunds(all)
    expect(pairs.size).toBe(3)
    expect(new Set(pairs.values())).toEqual(
      new Set(['wise-1', 'wise-2', 'wise-3']),
    )

    const workflowIds = listInvoiceWorkflowRows(all, '2026-06', '2026-07').map(
      (r) => r.expense.id,
    )
    expect(workflowIds).not.toContain('wise-1')
    expect(workflowIds).not.toContain('wise-2')
    expect(workflowIds).not.toContain('wise-3')
    for (const id of ['wise-1', 'wise-2', 'wise-3']) {
      const row = listReconciliationRows(all, '2026-06', '2026-07').find(
        (r) => r.expense.id === id,
      )
      expect(row?.status).toBe('refunded')
      expect(row ? isInvoiceWorkflowRow(row) : true).toBe(false)
      expect(row ? isOpenReconciliationRow(row) : true).toBe(false)
    }
  })

  it('חיוב מאותו ספק מדורג לפני חיוב בסכום זהה מספק אחר', () => {
    const other = expense({
      id: 'other',
      name: 'GOOGLE',
      amount: 306,
      paidDate: '2026-07-01',
    })
    const ranked = refundCandidates(REFUND, [other, CHARGE, REFUND])
    expect(ranked[0]?.charge.id).toBe('charge')
  })
})

describe('חוק: חיוב שזוכה במלואו נסגר בלי חשבונית', () => {
  const linked = { ...REFUND, refundForExpenseId: 'charge' }

  it('סטטוס הזיכוי מסמן ביטול מלא', () => {
    const status = refundStatusFor(CHARGE, [CHARGE, linked])
    expect(status.fully).toBe(true)
    expect(status.remaining).toBe(0)
  })

  it('זיכוי חלקי משאיר יתרה פתוחה', () => {
    const partial = { ...linked, id: 'partial', amount: -100 }
    const status = refundStatusFor(CHARGE, [CHARGE, partial])
    expect(status.partially).toBe(true)
    expect(status.remaining).toBe(206)
  })

  it('החיוב יוצא מרשימת הממתינים לחשבונית', () => {
    const rows = listReconciliationRows([CHARGE, linked], '2026-06', '2026-07')
    const row = rows.find((r) => r.expense.id === 'charge')
    expect(row?.status).toBe('refunded')
    expect(row ? isOpenReconciliationRow(row) : true).toBe(false)
  })

  it('בלי שיוך ידני — התאמה בטוחה סוגרת את החיוב אוטומטית', () => {
    const rows = listReconciliationRows([CHARGE, REFUND], '2026-06', '2026-07')
    const row = rows.find((r) => r.expense.id === 'charge')
    expect(row?.status).toBe('refunded')
    expect(row ? isOpenReconciliationRow(row) : true).toBe(false)
  })

  it('זיכוי דו-משמעי (שני חיובים) משאיר את החיובים ממתינים לחשבונית', () => {
    const twin = expense({
      id: 'twin',
      name: 'RESPOND.IO',
      amount: 306,
      paidDate: '2026-06-11',
    })
    const rows = listReconciliationRows(
      [CHARGE, twin, REFUND],
      '2026-06',
      '2026-07',
    )
    expect(rows.find((r) => r.expense.id === 'charge')?.status).toBe(
      'bank_missing_document',
    )
    expect(rows.find((r) => r.expense.id === 'twin')?.status).toBe(
      'bank_missing_document',
    )
  })

  it('הזיכוי עצמו אינו מופיע כשורה שממתינה לחשבונית', () => {
    const rows = listReconciliationRows([CHARGE, REFUND], '2026-06', '2026-07')
    expect(rows.some((r) => r.expense.id === 'refund')).toBe(false)
  })
})

describe('חוק: הפרשי שער אינם מונעים שיוך זיכוי', () => {
  // Wise ממיר פעמיים, ולכן הזיכוי חוזר בסכום שקלי מעט שונה מהחיוב
  const WISE_CHARGE = expense({
    id: 'wise-charge',
    name: 'WISE',
    amount: 412.4,
    paidDate: '2026-06-18',
    billingMonth: '2026-06',
  })
  const WISE_REFUND = expense({
    id: 'wise-refund',
    name: 'זיכוי — WISE',
    amount: -415.9,
    paidDate: '2026-07-03',
    billingMonth: '2026-07',
  })

  it('זיכוי גדול מעט מהחיוב עדיין מועמד', () => {
    const ids = refundCandidates(WISE_REFUND, [WISE_CHARGE, WISE_REFUND]).map(
      (c) => c.charge.id,
    )
    expect(ids).toContain('wise-charge')
  })

  it('ההתאמה מוצעת אוטומטית ומסומנת כהפרש שער', () => {
    const s = suggestedRefundMatch(WISE_REFUND, [WISE_CHARGE, WISE_REFUND])
    expect(s?.charge.id).toBe('wise-charge')
    expect(s?.exactAmount).toBe(false)
    expect(s?.nearAmount).toBe(true)
    expect(s?.gap).toBe(3.5)
  })

  it('החיוב נסגר במלואו למרות היתרה השלילית', () => {
    const linked = { ...WISE_REFUND, refundForExpenseId: 'wise-charge' }
    expect(refundStatusFor(WISE_CHARGE, [WISE_CHARGE, linked]).fully).toBe(true)
    const rows = listReconciliationRows(
      [WISE_CHARGE, linked],
      '2026-06',
      '2026-07',
    )
    expect(rows.find((r) => r.expense.id === 'wise-charge')?.status).toBe(
      'refunded',
    )
  })

  it('פער גדול מטווח סטיית השער אינו נחשב התאמה', () => {
    const far = { ...WISE_REFUND, id: 'far', amount: -480 }
    const c = refundCandidates(far, [WISE_CHARGE, far]).find(
      (x) => x.charge.id === 'wise-charge',
    )
    expect(c).toBeUndefined()
  })

  it('אותו סכום מט״ח נחשב זהה גם כשהשקלים שונים', () => {
    const usdCharge = expense({
      id: 'usd-charge',
      name: 'GOOGLE',
      amount: 74.32,
      currency: 'USD',
      originalAmount: 20,
      paidDate: '2026-06-20',
    })
    const usdRefund = expense({
      id: 'usd-refund',
      name: 'זיכוי — GOOGLE',
      amount: -71.1,
      currency: 'USD',
      originalAmount: -20,
      paidDate: '2026-07-04',
    })
    const c = refundCandidates(usdRefund, [usdCharge, usdRefund])[0]
    expect(c?.charge.id).toBe('usd-charge')
    expect(c?.exactAmount).toBe(true)
  })
})

describe('רשימת הזיכויים שממתינים לשיוך', () => {
  it('כוללת רק זיכויים ללא שיוך', () => {
    const linked = expense({
      id: 'linked',
      amount: -50,
      refundForExpenseId: 'charge',
    })
    const ids = listUnlinkedRefunds([CHARGE, REFUND, linked]).map((e) => e.id)
    expect(ids).toEqual(['refund'])
  })
})
