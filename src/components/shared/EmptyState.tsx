import type { ReactNode } from 'react'

export interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
}

export function EmptyState({ title, description, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--bg-card)] px-6 py-12 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      {icon ? (
        <div className="mb-3 text-[40px] leading-none text-[var(--text-light)]">
          {icon}
        </div>
      ) : null}
      <p className="text-base font-bold text-[var(--blue-dark)]">{title}</p>
      {description ? (
        <p className="mt-2 max-w-sm text-[13px] text-[var(--text-light)]">
          {description}
        </p>
      ) : null}
    </div>
  )
}
