import * as XLSX from 'xlsx'

/** קורא קובץ Excel/CSV → מטריצת שורות גולמית (תאים כמספרים/מחרוזות) */
export async function readWorkbookRows(file: File): Promise<unknown[][]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: false })
  const firstSheet = wb.SheetNames[0]
  if (!firstSheet) return []
  const ws = wb.Sheets[firstSheet]
  if (!ws) return []
  return XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    // false = טקסט מעוצב מהתא (למשל זיכויים בסוגריים "(750)")
    raw: false,
    defval: '',
    blankrows: false,
  })
}

/**
 * ממיר מספר סידורי של Excel ל-YYYY-MM-DD.
 * תומך גם במחרוזות תאריך (DD/MM/YYYY, ISO).
 */
export function excelSerialToYmd(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    // Excel epoch: 1899-12-30 (כולל באג 1900)
    const ms = Math.round((value - 25569) * 86400 * 1000)
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  if (typeof value === 'string') {
    const s = value.trim()
    if (!s) return ''
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    // DD/MM/YYYY או DD.MM.YYYY
    const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/)
    if (m) {
      const [, dd, mm, yy] = m
      const year = yy.length === 2 ? `20${yy}` : yy
      return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
    }
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return ''
}

/** מפרק סכום מתא אקסל — כולל פורמט חשבונאי (750) או 750- */
export function cellToNumber(value: unknown): number {
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

export function cellToString(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}
