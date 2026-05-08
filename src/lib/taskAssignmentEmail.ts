import { httpsCallable } from 'firebase/functions'
import { functionsClient } from './firebase'

const sendAssigneeTaskNotification = httpsCallable<
  { taskId: string },
  { ok: boolean; skipped?: boolean; sent?: boolean; reason?: string }
>(functionsClient, 'sendAssigneeTaskNotification')

/** נקרא אחרי יצירת משימה — כישלון לא חוסם את הממשק */
export function requestAssigneeTaskEmail(taskId: string): void {
  void sendAssigneeTaskNotification({ taskId }).catch((err: unknown) => {
    console.error('sendAssigneeTaskNotification', err)
  })
}
