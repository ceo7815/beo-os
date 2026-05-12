import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PROMPT_MODEL_CATEGORY_LABEL_HE,
  PROMPT_MODEL_ROWS,
  type PromptModelRow,
  type PromptTargetModel,
  promptModelSearchHaystack,
} from '../lib/promptModelCatalog'

type Props = {
  value: PromptTargetModel
  onChange: (id: PromptTargetModel) => void
  id?: string
}

export function PromptModelQuickSelect({ value, onChange, id }: Props) {
  const selected = useMemo(
    () => PROMPT_MODEL_ROWS.find((r) => r.id === value) ?? PROMPT_MODEL_ROWS[0]!,
    [value],
  )
  const [draft, setDraft] = useState(selected.label)
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDraft(selected.label)
  }, [selected.id, selected.label])

  /** כשהרשימה פתוחה והשדה עדיין מציג רק את שם הבחירה — לא מסננים (רשימה מלאה כמו שדה פתוח) */
  const needleForFilter = useMemo(() => {
    const d = draft.trim().toLowerCase()
    const sel = selected.label.trim().toLowerCase()
    if (open && d === sel) return ''
    return d
  }, [draft, open, selected.label])

  const filtered = useMemo(() => {
    const sorted = [...PROMPT_MODEL_ROWS].sort((a, b) =>
      a.label.localeCompare(b.label, 'he', { sensitivity: 'base' }),
    )
    if (!needleForFilter) return sorted
    return sorted.filter((r) =>
      promptModelSearchHaystack(r).includes(needleForFilter),
    )
  }, [needleForFilter])

  useEffect(() => {
    setHi(0)
  }, [needleForFilter, open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setDraft(selected.label)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, selected.label])

  const pick = (r: PromptModelRow) => {
    onChange(r.id)
    setDraft(r.label)
    setOpen(false)
  }

  const onInputChange = (s: string) => {
    setDraft(s)
    setOpen(true)
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
      setDraft(selected.label)
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
      <div
        className="flex gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2.5"
        dir="rtl"
      >
        <input
          id={id}
          type="text"
          autoComplete="off"
          value={draft}
          onChange={(e) => onInputChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="חפש לפי שם כלי, קטגוריה (שפה, תמונה, GPT, Claude…)"
          className="min-w-0 flex-1 border-0 bg-transparent py-0.5 text-sm text-[var(--text-dark)] outline-none ring-0 placeholder:text-[var(--text-mid)]"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={id ? `${id}-model-listbox` : undefined}
        />
      </div>
      <p className="mt-1 text-[10px] text-[var(--text-light)]">
        {needleForFilter
          ? `${filtered.length} תוצאות`
          : `${PROMPT_MODEL_ROWS.length} כלים — הקלד לחיפוש ממוקד`}
      </p>
      {open && filtered.length > 0 ? (
        <ul
          id={id ? `${id}-model-listbox` : undefined}
          role="listbox"
          className="absolute start-0 end-0 top-full z-30 mt-1 max-h-[min(22rem,55vh)] overflow-y-auto rounded-[10px] border-2 border-[var(--orange)] bg-[var(--dash-panel-bg)] py-1 shadow-[0_12px_40px_rgba(0,0,0,0.12)]"
        >
          {filtered.map((r, i) => (
            <li key={r.id} role="presentation">
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
                onClick={() => pick(r)}
                onMouseEnter={() => setHi(i)}
              >
                <span className="font-semibold">{r.label}</span>
                <span className="text-[11px] text-[var(--text-mid)]">
                  {PROMPT_MODEL_CATEGORY_LABEL_HE[r.category]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && needleForFilter && filtered.length === 0 ? (
        <div className="absolute start-0 end-0 top-full z-30 mt-1 rounded-[10px] border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-sm text-[var(--text-mid)] shadow-md">
          לא נמצאו כלים התואמים לחיפוש
        </div>
      ) : null}
    </div>
  )
}
