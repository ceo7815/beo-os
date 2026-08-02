import {
  extractInvoiceFields,
  type ExtractedInvoiceFields,
} from './invoiceFieldExtraction'

/**
 * קריאת שכבת הטקסט של PDF בדפדפן.
 *
 * חשבונית שהופקה במערכת ממוחשבת מכילה טקסט אמיתי, ולכן אין צורך ב-OCR:
 * הקריאה מיידית, מדויקת, והמסמך אינו נשלח לשום שירות חיצוני.
 * חשבונית שהיא צילום תחזיר טקסט ריק, ואז השדות נשארים למילוי ידני.
 */

/** מספר העמודים שנקראים — בחשבונית השדות תמיד בעמוד הראשון */
const MAX_PAGES = 3

/** הספרייה כבדה ונטענת רק כשבאמת קוראים מסמך, לא בעליית האפליקציה */
async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await loadPdfjs()
  const buffer = await file.arrayBuffer()
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer) })
  const doc = await task.promise
  try {
    const pages: string[] = []
    const count = Math.min(doc.numPages, MAX_PAGES)
    for (let i = 1; i <= count; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      /**
       * פריטי הטקסט מגיעים כרצף ללא שורות. השחזור נעשה לפי הקואורדינטה
       * האנכית, מפני שהתוויות והערכים בחשבונית יושבים באותה שורה ורק כך
       * אפשר לקשור ביניהם.
       */
      const byRow = new Map<number, string[]>()
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue
        const y = Math.round((item.transform?.[5] ?? 0) / 3)
        const row = byRow.get(y) ?? []
        row.push(item.str)
        byRow.set(y, row)
      }
      const rows = [...byRow.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, parts]) => parts.join(' ').replace(/\s+/g, ' ').trim())
      pages.push(rows.join('\n'))
    }
    return pages.join('\n')
  } finally {
    await task.destroy()
  }
}

export type InvoiceReadResult = {
  fields: ExtractedInvoiceFields
  /** false כשהמסמך הוא סריקה ואין בו טקסט לקריאה */
  hasText: boolean
}

export async function readInvoiceFile(file: File): Promise<InvoiceReadResult> {
  if (!/\.pdf$/i.test(file.name)) {
    return { fields: {}, hasText: false }
  }
  const text = await extractPdfText(file)
  if (text.replace(/\s/g, '').length < 20) {
    return { fields: {}, hasText: false }
  }
  return { fields: extractInvoiceFields(text), hasText: true }
}
