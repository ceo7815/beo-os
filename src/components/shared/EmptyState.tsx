import type { ReactNode } from 'react'

export interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
}

export function EmptyState({ title, description, icon }: EmptyStateProps) {
  return (
    <div className="hub-empty-dashed flex flex-col items-center justify-center rounded-xl px-6 py-12 text-center">
      {icon ? (
        <div className="mb-3 text-[40px] leading-none text-[var(--text-light)]">
          {icon}
        </div>
      ) : null}
      <p className="text-base font-bold text-[var(--text-dark)]">{title}</p>
      {description ? (
        <p className="mt-2 max-w-sm text-[13px] text-[var(--text-mid)]">
          {description}
        </p>
      ) : null}
    </div>
  )
}
