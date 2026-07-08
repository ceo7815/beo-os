import type {
  HourlyEntryStatus,
  HourlyServiceKind,
  HourlyServiceStatus,
  HourlyWorkCategory,
} from '../types'

export const HOURLY_SERVICE_STATUS_LABEL: Record<HourlyServiceStatus, string> = {
  active: 'פעיל',
  paused: 'מושהה',
  closed: 'נסגר',
}

export const HOURLY_SERVICE_KIND_LABEL: Record<HourlyServiceKind, string> = {
  development: 'פיתוח',
  support: 'תמיכה',
  maintenance: 'תחזוקה',
  consulting: 'ייעוץ',
}

export const HOURLY_WORK_CATEGORY_LABEL: Record<HourlyWorkCategory, string> = {
  development: 'פיתוח',
  support: 'תמיכה',
  meeting: 'פגישה',
  documentation: 'תיעוד',
  qa: 'בדיקות',
  other: 'אחר',
}

export const HOURLY_ENTRY_STATUS_LABEL: Record<HourlyEntryStatus, string> = {
  logged: 'נרשם',
  approved: 'מאושר',
  invoiced: 'חויב',
}

export const HOURLY_SERVICE_STATUS_COLOR: Record<HourlyServiceStatus, string> = {
  active: '#10B981',
  paused: '#F59E0B',
  closed: '#64748B',
}

export const HOURLY_ENTRY_STATUS_COLOR: Record<HourlyEntryStatus, string> = {
  logged: '#64748B',
  approved: '#2563EB',
  invoiced: '#16A34A',
}

export const HOURLY_SERVICE_KINDS: HourlyServiceKind[] = [
  'development',
  'support',
  'maintenance',
  'consulting',
]

export const HOURLY_WORK_CATEGORIES: HourlyWorkCategory[] = [
  'development',
  'support',
  'meeting',
  'documentation',
  'qa',
  'other',
]

export const HOURLY_ENTRY_STATUSES: HourlyEntryStatus[] = [
  'logged',
  'approved',
  'invoiced',
]
