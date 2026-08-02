import { auth } from './firebase'

/**
 * גיבוי חשבונית הספק שמוצמדת לתשלום.
 *
 * הקובץ נשמר על השרת של המערכת ולא בשירות אחסון חיצוני, ותחת מזהה ההוצאה
 * ולא תחת שם הספק — כך הקישור בין התשלום בבנק לבין המסמך חד-ערכי גם
 * כששני ספקים נושאים שם דומה.
 */

const MAX_SIZE_BYTES = 15 * 1024 * 1024

const ACCEPTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic']

/** ערך ל-accept של שדה הקובץ — נגזר מאותה רשימה שהאימות משתמש בה */
export const EXPENSE_DOCUMENT_ACCEPT = ACCEPTED_EXTENSIONS.join(',')

export type UploadedExpenseDocument = {
  url: string
  fileName: string
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

export function validateExpenseDocument(file: File): string | null {
  if (!ACCEPTED_EXTENSIONS.includes(extensionOf(file.name))) {
    return `סוג הקובץ אינו נתמך. אפשר להעלות ${ACCEPTED_EXTENSIONS.join(' · ')}`
  }
  if (file.size > MAX_SIZE_BYTES) {
    return `הקובץ גדול מ-${Math.round(MAX_SIZE_BYTES / 1024 / 1024)}MB`
  }
  return null
}

const UPLOAD_TIMEOUT_MS = 120_000

function messageFromResponse(raw: string, status: number): string {
  try {
    const parsed = JSON.parse(raw) as { message?: string; error?: string }
    return parsed.message ?? parsed.error ?? `העלאה נכשלה (${status})`
  } catch {
    return `העלאה נכשלה (${status})`
  }
}

/**
 * ההעלאה נעשית ב-XMLHttpRequest ולא ב-fetch, מפני שרק הוא מדווח על
 * התקדמות בפועל. בלי מדד התקדמות אמיתי, קובץ גדול נראה כמו תקיעה.
 */
function postFile(
  url: string,
  token: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ url: string; fileName: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file, file.name)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.timeout = UPLOAD_TIMEOUT_MS
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable || e.total === 0) return
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(messageFromResponse(xhr.responseText, xhr.status)))
        return
      }
      try {
        const data = JSON.parse(xhr.responseText) as {
          url?: string
          fileName?: string
        }
        if (!data.url) throw new Error('missing url')
        resolve({ url: data.url, fileName: data.fileName ?? file.name })
      } catch {
        reject(new Error('השרת החזיר תשובה לא צפויה'))
      }
    }
    xhr.onerror = () =>
      reject(new Error('ההעלאה נכשלה — בדקו חיבור לאינטרנט ונסו שוב'))
    xhr.ontimeout = () =>
      reject(
        new Error(
          `ההעלאה לא הסתיימה תוך ${Math.round(UPLOAD_TIMEOUT_MS / 1000)} שניות. נסו שוב.`,
        ),
      )

    xhr.send(form)
  })
}

export async function uploadExpenseDocument(
  expenseId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadedExpenseDocument> {
  const problem = validateExpenseDocument(file)
  if (problem) throw new Error(problem)

  const user = auth.currentUser
  if (!user) throw new Error('לא מחובר — התחברו מחדש ונסו שוב')
  const token = await user.getIdToken()

  return postFile(
    `/api/finance-documents/${encodeURIComponent(expenseId)}`,
    token,
    file,
    onProgress,
  )
}
