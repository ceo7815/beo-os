import type { ReactNode } from 'react'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** lg / xl / full — תצוגה רחבה (full למסכי עבודה גדולים כמו הפקת מסמך) */
  size?: 'md' | 'lg' | 'xl' | 'full'
  /**
   * ברירת מחדל: גלילה פנימית עם גובה מקסימלי.
   * לרשימות צפות (אוטו-השלמה) העבירו overflow-visible max-h-none — הגלילה תהיה על כל חלון המודל.
   */
  bodyClassName?: string
  /** ללא כותרת כפולה כשהילד מביא כותרת משלו */
  hideTitle?: boolean
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  bodyClassName,
  hideTitle = false,
}: ModalProps) {
  if (!isOpen) return null
  const maxW =
    size === 'full'
      ? 'max-w-[min(96vw,1180px)]'
      : size === 'xl'
        ? 'max-w-4xl'
        : size === 'lg'
          ? 'max-w-2xl'
          : 'max-w-lg'
  const panelPad =
    size === 'full' && hideTitle ? 'p-2 sm:p-3' : size === 'full' ? 'p-4 sm:p-5' : 'p-7'
  const panelMaxH =
    size === 'full' ? 'max-h-[min(94vh,980px)]' : 'max-h-[min(90vh,880px)]'
  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center p-2 sm:p-4"
      dir="rtl"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="absolute inset-0 bg-[rgba(15,23,42,0.55)] backdrop-blur-[5px]" />
      <div
        className={`relative z-10 flex w-full ${maxW} ${panelMaxH} flex-col overflow-hidden rounded-2xl hub-dash-card ${panelPad} shadow-[0_24px_80px_rgba(0,0,0,0.22)]`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div
          className={`flex shrink-0 items-start justify-between gap-3 ${
            hideTitle ? 'absolute start-3 top-3 z-20 mb-0' : 'mb-3 border-b border-[var(--border)] pb-3'
          }`}
        >
          {hideTitle ? (
            <span id="modal-title" className="sr-only">
              {title}
            </span>
          ) : (
            <h2
              id="modal-title"
              className="min-w-0 flex-1 text-start text-[17px] font-bold leading-snug text-[var(--text-dark)]"
            >
              {title}
            </h2>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${
              hideTitle
                ? 'bg-white/95 text-[var(--text-dark)] shadow-sm ring-1 ring-black/10 hover:bg-white'
                : 'text-[var(--text-light)] hover:bg-[var(--brand-light)] hover:text-[var(--text-dark)]'
            }`}
            aria-label="סגור"
          >
            ✕
          </button>
        </div>
        <div
          className={
            bodyClassName?.trim()
              ? `${bodyClassName} min-h-0 flex-1 text-[var(--text-dark)]`
              : 'min-h-0 max-h-[min(65vh,640px)] flex-1 overflow-y-auto text-[var(--text-dark)]'
          }
        >
          {children}
        </div>
      </div>
    </div>
  )
}
