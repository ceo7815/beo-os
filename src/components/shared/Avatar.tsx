import type { TeamMember } from '../../types'

export interface AvatarProps {
  member: TeamMember
  size?: number
}

export function Avatar({ member, size = 28 }: AvatarProps) {
  const s = `${size}px`
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none text-[var(--text-dark)]"
      style={{
        width: s,
        height: s,
        fontSize: Math.max(10, Math.round(size * 0.38)),
        backgroundColor: `${member.color}22`,
        border: `1.5px solid ${member.color}`,
      }}
      title={member.name}
    >
      {member.avatar}
    </span>
  )
}
