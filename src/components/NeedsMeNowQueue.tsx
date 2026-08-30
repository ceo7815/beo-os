import { Link } from 'react-router-dom'

export type NeedsMeItem = {
  id: string
  tone: 'danger' | 'warning' | 'info' | 'brand'
  title: string
  detail: string
  meta?: string
  to: string
}

const toneClass: Record<NeedsMeItem['tone'], string> = {
  danger: 'border-rose-200 bg-rose-50/90 hover:bg-rose-50',
  warning: 'border-amber-200 bg-amber-50/90 hover:bg-amber-50',
  info: 'border-sky-200 bg-sky-50/90 hover:bg-sky-50',
  brand: 'border-[var(--brand)]/25 bg-[var(--brand-light)]/80 hover:bg-[var(--brand-light)]',
}

const toneLabel: Record<NeedsMeItem['tone'], string> = {
  danger: 'דחוף',
  warning: 'מעקב',
  info: 'מידע',
  brand: 'סוכנים',
}

/** תור פעולות «דורש אותי עכשיו» — דשבורד / Inbox */
export function NeedsMeNowQueue({
  items,
  title = 'דורש אותי עכשיו',
  emptyHint = 'אין פריטים דחופים — אפשר לנשום.',
}: {
  items: NeedsMeItem[]
  title?: string
  emptyHint?: string
}) {
  if (items.length === 0) {
    return (
      <section className="beo-agent-panel px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-extrabold text-[var(--text-dark)]">{title}</h2>
          <span className="text-[11px] font-semibold text-emerald-700">הכל שקט</span>
        </div>
        <p className="mt-1 text-[12px] text-[var(--text-mid)]">{emptyHint}</p>
      </section>
    )
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <h2 className="text-[13px] font-extrabold text-[var(--text-dark)]">{title}</h2>
        <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-[var(--text-mid)]">
          {items.length}
        </span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to={item.to}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-3 transition ${toneClass[item.tone]}`}
            >
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-light)]">
                  {toneLabel[item.tone]}
                </p>
                <p className="text-[13px] font-bold text-[var(--text-dark)]">{item.title}</p>
                <p className="mt-0.5 text-[12px] text-[var(--text-mid)]">{item.detail}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {item.meta ? (
                  <span className="text-[11px] font-semibold text-[var(--text-dark)]">{item.meta}</span>
                ) : null}
                <span className="text-[11px] font-bold text-[var(--brand)]">מעבר ←</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
