import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { isSupabaseConfigured } from '../lib/backend'
import { supabase } from '../lib/supabase'
import type { AppUser } from '../lib/appUser'
import { isPublicAppPath } from '../lib/publicRoutes'
import { useHubStore } from '../store/useStore'

export interface AuthContextValue {
  user: AppUser | null
  loading: boolean
  /** @deprecated השתמשו ב-authReady — אין Firebase ב-Beo OS */
  firebaseReady: boolean
  authReady: boolean
  signInWithEmail: (email: string, password: string) => Promise<void>
  signOutUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function toAppUser(u: SupabaseUser, accessToken: string): AppUser {
  const meta = u.user_metadata as Record<string, unknown> | undefined
  const displayName =
    (typeof meta?.name === 'string' && meta.name.trim()) ||
    (typeof meta?.full_name === 'string' && meta.full_name.trim()) ||
    u.email?.split('@')[0] ||
    null
  return {
    uid: u.id,
    email: u.email ?? null,
    displayName,
    getIdToken: async () => accessToken,
  }
}

async function loadProfileIntoStore(uid: string, email: string | null, displayName: string | null) {
  const setCurrentUser = useHubStore.getState().setCurrentUser
  const fallback = {
    uid,
    name: displayName || email?.split('@')[0] || 'משתמש',
    email: email ?? '',
    role: 'employee',
    avatar: (displayName || email || 'מש').slice(0, 2),
    color: '#5828A0',
    active: true,
  }

  if (!supabase) {
    setCurrentUser(fallback)
    return
  }

  const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
  if (data) {
    setCurrentUser({
      uid,
      name: data.name ?? fallback.name,
      email: data.email ?? fallback.email,
      role: data.role ?? 'employee',
      avatar: data.avatar ?? fallback.avatar,
      color: data.color ?? fallback.color,
      active: data.active !== false,
      isAgent: Boolean(data.is_agent),
    })
    return
  }
  setCurrentUser(fallback)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const authReady = isSupabaseConfigured()

  useEffect(() => {
    if (!authReady || !supabase) {
      queueMicrotask(() => setLoading(false))
      return
    }

    const applySession = async (sessionUser: SupabaseUser | null, accessToken: string) => {
      const setCurrentUser = useHubStore.getState().setCurrentUser
      if (!sessionUser) {
        setUser(null)
        setCurrentUser(null)
        if (!isPublicAppPath(location.pathname)) {
          navigate('/login', { replace: true })
        }
        return
      }
      const mapped = toAppUser(sessionUser, accessToken)
      setUser(mapped)
      try {
        await loadProfileIntoStore(mapped.uid, mapped.email, mapped.displayName)
      } catch {
        setCurrentUser({
          uid: mapped.uid,
          name: mapped.displayName || mapped.email?.split('@')[0] || 'משתמש',
          email: mapped.email ?? '',
          role: 'employee',
          avatar: (mapped.displayName || mapped.email || 'מש').slice(0, 2),
          color: '#5828A0',
          active: true,
        })
      }
    }

    void supabase.auth.getSession().then(({ data }) => {
      void applySession(data.session?.user ?? null, data.session?.access_token ?? '').finally(() => {
        setLoading(false)
      })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session?.user ?? null, session?.access_token ?? '').finally(() => {
        setLoading(false)
      })
    })

    return () => {
      sub.subscription.unsubscribe()
    }
  }, [authReady, navigate, location.pathname])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      throw new Error('Supabase אינו מוגדר')
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) {
      const err = error as Error & { code?: string }
      err.code = error.message.toLowerCase().includes('invalid')
        ? 'auth/invalid-credential'
        : error.message
      throw err
    }
  }, [])

  const signOutUser = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
    useHubStore.getState().setCurrentUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      firebaseReady: authReady,
      authReady,
      signInWithEmail,
      signOutUser,
    }),
    [user, loading, authReady, signInWithEmail, signOutUser],
  )

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div
          dir="rtl"
          className="flex min-h-[100dvh] items-center justify-center bg-[#F7F5FB] text-base font-semibold text-[#141416]"
        >
          טוען...
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth חייב לרוץ בתוך AuthProvider')
  }
  return ctx
}
