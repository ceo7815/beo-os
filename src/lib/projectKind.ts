import type { Project } from '../types'

/** צבע תג «פנימי» לפרויקטים פנימיים */
export const INTERNAL_PROJECT_BADGE_COLOR = '#7C3AED'

export function isInternalProject(p: Pick<Project, 'type'>): boolean {
  return p.type === 'internal'
}
