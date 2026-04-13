import { useEffect, useMemo, useRef, useState } from 'react'
import type { Client } from '../types'

type Props = {
  clients: Client[]
  value: string
  onChange: (clientId: string) => void
  id?: string
}

function haystack(c: Client): string {
  return `${c.name} ${c.email} ${c.phone} ${c.contact} ${c.department ?? ''}`.toLowerCase()
}

export function ClientQuickSelect({ clients, value, onChange, id }: Props) {
  const selected = useMemo(
    () => clients.find((c) => c.id === value),
    [clients, value],
  )
  const [draft, setDraft] = useState(selected?.name ?? '')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selected) setDraft(selected.name)
  }, [selected?.id, selected?.name])

  const needle = draft.trim().toLowerCase()
  const filtered = useMemo(() => {
    const sorted = [...clients].sort((a, b) =>
      a.name.localeCompare(b.name, 'he'),
    )
    if (!needle) return sorted.slice(0, 18)
    return sorted.filter((c) => haystack(c).includes(needle)).slice(0, 40)
  }, [clients, needle])

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

  const pick = (c: Client) => {
    onChange(c.id)
    setDraft(c.name)
    setOpen(false)
  }

  const onInputChange = (s: string) => {
    setDraft(s)
    setOpen(true)
    if (value) {
      const cur = clients.find((c) => c.id === value)
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
          placeholder="הקלד לזיהוי מהיר — שם, אימייל או טלפון…"
          className="min-w-0 flex-1 bg-transparent py-0.5 text-sm text-[var(--text-dark)] outline-none placeholder:text-[var(--text-mid)]"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={id ? `${id}-listbox` : undefined}
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
        {filtered.length} תוצאות
        {needle ? '' : ' · מוצגים לקוחות ראשונים לפי א״ב — הקלד לסינון'}
      </p>
      {open && filtered.length > 0 ? (
        <ul
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          className="absolute start-0 end-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-[0_12px_40px_rgba(0,0,0,0.12)]"
        >
          {filtered.map((c, i) => (
            <li key={c.id} role="presentation">
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
                onClick={() => pick(c)}
                onMouseEnter={() => setHi(i)}
              >
                <span className="font-semibold">{c.name}</span>
                <span className="text-[11px] text-[var(--text-mid)]">
                  {[
                    c.department,
                    c.email,
                    c.phone,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && needle && filtered.length === 0 ? (
        <div className="absolute start-0 end-0 top-full z-20 mt-1 rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-mid)] shadow-md">
          לא נמצאו לקוחות
        </div>
      ) : null}
    </div>
  )
}
