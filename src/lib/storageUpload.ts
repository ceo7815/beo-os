import { getDownloadURL, ref, uploadBytesResumable, type UploadTask } from 'firebase/storage'
import { storage } from './firebase'

/**
 * העלאת קבצים ל-Firebase Storage עם פסק זמן אמיתי.
 *
 * הפער בין Promise.race רגיל לבין המימוש כאן הוא שכאן משימת ההעלאה מבוטלת
 * בפועל כשפג הזמן. בלי זה ההעלאה ממשיכה ברקע והמשתמש מקבל שגיאה על פעולה
 * שדווקא הצליחה — מצב שמוביל להעלאה כפולה של אותו מסמך.
 */

const UPLOAD_TIMEOUT_MS = 120_000
const DOWNLOAD_URL_TIMEOUT_MS = 45_000

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
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

export function awaitUploadTask(
  task: UploadTask,
  ms: number,
  label: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
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
      (snap) => {
        if (!onProgress || snap.totalBytes === 0) return
        onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100))
      },
      (err) => finish(() => reject(err)),
      () => finish(() => resolve()),
    )
  })
}

/**
 * מנקה שם קובץ לשימוש בנתיב אחסון, תוך שמירה על עברית וקריאוּת.
 *
 * הסיומת נשמרת גם בשם ארוך: כללי האחסון מתירים העלאה לפי הסיומת בלבד,
 * וקטיעה עיוורת של הסוף הייתה הופכת קובץ תקין להעלאה שנדחית.
 */
const MAX_FILE_NAME_LENGTH = 120

export function safeFileName(name: string): string {
  const clean = name.replace(/[^\w.\u0590-\u05FF\- ]/g, '_')
  if (clean.length <= MAX_FILE_NAME_LENGTH) return clean

  const dot = clean.lastIndexOf('.')
  const ext = dot > 0 ? clean.slice(dot) : ''
  if (!ext || ext.length > 12) return clean.slice(0, MAX_FILE_NAME_LENGTH)
  return clean.slice(0, MAX_FILE_NAME_LENGTH - ext.length) + ext
}

export async function uploadToStorage(
  path: string,
  file: File,
  options?: { contentType?: string; onProgress?: (percent: number) => void },
): Promise<string> {
  const r = ref(storage, path)
  const task = uploadBytesResumable(
    r,
    file,
    options?.contentType ? { contentType: options.contentType } : undefined,
  )
  await awaitUploadTask(
    task,
    UPLOAD_TIMEOUT_MS,
    'העלאת הקובץ נכשלה או התארכה יתר על המידה',
    options?.onProgress,
  )
  return withTimeout(getDownloadURL(r), DOWNLOAD_URL_TIMEOUT_MS, 'קבלת קישור להורדה מהאחסון')
}
