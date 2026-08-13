import type { Priority } from '../types'

export function priorityColor(p: Priority): string {
  switch (p) {
    case 'high':
      return '#EF4444'
    case 'medium':
      return '#f59e0b'
    case 'low':
      return '#64748B'
  }
}
