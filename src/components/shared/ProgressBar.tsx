import { useEffect, useState } from 'react'

export interface ProgressBarProps {
  done: number
  total: number
  color: string
  /** אם מספר — דורס את האחוז האוטומטי לפי משימות */
  manualPercent?: number
  /**
   * אם מוגדר — לחיצה על האחוז מאפשרת עריכה; `null` = חזרה לחישוב אוטומטי
   */
  onManualPercentCommit?: (value: number | null) => void
}

function autoPercent(done: number, total: number): number {
  return total <= 0 ? 0 : Math.round((done / total) * 100)
}

export function ProgressBar({
  done,
  total,
  color,
  manualPercent,
  onManualPercentCommit,
}: ProgressBarProps) {
  const auto = autoPercent(done, total)
  const hasManual =
    typeof manualPercent === 'number' && !Number.isNaN(manualPercent)
  const pct = hasManual
    ? Math.min(100, Math.max(0, Math.round(manualPercent)))
    : auto

  const editable = Boolean(onManualPercentCommit)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(pct))

  useEffect(() => {
    if (!editing) setDraft(String(pct))
  }, [pct, editing])

  const commit = () => {
    if (!onManualPercentCommit) return
    const t = draft.trim()
    if (t === '') {
      onManualPercentCommit(null)
      setEditing(false)
      return
    }
    const n = Number.parseInt(t.replace(/\D/g, ''), 10)
    if (Number.isNaN(n)) {
      setDraft(String(pct))
      setEditing(false)
      return
    }
    onManualPercentCommit(Math.min(100, Math.max(0, n)))
    setEditing(false)
  }

  return (
    <div className="w-full">
      <div
        className="mb-1 flex justify-between gap-2 text-[11px] text-slate-500"
        dir="ltr"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          {editing ? (
            <span
              className="inline-flex items-center gap-1"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commit()
                  }
                  if (e.key === 'Escape') {
                    setDraft(String(pct))
                    setEditing(false)
                  }
                }}
                onBlur={() => commit()}
                className="w-11 rounded border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-1 py-0.5 text-center text-[11px] font-semibold text-[var(--text-dark)]"
                aria-label="אחוז התקדמות"
              />
              <span className="text-slate-500">%</span>
            </span>
          ) : editable ? (
            <button
              type="button"
              title="לחץ לעריכת אחוז (או רוקן ושמור לחזרה אוטומטית)"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setEditing(true)
              }}
              className={`rounded px-1 py-0.5 font-semibold transition hover:bg-slate-100 ${
                hasManual ? 'text-amber-600' : 'text-slate-800'
              }`}
            >
              {pct}%
              {hasManual ? (
                <span className="ms-0.5 text-[9px] font-bold text-slate-500">
                  ידני
                </span>
              ) : null}
            </button>
          ) : (
            <span>{pct}%</span>
          )}
          {editable && hasManual && !editing ? (
            <button
              type="button"
              title="חזרה לחישוב לפי משימות"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onManualPercentCommit?.(null)
              }}
              className="text-[9px] font-bold text-blue-600 underline decoration-dotted hover:text-blue-700"
            >
              אוטו
            </button>
          ) : null}
        </span>
        <span className="shrink-0">
          {done}/{total}
        </span>
      </div>
      <div
        className="h-[8px] w-full overflow-hidden rounded-full bg-slate-200"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  )
}
