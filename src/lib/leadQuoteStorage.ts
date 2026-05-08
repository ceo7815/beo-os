import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadTask,
} from 'firebase/storage'
import { storage } from './firebase'

/** מספיק לרוב קבצי PDF; עם ביטול פעיל של משימת ההעלאה אין צורך ב־4 דקות */
const UPLOAD_TIMEOUT_MS = 120_000
const DOWNLOAD_URL_TIMEOUT_MS = 45_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `${label} — לא התקבלה תשובה מהשרת תוך ${Math.round(ms / 1000)} שניות. בדקו חיבור ונסו שוב.`,
        ),
      )
    }, ms)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId!))
}

/**
 * מחכים לסיום העלאה — במקביל timeout שמבטל את משימת ה-Storage (בניגוד ל־Promise.race על uploadBytes).
 */
function awaitUploadTask(task: UploadTask, ms: number, label: string): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout>
  let settled = false

  const finish = (fn: () => void) => {
    if (settled) return
    settled = true
    clearTimeout(timeoutId)
    fn()
  }

  return new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      task.cancel()
      finish(() =>
        reject(
          new Error(
            `${label} — לא התקבלה תשובה מהשרת תוך ${Math.round(ms / 1000)} שניות. בדקו חיבור (כולל חומת אש / VPN) ונסו שוב.`,
          ),
        ),
      )
    }, ms)

    task.on(
      'state_changed',
      () => {},
      (err) => {
        finish(() => reject(err))
      },
      () => {
        finish(() => resolve())
      },
    )
  })
}

export async function uploadLeadQuotePdf(
  leadId: string,
  file: File,
): Promise<{ url: string; fileName: string }> {
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) {
    throw new Error('נא להעלות קובץ PDF בלבד')
  }
  const safeTail = file.name
    .replace(/[^\w.\u0590-\u05FF\- ]/g, '_')
    .slice(0, 120)
  const path = `leads/${leadId}/quotes/${crypto.randomUUID()}-${safeTail}`
  const r = ref(storage, path)
  const task = uploadBytesResumable(r, file, { contentType: 'application/pdf' })
  await awaitUploadTask(
    task,
    UPLOAD_TIMEOUT_MS,
    'העלאת הקובץ נכשלה או התארכה יתר על המידה',
  )
  const url = await withTimeout(
    getDownloadURL(r),
    DOWNLOAD_URL_TIMEOUT_MS,
    'קבלת קישור להורדה מהאחסון',
  )
  return { url, fileName: file.name }
}
