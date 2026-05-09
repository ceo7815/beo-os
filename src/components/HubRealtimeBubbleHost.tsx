import { useHubRealtimeBubbleStore } from '../store/hubRealtimeBubbleStore'

/**
 * חלוניות צף בפינה התחתונה־שמאלית (מעל כפתור «מהיר»), בסגנון WhatsApp Web.
 * מוצג רק בטאב שבו האפליקציה פתוחה — בחלון/טאב אחר רואים התראת מערכת + מונה בטאב.
 */
export function HubRealtimeBubbleHost() {
  const items = useHubRealtimeBubbleStore((s) => s.items)
  const dismissBubble = useHubRealtimeBubbleStore((s) => s.dismissBubble)

  if (items.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed bottom-[5.25rem] left-4 z-[95] flex max-h-[min(52vh,calc(100vh-7rem))] w-[min(100vw-2rem,380px)] flex-col-reverse gap-2 overflow-y-auto pb-1 md:bottom-[6rem] md:left-6"
      dir="rtl"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="hub-realtime-bubble-animate pointer-events-auto flex gap-3 rounded-2xl border-2 border-[var(--orange)] bg-[var(--dash-panel-bg)] px-3 py-3 shadow-[0_12px_36px_rgba(15,23,42,0.14)]"
        >
          <div className="flex shrink-0 flex-col items-center gap-1">
            <img
              src="/favicon.svg"
              alt=""
              className="h-10 w-10 rounded-xl bg-[var(--blue-light)] p-1.5"
            />
            <span className="h-7 w-1 rounded-full bg-[var(--orange)]" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-[13px] font-bold leading-snug text-[var(--text-dark)]">
              {t.title}
            </p>
            <p className="mt-1 whitespace-pre-line break-words text-[12px] leading-snug text-[var(--text-mid)]">
              {t.body}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 self-start rounded-lg px-1.5 py-0.5 text-[15px] leading-none text-[var(--text-light)] transition hover:bg-[var(--bg-main)] hover:text-[var(--text-dark)]"
            onClick={() => dismissBubble(t.id)}
            aria-label="סגור"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
