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
import { parseForeignNote } from '../foreignCurrency'

/** עמודות בייצוא כאל/דיינרס (מרכנתיל דיסקונט): תאריך · בית עסק · סכום · כרטיס · מועד חיוב · סוג · ארנק · הערות */
const COL = {
  date: 0,
  merchant: 1,
  amount: 2,
  card: 3,
  chargeDate: 4,
  type: 5,
  wallet: 6,
  notes: 7,
} as const

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

function summaryAmount(row: unknown[]): number | undefined {
  const amount = cellToNumber(row[COL.amount])
  return amount > 0 ? amount : undefined
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
    let seq = 0

    const skip = (reason: SkipReason) => {
      skipped += 1
      skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1
    }
    let fileTotal: number | undefined

    for (const row of rows) {
      if (!headerSeen) {
        if (isHeaderRow(row)) headerSeen = true
        continue
      }
      if (isHeaderRow(row) || isTitleMetaRow(row)) {
        skip('header_meta')
        continue
      }
      if (isSummaryRow(row)) {
        if (isExplicitTotalRow(row)) {
          const total = summaryAmount(row)
          if (total != null) fileTotal = total
        }
        skip('summary')
        continue
      }

      const date = excelSerialToYmd(row[COL.date])
      const merchant = cellToString(row[COL.merchant])
      const rawAmount = cellToNumber(row[COL.amount])
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

      const rawType = cellToString(row[COL.type])
      const notes = cellToString(row[COL.notes])
      // "עסקה בקליטה" מופיעה לעיתים בעמודת הערות (לא בסוג) — לא נכללת בסה״כ הבנק
      const pendingText = `${rawType} ${notes}`
      if (SKIP_TYPES.some((t) => pendingText.includes(t))) {
        skip('pending')
        continue
      }

      const chargeDate = excelSerialToYmd(row[COL.chargeDate]) || undefined

      const isCredit =
        CREDIT_TYPES.some((t) => rawType.includes(t)) ||
        rawAmount < 0 ||
        notes.includes('זיכוי') ||
        notes.includes('החזר')
      const amount = Math.abs(rawAmount)
      const account = cellToString(row[COL.card]) || undefined
      const foreignNote = notes.includes('סכום העסקה') ? notes : undefined
      const foreign = parseForeignNote(foreignNote)

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
        `פער התאמה: חיובים ${chargeSum.toFixed(0)} − זיכויים ${creditSum.toFixed(0)} = ${parsedNet.toFixed(0)}, מול סה״כ בקובץ ${fileTotal.toFixed(0)}`,
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
