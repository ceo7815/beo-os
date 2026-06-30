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
const SKIP_TYPES = ['עסקה בקליטה']
const CREDIT_TYPES = ['זיכוי', 'החזר']

function isHeaderRow(row: unknown[]): boolean {
  const joined = row.map(cellToString).join(' ')
  return joined.includes('שם בית עסק') && joined.includes('סכום')
}

function isSummaryRow(row: unknown[]): boolean {
  const first = cellToString(row[0])
  return (
    first.includes('סה"כ') ||
    first.includes('סה״כ') ||
    first.includes('הסכום אינו כולל') ||
    first.includes('את המידע המלא')
  )
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

    for (const row of rows) {
      if (!headerSeen) {
        if (isHeaderRow(row)) headerSeen = true
        continue
      }
      if (isSummaryRow(row)) {
        skip('summary')
        continue
      }

      const date = excelSerialToYmd(row[COL.date])
      const merchant = cellToString(row[COL.merchant])
      const amount = cellToNumber(row[COL.amount])
      if (!date && !merchant) continue
      if (!merchant || amount === 0) {
        skip('empty')
        continue
      }

      const rawType = cellToString(row[COL.type])
      if (SKIP_TYPES.some((t) => rawType.includes(t))) {
        skip('pending')
        continue
      }

      const isCredit = CREDIT_TYPES.some((t) => rawType.includes(t))
      const chargeDate = excelSerialToYmd(row[COL.chargeDate]) || undefined
      const account = cellToString(row[COL.card]) || undefined
      const notes = cellToString(row[COL.notes])
      const foreignNote = notes.includes('סכום העסקה') ? notes : undefined

      seq += 1
      const ref = `cal:${date}:${Math.round(amount * 100)}:${merchant}:${seq}`

      transactions.push({
        ref,
        date,
        ...(chargeDate ? { chargeDate } : {}),
        description: merchant,
        amount: isCredit ? -Math.abs(amount) : Math.abs(amount),
        ...(foreignNote ? { foreignNote } : {}),
        ...(account ? { account } : {}),
        ...(rawType ? { rawType } : {}),
        isCredit,
      })
    }

    if (!headerSeen) {
      warnings.push('לא זוהתה שורת כותרת — ודאו שזהו ייצוא כאל/דיינרס תקין')
    }

    return { source, fileName, transactions, skipped, skippedReasons, warnings }
  },
}
