import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useUsers } from '../hooks/useUsers'

export function isAdminRole(role: string): boolean {
  return role === 'admin' || role === 'superadmin'
}

/** רק admin / superadmin — אחרת הפניה לדשבורד */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { users } = useUsers()
  const role = users.find((m) => m.id === user?.uid)?.role ?? ''
  const ok = user && isAdminRole(role)

  if (!user) return null
  if (!ok) return <Navigate to="/" replace />
  return children
}
