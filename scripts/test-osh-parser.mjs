/**
 * בדיקת parser עובר ושב
 * node scripts/test-osh-parser.mjs "path/to/file.xlsx"
 */
import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'

const path =
  process.argv[2] ||
  'c:\\Users\\Beo-syestems\\Downloads\\עובר ושב_30062026_1938.xlsx'

const CARD_SETTLEMENT_RE =
  /^חיוב\s+לכרטיס|דיינרס.*חיוב|כאל.*חיוב|מסטרקארד.*חיוב|mastercard.*charge/i

function cellToString(v) {
  return v == null ? '' : String(v).trim()
}
function cellToNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) return 0
    const cleaned = raw.replace(/[^\d.,-]/g, '').replace(/,/g, '')
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}
function parseOshDate(value) {
  const s = cellToString(value)
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/)
  if (!m) return s
  const a = Number(m[1])
  const b = Number(m[2])
  const year = m[3].length === 2 ? `20${m[3]}` : m[3]
  let month, day
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
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const wb = XLSX.read(readFileSync(path), { type: 'buffer', cellDates: false })
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  header: 1,
  raw: false,
  defval: '',
  blankrows: false,
})

let inRecent = false
let inFuture = false
let skipped = { card: 0, future: 0, empty: 0 }
const txs = []

for (const row of rows) {
  const joined = row.map(cellToString).join(' ')
  if (joined.includes('תנועות עתידיות')) {
    inFuture = true
    inRecent = false
    skipped.future++
    continue
  }
  if (joined.includes('תנועות אחרונות')) {
    inRecent = true
    inFuture = false
    continue
  }
  if (!inRecent || inFuture) continue
  if (joined.includes('תיאור התנועה')) continue

  const date = parseOshDate(row[0])
  const desc = cellToString(row[2])
  const amt = cellToNumber(row[3])
  if (!date || !desc || amt === 0) {
    skipped.empty++
    continue
  }
  if (CARD_SETTLEMENT_RE.test(desc)) {
    skipped.card++
    console.log('SKIP card:', date, desc, amt)
    continue
  }
  if (amt > 0) {
    console.log('CREDIT skip:', date, desc, amt)
    continue
  }
  txs.push({ date, desc, amt: Math.abs(amt), ref: row[5] })
}

console.log('\n--- Imported ---')
console.table(txs)
console.log('\nCount:', txs.length)
console.log('Total:', txs.reduce((s, t) => s + t.amt, 0).toFixed(2))
console.log('Skipped card:', skipped.card, 'future:', skipped.future)
