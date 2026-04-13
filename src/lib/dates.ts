/** תאריך היום בפורמט YYYY-MM-DD להשוואות */
export function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** פורמט ישראלי DD/MM/YYYY מתאריך ISO (YYYY-MM-DD או מלא) */
export function formatDateIL(isoDate: string): string {
  const part = isoDate.slice(0, 10)
  const [y, m, d] = part.split('-')
  if (!y || !m || !d) return isoDate
  return `${d}/${m}/${y}`
}

/** תאריך ושעה בעברית (לרישום פעילות) */
export function formatDateTimeIL(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('he-IL', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

/** תאריך YYYY-MM-DD + N ימים */
export function addDaysYmd(baseYmd: string, days: number): string {
  const [y, m, d] = baseYmd.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}
