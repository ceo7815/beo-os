import type { Task } from '../types'

/**
 * לוח המשימות משותף לכל הצוות באותו פרויקט Firebase — כל משתמש מחובר רואה את כל המשימות.
 * שדות שיתוף (אחראי, משותפים, שיתוף לכל הצוות) משמשים לתצוגה ולעמודת «משותפות לביצוע», לא לסינון הסתרה.
 */
export function taskVisibleToUser(
  _task: Task,
  currentUserId: string,
  _role: string,
): boolean {
  return Boolean(currentUserId)
}
