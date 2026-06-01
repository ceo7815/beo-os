import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useUsers } from '../hooks/useUsers'
import { useHubStore } from '../store/useStore'

export function isAdminRole(role: string): boolean {
  const r = String(role ?? '')
    .trim()
    .toLowerCase()
  return r === 'admin' || r === 'superadmin'
}

/** תפקיד אפקטיבי — עדיפות לפרופיל Firestore בזיכרון (כמו בכספת) */
export function resolveEffectiveUserRole(
  uid: string | undefined,
  teamMembers: ReadonlyArray<{ id: string; role: string }>,
  hubUser: { uid?: string; role?: string } | null | undefined,
): string {
  if (!uid) return ''
  const fromTeam = teamMembers.find((m) => m.id === uid)?.role ?? ''
  if (
    hubUser?.uid === uid &&
    typeof hubUser.role === 'string' &&
    hubUser.role.trim() !== ''
  ) {
    return hubUser.role
  }
  return fromTeam
}

export function userIsAdmin(
  uid: string | undefined,
  teamMembers: ReadonlyArray<{ id: string; role: string }>,
  hubUser: { uid?: string; role?: string } | null | undefined,
): boolean {
  return isAdminRole(resolveEffectiveUserRole(uid, teamMembers, hubUser))
}

/** רק admin / superadmin — אחרת הפניה לדשבורד */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { users } = useUsers()
  const hubUser = useHubStore((s) => s.currentUser)
  const ok = user && userIsAdmin(user.uid, users, hubUser)

  if (!user) return null
  if (!ok) return <Navigate to="/" replace />
  return children
}
