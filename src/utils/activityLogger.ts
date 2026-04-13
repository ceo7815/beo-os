import type { TaskActivity } from '../types'

export const ACTION_TEMPLATES = {
  created: (user: string) => `${user} יצר את המשימה`,
  status_changed: (user: string, from: string, to: string) =>
    `${user} שינה סטטוס מ-${from} ל-${to}`,
  assigned: (user: string, to: string) => `${user} שייך את המשימה ל-${to}`,
  due_changed: (user: string, date: string) =>
    `${user} שינה תאריך יעד ל-${date}`,
  priority_changed: (user: string, p: string) =>
    `${user} שינה עדיפות ל-${p}`,
  supplier_added: (user: string, s: string) => `${user} הוסיף ספק: ${s}`,
  supplier_removed: (user: string, s: string) => `${user} הסיר ספק: ${s}`,
  tag_added: (user: string, t: string) => `${user} הוסיף תגית: ${t}`,
  tag_removed: (user: string, t: string) => `${user} הסיר תגית: ${t}`,
  project_set: (user: string, name: string) =>
    `${user} קישר את המשימה לפרויקט: ${name}`,
  project_cleared: (user: string) => `${user} ניתק את המשימה מהפרויקט`,
  client_set: (user: string, name: string) =>
    `${user} קישר את המשימה ללקוח: ${name}`,
  client_cleared: (user: string) => `${user} ניתק את המשימה מהלקוח`,
  description_updated: (user: string) => `${user} עדכן את התיאור`,
  title_updated: (user: string) => `${user} עדכן את הכותרת`,
  shared_on: (user: string) => `${user} סימן את המשימה כמשותפת לכל הצוות`,
  shared_off: (user: string) => `${user} ביטל שיתוף — המשימה אישית (אחראי ויוצר בלבד)`,
  shared_targets_updated: (user: string) =>
    `${user} עדכן את רשימת העובדים לשיתוף המשימה`,
} as const

export type ActivityAction = keyof typeof ACTION_TEMPLATES

type TemplateFn = (user: string, ...rest: string[]) => string

export function logActivity(
  taskId: string,
  userId: string,
  userName: string,
  action: ActivityAction,
  ...args: string[]
): TaskActivity {
  const fn = ACTION_TEMPLATES[action] as TemplateFn
  const text = fn(userName, ...args)
  return {
    id: crypto.randomUUID(),
    taskId,
    userId,
    userName,
    action: text,
    timestamp: new Date().toISOString(),
  }
}
