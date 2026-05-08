import type { Task } from '../types'

export function taskVisibleToUser(
  task: Task,
  currentUserId: string,
  role: string,
): boolean {
  if (!currentUserId) return false
  if (role === 'admin' || role === 'superadmin') return true
  return task.assigneeId === currentUserId
}
