import type { Task } from '../types'

function isAdminRole(role: string): boolean {
  return role === 'admin' || role === 'superadmin'
}

/** מנהלים — כל המשימות. עובדים — רק מה שהוקצה אליהם או שיצרו (כולל משימות שנפתחו לאחרים). */
export function taskVisibleToUser(
  task: Task,
  currentUserId: string,
  role: string,
): boolean {
  if (!currentUserId) return false
  if (isAdminRole(role)) return true
  return (
    task.assigneeId === currentUserId ||
    task.createdBy === currentUserId
  )
}
