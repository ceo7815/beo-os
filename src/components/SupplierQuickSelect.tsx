import { useEffect, useMemo, useRef, useState } from 'react'
import type { Supplier } from '../types'

type Props = {
  suppliers: Supplier[]
  value: string
  onChange: (supplierId: string) => void
  id?: string
  /** הוספת ספק חדש בשם בלבד (מהיר) */
  quickAdd?: boolean
  onQuickAdd?: (name: string) => Promise<string | null>
}

function haystack(s: Supplier): string {
  return `${s.name} ${s.email} ${s.phone}`.toLowerCase()
}

export function SupplierQuickSelect({
  suppliers,
  value,
  onChange,
  id,
  quickAdd,
  onQuickAdd,
}: Props) {
  const selected = useMemo(
    () => suppliers.find((s) => s.id === value),
    [suppliers, value],
  )
  const [draft, setDraft] = useState(selected?.name ?? '')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickName, setQuickName] = useState('')
  const [quickBusy, setQuickBusy] = useState(false)

  useEffect(() => {
    if (selected) setDraft(selected.name)
  }, [selected?.id, selected?.name])

  const needle = draft.trim().toLowerCase()
  const filtered = useMemo(() => {
    const sorted = [...suppliers].sort((a, b) =>
      a.name.localeCompare(b.name, 'he'),
    )
    if (!needle) return sorted.slice(0, 18)
    return sorted.filter((s) => haystack(s).includes(needle)).slice(0, 40)
  }, [suppliers, needle])

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

  const pick = (s: Supplier) => {
    onChange(s.id)
    setDraft(s.name)
    setOpen(false)
  }

  const onInputChange = (s: string) => {
    setDraft(s)
    setOpen(true)
    if (value) {
      const cur = suppliers.find((x) => x.id === value)
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

  const submitQuick = async () => {
    const n = quickName.trim()
    if (!n || !onQuickAdd || quickBusy) return
    setQuickBusy(true)
    try {
      const newId = await onQuickAdd(n)
      if (newId) {
        onChange(newId)
        setDraft(n)
        setQuickName('')
        setQuickOpen(false)
        setOpen(false)
      }
    } finally {
      setQuickBusy(false)
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
          placeholder="חיפוש ספק — שם, אימייל או טלפון…"
          className="min-w-0 flex-1"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={id ? `${id}-supplier-list` : undefined}
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
        {!needle ? ' · הקלד לסינון' : null}
      </p>
      {quickAdd && onQuickAdd ? (
        <div className="mt-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-input)] p-2">
          <button
            type="button"
            className="text-[11px] font-bold text-[var(--blue-mid)] hover:underline"
            onClick={() => setQuickOpen((o) => !o)}
          >
            {quickOpen ? '▾ בטל הוספה' : '+ הוסף ספק חדש (מהיר)'}
          </button>
          {quickOpen ? (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <input
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                placeholder="שם הספק"
                className="min-w-[140px] flex-1 rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void submitQuick()
                  }
                }}
              />
              <button
                type="button"
                disabled={!quickName.trim() || quickBusy}
                onClick={() => void submitQuick()}
                className="rounded-md bg-[var(--orange)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
              >
                {quickBusy ? '…' : 'הוסף'}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {open && filtered.length > 0 ? (
        <ul
          id={id ? `${id}-supplier-list` : undefined}
          role="listbox"
          className="absolute start-0 end-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-[0_12px_40px_rgba(0,0,0,0.12)]"
        >
          {filtered.map((s, i) => (
            <li key={s.id} role="presentation">
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
                onClick={() => pick(s)}
                onMouseEnter={() => setHi(i)}
              >
                <span className="font-semibold">{s.name}</span>
                <span className="text-[11px] text-[var(--text-mid)]">
                  {[s.email, s.phone].filter(Boolean).join(' · ') || '—'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && needle && filtered.length === 0 ? (
        <div className="absolute start-0 end-0 top-full z-20 mt-1 rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-mid)] shadow-md">
          לא נמצאו ספקים — השתמשו בהוספה המהירה למעלה
        </div>
      ) : null}
    </div>
  )
}
