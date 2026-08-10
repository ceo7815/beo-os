import * as XLSX from 'xlsx'

export type RtlExcelSheet = {
  sheetName: string
  headers: readonly string[]
  rows: (string | number)[][]
  colWidths?: { wch: number }[]
}

export type RtlExcelDownloadOptions = {
  filenamePrefix: string
  sheets: RtlExcelSheet[]
}

/** ייצוא קובץ Excel עם תצוגה RTL — תומך בגיליון אחד או יותר */
export function downloadRtlExcel(opts: RtlExcelDownloadOptions): void {
  const wb = XLSX.utils.book_new()

  for (const sheet of opts.sheets) {
    const ws = XLSX.utils.aoa_to_sheet([sheet.headers.slice(), ...sheet.rows])
    if (sheet.colWidths?.length) {
      ws['!cols'] = sheet.colWidths
    }
    XLSX.utils.book_append_sheet(wb, ws, sheet.sheetName.slice(0, 31))
  }

  wb.Workbook = {
    Views: [{ RTL: true }],
  }

  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `${opts.filenamePrefix}-${stamp}.xlsx`)
}

export function roundExcelMoney(n: number): number {
  return Math.round(n * 100) / 100
}
