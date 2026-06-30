import { calParser } from './calParser'
import { readWorkbookRows } from './readWorkbook'
import type { BankImportSource, BankParser, ParseResult } from './types'

export * from './types'
export { readWorkbookRows, excelSerialToYmd } from './readWorkbook'

/** Parsers זמינים — סדר עדיפות. PDF/בנקים נוספים ייכנסו כאן בעתיד. */
const PARSERS: BankParser[] = [calParser]

/**
 * קורא קובץ ומפענח אותו ל-ParseResult.
 * בוחר אוטומטית את ה-parser המתאים לפי הכותרות; נופל ל-parser הראשון אם אין התאמה.
 */
export async function parseBankFile(
  file: File,
  source: BankImportSource,
): Promise<ParseResult> {
  const rows = await readWorkbookRows(file)
  const parser = PARSERS.find((p) => p.canParse(rows, file.name)) ?? PARSERS[0]
  return parser.parse(rows, file.name, source)
}
