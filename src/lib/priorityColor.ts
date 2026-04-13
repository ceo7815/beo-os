import type { Priority } from '../types'

export function priorityColor(p: Priority): string {
  switch (p) {
    case 'high':
      return '#EF4444'
    case 'medium':
      return '#F97316'
    case 'low':
      return '#64748B'
  }
}
