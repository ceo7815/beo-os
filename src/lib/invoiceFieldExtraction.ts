/**
 * חילוץ שדות מחשבונית ספק.
 *
 * רוב חשבוניות הספק מגיעות כ-PDF דיגיטלי שכבר מכיל שכבת טקסט, ולכן אפשר
 * לקרוא מהן ישירות — בלי OCR, בלי שירות חיצוני ובלי שהמסמך יוצא מהמחשב.
 *
 * הערכים המוחזרים הם הצעה בלבד. ההצמדה נשארת בשליטת המשתמש, מפני שחשבונית
 * שמזוהה לא נכון תזיז הוצאה לחודש שגוי — טעות שקשה לגלות בדיעבד.
 */

export type FieldGuess<T> = {
  value: T
  /** התווית שממנה נלקח הערך — מאפשרת למשתמש לשפוט את ההצעה */
  label?: string
  /** ככל שגבוה יותר, ההצעה בטוחה יותר */
  confidence: number
}

export type ExtractedInvoiceFields = {
  date?: FieldGuess<string>
  amount?: FieldGuess<number>
  invoiceNumber?: FieldGuess<string>
  supplierName?: FieldGuess<string>
  vatId?: FieldGuess<string>
}

/**
 * חילוץ טקסט מ-PDF עלול להחזיר עברית בסדר הפוך.
 * השוואה מול המילה ומול היפוכה חוסכת תלות בכיוון שבו הקובץ נוצר.
 */
function reverseText(s: string): string {
  return [...s].reverse().join('')
}

function lineMatches(line: string, labels: string[]): string | undefined {
  const reversed = reverseText(line)
  for (const label of labels) {
    if (line.includes(label) || reversed.includes(label)) return label
  }
  return undefined
}

const DATE_LABELS = [
  'תאריך הפקה',
  'תאריך חשבונית',
  'תאריך המסמך',
  'תאריך עסקה',
  'תאריך',
  'Invoice Date',
  'Date of Issue',
  'Issue Date',
  'Date',
]

const TOTAL_LABELS = [
  'סה"כ לתשלום',
  'סה״כ לתשלום',
  'סך הכל לתשלום',
  'סכום לתשלום',
  'לתשלום',
  'סה"כ כולל מע"מ',
  'סה״כ כולל מע״מ',
  'סה"כ',
  'סה״כ',
  'סך הכל',
  'Total Due',
  'Amount Due',
  'Grand Total',
  'Total',
]

const INVOICE_NUMBER_LABELS = [
  'חשבונית מס',
  'חשבונית מספר',
  'מספר חשבונית',
  'מס\' חשבונית',
  'אסמכתא',
  'Invoice Number',
  'Invoice No',
  'Invoice #',
]

const VAT_ID_LABELS = ['ע.מ', 'ח.פ', 'עוסק מורשה', 'ח״פ', 'ע״מ', 'עוסק פטור']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** ממיר תאריך שנמצא בטקסט ל-YYYY-MM-DD, או undefined אם אינו חוקי */
export function normalizeFoundDate(raw: string): string | undefined {
  const iso = raw.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (iso) {
    const [, y, m, d] = iso
    return validDate(Number(y), Number(m), Number(d))
  }
  // בישראל הפורמט הוא יום/חודש/שנה
  const dmy = raw.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (dmy) {
    const [, d, m, y] = dmy
    const year = Number(y) < 100 ? 2000 + Number(y) : Number(y)
    return validDate(year, Number(m), Number(d))
  }
  return undefined
}

function validDate(y: number, m: number, d: number): string | undefined {
  if (y < 2000 || y > 2100) return undefined
  if (m < 1 || m > 12) return undefined
  if (d < 1 || d > 31) return undefined
  return `${y}-${pad(m)}-${pad(d)}`
}

/** תאריך אינו סכום — הוא מוסר מהשורה לפני חיפוש המספרים */
const DATE_LIKE = /\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}/g

/** מוצא את כל הסכומים בשורה, בפורמט 1,234.56 */
export function findAmounts(line: string): number[] {
  const cleaned = line.replace(DATE_LIKE, ' ')
  const out: number[] = []
  const re = /\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{1,2}|\d{2,}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned))) {
    const n = Number(m[0].replace(/,/g, ''))
    if (Number.isFinite(n) && n > 0) out.push(n)
  }
  return out
}

function splitLines(text: string): string[] {
  return text
    .split(/[\r\n]+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function extractDate(lines: string[]): FieldGuess<string> | undefined {
  const found: FieldGuess<string>[] = []
  for (const line of lines) {
    const label = lineMatches(line, DATE_LABELS)
    const value = normalizeFoundDate(line)
    if (!value) continue
    found.push({
      value,
      ...(label ? { label } : {}),
      // תאריך שמופיע ליד תווית מפורשת עדיף על תאריך אקראי במסמך
      confidence: label ? 90 : 40,
    })
  }
  if (found.length === 0) return undefined
  found.sort((a, b) => b.confidence - a.confidence)
  return found[0]
}

function extractAmount(lines: string[]): FieldGuess<number> | undefined {
  const labelled: FieldGuess<number>[] = []
  let largest = 0

  for (const line of lines) {
    const amounts = findAmounts(line)
    if (amounts.length === 0) continue
    largest = Math.max(largest, ...amounts)

    const label = lineMatches(line, TOTAL_LABELS)
    if (!label) continue
    // "לתשלום" / "Due" מסמנים את השורה הסופית, ולא סכום ביניים כמו Subtotal
    const isFinal = /לתשלום|Due|Grand/i.test(label)
    // בשורת סיכום הסכום הגדול הוא הסך הכולל
    labelled.push({
      value: Math.max(...amounts),
      label,
      confidence: isFinal ? 95 : 80,
    })
  }

  if (labelled.length > 0) {
    labelled.sort((a, b) => b.confidence - a.confidence || b.value - a.value)
    return labelled[0]
  }
  if (largest > 0) return { value: largest, confidence: 30 }
  return undefined
}

function extractInvoiceNumber(lines: string[]): FieldGuess<string> | undefined {
  for (const line of lines) {
    const label = lineMatches(line, INVOICE_NUMBER_LABELS)
    if (!label) continue
    const m = line.match(/(\d{2,})/)
    if (m) return { value: m[1]!, label, confidence: 85 }
  }
  return undefined
}

function extractVatId(lines: string[]): FieldGuess<string> | undefined {
  for (const line of lines) {
    const label = lineMatches(line, VAT_ID_LABELS)
    if (!label) continue
    const m = line.match(/(\d{8,9})/)
    if (m) return { value: m[1]!, label, confidence: 85 }
  }
  return undefined
}

/**
 * שם הספק הוא בדרך כלל הכיתוב הבולט בראש המסמך.
 * שורות שהן תאריך, סכום או כותרת גנרית נפסלות.
 */
function extractSupplier(lines: string[]): FieldGuess<string> | undefined {
  const GENERIC = /^(חשבונית|קבלה|חשבונית מס|invoice|receipt|tax invoice)$/i
  for (const line of lines.slice(0, 8)) {
    if (line.length < 2 || line.length > 60) continue
    if (GENERIC.test(line)) continue
    if (normalizeFoundDate(line)) continue
    if (/^[\d\s.,:/-]+$/.test(line)) continue
    if (lineMatches(line, [...DATE_LABELS, ...TOTAL_LABELS])) continue
    return { value: line, confidence: 50 }
  }
  return undefined
}

export function extractInvoiceFields(text: string): ExtractedInvoiceFields {
  const lines = splitLines(text)
  const date = extractDate(lines)
  const amount = extractAmount(lines)
  const invoiceNumber = extractInvoiceNumber(lines)
  const supplierName = extractSupplier(lines)
  const vatId = extractVatId(lines)
  return {
    ...(date ? { date } : {}),
    ...(amount ? { amount } : {}),
    ...(invoiceNumber ? { invoiceNumber } : {}),
    ...(supplierName ? { supplierName } : {}),
    ...(vatId ? { vatId } : {}),
  }
}
