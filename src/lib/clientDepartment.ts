import type { Client } from '../types'

/** תווית תצוגה לפי מחלקת הלקוח — לסיווג גבייה ודשבורד */
export function clientDepartmentLabel(client: Client | undefined): string {
  const d = client?.department?.trim()
  if (d) return d
  return 'ללא מחלקה'
}
