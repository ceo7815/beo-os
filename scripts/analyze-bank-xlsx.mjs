/**
 * ניתוח קובץ כאל/דיינרס — הרצה:
 * node scripts/analyze-bank-xlsx.mjs "path/to/file.xlsx"
 */
import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'

const path = process.argv[2]
if (!path) {
  console.error('Usage: node scripts/analyze-bank-xlsx.mjs <file.xlsx>')
  process.exit(1)
}

const wb = XLSX.read(readFileSync(path), { type: 'buffer', cellDates: false })
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, {
  header: 1,
  raw: false,
  defval: '',
  blankrows: false,
})

function cellToString(v) {
  return v == null ? '' : String(v).trim()
}

function cellToNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) return 0
    const parenNegative = /^\(.*\)$/.test(raw)
    const trailingNegative = /-$/.test(raw) && !raw.startsWith('-')
    const cleaned = raw
      .replace(/[()]/g, '')
      .replace(/[^\d.,-]/g, '')
      .replace(/,/g, '')
    let n = Number(cleaned)
    if (!Number.isFinite(n)) return 0
    if (parenNegative || trailingNegative) return -Math.abs(n)
    return n
  }
  return 0
}

let headerAt = -1
for (let i = 0; i < rows.length; i++) {
  const j = rows[i].map(cellToString).join(' ')
  if (j.includes('שם בית עסק') && j.includes('סכום')) {
    headerAt = i
    break
  }
}

let fileTotal
let charges = 0
let credits = 0
let chargeCount = 0
let creditCount = 0
const byType = new Map()
const suspects = []

for (let i = headerAt + 1; i < rows.length; i++) {
  const row = rows[i]
  const joined = row.map(cellToString).join(' ')
  if (joined.includes('סה"כ') || joined.includes('סה״כ')) {
    const amt = cellToNumber(row[2])
    if (amt > 0) fileTotal = amt
    continue
  }
  const merchant = cellToString(row[1])
  const amt = cellToNumber(row[2])
  const type = cellToString(row[5])
  const notes = cellToString(row[7])
  const date = cellToString(row[0])
  const chargeDate = cellToString(row[4])
  if (!merchant || amt === 0) continue
  if (['עסקה בקליטה', 'בקליטה'].some((t) => `${type} ${notes}`.includes(t))) {
    console.log('SKIP pending:', merchant, amt, notes)
    continue
  }

  const isCredit =
    type.includes('זיכוי') ||
    type.includes('החזר') ||
    amt < 0 ||
    /^\(.*\)$/.test(cellToString(row[2]))

  if (isCredit) {
    credits += Math.abs(amt)
    creditCount++
  } else {
    charges += Math.abs(amt)
    chargeCount++
  }
  byType.set(type || '(ריק)', (byType.get(type || '(ריק)') ?? 0) + 1)

  if (merchant.toUpperCase().includes('GOOGLE')) {
    suspects.push({ line: i + 1, merchant, amt, type, date, chargeDate, rawAmt: row[2] })
  }
}

const net = charges - credits
console.log('--- סיכום ---')
console.log('חיובים:', chargeCount, charges.toFixed(2))
console.log('זיכויים:', creditCount, credits.toFixed(2))
console.log('נטו מחושב:', net.toFixed(2))
console.log('סה״כ בקובץ:', fileTotal?.toFixed(2) ?? '?')
console.log('פער:', fileTotal != null ? (net - fileTotal).toFixed(2) : '?')
console.log('\n--- סוגי עסקה ---')
for (const [t, c] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(c, t)
}
if (suspects.length) {
  console.log('\n--- Google ---')
  console.table(suspects)
}
