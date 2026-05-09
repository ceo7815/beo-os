export interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  message: string
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  message,
}: ConfirmDialogProps) {
  if (!isOpen) return null
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      dir="rtl"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="absolute inset-0 bg-[rgba(15,23,42,0.5)] backdrop-blur-[4px]" />
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl hub-dash-card p-7 shadow-[0_20px_60px_rgba(0,0,0,0.15)]"
        role="alertdialog"
        aria-modal="true"
      >
        <p className="mb-6 text-sm leading-relaxed text-[var(--text-dark)]">
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="hub-btn-secondary text-sm"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm()
              onClose()
            }}
            className="rounded-[10px] bg-[var(--danger)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#dc2626]"
          >
            אישור
          </button>
        </div>
      </div>
    </div>
  )
}
