function parseYm(ym: string): { y: number; m: number } | null {
  const [ys, ms] = ym.split('-')
  const y = Number(ys)
  const m = Number(ms)
  if (!y || !m || m < 1 || m > 12) return null
  return { y, m }
}

export function compareYm(a: string, b: string): number {
  return a.localeCompare(b)
}

export function addMonths(ym: string, delta: number): string {
  const p = parseYm(ym)
  if (!p) return ym
  let { y, m } = p
  m += delta
  while (m > 12) {
    m -= 12
    y += 1
  }
  while (m < 1) {
    m += 12
    y -= 1
  }
  return `${y}-${String(m).padStart(2, '0')}`
}

export function normalizeYmRange(
  from: string,
  to: string,
): { from: string; to: string } {
  const f = from.trim().slice(0, 7)
  const t = to.trim().slice(0, 7)
  if (!f && !t) return { from: '', to: '' }
  if (!f) return { from: t, to: t }
  if (!t) return { from: f, to: f }
  if (compareYm(f, t) > 0) return { from: t, to: f }
  return { from: f, to: t }
}

export function monthsInRange(from: string, to: string, max = 24): string[] {
  const { from: start, to: end } = normalizeYmRange(from, to)
  if (!start || !end) return []
  const out: string[] = []
  let cur = start
  while (compareYm(cur, end) <= 0 && out.length < max) {
    out.push(cur)
    if (cur === end) break
    cur = addMonths(cur, 1)
  }
  return out
}
