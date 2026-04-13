import type { Task } from '../types'

/** מנהל על רואה הכל; אחרת אחראי, יוצר, שיתוף לכל הצוות (ישן), או ברשימת השיתוף */
export function taskVisibleToUser(
  task: Task,
  currentUserId: string,
  role: string,
): boolean {
  if (role === 'superadmin') return true
  if (!currentUserId) return false
  if (task.assigneeId === currentUserId) return true
  if (task.createdBy === currentUserId) return true
  if (task.teamWideShared) return true
  if (task.sharedWithUserIds.some((id) => id === currentUserId)) return true
  return false
}
