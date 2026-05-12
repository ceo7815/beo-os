/**
 * מזהי משתמשים שרואים את הפגישה ביומן (שאילתת array-contains).
 * כש-excludeCreatorFromAttendees: היוצר (createdBy) לא נכלל גם אם הוא מאורגן או משתתף.
 */
export function buildAttendeeUserIds(args: {
  createdBy: string
  organizerUserId: string
  participantUserIds: string[]
  excludeCreatorFromAttendees?: boolean
}): string[] {
  const exclude = Boolean(args.excludeCreatorFromAttendees)
  const creator = String(args.createdBy ?? '').trim()
  const org = String(args.organizerUserId ?? '').trim()
  const parts = (args.participantUserIds ?? [])
    .map((x) => String(x).trim())
    .filter(Boolean)

  const ids = new Set<string>()
  const keep = (uid: string) => !exclude || uid !== creator

  if (org && keep(org)) ids.add(org)
  for (const p of parts) {
    if (keep(p)) ids.add(p)
  }
  if (creator && !exclude) ids.add(creator)

  return [...ids]
}
