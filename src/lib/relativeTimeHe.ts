/** "לפני 3 שעות" / "אתמול" / תאריך קצר */
export function formatRelativeHebrew(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const now = Date.now()
  const diffMs = now - then
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return 'לפני רגע'
  const min = Math.floor(sec / 60)
  if (min < 60) return `לפני ${min} דקות`
  const h = Math.floor(min / 60)
  if (h < 24) return `לפני ${h} שעות`
  const d = Math.floor(h / 24)
  if (d === 1) return 'אתמול'
  if (d < 7) return `לפני ${d} ימים`
  return new Date(iso).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
