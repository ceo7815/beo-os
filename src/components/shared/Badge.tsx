export interface BadgeProps {
  label: string
  color: string
}

export function Badge({ label, color }: BadgeProps) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none tracking-tight"
      style={{
        backgroundColor: `${color}14`,
        borderColor: `${color}4D`,
        color,
      }}
    >
      {label}
    </span>
  )
}
