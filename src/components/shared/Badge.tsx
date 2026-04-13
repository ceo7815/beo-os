export interface BadgeProps {
  label: string
  color: string
}

export function Badge({ label, color }: BadgeProps) {
  return (
    <span
      className="inline-flex items-center justify-center font-bold leading-none"
      style={{
        backgroundColor: `${color}18`,
        border: `1px solid ${color}55`,
        color,
        borderRadius: '20px',
        padding: '3px 10px',
        fontSize: '11px',
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  )
}
