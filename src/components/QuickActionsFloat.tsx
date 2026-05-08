import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTasks } from '../hooks/useTasks'

const dockBtn =
  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-right transition active:scale-[0.98]'

export function QuickActionsFloat() {
  const navigate = useNavigate()
  const { setQuickSliderOpen } = useTasks()
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
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200/90 bg-[#2563EB] text-xl font-black text-white shadow-[0_8px_24px_rgba(37,99,235,0.35)] backdrop-blur-sm transition hover:bg-[#1D4ED8] hover:shadow-[0_10px_28px_rgba(37,99,235,0.45)] active:scale-95"
          aria-label="פתח פעולות מהירות"
          aria-expanded={false}
        >
          +
        </button>
      ) : (
        <div
          className="pointer-events-auto flex max-w-[220px] flex-col gap-1 rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-[0_8px_30px_rgba(15,23,42,0.12)] backdrop-blur-md"
          role="toolbar"
          aria-label="פעולות מהירות"
        >
          <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              מהיר
            </p>
            <button
              type="button"
              onClick={close}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
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
            className={`${dockBtn} text-slate-800 hover:bg-emerald-50 hover:text-emerald-900`}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-base font-black text-emerald-700"
              aria-hidden
            >
              +
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-extrabold leading-tight">הוסף משימה</span>
              <span className="block text-[10px] font-medium text-slate-500">רשימה מהירה</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              navigate('/leads', { state: { openAdd: true } })
              close()
            }}
            className={`${dockBtn} text-slate-800 hover:bg-violet-50 hover:text-violet-900`}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-base font-black text-violet-700"
              aria-hidden
            >
              +
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-extrabold leading-tight">הוסף ליד</span>
              <span className="block text-[10px] font-medium text-slate-500">טופס חדש</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              navigate('/clients', { state: { openAdd: true } })
              close()
            }}
            className={`${dockBtn} text-slate-800 hover:bg-amber-50 hover:text-amber-900`}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-base font-black text-amber-700"
              aria-hidden
            >
              +
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-extrabold leading-tight">הוסף לקוח</span>
              <span className="block text-[10px] font-medium text-slate-500">כרטיס לקוח</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              navigate('/projects', { state: { openAdd: true } })
              close()
            }}
            className={`${dockBtn} text-slate-800 hover:bg-sky-50 hover:text-sky-900`}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-base font-black text-sky-700"
              aria-hidden
            >
              +
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-extrabold leading-tight">הוסף פרויקט</span>
              <span className="block text-[10px] font-medium text-slate-500">פרויקט חדש</span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
