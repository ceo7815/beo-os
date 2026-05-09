import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

type Props = {
  id?: string
  value: string[]
  onChange: (next: string[]) => void
  options: readonly string[]
  disabled?: boolean
}

export function SupplierTypesMultiSelect({
  id,
  value,
  onChange,
  options,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{
    top: number
    left: number
    width: number
  } | null>(null)

  const updatePos = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = Math.min(Math.max(r.width, 288), window.innerWidth - 16)
    let left = r.left
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - 8 - width)
    }
    setPos({
      top: r.bottom + 6,
      left,
      width,
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updatePos()
    const onScroll = () => updatePos()
    const onResize = () => updatePos()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open, updatePos])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const toggle = (opt: string) => {
    if (value.includes(opt)) onChange(value.filter((x) => x !== opt))
    else onChange([...value, opt])
  }

  const summary =
    value.length === 0
      ? 'בחרו סוג אחד או יותר…'
      : value.length <= 2
        ? value.join(' · ')
        : `${value.length} סוגים נבחרו`

  return (
    <div className="relative w-full" id={id}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          setOpen((o) => !o)
          requestAnimationFrame(() => updatePos())
        }}
        className="flex w-full items-center justify-between gap-2 rounded-xl border-2 border-[#BFDBFE] bg-[var(--bg-main)] px-3 py-2.5 text-right text-sm text-[var(--text-dark)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-[#93C5FD] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          className="min-w-0 flex-1 truncate font-medium"
          dir="rtl"
          title={value.length ? value.join(', ') : undefined}
        >
          {summary}
        </span>
        <span
          className="shrink-0 text-[var(--text-mid)] transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={panelRef}
              dir="rtl"
              className="fixed z-[200] max-h-[min(18rem,50vh)] overflow-y-auto rounded-xl border-2 border-[var(--orange)] bg-[var(--dash-panel-bg)] py-1 shadow-[0_16px_48px_rgba(15,23,42,0.18)]"
              style={{
                top: pos.top,
                left: pos.left,
                width: pos.width,
              }}
              role="listbox"
              aria-multiselectable="true"
            >
              {options.map((opt) => {
                const sel = value.includes(opt)
                return (
                  <button
                    key={opt}
                    type="button"
                    role="option"
                    aria-selected={sel}
                    onClick={() => toggle(opt)}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-right text-[13px] transition ${
                      sel
                        ? 'bg-[#EFF6FF] font-semibold text-[var(--text-dark)]'
                        : 'text-[var(--text-mid)] hover:bg-[var(--blue-light)]'
                    }`}
                  >
                    <span
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border-2 text-[10px] leading-none ${
                        sel
                          ? 'border-[#2563EB] bg-[#2563EB] text-white'
                          : 'border-[var(--border)] bg-[var(--bg-main)]'
                      }`}
                      aria-hidden
                    >
                      {sel ? '✓' : ''}
                    </span>
                    <span className="min-w-0 flex-1 leading-snug">{opt}</span>
                  </button>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
