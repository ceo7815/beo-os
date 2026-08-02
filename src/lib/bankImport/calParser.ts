import type {
  BankParser,
  ParseResult,
  ParsedTransaction,
  SkipReason,
} from './types'
import {
  cellToNumber,
  cellToString,
  excelSerialToYmd,
} from './readWorkbook'
import { normalizeCurrencyCode, parseForeignNote } from '../foreignCurrency'

/** עמודות ברירת מחדל בייצוא כאל/דיינרס ישן */
const DEFAULT_COL = {
  date: 0,
  merchant: 1,
  amount: 2,
  card: 3,
  chargeDate: 4,
  type: 5,
  wallet: 6,
  notes: 7,
  originalAmount: -1,
  currency: -1,
} as const

type ColMap = {
  date: number
  merchant: number
  amount: number
  card: number
  chargeDate: number
  type: number
  wallet: number
  notes: number
  originalAmount: number
  currency: number
}

/** סוגי עסקה שאינם הוצאה בפועל ויש לדלג עליהם */
const SKIP_TYPES = ['עסקה בקליטה', 'בקליטה']
const CREDIT_TYPES = ['זיכוי', 'החזר', 'ביטול', 'זיכוי חלקי']

const SUMMARY_MARKERS = [
  'סה"כ',
  'סה״כ',
  'סהכ',
  'הסכום אינו כולל',
  'את המידע המלא',
  'סך הכל',
  'סך-הכל',
] as const

function rowText(row: unknown[]): string {
  return row.map(cellToString).join(' ')
}

function isHeaderRow(row: unknown[]): boolean {
  const joined = rowText(row)
  return joined.includes('שם בית עסק') && joined.includes('סכום')
}

/** שורת כותרת עליונה / מטא לפני הטבלה */
function isTitleMetaRow(row: unknown[]): boolean {
  const joined = rowText(row)
  return (
    joined.includes('פירוט עסקאות') ||
    joined.includes('מרכנתיל דיסקונט') ||
    joined.includes('כרטיסי אשראי')
  )
}

function textLooksLikeSummary(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return SUMMARY_MARKERS.some((m) => t.includes(m))
}

/** שורת סה״כ מפורשת (לא רק הערת שוליים בתחתית הקובץ) */
function isExplicitTotalRow(row: unknown[]): boolean {
  const joined = rowText(row)
  return (
    joined.includes('סה"כ') ||
    joined.includes('סה״כ') ||
    /\bסהכ\b/.test(joined)
  )
}

/** שורת סיכום / הערות תחתונה — בודק את כל התאים, לא רק העמודה הראשונה */
function isSummaryRow(row: unknown[]): boolean {
  return row.some((cell) => textLooksLikeSummary(cellToString(cell)))
}

function summaryAmount(row: unknown[], amountCol: number): number | undefined {
  const amount = cellToNumber(row[amountCol])
  return amount > 0 ? amount : undefined
}

function findCol(headers: string[], predicates: ((h: string) => boolean)[]): number {
  for (const pred of predicates) {
    const idx = headers.findIndex(pred)
    if (idx >= 0) return idx
  }
  return -1
}

/** מיפוי עמודות לפי כותרות — כולל סכום מקורי / מטבע כשקיימים */
function resolveColumns(headerRow: unknown[]): ColMap {
  const headers = headerRow.map((c) => cellToString(c).trim())
  const date = findCol(headers, [
    (h) => h.includes('תאריך עסקה'),
    (h) => h === 'תאריך' || h.startsWith('תאריך'),
  ])
  const merchant = findCol(headers, [
    (h) => h.includes('שם בית עסק'),
    (h) => h.includes('בית עסק'),
  ])
  const amount = findCol(headers, [
    (h) => h.includes('סכום החיוב') || h.includes('סכום בש'),
    (h) => h === 'סכום' || (h.includes('סכום') && !h.includes('מקור')),
  ])
  const card = findCol(headers, [
    (h) => h.includes('4 ספרות') || h.includes('כרטיס'),
  ])
  const chargeDate = findCol(headers, [
    (h) => h.includes('מועד חיוב') || h.includes('תאריך חיוב'),
  ])
  const type = findCol(headers, [
    (h) => h.includes('סוג עסקה') || h === 'סוג',
  ])
  const wallet = findCol(headers, [(h) => h.includes('ארנק')])
  const notes = findCol(headers, [
    (h) => h.includes('הערות') || h.includes('הערה'),
  ])
  const originalAmount = findCol(headers, [
    (h) => h.includes('סכום מקור') || h.includes('סכום העסקה'),
    (h) => h.includes('סכום במטבע'),
  ])
  const currency = findCol(headers, [
    (h) => h === 'מטבע' || h.includes('מטבע מקור') || h.includes('מט״ח') || h.includes('מט"ח'),
  ])

  return {
    date: date >= 0 ? date : DEFAULT_COL.date,
    merchant: merchant >= 0 ? merchant : DEFAULT_COL.merchant,
    amount: amount >= 0 ? amount : DEFAULT_COL.amount,
    card: card >= 0 ? card : DEFAULT_COL.card,
    chargeDate: chargeDate >= 0 ? chargeDate : DEFAULT_COL.chargeDate,
    type: type >= 0 ? type : DEFAULT_COL.type,
    wallet: wallet >= 0 ? wallet : DEFAULT_COL.wallet,
    notes: notes >= 0 ? notes : DEFAULT_COL.notes,
    originalAmount,
    currency,
  }
}

function cellAt(row: unknown[], idx: number): unknown {
  return idx >= 0 ? row[idx] : undefined
}

export const calParser: BankParser = {
  id: 'cal_diners',
  label: 'כאל / דיינרס (מרכנתיל דיסקונט)',
  canParse(rows) {
    return rows.some(isHeaderRow)
  },
  parse(rows, fileName, source): ParseResult {
    const transactions: ParsedTransaction[] = []
    const warnings: string[] = []
    const skippedReasons: Partial<Record<SkipReason, number>> = {}
    let skipped = 0
    let headerSeen = false
    let cols: ColMap = { ...DEFAULT_COL }
    let seq = 0

    const skip = (reason: SkipReason) => {
      skipped += 1
      skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1
    }
    let fileTotal: number | undefined

    for (const row of rows) {
      if (!headerSeen) {
        if (isHeaderRow(row)) {
          headerSeen = true
          cols = resolveColumns(row)
        }
        continue
      }
      if (isHeaderRow(row) || isTitleMetaRow(row)) {
        skip('header_meta')
        continue
      }
      if (isSummaryRow(row)) {
        if (isExplicitTotalRow(row)) {
          const total = summaryAmount(row, cols.amount)
          if (total != null) fileTotal = total
        }
        skip('summary')
        continue
      }

      const date = excelSerialToYmd(cellAt(row, cols.date))
      const merchant = cellToString(cellAt(row, cols.merchant))
      const rawAmount = cellToNumber(cellAt(row, cols.amount))
      if (textLooksLikeSummary(merchant)) {
        if (isExplicitTotalRow(row)) {
          const total = rawAmount > 0 ? rawAmount : undefined
          if (total != null) fileTotal = total
        }
        skip('summary')
        continue
      }
      if (!date && !merchant) continue
      if (!date || !merchant || rawAmount === 0) {
        skip('empty')
        continue
      }

      const rawType = cellToString(cellAt(row, cols.type))
      const notes = cellToString(cellAt(row, cols.notes))
      // "עסקה בקליטה" מופיעה לעיתים בעמודת הערות (לא בסוג) — לא נכללת בסה״כ הבנק
      const pendingText = `${rawType} ${notes}`
      if (SKIP_TYPES.some((t) => pendingText.includes(t))) {
        skip('pending')
        continue
      }

      const chargeDate =
        excelSerialToYmd(cellAt(row, cols.chargeDate)) || undefined

      const isCredit =
        CREDIT_TYPES.some((t) => rawType.includes(t)) ||
        rawAmount < 0 ||
        notes.includes('זיכוי') ||
        notes.includes('החזר')
      const amount = Math.abs(rawAmount)
      const account = cellToString(cellAt(row, cols.card)) || undefined

      // מט״ח: עמודות ייעודיות בקובץ, אחרת חילוץ מהערות / משורת הטקסט
      const colOriginal = cellToNumber(cellAt(row, cols.originalAmount))
      const colCurrency = normalizeCurrencyCode(
        cellToString(cellAt(row, cols.currency)),
      )
      const fromCols =
        colOriginal > 0 && colCurrency && colCurrency !== 'ILS'
          ? { currency: colCurrency, amount: colOriginal }
          : undefined
      const fromNotes =
        parseForeignNote(notes) ?? parseForeignNote(rowText(row))
      const foreign = fromCols ?? fromNotes
      const foreignNote =
        notes && (notes.includes('סכום העסקה') || fromNotes)
          ? notes
          : foreign
            ? `סכום העסקה הוא ${foreign.amount} ${foreign.currency}`
            : undefined

      seq += 1
      const ref = `cal:${date}:${Math.round(amount * 100)}:${merchant}:${seq}`

      transactions.push({
        ref,
        date,
        ...(chargeDate ? { chargeDate } : {}),
        description: merchant,
        amount: isCredit ? -amount : amount,
        ...(foreignNote ? { foreignNote } : {}),
        ...(foreign
          ? {
              currency: foreign.currency,
              originalAmount: isCredit ? -foreign.amount : foreign.amount,
            }
          : {}),
        ...(account ? { account } : {}),
        ...(rawType ? { rawType } : {}),
        isCredit,
      })
    }

    if (!headerSeen) {
      warnings.push('לא זוהתה שורת כותרת — ודאו שזהו ייצוא כאל/דיינרס תקין')
    }

    const chargeSum = transactions
      .filter((t) => !t.isCredit)
      .reduce((s, t) => s + t.amount, 0)
    const creditSum = transactions
      .filter((t) => t.isCredit)
      .reduce((s, t) => s + Math.abs(t.amount), 0)
    const parsedNet = Math.round((chargeSum - creditSum) * 100) / 100

    if (
      fileTotal != null &&
      Math.abs(parsedNet - fileTotal) > 1
    ) {
      warnings.push(
        `פער התאמה: חיובים ${chargeSum.toFixed(2)} − זיכויים ${creditSum.toFixed(2)} = ${parsedNet.toFixed(2)}, מול סה״כ בקובץ ${fileTotal.toFixed(2)}`,
      )
    }

    return {
      source,
      fileName,
      transactions,
      skipped,
      skippedReasons,
      warnings,
      parsedNet,
      ...(fileTotal != null ? { fileTotal } : {}),
    }
  },
}
