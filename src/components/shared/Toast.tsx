import { useHubStore } from '../../store/useStore'

export function ToastHost() {
  const toasts = useHubStore((s) => s.toasts)
  const dismissToast = useHubStore((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex w-[min(100%,420px)] -translate-x-1/2 flex-col gap-2 px-4"
      dir="rtl"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="hub-toast-animate pointer-events-auto flex items-start justify-between gap-3 rounded-[10px] border-r-4 border-[var(--orange)] bg-[var(--bg-sidebar)] px-5 py-3 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.15)]"
        >
          <p className="whitespace-pre-line break-words leading-snug">
            {t.message}
          </p>
          <button
            type="button"
            className="shrink-0 text-white/70 hover:text-white"
            onClick={() => dismissToast(t.id)}
            aria-label="סגור הודעה"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
