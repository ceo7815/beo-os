import { useEffect, useMemo, useRef, useState } from 'react'

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
}

export function HubDropdownSelect({
  id,
  value,
  onChange,
  options,
  emptyOption,
  disabled,
  className = '',
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)

  const rows = useMemo(() => {
    if (emptyOption) {
      return [{ value: '', label: emptyOption.label }, ...options]
    }
    return options
  }, [options, emptyOption])

  const displayLabel = useMemo(() => {
    const hit = rows.find((r) => r.value === value)
    return hit?.label ?? '—'
  }, [rows, value])

  useEffect(() => {
    if (!open) return
    const idx = rows.findIndex((r) => r.value === value)
    setHi(idx >= 0 ? idx : 0)
  }, [open, rows, value])

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
        className={`flex w-full min-w-0 items-center gap-2 rounded-xl border-2 border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] py-2.5 ps-3 pe-3 text-start text-sm font-bold text-[var(--text-dark)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition ${
          disabled
            ? 'cursor-not-allowed opacity-[0.52]'
            : 'cursor-pointer hover:border-[var(--orange)]'
        } ${open ? 'ring-[3px] ring-[rgba(249,115,22,0.2)]' : ''}`}
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
        <ul
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          className="absolute start-0 end-0 top-full z-[100] mt-1 max-h-[min(20rem,50vh)] overflow-y-auto rounded-[10px] border-2 border-[var(--orange)] bg-[var(--dash-panel-bg)] py-0 shadow-[0_10px_36px_rgba(15,23,42,0.12)]"
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
                      ? 'bg-[#454545] font-semibold text-white'
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
        </ul>
      ) : null}
    </div>
  )
}
