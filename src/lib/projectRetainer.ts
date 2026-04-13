import type { Project } from '../types'

export const RETAINER_ACCENT = '#7C3AED'

export function isRetainerProject(
  p: Pick<Project, 'projectType'>,
): boolean {
  return p.projectType === 'retainer'
}

export function formatRetainerIls(n: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(n)
}

/** אפשרויות חודש YYYY-MM — עבר + עתיד קצר לבחירה */
export function retainerMonthOptions(past = 24, future = 3): string[] {
  const out: string[] = []
  const base = new Date()
  base.setDate(1)
  for (let i = -past; i <= future; i++) {
    const x = new Date(base.getFullYear(), base.getMonth() + i, 1)
    const y = x.getFullYear()
    const m = String(x.getMonth() + 1).padStart(2, '0')
    out.push(`${y}-${m}`)
  }
  return out.reverse()
}

export function retainerMonthLabelHe(ym: string): string {
  const [ys, ms] = ym.split('-')
  const y = Number(ys)
  const m = Number(ms)
  if (!y || !m) return ym
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
}
