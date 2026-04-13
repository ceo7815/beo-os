import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/** מסלולים שדורשים התחברות Firebase */
export function RequireAuth() {
  const { user, loading, firebaseReady } = useAuth()

  if (!firebaseReady) {
    return <Navigate to="/login" replace />
  }

  if (loading) {
    return (
      <div
        dir="rtl"
        className="flex min-h-[100dvh] items-center justify-center bg-[#F0F4FF] text-base font-semibold text-[#1A2B5E]"
      >
        טוען...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
