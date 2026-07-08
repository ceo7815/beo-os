import type { MorningClient } from './morningClient.js'

export type ExpenseFileSource =
  | { kind: 'url'; url: string; fileName?: string }
  | { kind: 'base64'; base64: string; mimeType: string; fileName?: string }

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

/**
 * מורנינג מחזיר הוצאה עם שדות מקוננים ב-data (fileKey וכו')
 * ושדות ברמת השורש (url, id, number). לא מספיק לקחת רק את data.
 */
export function mergeGiExpenseRecord(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) return {}
  if (!isRecord(raw.data)) return raw
  return { ...raw.data, ...raw }
}

/** @deprecated use mergeGiExpenseRecord */
export function unwrapGiPayload(raw: unknown): Record<string, unknown> {
  return mergeGiExpenseRecord(raw)
}

function pickHttpUrl(v: unknown): string | undefined {
  if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) return v.trim()
  return undefined
}

function pickUrlFromObject(obj: unknown): string | undefined {
  if (!isRecord(obj)) return undefined
  for (const key of ['he', 'origin', 'en', 'url', 'href', 'downloadUrl', 'view']) {
    const u = pickHttpUrl(obj[key])
    if (u) return u
  }
  return undefined
}

function fileNameFromExpense(expense: Record<string, unknown>): string | undefined {
  const fileKey = expense.fileKey
  if (typeof fileKey === 'string' && fileKey.includes('/')) {
    const base = fileKey.split('/').pop()
    if (base?.trim()) return base.trim()
  }
  const n = expense.fileName ?? expense.filename
  if (typeof n === 'string' && n.trim()) return n.trim()
  const num = expense.number
  if (typeof num === 'string' && num.trim()) return `expense-${num.trim()}.pdf`
  if (typeof num === 'number') return `expense-${num}.pdf`
  return undefined
}

function hasAttachedFile(expense: Record<string, unknown>): boolean {
  if (typeof expense.fileKey === 'string' && expense.fileKey.trim()) return true
  if (pickHttpUrl(expense.url)) return true
  return false
}

/** מחלץ קישור או base64 למסמך מצורף מהוצאה ב-GI */
export function extractExpenseFileSource(
  raw: unknown,
): ExpenseFileSource | null {
  const expense = mergeGiExpenseRecord(raw)
  const fileName = fileNameFromExpense(expense)

  const directUrl = pickHttpUrl(expense.url)
  if (directUrl) return { kind: 'url', url: directUrl, fileName }

  const files = expense.files
  const fromFiles =
    pickUrlFromObject(files) ??
    (isRecord(files) ? pickUrlFromObject(files.downloadLinks) : undefined)
  if (fromFiles) return { kind: 'url', url: fromFiles, fileName }

  const fromDownloadLinks = pickUrlFromObject(expense.downloadLinks)
  if (fromDownloadLinks) return { kind: 'url', url: fromDownloadLinks, fileName }

  const fileField = expense.file
  const urlFromFile =
    pickHttpUrl(fileField) ?? pickUrlFromObject(fileField)
  if (urlFromFile) return { kind: 'url', url: urlFromFile, fileName }

  const base64Candidates = [
    typeof fileField === 'string' ? fileField : undefined,
    typeof expense.fileBase64 === 'string' ? expense.fileBase64 : undefined,
    typeof expense.attachment === 'string' ? expense.attachment : undefined,
    isRecord(fileField) && typeof fileField.data === 'string'
      ? fileField.data
      : undefined,
  ].filter((s): s is string => typeof s === 'string' && s.length > 80)

  for (const b64 of base64Candidates) {
    if (b64.startsWith('http')) continue
    const clean = b64.replace(/^data:[^;]+;base64,/, '')
    return {
      kind: 'base64',
      base64: clean,
      mimeType: 'application/pdf',
      fileName: fileName ?? 'expense.pdf',
    }
  }

  if (hasAttachedFile(expense)) {
    return null
  }

  return null
}

export async function fetchExpenseDocumentBuffer(
  client: MorningClient,
  greenInvoiceId: string,
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const raw = await client.getExpense(greenInvoiceId)
  let source = extractExpenseFileSource(raw)

  if (!source && isRecord(raw) && isRecord(raw.data) && raw.data.fileKey && !raw.url) {
    const found = await client.findExpenseDownloadUrl(greenInvoiceId)
    if (found) {
      source = {
        kind: 'url',
        url: found.url,
        fileName: fileNameFromExpense(mergeGiExpenseRecord(raw)),
      }
    }
  }

  if (!source) {
    const expense = mergeGiExpenseRecord(raw)
    if (hasAttachedFile(expense) && !pickHttpUrl(expense.url)) {
      throw new Error('המסמך קיים בחשבונית ירוקה אך קישור ההורדה לא זמין כרגע')
    }
    throw new Error('לא נמצא מסמך מצורף להוצאה זו בחשבונית ירוקה')
  }

  if (source.kind === 'base64') {
    return {
      buffer: Buffer.from(source.base64, 'base64'),
      mimeType: source.mimeType,
      fileName: source.fileName ?? 'expense.pdf',
    }
  }

  const fetched = await client.fetchBinaryUrl(source.url)
  return {
    buffer: Buffer.from(fetched.data),
    mimeType: fetched.contentType || 'application/pdf',
    fileName: source.fileName ?? 'expense.pdf',
  }
}
