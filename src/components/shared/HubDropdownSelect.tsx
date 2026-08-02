import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type HubDropdownOption = { value: string; label: string }

type Props = {
  id?: string
  value: string
  onChange: (value: string) => void
  options: HubDropdownOption[]
  /** רשומה ריקה ראשונה (למשל «ללא פרויקט») — value יוצא כ־'' */
  emptyOption?: { label: string }
  disabled?: boolean
  className?: string
  /** מציג שדה חיפוש בראש הרשימה — לסינון חכם ברשימות ארוכות */
  searchable?: boolean
  /** טקסט placeholder לשדה החיפוש */
  searchPlaceholder?: string
  /** הרחבת התפריט מעבר לרוחב הכפתור — לעמודת טבלה צרה עם ערכים ארוכים */
  menuClassName?: string
  /** כפתור/פעולה בתחתית התפריט (למשל «+ פרויקט מהיר») */
  menuFooter?: ReactNode
}

export function HubDropdownSelect({
  id,
  value,
  onChange,
  options,
  emptyOption,
  disabled,
  className = '',
  searchable = false,
  searchPlaceholder = 'חיפוש…',
  menuClassName = '',
  menuFooter,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const [query, setQuery] = useState('')

  const allRows = useMemo(() => {
    if (emptyOption) {
      return [{ value: '', label: emptyOption.label }, ...options]
    }
    return options
  }, [options, emptyOption])

  const rows = useMemo(() => {
    if (!searchable) return allRows
    const q = query.trim().toLowerCase()
    if (!q) return allRows
    return allRows.filter(
      (r) => r.value === '' || r.label.toLowerCase().includes(q),
    )
  }, [allRows, searchable, query])

  const displayLabel = useMemo(() => {
    const hit = allRows.find((r) => r.value === value)
    return hit?.label ?? '—'
  }, [allRows, value])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const idx = rows.findIndex((r) => r.value === value)
    setHi(idx >= 0 ? idx : 0)
    if (searchable) {
      const t = setTimeout(() => searchRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open, rows, value, searchable])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  const onKeyDownButton = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault()
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
      setHi((i) => Math.min(i + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && rows[hi]) {
      e.preventDefault()
      pick(rows[hi]!.value)
    }
  }

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id ? `${id}-listbox` : undefined}
        onClick={() => {
          if (!disabled) setOpen((o) => !o)
        }}
        onKeyDown={onKeyDownButton}
        className={`flex w-full min-w-0 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] py-2.5 ps-3 pe-3 text-start text-sm font-semibold text-[var(--text-dark)] shadow-[var(--shadow-sm)] transition ${
          disabled
            ? 'cursor-not-allowed opacity-[0.52]'
            : 'cursor-pointer hover:border-[var(--border-dark)]'
        } ${open ? 'ring-[3px] ring-[rgba(37,99,235,0.12)]' : ''}`}
      >
        <span className="min-w-0 flex-1 truncate text-right">{displayLabel}</span>
        <span
          className={`shrink-0 text-[var(--text-mid)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {open ? (
        <div
          className={`absolute start-0 end-0 top-full z-[100] mt-1 overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--dash-panel-bg)] shadow-[var(--shadow-lg)] ${menuClassName}`}
        >
          {searchable ? (
            <div className="border-b border-[var(--border)] p-2">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setOpen(false)
                    return
                  }
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setHi((i) => Math.min(i + 1, rows.length - 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setHi((i) => Math.max(i - 1, 0))
                  } else if (e.key === 'Enter' && rows[hi]) {
                    e.preventDefault()
                    pick(rows[hi]!.value)
                  }
                }}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-right text-sm text-[var(--text-dark)] outline-none focus:border-[var(--border-dark)]"
              />
            </div>
          ) : null}
          <ul
            id={id ? `${id}-listbox` : undefined}
            role="listbox"
            className="max-h-[min(18rem,45vh)] overflow-y-auto py-0"
          >
          {rows.map((row, i) => {
            const isSelectedValue = row.value === value
            const isHi = i === hi
            return (
              <li key={row.value === '' ? '__empty' : row.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelectedValue}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(row.value)}
                  onMouseEnter={() => setHi(i)}
                  className={`w-full py-2.5 pe-3 ps-3 text-right text-sm transition-colors ${
                    isSelectedValue
                      ? 'bg-[var(--bg-sidebar)] font-semibold text-white'
                      : isHi
                        ? 'bg-[var(--orange-light)] font-medium text-[var(--text-dark)]'
                        : 'bg-[var(--dash-panel-bg)] font-normal text-[var(--text-dark)] hover:bg-[var(--surface-muted)]'
                  }`}
                >
                  {row.label}
                </button>
              </li>
            )
          })}
          {rows.length === 0 ? (
            <li
              role="presentation"
              className="px-3 py-3 text-center text-sm text-[var(--text-mid)]"
            >
              לא נמצאו תוצאות
            </li>
          ) : null}
          </ul>
          {menuFooter ? (
            <div
              className="border-t border-[var(--border)] p-2"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setOpen(false)}
            >
              {menuFooter}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
