import { httpsCallable } from 'firebase/functions'
import { functionsClient } from './firebase'

const sendAssigneeTaskNotification = httpsCallable<
  { taskId: string },
  { ok: boolean; skipped?: boolean; sent?: boolean; reason?: string }
>(functionsClient, 'sendAssigneeTaskNotification')

/** נקרא אחרי יצירת משימה / שינוי מוקצה — כישלון לא חוסם את הממשק */
export function requestAssigneeTaskEmail(taskId: string): void {
  void sendAssigneeTaskNotification({ taskId })
    .then((res) => {
      const d = res.data
      if (d?.skipped && d.reason) {
        console.warn(
          '[sendAssigneeTaskNotification] לא נשלח מייל:',
          d.reason,
          '(בדוק SMTP ב-Functions או מייל ב-Firebase Auth למוקצה)',
        )
      }
    })
    .catch((err: unknown) => {
      console.error('sendAssigneeTaskNotification', err)
    })
}
