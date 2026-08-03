import type { ReactNode, MouseEvent } from 'react'

type Props = {
  onClick?: () => void
  children: ReactNode
  className?: string
  title?: string
  /** מונע bubbling ללחיצות בתוך dropdowns */
  stopPropagation?: boolean
}

/**
 * טקסט לחיץ אחיד בטבלאות פיננסים (לקוח / פרויקט / ספק).
 * בלי onClick — מוצג כטקסט רגיל.
 */
export function FinanceClickable({
  onClick,
  children,
  className = '',
  title,
  stopPropagation = true,
}: Props) {
  if (!onClick) {
    return <span className={className}>{children}</span>
  }

  const handle = (e: MouseEvent) => {
    if (stopPropagation) e.stopPropagation()
    onClick()
  }

  return (
    <button
      type="button"
      onClick={handle}
      title={title}
      className={`max-w-full truncate text-right font-semibold text-[var(--orange)] underline-offset-2 transition hover:underline ${className}`}
    >
      {children}
    </button>
  )
}
