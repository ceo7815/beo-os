/** תאריך היום בפורמט YYYY-MM-DD להשוואות */
export function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** יום ראשון של אותו חודש (YYYY-MM-01) לפי YYYY-MM-DD */
export function ymdFirstOfMonth(ymd: string): string {
  const part = ymd.slice(0, 10)
  const [y, m] = part.split('-').map(Number)
  if (!y || !m) return ymd
  return `${y}-${String(m).padStart(2, '0')}-01`
}

/** פורמט ישראלי DD/MM/YYYY מתאריך ISO (YYYY-MM-DD או מלא) */
export function formatDateIL(isoDate: string | null | undefined): string {
  if (isoDate == null || typeof isoDate !== 'string') return ''
  const part = isoDate.slice(0, 10)
  const [y, m, d] = part.split('-')
  if (!y || !m || !d) return isoDate
  return `${d}/${m}/${y}`
}

/** ערך בטוח ל־input type=date (YYYY-MM-DD או ריק) */
export function toDateInputYmd(due: string | null | undefined): string {
  if (due == null || typeof due !== 'string') return ''
  const s = due.trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

/** תאריך ושעה בעברית (לרישום פעילות) */
export function formatDateTimeIL(iso: string | null | undefined): string {
  if (iso == null || typeof iso !== 'string') return ''
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

/**
 * המופע השבועי הבא של weekday אחרי fromYmd (לא כולל אותו יום —
 * אם מסמנים הושלם באותו יום כמו יום המשימה, המופע הבא הוא בעוד שבוע).
 * targetDow כמו Date#getDay() ‏(0=ראשון … 6=שבת).
 */
export function nextWeeklyYmdAfter(fromYmd: string, targetDow: number): string {
  const [y, m, d] = fromYmd.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const dow = dt.getDay()
  let delta = (targetDow - dow + 7) % 7
  if (delta === 0) delta = 7
  dt.setDate(dt.getDate() + delta)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** המופע הראשון של weekday על או אחרי anchorYmd (כולל anchor) */
export function firstWeeklyOnOrAfter(anchorYmd: string, targetDow: number): string {
  let ymd = anchorYmd
  for (let step = 0; step < 7; step++) {
    const [y, m, d] = ymd.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    if (dt.getDay() === targetDow) return ymd
    ymd = addDaysYmd(ymd, 1)
  }
  return anchorYmd
}

/** תחילת יום קלנדרי ב-local (מילישניות) לפי YYYY-MM-DD */
export function startOfDayMsFromYmd(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return NaN
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime()
}

/** סוף יום קלנדרי ב-local (מילישניות) */
export function endOfDayMsFromYmd(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return NaN
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
}

/**
 * דקות עבודה שנספרות ליום נתון — חפיפה עם [startIso, endIso).
 * אם אין endIso — משתמשים ב-nowMs (סשן פתוח).
 */
export function minutesOverlappingCalendarDay(
  startIso: string,
  endIso: string | undefined,
  ymd: string,
  nowMs: number = Date.now(),
): number {
  const dayStart = startOfDayMsFromYmd(ymd)
  const dayEnd = endOfDayMsFromYmd(ymd)
  if (!Number.isFinite(dayStart) || !Number.isFinite(dayEnd)) return 0
  const start = new Date(startIso).getTime()
  let end: number
  if (endIso != null && String(endIso).trim() !== '') {
    const parsed = new Date(endIso).getTime()
    end = Number.isFinite(parsed) ? parsed : nowMs
  } else {
    end = nowMs
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  const s = Math.max(start, dayStart)
  const e = Math.min(end, dayEnd)
  if (e <= s) return 0
  return Math.round((e - s) / 60000)
}

/** יום ראשון של אותו שבוע (א׳) בפורמט YYYY-MM-DD */
export function weekStartSundayYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (Number.isNaN(dt.getTime())) return ymd
  const dow = dt.getDay()
  dt.setDate(dt.getDate() - dow)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** יום בשבוע קצר בעברית */
export function formatWeekdayShortIL(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('he-IL', { weekday: 'short' })
}
