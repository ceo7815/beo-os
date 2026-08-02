import { describe, expect, it } from 'vitest'
import path from 'node:path'
import {
  UnsafePathError,
  buildStoredName,
  contentTypeFor,
  documentExtension,
  documentUrlFor,
  isAcceptedDocument,
  isSafeSegment,
  resolveDocumentPath,
} from '../financeDocumentStore.js'

const BASE = path.resolve('/srv/data/finance-documents')

describe('סוגי מסמך מותרים', () => {
  it('מקבל חשבונית PDF', () => {
    expect(isAcceptedDocument('invoice.pdf')).toBe(true)
  })

  it('מקבל צילום חשבונית', () => {
    expect(isAcceptedDocument('IMG_1234.JPG')).toBe(true)
    expect(isAcceptedDocument('scan.heic')).toBe(true)
  })

  it('דוחה קובץ הרצה', () => {
    expect(isAcceptedDocument('virus.exe')).toBe(false)
    expect(isAcceptedDocument('script.sh')).toBe(false)
  })

  it('דוחה קובץ בלי סיומת', () => {
    expect(isAcceptedDocument('invoice')).toBe(false)
  })

  it('מזהה סיומת ללא תלות באותיות גדולות', () => {
    expect(documentExtension('A.PDF')).toBe('.pdf')
  })
})

describe('סוג התוכן להגשה', () => {
  it('PDF מוגש כ-PDF כדי שייפתח בדפדפן', () => {
    expect(contentTypeFor('a.pdf')).toBe('application/pdf')
  })

  it('תמונה מוגשת כתמונה', () => {
    expect(contentTypeFor('a.jpeg')).toBe('image/jpeg')
    expect(contentTypeFor('a.png')).toBe('image/png')
  })

  it('סיומת לא מוכרת אינה מוגשת כסוג שהדפדפן ירנדר', () => {
    expect(contentTypeFor('a.xyz')).toBe('application/octet-stream')
  })
})

describe('חוק: שם הקובץ מהמשתמש אינו משתתף בבניית הנתיב', () => {
  it('השם הנשמר מורכב ממזהה אקראי וסיומת בלבד', () => {
    const stored = buildStoredName('חשבונית ../../etc/passwd.pdf')
    expect(stored).toMatch(/^[0-9a-f-]{36}\.pdf$/)
  })

  it('שני קבצים באותו שם אינם דורסים זה את זה', () => {
    expect(buildStoredName('a.pdf')).not.toBe(buildStoredName('a.pdf'))
  })
})

describe('חוק: אי אפשר לצאת מתיקיית האחסון', () => {
  it('מזהה תקין מייצר נתיב בתוך התיקייה', () => {
    const p = resolveDocumentPath(BASE, 'exp123', 'abc-def.pdf')
    expect(p).toBe(path.join(BASE, 'exp123', 'abc-def.pdf'))
  })

  it('נקודותיים כפולות נדחות', () => {
    expect(() => resolveDocumentPath(BASE, '..', 'a.pdf')).toThrow(
      UnsafePathError,
    )
    expect(() => resolveDocumentPath(BASE, 'exp123', '../../etc/passwd')).toThrow(
      UnsafePathError,
    )
  })

  it('לוכסן בשם נדחה', () => {
    expect(() => resolveDocumentPath(BASE, 'a/b', 'x.pdf')).toThrow(
      UnsafePathError,
    )
    expect(() => resolveDocumentPath(BASE, 'exp', 'a\\b.pdf')).toThrow(
      UnsafePathError,
    )
  })

  it('מזהה ריק נדחה', () => {
    expect(() => resolveDocumentPath(BASE, '', 'x.pdf')).toThrow(UnsafePathError)
  })

  it('נתיב מוחלט נדחה', () => {
    expect(() => resolveDocumentPath(BASE, 'exp', '/etc/passwd')).toThrow(
      UnsafePathError,
    )
  })
})

describe('בדיקת מזהה בטוח', () => {
  it('מזהה Firestore רגיל עובר', () => {
    expect(isSafeSegment('K3nQ8vRt2LmXpZa1')).toBe(true)
  })

  it('מזהה עם תווים מיוחדים נדחה', () => {
    expect(isSafeSegment('a b')).toBe(false)
    expect(isSafeSegment('a;b')).toBe(false)
    expect(isSafeSegment('חשבונית')).toBe(false)
  })
})

describe('כתובת המסמך', () => {
  it('יחסית, כדי שתעבוד גם בפיתוח וגם בפרודקשן', () => {
    expect(documentUrlFor('exp1', 'file.pdf')).toBe(
      '/api/finance-documents/exp1/file.pdf',
    )
  })
})
