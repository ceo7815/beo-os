import { calParser } from './calParser'
import { discountOshParser } from './discountOshParser'
import { readWorkbookRows } from './readWorkbook'
import type { BankImportSource, BankParser, ParseResult } from './types'

export * from './types'
export { readWorkbookRows, excelSerialToYmd } from './readWorkbook'

/** Parsers זמינים — סדר עדיפות לפי canParse */
const PARSERS: BankParser[] = [discountOshParser, calParser]

/**
 * קורא קובץ ומפענח אותו ל-ParseResult.
 * בוחר parser לפי סוג הקובץ שהמשתמש בחר ולפי מבנה הטבלה.
 */
export async function parseBankFile(
  file: File,
  source: BankImportSource,
): Promise<ParseResult> {
  const rows = await readWorkbookRows(file)
  const preferredId = source === 'bank_account' ? 'discount_osh' : 'cal_diners'
  const parser =
    PARSERS.find((p) => p.id === preferredId && p.canParse(rows, file.name)) ??
    PARSERS.find((p) => p.canParse(rows, file.name)) ??
    (source === 'bank_account' ? discountOshParser : calParser)
  return parser.parse(rows, file.name, source)
}
