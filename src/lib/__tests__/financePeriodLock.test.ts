import { describe, expect, it } from 'vitest'
import {
  canEditMonth,
  isMonthLocked,
  monthLockDate,
  openMonth,
  resolveAttributionMonth,
} from '../financePeriodLock'

describe('חוק: חודש ננעל ב-19 לחודש העוקב', () => {
  it('יולי 2026 ננעל ב-19 באוגוסט', () => {
    expect(monthLockDate('2026-07')).toBe('2026-08-19')
  })

  it('דצמבר ננעל ב-19 בינואר של השנה הבאה', () => {
    expect(monthLockDate('2026-12')).toBe('2027-01-19')
  })

  it('ב-19 באוגוסט יולי עדיין פתוח — זה יום הדיווח עצמו', () => {
    expect(isMonthLocked('2026-07', '2026-08-19')).toBe(false)
  })

  it('ב-20 באוגוסט יולי כבר נעול', () => {
    expect(isMonthLocked('2026-07', '2026-08-20')).toBe(true)
  })

  it('חודש נעול אינו ניתן לעריכה', () => {
    expect(canEditMonth('2026-07', '2026-08-20')).toBe(false)
    expect(canEditMonth('2026-07', '2026-08-15')).toBe(true)
  })
})

describe('חוק: החודש הפתוח', () => {
  it('לפני ה-19 החודש הקודם עדיין פתוח', () => {
    expect(openMonth('2026-08-15')).toBe('2026-07')
  })

  it('אחרי ה-19 החודש הנוכחי הוא הפתוח', () => {
    expect(openMonth('2026-08-20')).toBe('2026-08')
  })

  it('בתחילת ינואר החודש הפתוח הוא דצמבר של השנה הקודמת', () => {
    expect(openMonth('2027-01-05')).toBe('2026-12')
  })
})

describe('חוק: מסמך מאחר נספר בחודש החשבונית ומסומן', () => {
  it('חשבונית יולי שהוגשה ב-10 באוגוסט נספרת ביולי', () => {
    const r = resolveAttributionMonth('2026-07-28', '2026-08-10')
    expect(r.month).toBe('2026-07')
    expect(r.late).toBe(false)
  })

  it('אותה חשבונית שהוגשה ב-25 באוגוסט נשארת ביולי ומסומנת כמאחרת', () => {
    const r = resolveAttributionMonth('2026-07-28', '2026-08-25')
    expect(r.month).toBe('2026-07')
    expect(r.late).toBe(true)
    expect(r.documentMonth).toBe('2026-07')
  })

  it('חודש המסמך המקורי נשמר גם אחרי נעילה', () => {
    const r = resolveAttributionMonth('2026-03-15', '2026-08-25')
    expect(r.documentMonth).toBe('2026-03')
    expect(r.month).toBe('2026-03')
    expect(r.late).toBe(true)
  })

  it('חשבונית עתידית נשארת בחודש שלה', () => {
    const r = resolveAttributionMonth('2026-09-05', '2026-08-25')
    expect(r.month).toBe('2026-09')
    expect(r.late).toBe(false)
  })
})
