import {
  LEAD_STATUS_COLORS,
  LEAD_STATUS_LABELS,
  WARM_LEAD_PIPELINE,
} from '../../lib/leadStatusUi'
import type { Lead, LeadStatus } from '../../types'

const KANBAN_COLS: LeadStatus[] = [
  'new',
  'contacted',
  'follow_up',
  'replied',
  'meeting_scheduled',
  'specification',
  'quote_sent',
  'negotiation',
  'no_answer',
]

type Props = {
  leads: Lead[]
  onOpenActions: (id: string) => void
  onMoveStatus: (id: string, status: LeadStatus) => void
}

export function LeadsKanban({ leads, onOpenActions, onMoveStatus }: Props) {
  const byCol = (status: LeadStatus) =>
    leads.filter((l) => l.status === status && WARM_LEAD_PIPELINE.has(l.status))

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {KANBAN_COLS.map((status) => {
        const col = byCol(status)
        return (
          <section
            key={status}
            className="flex w-[min(100%,17.5rem)] shrink-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/40"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const id = e.dataTransfer.getData('text/lead-id')
              if (id) onMoveStatus(id, status)
            }}
          >
            <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: LEAD_STATUS_COLORS[status] }}
                />
                <h3 className="text-[12px] font-extrabold text-[var(--text-dark)]">
                  {LEAD_STATUS_LABELS[status]}
                </h3>
              </div>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold tabular-nums text-[var(--text-mid)]">
                {col.length}
              </span>
            </header>
            <ul className="flex max-h-[min(70vh,560px)] flex-col gap-2 overflow-y-auto p-2">
              {col.length === 0 ? (
                <li className="rounded-xl border border-dashed border-[var(--border)] px-3 py-6 text-center text-[11px] text-[var(--text-light)]">
                  ריק
                </li>
              ) : (
                col.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/lead-id', l.id)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onClick={() => onOpenActions(l.id)}
                      className="w-full rounded-xl border border-[var(--border)] bg-white p-3 text-right shadow-sm transition hover:border-[var(--brand)]/35"
                    >
                      <div className="text-[13px] font-bold text-[var(--text-dark)]">
                        {l.company || l.name}
                      </div>
                      {l.company && l.name !== l.company ? (
                        <div className="mt-0.5 text-[11px] text-[var(--text-mid)]">{l.name}</div>
                      ) : null}
                      {l.clientNeeds ? (
                        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-[var(--text-light)]">
                          {l.clientNeeds}
                        </p>
                      ) : null}
                      {l.nextFollowUpDate ? (
                        <p className="mt-2 text-[10px] font-semibold text-amber-800">
                          פולואפ: {l.nextFollowUpDate}
                        </p>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
