import { useEffect, useRef, useState } from 'react'
import {
  EXPENSE_VAT_CLASS_LABEL,
  EXPENSE_VAT_CLASS_SHORT,
} from '../../lib/financeExpenseVat'
import type { FinanceExpenseVatClass } from '../../types'

const VAT_OPTIONS: FinanceExpenseVatClass[] = [
  'vat_liable',
  'exempt_supplier',
  'statutory',
]

const HINT: Record<FinanceExpenseVatClass, string> = {
  vat_liable: 'מע״מ לקיזוז (תשומות)',
  exempt_supplier: 'בלי מע״מ לקיזוז',
  statutory: 'תשלום חוקי — בלי תשומות',
}

/**
 * לחיצה על תווית המע״מ בטבלה — בחירה מיידית בלי לפתוח את חלון העריכה.
 */
export function ExpenseVatClassChip({
  value,
  onChange,
}: {
  value: FinanceExpenseVatClass
  onChange: (next: FinanceExpenseVatClass) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        title="שינוי סיווג מע״מ"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold underline decoration-dotted underline-offset-2 transition ${
          value === 'vat_liable'
            ? 'bg-[#EDE9FE] text-[#5B21B6] hover:bg-[#DDD6FE]'
            : value === 'statutory'
              ? 'bg-[#FEF3C7] text-[#92400E] hover:bg-[#FDE68A]'
              : 'bg-[var(--surface-muted)] text-[var(--text-mid)] hover:bg-black/[0.06]'
        }`}
      >
        {EXPENSE_VAT_CLASS_SHORT[value]}
        <span aria-hidden className="text-[8px] opacity-70">
          ▾
        </span>
      </button>
      {open ? (
        <div className="absolute start-0 top-full z-[120] mt-1 min-w-[200px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
          <ul role="listbox" className="py-1">
            {VAT_OPTIONS.map((opt) => {
              const selected = opt === value
              return (
                <li key={opt} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(opt)
                      setOpen(false)
                    }}
                    className={`flex w-full flex-col gap-0.5 px-3 py-2 text-right transition ${
                      selected
                        ? 'bg-[var(--orange-light)]'
                        : 'hover:bg-[var(--surface-muted)]'
                    }`}
                  >
                    <span className="text-[12px] font-bold text-[var(--text-dark)]">
                      {EXPENSE_VAT_CLASS_LABEL[opt]}
                    </span>
                    <span className="text-[10px] text-[var(--text-mid)]">
                      {HINT[opt]}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
