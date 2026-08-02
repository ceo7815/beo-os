import { describe, expect, it } from 'vitest'
import * as web from '../financePeriodLock'
import * as server from '../../../server/src/lib/financePeriodLock.js'

// חוקי הנעילה קיימים פעמיים: פעם בממשק ופעם בשרת, כי לכל אחד מהם
// מודול נפרד. הבדיקה הזו מוודאת שהם לא נפרדים בהתנהגות — אם מישהו
// ישנה אחד מהם בלי השני, הבדיקה תיכשל כאן ולא בדוח החודשי.

function everyDayOfYear(year: number): string[] {
  const out: string[] = []
  for (let m = 1; m <= 12; m += 1) {
    const daysInMonth = new Date(year, m, 0).getDate()
    for (let d = 1; d <= daysInMonth; d += 1) {
      out.push(`${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
  }
  return out
}

const DAYS = [...everyDayOfYear(2026), ...everyDayOfYear(2027)]

const DOCUMENT_MONTHS = [
  '2025-11',
  '2025-12',
  '2026-01',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-12',
  '2027-01',
]

describe('זהות בין חוקי הנעילה בממשק ובשרת', () => {
  it('תאריך הנעילה זהה בכל חודש נבדק', () => {
    for (const ym of DOCUMENT_MONTHS) {
      expect(server.monthLockDate(ym)).toBe(web.monthLockDate(ym))
    }
  })

  it('קביעת חודש פתוח זהה בכל יום בשנתיים', () => {
    for (const today of DAYS) {
      expect(server.openMonth(today)).toBe(web.openMonth(today))
    }
  })

  it('שיוך מסמך זהה בכל שילוב של תאריך מסמך ויום הגשה', () => {
    for (const ym of DOCUMENT_MONTHS) {
      const docDate = `${ym}-15`
      for (const today of DAYS) {
        expect(server.resolveAttributionMonth(docDate, today)).toEqual(
          web.resolveAttributionMonth(docDate, today),
        )
      }
    }
  })

  it('יום דיווח המע״מ זהה', () => {
    expect(server.VAT_REPORT_DAY).toBe(web.VAT_REPORT_DAY)
  })
})
