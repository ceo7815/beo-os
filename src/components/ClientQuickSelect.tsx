import { useEffect, useMemo, useRef, useState } from 'react'
import type { Client } from '../types'

type Props = {
  clients: Client[]
  value: string
  onChange: (clientId: string) => void
  id?: string
  /** לקוחות שיוצגו ברשימה אך לא ניתן לבחור (למשל כבר במעקב) */
  disabledClientIds?: Set<string>
  disabledClientHint?: string
  /** מסגרת ורשימה בסגנון hub-select (למשל בקמפיינים) */
  hubPanel?: boolean
}

function haystack(c: Client): string {
  return `${c.name} ${c.email} ${c.phone} ${c.contact} ${c.department ?? ''}`.toLowerCase()
}

export function ClientQuickSelect({
  clients,
  value,
  onChange,
  id,
  disabledClientIds,
  disabledClientHint = 'לא ניתן לבחור',
  hubPanel,
}: Props) {
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
    if (!needle) return sorted
    return sorted.filter((c) => haystack(c).includes(needle))
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

  const isPickDisabled = (c: Client) => Boolean(disabledClientIds?.has(c.id))

  const pick = (c: Client) => {
    if (isPickDisabled(c)) return
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

  const panelSurface =
    hubPanel === true
      ? 'rounded-[10px] border-2 border-[var(--orange)] bg-[var(--dash-panel-bg)] py-0 shadow-[0_10px_36px_rgba(0,0,0,0.14)]'
      : 'rounded-[10px] border-2 border-[var(--orange)] shadow-[0_12px_40px_rgba(0,0,0,0.12)]'

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
      const c = filtered[hi]!
      if (!isPickDisabled(c)) pick(c)
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
        {needle
          ? `${filtered.length} תוצאות`
          : `${clients.length} לקוחות במערכת — הקלד לחיפוש ממוקד`}
      </p>
      {open && filtered.length > 0 ? (
        <ul
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          className={`absolute start-0 end-0 top-full mt-1 max-h-[min(22rem,55vh)] overflow-y-auto ${hubPanel === true ? 'z-[100]' : 'z-20'} bg-[var(--dash-panel-bg)] py-1 ${panelSurface}`}
        >
          {filtered.map((c, i) => {
            const blocked = isPickDisabled(c)
            return (
              <li key={c.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={i === hi}
                  disabled={blocked}
                  className={`flex w-full flex-col gap-0.5 px-3 py-2 text-right text-sm transition ${
                    blocked
                      ? 'cursor-not-allowed opacity-55'
                      : i === hi
                        ? 'bg-[var(--blue-light)] text-[var(--blue-dark)]'
                        : hubPanel === true
                          ? 'bg-[var(--dash-panel-bg)] text-[var(--text-dark)] hover:bg-[var(--surface-muted)]'
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
                  {blocked ? (
                    <span className="text-[10px] font-semibold text-[#B45309]">
                      {disabledClientHint}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
      {open && needle && filtered.length === 0 ? (
        <div
          className={`absolute start-0 end-0 top-full mt-1 bg-[var(--dash-panel-bg)] px-3 py-2 text-sm text-[var(--text-mid)] ${
            hubPanel === true
              ? 'z-[100] rounded-[10px] border border-[#D1D5DB] bg-[#EEF2F6] shadow-[0_10px_36px_rgba(0,0,0,0.14)]'
              : 'z-20 rounded-[10px] border border-[var(--border)] shadow-md'
          }`}
        >
          לא נמצאו לקוחות
        </div>
      ) : null}
    </div>
  )
}
