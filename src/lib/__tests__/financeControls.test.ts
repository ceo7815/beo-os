import { describe, expect, it } from 'vitest'
import {
  bankBalanceControl,
  buildCardCycleControls,
  cardCycleControl,
  controlsPassed,
  failingControls,
} from '../financeControls'

describe('בקרת יתרת בנק', () => {
  it('תנועות שתואמות את שינוי היתרה — תקין', () => {
    const r = bankBalanceControl({
      openingBalance: 10000,
      closingBalance: 12500,
      movements: [5000, -1500, -1000],
    })
    expect(r.status).toBe('ok')
    expect(r.difference).toBe(0)
  })

  it('תנועה שלא יובאה מזוהה כחסר', () => {
    const r = bankBalanceControl({
      openingBalance: 10000,
      closingBalance: 12500,
      movements: [5000, -1500],
    })
    expect(r.status).toBe('mismatch')
    expect(r.difference).toBe(1000)
  })

  it('תנועה כפולה מזוהה כעודף', () => {
    const r = bankBalanceControl({
      openingBalance: 10000,
      closingBalance: 12500,
      movements: [5000, -1500, -1000, -1000],
    })
    expect(r.status).toBe('mismatch')
    expect(r.detail).toContain('לא יובאה')
  })

  it('בלי יתרות אין בקרה — ולא מדווחים בכזב שהכל תקין', () => {
    const r = bankBalanceControl({ movements: [100, -50] })
    expect(r.status).toBe('insufficient_data')
    expect(r.status).not.toBe('ok')
  })

  it('רעש עיגול של שברי אגורה אינו נחשב פער', () => {
    const r = bankBalanceControl({
      openingBalance: 0,
      closingBalance: 0.3,
      movements: [0.1, 0.1, 0.1],
    })
    expect(r.status).toBe('ok')
  })
})

describe('בקרת מחזור חיוב אשראי', () => {
  it('סכום העסקאות שווה לחיוב בבנק — תקין', () => {
    const r = cardCycleControl({
      cycleLabel: 'חיוב 2 ביולי',
      transactions: [
        { amount: 300, isCredit: false },
        { amount: 700, isCredit: false },
      ],
      bankChargeAmount: 1000,
    })
    expect(r.status).toBe('ok')
  })

  it('זיכוי מקטין את המחזור', () => {
    const r = cardCycleControl({
      cycleLabel: 'חיוב 2 ביולי',
      transactions: [
        { amount: 1200, isCredit: false },
        { amount: 200, isCredit: true },
      ],
      bankChargeAmount: 1000,
    })
    expect(r.status).toBe('ok')
  })

  it('עסקה חסרה בקובץ הכרטיס מזוהה מול הבנק', () => {
    const r = cardCycleControl({
      cycleLabel: 'חיוב 2 ביולי',
      transactions: [{ amount: 700, isCredit: false }],
      bankChargeAmount: 1000,
    })
    expect(r.status).toBe('mismatch')
    expect(r.difference).toBe(-300)
    expect(r.detail).toContain('חסרות')
  })

  it('בלי חיוב מזוהה בבנק אין בקרה', () => {
    const r = cardCycleControl({
      cycleLabel: 'חיוב 2 ביולי',
      transactions: [{ amount: 700, isCredit: false }],
    })
    expect(r.status).toBe('insufficient_data')
  })
})

describe('הצלבת מחזורי אשראי מול חיובי הבנק', () => {
  const cal = [
    { date: '2026-06-10', chargeDate: '2026-07-02', amount: 300, isCredit: false },
    { date: '2026-06-20', chargeDate: '2026-07-02', amount: 700, isCredit: false },
    { date: '2026-07-11', chargeDate: '2026-08-02', amount: 450, isCredit: false },
  ]

  it('כל מחזור מוצלב מול החיוב שירד בבנק', () => {
    const results = buildCardCycleControls(cal, [
      { date: '2026-07-02', amount: 1000 },
      { date: '2026-08-02', amount: 450 },
    ])
    expect(results).toHaveLength(2)
    expect(results.every((r) => r.status === 'ok')).toBe(true)
  })

  it('העסקאות מקובצות לפי מועד החיוב ולא לפי תאריך העסקה', () => {
    const results = buildCardCycleControls(cal, [])
    expect(results.map((r) => r.actual)).toEqual([1000, 450])
  })

  it('פער במחזור אחד אינו מסתיר מחזור תקין', () => {
    const results = buildCardCycleControls(cal, [
      { date: '2026-07-02', amount: 1200 },
      { date: '2026-08-02', amount: 450 },
    ])
    expect(results[0]!.status).toBe('mismatch')
    expect(results[1]!.status).toBe('ok')
    expect(controlsPassed(results)).toBe(false)
  })

  it('הפרש של יומיים בין מועד החיוב לירידה בבנק עדיין מזוהה', () => {
    const results = buildCardCycleControls(cal, [
      { date: '2026-07-04', amount: 1000 },
    ])
    expect(results[0]!.status).toBe('ok')
  })

  it('שני כרטיסים באותו מועד חיוב נבדקים בנפרד ולא כמחזור אחד', () => {
    const results = buildCardCycleControls(
      [
        { date: '2026-05-04', chargeDate: '2026-06-02', amount: 15951.01, isCredit: false, account: 'ויזה 0942' },
        { date: '2026-05-06', chargeDate: '2026-06-02', amount: 625.16, isCredit: false, account: 'דיינרס מסטרקארד 6814' },
      ],
      [
        { date: '2026-06-02', amount: 625.16, description: 'דיינרס קלו חיוב' },
        { date: '2026-06-02', amount: 15951.01, description: 'חיוב לכרטיס ויזה 0942' },
      ],
    )
    expect(results).toHaveLength(2)
    expect(results.every((r) => r.status === 'ok')).toBe(true)
  })

  it('ארבע ספרות הכרטיס גוברות על קרבת התאריך', () => {
    const results = buildCardCycleControls(
      [{ date: '2026-05-04', chargeDate: '2026-06-02', amount: 100, isCredit: false, account: 'ויזה 0942' }],
      [
        { date: '2026-06-02', amount: 900, description: 'חיוב לכרטיס ויזה 1111' },
        { date: '2026-06-03', amount: 100, description: 'חיוב לכרטיס ויזה 0942' },
      ],
    )
    expect(results[0]!.status).toBe('ok')
  })

  it('בלי זיהוי כרטיס הבקרה נופלת חזרה להתאמה לפי תאריך', () => {
    const results = buildCardCycleControls(
      [{ date: '2026-06-10', chargeDate: '2026-07-02', amount: 1000, isCredit: false }],
      [{ date: '2026-07-02', amount: 1000 }],
    )
    expect(results[0]!.status).toBe('ok')
  })

  it('חיוב בנק אינו משמש פעמיים לשני מחזורים', () => {
    const results = buildCardCycleControls(
      [
        { date: '2026-07-01', chargeDate: '2026-07-02', amount: 500, isCredit: false },
        { date: '2026-07-02', chargeDate: '2026-07-03', amount: 500, isCredit: false },
      ],
      [{ date: '2026-07-02', amount: 500 }],
    )
    expect(results[0]!.status).toBe('ok')
    expect(results[1]!.status).toBe('insufficient_data')
  })
})

describe('הכרעה משולבת', () => {
  it('בקרה אחת שנכשלת שוללת את האימות', () => {
    const results = [
      bankBalanceControl({
        openingBalance: 0,
        closingBalance: 100,
        movements: [100],
      }),
      cardCycleControl({
        cycleLabel: 'א',
        transactions: [{ amount: 50, isCredit: false }],
        bankChargeAmount: 80,
      }),
    ]
    expect(controlsPassed(results)).toBe(false)
    expect(failingControls(results)).toHaveLength(1)
  })

  it('נתונים חסרים אינם נחשבים הצלחה', () => {
    const results = [bankBalanceControl({ movements: [1] })]
    expect(controlsPassed(results)).toBe(false)
  })
})
