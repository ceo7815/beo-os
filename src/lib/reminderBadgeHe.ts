export function reminderBadgeHe(atIso: string): string {
  const d = new Date(atIso)
  if (Number.isNaN(d.getTime())) return ''
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(d)
  end.setHours(0, 0, 0, 0)
  const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000)
  if (diffDays < 0) return 'פג תוקף'
  if (diffDays === 0) return 'היום!'
  return `עוד ${diffDays} ימים`
}
