type Props = {
  onClick: () => void
  disabled?: boolean
  label?: string
  className?: string
}

export function ExportExcelButton({
  onClick,
  disabled,
  label = 'ייצוא לאקסל',
  className = '',
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-sm font-semibold text-[var(--orange)] transition hover:bg-[var(--orange-light)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {label}
    </button>
  )
}
