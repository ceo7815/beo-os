/**
 * מחלקת כרטיס אחידה לכל הסקשנים — ללא סירוגין צבעים.
 */
export function hubSectionClass(_seq?: number): string {
  return 'hub-dash-card'
}

/** כרטיס בולט יותר (hero, KPI מרכזי) */
export function hubSectionElevatedClass(): string {
  return 'hub-dash-card hub-dash-card--elevated'
}
