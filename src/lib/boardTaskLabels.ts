import type { Priority, TaskStatus } from '../types'

export function boardStatusHe(s: TaskStatus): string {
  switch (s) {
    case 'todo':
      return 'לביצוע'
    case 'doing':
      return 'בעבודה'
    case 'blocked':
      return 'חסום'
    case 'done':
      return 'הושלם'
  }
}

export function priorityHe(p: Priority): string {
  switch (p) {
    case 'high':
      return 'גבוהה'
    case 'medium':
      return 'בינונית'
    case 'low':
      return 'נמוכה'
  }
}

export const COLUMN_META: {
  status: TaskStatus
  label: string
  badgeColor: string
}[] = [
  { status: 'todo', label: 'לביצוע', badgeColor: '#64748B' },
  { status: 'doing', label: 'בעבודה', badgeColor: '#2563EB' },
  { status: 'blocked', label: 'חסום', badgeColor: '#EF4444' },
  { status: 'done', label: 'הושלם', badgeColor: '#10B981' },
]
