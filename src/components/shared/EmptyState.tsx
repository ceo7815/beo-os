import type { ReactNode } from 'react'

export interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
}

export function EmptyState({ title, description, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-gradient-to-b from-white to-slate-50 px-6 py-12 text-center shadow-sm">
      {icon ? (
        <div className="mb-3 text-[40px] leading-none text-slate-400">
          {icon}
        </div>
      ) : null}
      <p className="text-base font-extrabold text-slate-800">{title}</p>
      {description ? (
        <p className="mt-2 max-w-sm text-[13px] text-slate-500">
          {description}
        </p>
      ) : null}
    </div>
  )
}
