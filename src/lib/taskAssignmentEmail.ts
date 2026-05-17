import { httpsCallable } from 'firebase/functions'
import { functionsClient } from './firebase'
import { formatFirebaseErrorDetail } from './formatFirebaseError'
import { useHubStore } from '../store/useStore'

const sendAssigneeTaskNotification = httpsCallable<
  { taskId: string; kind?: 'new' | 'transfer' },
  {
    ok: boolean
    skipped?: boolean
    sent?: boolean
    reason?: string
  }
>(functionsClient, 'sendAssigneeTaskNotification')

const SKIP_TOAST: Record<string, string> = {
  no_smtp:
    'לא נשלח מייל על המשימה: חסרות הגדרות בשרת. הגדר RESEND_API_KEY + MAIL_FROM או SMTP מלא בפרויקט Functions.',
  no_email:
    'לא נשלח מייל: למוקצה אין כתובת מייל. הזן מייל בכרטיס המשתמש (משתמשים) או ב-Firebase Authentication.',
  smtp_send_failed:
    'לא נשלח מייל: שגיאת שליחה (Resend/SMTP — ספק, מפתח, או כתובת השולח). בדוק לוגים של sendAssigneeTaskNotification.',
  function_error:
    'לא נשלח מייל התראה: שגיאה לא צפויה בשרת. פתח לוגים של sendAssigneeTaskNotification ב-Firebase Console.',
  self_or_empty: '',
}

/** נקרא אחרי יצירת משימה / שינוי מוקצה — כישלון לא חוסם את הממשק */
export function requestAssigneeTaskEmail(
  taskId: string,
  opts?: { kind?: 'new' | 'transfer' },
): void {
  void sendAssigneeTaskNotification({
    taskId,
    ...(opts?.kind ? { kind: opts.kind } : {}),
  })
    .then((res) => {
      const d = res.data
      if (d?.sent) {
        return
      }
      if (d?.skipped && d.reason) {
        const msg = SKIP_TOAST[d.reason]
        if (msg) {
          useHubStore.getState().pushToast(msg, 'error')
        } else if (d.reason !== 'self_or_empty') {
          console.warn(
            '[sendAssigneeTaskNotification] לא נשלח מייל:',
            d.reason,
          )
        }
      }
    })
    .catch((err: unknown) => {
      console.error('sendAssigneeTaskNotification', err)
      const detail = formatFirebaseErrorDetail(err)
      const msg =
        detail.trim().length > 0
          ? `לא נשלח מייל התראה:\n${detail}`
          : 'לא נשלח מייל התראה (שגיאת רשת או פונקציה). אם פרסת Functions ב־us-central1 — רענן את הדף ונסה שוב.'
      useHubStore.getState().pushToast(msg, 'error')
    })
}
