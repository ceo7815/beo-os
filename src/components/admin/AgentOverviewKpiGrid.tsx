import type { ReactNode } from 'react'
import { hubSectionClass } from '../../lib/hubSectionBorder'
import type { AgentOverviewCard } from '../../lib/agentOverviewCards'

type Props = {
  title: string
  subtitle?: ReactNode
  cards: AgentOverviewCard[]
  sectionBorder?: number
  ariaLabel: string
  /** בתוך קוביית ניהול סוכן — בלי מעטפת section נפרדת */
  embedded?: boolean
  /** מספר עמודות בגריד (ברירת מחדל 3) */
  columns?: 3 | 4
}

export function AgentOverviewKpiGrid({
  title,
  subtitle,
  cards,
  sectionBorder = 0,
  ariaLabel,
  embedded = false,
  columns = 3,
}: Props) {
  const gridClass =
    columns === 4
      ? 'grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
      : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'

  const content = (
    <>
      <div className="mb-4">
        <h2 className="text-base font-extrabold text-[var(--text-dark)]">{title}</h2>
        {subtitle ? (
          <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-[var(--text-mid)]">{subtitle}</p>
        ) : null}
      </div>
      <div className={gridClass}>
        {cards.map((c, i) => (
          <div
            key={c.title}
            className={`rounded-xl border border-[var(--border)] bg-white/95 p-4 shadow-sm ${hubSectionClass(sectionBorder + 1 + i)}`}
          >
            <p className="text-[11px] font-bold text-[var(--text-mid)]">{c.title}</p>
            <p className="mt-2 text-2xl font-extrabold tabular-nums text-[var(--text-dark)]">{c.value}</p>
            <p className="mt-1.5 text-[10px] leading-snug text-[var(--text-mid)]">{c.hint}</p>
          </div>
        ))}
      </div>
    </>
  )

  if (embedded) {
    return <div aria-label={ariaLabel}>{content}</div>
  }

  return (
    <section
      className={`rounded-2xl border border-[var(--border-orange-soft)] bg-gradient-to-l from-[#FFFBF7] to-[var(--dash-panel-bg)] p-4 md:p-5 ${hubSectionClass(sectionBorder)}`}
      aria-label={ariaLabel}
    >
      {content}
    </section>
  )
}
