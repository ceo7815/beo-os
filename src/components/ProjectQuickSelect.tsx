import { useEffect, useMemo, useRef, useState } from 'react'
import type { Project } from '../types'

type Props = {
  projects: Project[]
  value: string
  onChange: (projectId: string) => void
  id?: string
  /** לשורת משנה ולחיפוש לפי שם לקוח */
  clientNameById?: Map<string, string>
}

function haystack(p: Project, clientNameById?: Map<string, string>): string {
  const client =
    p.clientId && clientNameById ? clientNameById.get(p.clientId) ?? '' : ''
  return `${p.name} ${p.description ?? ''} ${p.type === 'internal' ? 'פנימי' : ''} ${p.subContractor ?? ''} ${client}`
    .trim()
    .toLowerCase()
}

function subline(
  p: Project,
  clientNameById?: Map<string, string>,
): string {
  if (p.type === 'internal') {
    return p.description?.trim()
      ? `פנימי · ${p.description.trim().slice(0, 48)}`
      : 'פרויקט פנימי'
  }
  const cn = p.clientId ? clientNameById?.get(p.clientId) : undefined
  return [cn || 'לקוח', p.description?.trim().slice(0, 40)].filter(Boolean).join(' · ') || '—'
}

export function ProjectQuickSelect({
  projects,
  value,
  onChange,
  id,
  clientNameById,
}: Props) {
  const selected = useMemo(
    () => projects.find((p) => p.id === value),
    [projects, value],
  )
  const [draft, setDraft] = useState(selected?.name ?? '')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selected) setDraft(selected.name)
    else if (!value) setDraft('')
  }, [selected?.id, selected?.name, value])

  const needle = draft.trim().toLowerCase()
  const filtered = useMemo(() => {
    const sorted = [...projects].sort((a, b) =>
      a.name.localeCompare(b.name, 'he'),
    )
    if (!needle) return sorted.slice(0, 24)
    return sorted
      .filter((p) => haystack(p, clientNameById).includes(needle))
      .slice(0, 40)
  }, [projects, needle, clientNameById])

  useEffect(() => {
    setHi(0)
  }, [needle, open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const pick = (p: Project) => {
    onChange(p.id)
    setDraft(p.name)
    setOpen(false)
  }

  const onInputChange = (s: string) => {
    setDraft(s)
    setOpen(true)
    if (value) {
      const cur = projects.find((x) => x.id === value)
      if (cur && s.trim() !== cur.name.trim()) onChange('')
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true)
      return
    }
    if (!open) return
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHi((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[hi]) {
      e.preventDefault()
      pick(filtered[hi]!)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          autoComplete="off"
          value={draft}
          onChange={(e) => onInputChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="חיפוש פרויקט — שם, לקוח, תיאור…"
          className="min-w-0 flex-1 bg-transparent py-0.5 text-sm text-[var(--text-dark)] outline-none placeholder:text-[var(--text-mid)]"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={id ? `${id}-project-list` : undefined}
        />
        {value ? (
          <button
            type="button"
            className="shrink-0 rounded-[10px] border border-[var(--border)] px-2.5 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--blue-light)]"
            onClick={() => {
              onChange('')
              setDraft('')
              setOpen(true)
            }}
          >
            נקה
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-[10px] text-[var(--text-light)]">
        {needle
          ? `${filtered.length} תוצאות`
          : `${projects.length} פרויקטים ברשימה — הקלד לחיפוש`}
      </p>
      {open && filtered.length > 0 ? (
        <ul
          id={id ? `${id}-project-list` : undefined}
          role="listbox"
          className="absolute start-0 end-0 top-full z-20 mt-1 max-h-[min(22rem,55vh)] overflow-y-auto rounded-[10px] border-2 border-[var(--orange)] bg-[var(--dash-panel-bg)] py-1 shadow-[0_12px_40px_rgba(0,0,0,0.12)]"
        >
          {filtered.map((p, i) => (
            <li key={p.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={i === hi}
                className={`flex w-full flex-col gap-0.5 px-3 py-2 text-right text-sm transition ${
                  i === hi
                    ? 'bg-[var(--blue-light)] text-[var(--blue-dark)]'
                    : 'text-[var(--text-dark)] hover:bg-[var(--bg-input)]'
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                onMouseEnter={() => setHi(i)}
              >
                <span className="font-semibold">{p.name}</span>
                <span className="text-[11px] text-[var(--text-mid)]">
                  {subline(p, clientNameById)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && needle && filtered.length === 0 ? (
        <div className="absolute start-0 end-0 top-full z-20 mt-1 rounded-[10px] border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-sm text-[var(--text-mid)] shadow-md">
          לא נמצאו פרויקטים
        </div>
      ) : null}
    </div>
  )
}
