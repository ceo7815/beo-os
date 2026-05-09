import type { ReactNode } from 'react'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** lg / xl — תצוגה רחבה (xl למסכי פרטים מלאים) */
  size?: 'md' | 'lg' | 'xl'
  /**
   * ברירת מחדל: גלילה פנימית עם גובה מקסימלי.
   * לרשימות צפות (אוטו-השלמה) העבירו overflow-visible max-h-none — הגלילה תהיה על כל חלון המודל.
   */
  bodyClassName?: string
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  bodyClassName,
}: ModalProps) {
  if (!isOpen) return null
  const maxW =
    size === 'xl' ? 'max-w-4xl' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg'
  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center p-4"
      dir="rtl"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="absolute inset-0 bg-[rgba(15,23,42,0.5)] backdrop-blur-[4px]" />
      <div
        className={`relative z-10 w-full ${maxW} max-h-[min(90vh,880px)] overflow-y-auto rounded-2xl hub-dash-card p-7 shadow-[0_20px_60px_rgba(0,0,0,0.15)]`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="mb-4 flex shrink-0 items-start justify-between gap-3 border-b border-[rgba(249,115,22,0.25)] pb-4">
          <h2
            id="modal-title"
            className="min-w-0 flex-1 text-start text-[17px] font-bold leading-snug text-[var(--text-dark)]"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-light)] transition hover:bg-[var(--orange-light)] hover:text-[var(--text-dark)]"
            aria-label="סגור"
          >
            ✕
          </button>
        </div>
        <div
          className={
            bodyClassName?.trim()
              ? `${bodyClassName} text-[var(--text-dark)]`
              : 'max-h-[min(65vh,640px)] overflow-y-auto text-[var(--text-dark)]'
          }
        >
          {children}
        </div>
      </div>
    </div>
  )
}
