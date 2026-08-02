import { HOSTING_TYPE_LABEL } from './financeHostingTypes'
import type { HourlyServiceStatus } from '../types'

/** קידומת ערך-שיוך לאחסון בבורר השיוך */
export const HOSTING_ASSIGN_PREFIX = 'hosting:'

/** קידומת ערך-שיוך לבנק שעות — `hourly:{serviceId}` */
export const HOURLY_ASSIGN_PREFIX = 'hourly:'

/** אחסון אתר חודשי / שנתי + פורטל BizBakrayot — זמין תמיד בשיוך */
export const SITE_HOSTING_ASSIGN_OPTIONS = [
  {
    value: `${HOSTING_ASSIGN_PREFIX}monthly`,
    label: `☁ ${HOSTING_TYPE_LABEL.monthly}`,
  },
  {
    value: `${HOSTING_ASSIGN_PREFIX}yearly`,
    label: `☁ ${HOSTING_TYPE_LABEL.yearly}`,
  },
  {
    value: `${HOSTING_ASSIGN_PREFIX}portal_monthly`,
    label: `☁ ${HOSTING_TYPE_LABEL.portal_monthly}`,
  },
] as const

export type ProjectAssignSource = {
  id: string
  name: string
  clientId?: string
}

export type HourlyAssignSource = {
  id: string
  title: string
  clientId: string
  status: HourlyServiceStatus
}

export function isHourlyAssignValue(value: string): boolean {
  return value.startsWith(HOURLY_ASSIGN_PREFIX)
}

export function hourlyAssignValue(serviceId: string): string {
  return `${HOURLY_ASSIGN_PREFIX}${serviceId}`
}

export function parseHourlyAssignValue(value: string): string | null {
  if (!isHourlyAssignValue(value)) return null
  const id = value.slice(HOURLY_ASSIGN_PREFIX.length).trim()
  return id || null
}

/**
 * בנקי שעות פעילים של הלקוח (+ בנק שכבר משויך גם אם נסגר/מושהה).
 */
export function clientScopedHourlyOptions(
  services: HourlyAssignSource[],
  opts: {
    clientId?: string
    currentHourlyServiceId?: string
  },
): { value: string; label: string }[] {
  const clientId = opts.clientId?.trim() || ''
  const currentId = opts.currentHourlyServiceId?.trim() || ''
  if (!clientId && !currentId) return []

  let matches = clientId
    ? services.filter((s) => s.clientId === clientId && s.status === 'active')
    : []

  if (currentId && !matches.some((s) => s.id === currentId)) {
    const current = services.find((s) => s.id === currentId)
    if (current) matches = [...matches, current]
  }

  return matches
    .sort((a, b) => a.title.localeCompare(b.title, 'he'))
    .map((s) => ({
      value: hourlyAssignValue(s.id),
      label: `⏱ בנק שעות · ${s.title}`,
    }))
}

/**
 * אפשרויות שיוך לפרויקט לפי לקוח בלבד.
 * - עם clientId: רק פרויקטים של הלקוח
 * - בלי clientId: לא מציגים את כל המערכת (רק הפרויקט המשויך כעת אם יש)
 * - תמיד כולל את הפרויקט הנוכחי גם אם הלקוח לא תואם (כדי לא «לאבד» שיוך קיים)
 */
export function clientScopedProjectOptions(
  projects: ProjectAssignSource[],
  opts: {
    clientId?: string
    /** פרויקט שכבר משויך — נשאר ברשימה גם אם לא תואם ללקוח */
    currentProjectId?: string
    clientNameById?: Map<string, string>
    /** להוסיף שם לקוח לתווית (שימושי כשאין סינון לקוח) */
    includeClientInLabel?: boolean
  },
): { value: string; label: string }[] {
  const clientId = opts.clientId?.trim() || ''
  const currentId = opts.currentProjectId?.trim() || ''

  let matches: ProjectAssignSource[]
  if (clientId) {
    matches = projects.filter((p) => p.clientId === clientId)
  } else {
    matches = []
  }

  if (currentId && !matches.some((p) => p.id === currentId)) {
    const current = projects.find((p) => p.id === currentId)
    if (current) matches = [...matches, current]
  }

  return matches
    .sort((a, b) => a.name.localeCompare(b.name, 'he'))
    .map((p) => {
      const clientName =
        opts.includeClientInLabel && p.clientId
          ? opts.clientNameById?.get(p.clientId)
          : undefined
      return {
        value: p.id,
        label: clientName ? `${p.name} · ${clientName}` : p.name,
      }
    })
}

/**
 * שיוך להכנסה: אחסון + בנקי שעות פעילים של הלקוח + פרויקטים של אותו לקוח.
 */
export function clientScopedAssignOptionsWithHosting(
  projects: ProjectAssignSource[],
  opts: {
    clientId?: string
    currentProjectId?: string
    currentHourlyServiceId?: string
    currentAssignValue?: string
    clientNameById?: Map<string, string>
    hourlyServices?: HourlyAssignSource[]
  },
): { value: string; label: string }[] {
  const projectOpts = clientScopedProjectOptions(projects, {
    clientId: opts.clientId,
    currentProjectId: opts.currentProjectId,
    clientNameById: opts.clientNameById,
  })
  const hourlyOpts = clientScopedHourlyOptions(opts.hourlyServices ?? [], {
    clientId: opts.clientId,
    currentHourlyServiceId: opts.currentHourlyServiceId,
  })

  return [...SITE_HOSTING_ASSIGN_OPTIONS, ...hourlyOpts, ...projectOpts]
}
