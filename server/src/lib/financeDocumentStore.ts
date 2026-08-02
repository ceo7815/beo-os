import { randomUUID } from 'node:crypto'
import path from 'node:path'

/**
 * אחסון חשבוניות הספק על השרת עצמו.
 *
 * הקובץ נשמר תחת מזהה ההוצאה ובשם אקראי, והשם המקורי נשמר בבסיס הנתונים
 * לצורך תצוגה בלבד. כך שם הקובץ שמגיע מהמשתמש אינו משתתף בבניית הנתיב,
 * ואי אפשר לצאת בעזרתו מתיקיית האחסון.
 *
 * הקישור הוא ציבורי אך בלתי ניתן לניחוש — אותו מודל אבטחה בדיוק שהיה
 * בקישורי ההורדה של Firebase Storage.
 */

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024

export const ACCEPTED_EXTENSIONS = [
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.heic',
] as const

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
}

export function documentExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

export function isAcceptedDocument(name: string): boolean {
  return (ACCEPTED_EXTENSIONS as readonly string[]).includes(
    documentExtension(name),
  )
}

export function contentTypeFor(name: string): string {
  return CONTENT_TYPES[documentExtension(name)] ?? 'application/octet-stream'
}

/** שם האחסון נגזר מהסיומת בלבד — שאר השם המקורי אינו נכנס לנתיב */
export function buildStoredName(originalName: string): string {
  return `${randomUUID()}${documentExtension(originalName)}`
}

/** מזהי מסמך ותיקייה מותרים — אותיות, ספרות ומקף בלבד */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function isSafeSegment(segment: string): boolean {
  if (!segment || segment.length > 200) return false
  if (segment.includes('..')) return false
  if (segment.includes('/') || segment.includes('\\')) return false
  return SEGMENT.test(segment)
}

export class UnsafePathError extends Error {}

/**
 * נתיב מלא לקובץ בתוך תיקיית האחסון.
 * נזרקת שגיאה כשהמזהים אינם עומדים בכללים, ובנוסף מאומת שהתוצאה
 * נשארה בתוך התיקייה — הגנה כפולה מפני מעבר תיקיות.
 */
export function resolveDocumentPath(
  baseDir: string,
  expenseId: string,
  fileName: string,
): string {
  if (!isSafeSegment(expenseId) || !isSafeSegment(fileName)) {
    throw new UnsafePathError('מזהה או שם קובץ אינם חוקיים')
  }
  const base = path.resolve(baseDir)
  const full = path.resolve(base, expenseId, fileName)
  if (full !== path.join(base, expenseId, fileName)) {
    throw new UnsafePathError('נתיב מחוץ לתיקיית האחסון')
  }
  return full
}

/** הכתובת שנשמרת על ההוצאה — יחסית, כדי שתעבוד בכל סביבה */
export function documentUrlFor(expenseId: string, fileName: string): string {
  return `/api/finance-documents/${expenseId}/${fileName}`
}
