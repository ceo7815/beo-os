import type {
  BankParser,
  CardSettlement,
  ParseResult,
  ParsedTransaction,
  SkipReason,
} from './types'
import {
  cellToNumber,
  cellToString,
  excelSerialToYmd,
} from './readWorkbook'

/** עמודות בייצוא עובר ושב (מרכנתיל דיסקונט) */
const COL = {
  date: 0,
  valueDate: 1,
  description: 2,
  amount: 3,
  balance: 4,
  reference: 5,
  fee: 6,
  channel: 7,
} as const

/** תיאורים שמייצגים חיוב מרוכז של כרטיס — כבר מיובא מקובץ האשראי */
const CARD_SETTLEMENT_RE =
  /^חיוב\s+לכרטיס|דיינרס.*חיוב|כאל.*חיוב|מסטרקארד.*חיוב|mastercard.*charge/i

function rowText(row: unknown[]): string {
  return row.map(cellToString).join(' ')
}

/**
 * מחלץ יתרת פתיחה וסגירה מעמודת היתרה הרצה.
 * הייצוא עשוי להיות מהחדש לישן, ולכן הסדר נקבע לפי התאריכים ולא לפי מיקום.
 * היתרה בשורה היא היתרה שאחרי התנועה, ולכן הפתיחה היא היתרה הראשונה
 * בניכוי התנועה שהובילה אליה.
 */
function deriveBalances(
  balanceRows: { date: string; balance: number; amount: number }[],
): {
  openingBalance?: number
  closingBalance?: number
  balanceMovements?: number[]
} {
  if (balanceRows.length === 0) return {}

  const first = balanceRows[0]!
  const last = balanceRows[balanceRows.length - 1]!
  const descending = first.date > last.date
  const chronoFirst = descending ? last : first
  const chronoLast = descending ? first : last
  const round2 = (n: number) => Math.round(n * 100) / 100

  return {
    openingBalance: round2(chronoFirst.balance - chronoFirst.amount),
    closingBalance: round2(chronoLast.balance),
    balanceMovements: balanceRows.map((r) => r.amount),
  }
}

function isOshHeaderRow(row: unknown[]): boolean {
  const joined = rowText(row)
  return (
    joined.includes('תיאור התנועה') &&
    (joined.includes('זכות/חובה') || joined.includes('זכות'))
  )
}

function isCardSettlement(description: string): boolean {
  const d = description.trim()
  if (!d) return false
  return CARD_SETTLEMENT_RE.test(d)
}

/**
 * תאריך מייצוא עו״ש מרכנתיל — פורמט M/D/YY (למשל 6/17/26 = 17 ביוני).
 */
function parseOshDate(value: unknown): string {
  if (typeof value === 'string') {
    const s = value.trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/)
    if (m) {
      const a = Number(m[1])
      const b = Number(m[2])
      const yearRaw = m[3]
      const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw
      let month: number
      let day: number
      if (a > 12) {
        day = a
        month = b
      } else if (b > 12) {
        month = a
        day = b
      } else {
        month = a
        day = b
      }
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      }
    }
  }
  return excelSerialToYmd(value)
}

export const discountOshParser: BankParser = {
  id: 'discount_osh',
  label: 'עובר ושב (מרכנתיל דיסקונט)',
  canParse(rows, fileName) {
    if (fileName.includes('עובר ושב') || fileName.includes('עו"ש')) return true
    return rows.some(
      (r) =>
        cellToString(r[0]).includes('תנועות אחרונות') ||
        isOshHeaderRow(r),
    )
  },
  parse(rows, fileName, source): ParseResult {
    const transactions: ParsedTransaction[] = []
    const warnings: string[] = []
    const skippedReasons: Partial<Record<SkipReason, number>> = {}
    let skipped = 0
    let seq = 0

    const skip = (reason: SkipReason) => {
      skipped += 1
      skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1
    }

    let inRecent = false
    let inFuture = false
    let headerSeen = false

    // כל שינויי היתרה בסדר הופעתם בקובץ, כולל שורות שאינן מיובאות כהוצאה
    const balanceRows: { date: string; balance: number; amount: number }[] = []
    const cardSettlements: CardSettlement[] = []

    for (const row of rows) {
      const joined = rowText(row)

      if (joined.includes('תנועות עתידיות')) {
        inFuture = true
        inRecent = false
        skip('future')
        continue
      }
      if (joined.includes('תנועות אחרונות')) {
        inRecent = true
        inFuture = false
        skip('header_meta')
        continue
      }
      if (!inRecent || inFuture) {
        if (isOshHeaderRow(row)) skip('header_meta')
        continue
      }

      if (isOshHeaderRow(row)) {
        headerSeen = true
        skip('header_meta')
        continue
      }

      const date = parseOshDate(row[COL.date])
      const description = cellToString(row[COL.description])
      const rawAmount = cellToNumber(row[COL.amount])
      const reference = cellToString(row[COL.reference])

      if (!date && !description) continue
      if (!date || !description || rawAmount === 0) {
        skip('empty')
        continue
      }

      const rowBalance = cellToNumber(row[COL.balance])
      if (Number.isFinite(rowBalance) && rowBalance !== 0) {
        balanceRows.push({ date, balance: rowBalance, amount: rawAmount })
      }

      if (isCardSettlement(description)) {
        cardSettlements.push({
          date,
          amount: Math.abs(rawAmount),
          description,
        })
        skip('card_settlement')
        continue
      }

      const valueDate = parseOshDate(row[COL.valueDate]) || undefined
      const channel = cellToString(row[COL.channel]) || undefined

      // בעו״ש: שלילי = חובה (הוצאה), חיובי = זכות (הכנסה)
      const isCredit = rawAmount > 0
      const amount = Math.abs(rawAmount)

      seq += 1
      const refKey = reference.replace(/\s+/g, '') || String(seq)
      const ref = `osh:${date}:${refKey}:${Math.round(amount * 100)}:${seq}`

      transactions.push({
        ref,
        date,
        ...(valueDate && valueDate !== date ? { chargeDate: valueDate } : {}),
        description,
        amount: isCredit ? -amount : amount,
        ...(reference ? { account: reference } : {}),
        ...(channel ? { rawType: channel } : {}),
        isCredit,
      })
    }

    if (!headerSeen) {
      warnings.push('לא זוהתה שורת כותרת — ודאו שזהו ייצוא עובר ושב תקין')
    }

    const chargeSum = transactions
      .filter((t) => !t.isCredit)
      .reduce((s, t) => s + t.amount, 0)
    const creditSum = transactions
      .filter((t) => t.isCredit)
      .reduce((s, t) => s + Math.abs(t.amount), 0)
    const parsedNet = Math.round((chargeSum - creditSum) * 100) / 100
    const balances = deriveBalances(balanceRows)

    return {
      source,
      fileName,
      transactions,
      skipped,
      skippedReasons,
      warnings,
      parsedNet,
      ...balances,
      ...(cardSettlements.length > 0 ? { cardSettlements } : {}),
    }
  },
}
