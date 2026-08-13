import type { ReactNode } from 'react'

export interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="hub-empty-dashed flex flex-col items-center justify-center rounded-xl px-6 py-10 text-center">
      {icon ? (
        <div className="mb-3 text-[40px] leading-none text-[var(--text-light)]">
          {icon}
        </div>
      ) : null}
      <p className="text-[15px] font-bold text-[var(--text-dark)]">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-[var(--text-mid)]">
          {description}
        </p>
      ) : null}
      {action ? (
        <button type="button" className="hub-btn-primary mt-4 text-sm" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  )
}
