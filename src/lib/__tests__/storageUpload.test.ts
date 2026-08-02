import { describe, expect, it } from 'vitest'
import { safeFileName } from '../storageUpload'

describe('ניקוי שם קובץ להעלאה', () => {
  it('שומר עברית, מקפים ורווחים', () => {
    expect(safeFileName('חשבונית ספק - יולי.pdf')).toBe(
      'חשבונית ספק - יולי.pdf',
    )
  })

  it('מחליף תווים שאינם חוקיים בנתיב', () => {
    expect(safeFileName('Invoice (2).pdf')).toBe('Invoice _2_.pdf')
  })

  it('חוק: שם ארוך נקטע אך הסיומת נשמרת', () => {
    const long = `${'a'.repeat(300)}.pdf`
    const out = safeFileName(long)
    expect(out.endsWith('.pdf')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(120)
  })

  it('שומר סיומת תמונה בשם ארוך', () => {
    const out = safeFileName(`${'חשבונית'.repeat(40)}.jpeg`)
    expect(out.endsWith('.jpeg')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(120)
  })

  it('שם ללא סיומת נקטע רגיל', () => {
    const out = safeFileName('b'.repeat(200))
    expect(out.length).toBe(120)
  })
})
