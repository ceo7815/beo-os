import { describe, expect, it } from 'vitest'
import {
  amountsIdentical,
  computeCoverage,
  daysBetween,
  evaluateMatch,
  withinMatchWindow,
} from '../financeMatchRules'

describe('חוק: סכום זהה בלבד', () => {
  it('סכומים זהים מתאימים', () => {
    expect(amountsIdentical(1180, 1180)).toBe(true)
  })

  it('הפרש של אגורה אחת אינו התאמה', () => {
    expect(amountsIdentical(1180, 1180.01)).toBe(false)
  })

  it('סטייה של אחוזים אינה התאמה — גם כשהיא קטנה', () => {
    expect(amountsIdentical(10000, 10400)).toBe(false)
    expect(amountsIdentical(100, 101)).toBe(false)
  })

  it('סכום אפס או שלילי אינו מתאים לכלום', () => {
    expect(amountsIdentical(0, 0)).toBe(false)
    expect(amountsIdentical(-100, -100)).toBe(false)
  })
})

describe('חוק: חלון של 45 יום', () => {
  it('45 יום בדיוק בתוך החלון', () => {
    expect(daysBetween('2026-07-01', '2026-08-15')).toBe(45)
    expect(withinMatchWindow('2026-07-01', '2026-08-15')).toBe(true)
  })

  it('46 יום מחוץ לחלון', () => {
    expect(withinMatchWindow('2026-07-01', '2026-08-16')).toBe(false)
  })

  it('הכיוון אינו משנה', () => {
    expect(withinMatchWindow('2026-08-15', '2026-07-01')).toBe(true)
  })
})

describe('חוק: הכרעת התאמה', () => {
  it('סכום זהה בתוך החלון — התאמה ודאית', () => {
    const r = evaluateMatch(
      { amount: 1180, date: '2026-07-10' },
      { amount: 1180, date: '2026-07-01' },
    )
    expect(r.verdict).toBe('match')
  })

  it('סכום שונה — לבדיקה, עם סיבה', () => {
    const r = evaluateMatch(
      { amount: 1180, date: '2026-07-10' },
      { amount: 1200, date: '2026-07-01' },
    )
    expect(r.verdict).toBe('review')
    expect(r.reason).toContain('הסכומים')
  })

  it('סכום זהה אבל מעבר לחלון — לבדיקה', () => {
    const r = evaluateMatch(
      { amount: 1180, date: '2026-09-30' },
      { amount: 1180, date: '2026-07-01' },
    )
    expect(r.verdict).toBe('review')
    expect(r.reason).toContain('45')
  })
})

describe('חוק: מטבע חוץ נקבע לפי שורת האשראי', () => {
  it('חשבונית בדולר אינה מוכרזת כהתאמה אוטומטית', () => {
    const r = evaluateMatch(
      { amount: 74.32, date: '2026-07-10' },
      { amount: 20, date: '2026-07-08', currency: 'USD' },
    )
    expect(r.verdict).toBe('review')
    expect(r.reason).toContain('מטבע חוץ')
  })

  it('גם כשהסכומים במקרה זהים, מטבע חוץ עובר בדיקה', () => {
    const r = evaluateMatch(
      { amount: 74.32, date: '2026-07-10' },
      { amount: 74.32, date: '2026-07-08', currency: 'USD' },
    )
    expect(r.verdict).toBe('review')
  })

  it('מסמך שסומן ILS מפורשות מתנהג כרגיל', () => {
    const r = evaluateMatch(
      { amount: 1180, date: '2026-07-10' },
      { amount: 1180, date: '2026-07-08', currency: 'ILS' },
    )
    expect(r.verdict).toBe('match')
  })
})

describe('מדד הכיסוי נמדד בכסף ולא בשורות', () => {
  it('בלי הוצאות הכיסוי מלא', () => {
    expect(computeCoverage([]).percent).toBe(100)
  })

  it('שורה גדולה לא מותאמת מורידה את הכיסוי הרבה יותר משורה קטנה', () => {
    const bigUnmatched = computeCoverage([
      { amount: 10000, matched: false },
      { amount: 100, matched: true },
    ])
    const smallUnmatched = computeCoverage([
      { amount: 10000, matched: true },
      { amount: 100, matched: false },
    ])

    expect(bigUnmatched.percent).toBeLessThan(2)
    expect(smallUnmatched.percent).toBeGreaterThan(98)
  })

  it('הכל מותאם — 100 אחוז', () => {
    const c = computeCoverage([
      { amount: 500, matched: true },
      { amount: 1500, matched: true },
    ])
    expect(c.percent).toBe(100)
    expect(c.unmatchedAmount).toBe(0)
  })

  it('הסכום שאינו מותאם מדווח בשקלים ולא רק באחוזים', () => {
    const c = computeCoverage([
      { amount: 3000, matched: true },
      { amount: 1000, matched: false },
    ])
    expect(c.percent).toBe(75)
    expect(c.unmatchedAmount).toBe(1000)
    expect(c.matchedRows).toBe(1)
    expect(c.totalRows).toBe(2)
  })
})
