import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMeetings } from '../hooks/useMeetings'
import { useTasks } from '../hooks/useTasks'

const dockBtn =
  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-right transition active:scale-[0.98]'

export function QuickActionsFloat() {
  const navigate = useNavigate()
  const { setQuickSliderOpen } = useTasks()
  const { setQuickCalendarSliderOpen } = useMeetings()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current
      if (!el || el.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed bottom-4 left-4 z-[56] md:bottom-6 md:left-6"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
      dir="rtl"
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--orange)] text-xl font-bold text-white shadow-[0_4px_16px_rgba(249,115,22,0.3)] transition hover:brightness-105 active:scale-95"
          aria-label="פתח פעולות מהירות"
          aria-expanded={false}
        >
          +
        </button>
      ) : (
        <div
          className="pointer-events-auto flex max-w-[220px] flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] p-1.5 shadow-[var(--shadow-lg)]"
          role="toolbar"
          aria-label="פעולות מהירות"
        >
          <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-light)]">
              מהיר
            </p>
            <button
              type="button"
              onClick={close}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-dark)]"
              aria-label="סגור פעולות מהירות"
            >
              ×
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setQuickSliderOpen(true)
              close()
            }}
            className={`${dockBtn} text-[var(--text-dark)] hover:bg-[var(--surface-muted)]`}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--orange-light)] text-base font-black text-[var(--orange)]"
              aria-hidden
            >
              +
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-extrabold leading-tight">הוסף משימה</span>
              <span className="block text-[10px] font-medium text-[var(--text-light)]">רשימה מהירה</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setQuickCalendarSliderOpen(true)
              close()
            }}
            className={`${dockBtn} text-[var(--text-dark)] hover:bg-[var(--surface-muted)]`}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E0F2FE] text-base font-black text-[#0EA5E9]"
              aria-hidden
            >
              +
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-extrabold leading-tight">יומן מהיר</span>
              <span className="block text-[10px] font-medium text-[var(--text-light)]">פגישות היום והשבוע</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              navigate('/leads', { state: { openAdd: true } })
              close()
            }}
            className={`${dockBtn} text-[var(--text-dark)] hover:bg-[var(--surface-muted)]`}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--orange-light)] text-base font-black text-[var(--orange)]"
              aria-hidden
            >
              +
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-extrabold leading-tight">הוסף ליד</span>
              <span className="block text-[10px] font-medium text-[var(--text-light)]">טופס חדש</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              navigate('/clients', { state: { openAdd: true } })
              close()
            }}
            className={`${dockBtn} text-[var(--text-dark)] hover:bg-[var(--surface-muted)]`}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--orange-light)] text-base font-black text-[var(--orange)]"
              aria-hidden
            >
              +
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-extrabold leading-tight">הוסף לקוח</span>
              <span className="block text-[10px] font-medium text-[var(--text-light)]">כרטיס לקוח</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              navigate('/projects', { state: { openAdd: true } })
              close()
            }}
            className={`${dockBtn} text-[var(--text-dark)] hover:bg-[var(--surface-muted)]`}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--orange-light)] text-base font-black text-[var(--orange)]"
              aria-hidden
            >
              +
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-extrabold leading-tight">הוסף פרויקט</span>
              <span className="block text-[10px] font-medium text-[var(--text-light)]">פרויקט חדש</span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
