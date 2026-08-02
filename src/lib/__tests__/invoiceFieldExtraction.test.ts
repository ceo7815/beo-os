import { describe, expect, it } from 'vitest'
import {
  extractInvoiceFields,
  findAmounts,
  normalizeFoundDate,
} from '../invoiceFieldExtraction'

describe('נרמול תאריך מטקסט חשבונית', () => {
  it('קורא פורמט ישראלי יום/חודש/שנה', () => {
    expect(normalizeFoundDate('תאריך: 31/07/2026')).toBe('2026-07-31')
  })

  it('קורא הפרדה בנקודות', () => {
    expect(normalizeFoundDate('05.08.2026')).toBe('2026-08-05')
  })

  it('קורא פורמט ISO', () => {
    expect(normalizeFoundDate('2026-07-31')).toBe('2026-07-31')
  })

  it('משלים שנה דו-ספרתית', () => {
    expect(normalizeFoundDate('31/07/26')).toBe('2026-07-31')
  })

  it('דוחה חודש לא חוקי', () => {
    expect(normalizeFoundDate('31/13/2026')).toBeUndefined()
  })

  it('מחזיר ריק כשאין תאריך', () => {
    expect(normalizeFoundDate('סה"כ לתשלום')).toBeUndefined()
  })
})

describe('איתור סכומים בשורה', () => {
  it('קורא סכום עם מפריד אלפים', () => {
    expect(findAmounts('סה"כ לתשלום 8,779.73 ₪')).toContain(8779.73)
  })

  it('קורא סכום עם אגורות בלבד', () => {
    expect(findAmounts('306.00')).toContain(306)
  })

  it('מתעלם משורה ללא מספרים', () => {
    expect(findAmounts('חשבונית מס')).toEqual([])
  })
})

const INVOICE = [
  'HUB ADVANCED בע"מ',
  'ע.מ 516123456',
  'חשבונית מס 10432',
  'תאריך הפקה: 31/07/2026',
  'תיאור  כמות  מחיר',
  'שירותי פיתוח  1  7,440.45',
  'מע"מ 18%  1,339.28',
  'סה"כ לתשלום 8,779.73 ₪',
].join('\n')

describe('חוק: השדות נקראים מהחשבונית ומוצעים למשתמש', () => {
  const fields = extractInvoiceFields(INVOICE)

  it('תאריך החשבונית מזוהה לפי התווית', () => {
    expect(fields.date?.value).toBe('2026-07-31')
    expect(fields.date?.confidence).toBeGreaterThan(80)
  })

  it('הסכום הנלקח הוא הסך לתשלום ולא שורת ביניים', () => {
    expect(fields.amount?.value).toBe(8779.73)
  })

  it('מספר החשבונית מזוהה', () => {
    expect(fields.invoiceNumber?.value).toBe('10432')
  })

  it('מספר עוסק מזוהה', () => {
    expect(fields.vatId?.value).toBe('516123456')
  })

  it('שם הספק נלקח מראש המסמך', () => {
    expect(fields.supplierName?.value).toContain('HUB ADVANCED')
  })
})

describe('עמידות בפורמטים שונים', () => {
  it('קורא חשבונית באנגלית', () => {
    const en = [
      'Respond.io Pte Ltd',
      'Invoice Number: 88214',
      'Invoice Date: 2026-06-10',
      'Subtotal 260.00',
      'Total Due 306.00',
    ].join('\n')
    const f = extractInvoiceFields(en)
    expect(f.date?.value).toBe('2026-06-10')
    expect(f.amount?.value).toBe(306)
    expect(f.invoiceNumber?.value).toBe('88214')
  })

  it('קורא עברית שחולצה בסדר הפוך', () => {
    const reversed = [
      'םולשתל כ"הס 1,180.00',
      'ךיראת 15/07/2026',
    ].join('\n')
    const f = extractInvoiceFields(reversed)
    expect(f.amount?.value).toBe(1180)
    expect(f.date?.value).toBe('2026-07-15')
  })

  it('בלי תווית סיכום נבחר הסכום הגדול, בביטחון נמוך', () => {
    const f = extractInvoiceFields('שורה 100.00\nשורה 250.50')
    expect(f.amount?.value).toBe(250.5)
    expect(f.amount?.confidence).toBeLessThan(50)
  })

  it('טקסט ריק אינו מייצר הצעות', () => {
    expect(extractInvoiceFields('')).toEqual({})
  })
})
