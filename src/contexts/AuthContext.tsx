import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  GoogleAuthProvider,
  type User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import {
  auth,
  db,
  ensureFirestoreReady,
  isFirebaseConfigured,
} from '../lib/firebase'
import { isFirestoreAutoSeedEnabled } from '../lib/firestoreSeedFlags'
import { seedCloudflare } from '../lib/seedCloudflare'
import { seedClients } from '../lib/seedClients'
import { seedFirestore } from '../lib/seedData'
import { seedHosting } from '../lib/seedHosting'
import { useHubStore } from '../store/useStore'

/**
 * Seed (CSV + דמו) רק אם VITE_ENABLE_FIRESTORE_SEED=true — לא נוגע בנתונים אמיתיים בפרודקשן.
 */
let csvSeedDoneForUid: string | null = null

function runSeedsAfterLogin(uid: string): void {
  if (!isFirestoreAutoSeedEnabled()) return

  void (async () => {
    try {
      await ensureFirestoreReady()
    } catch {
      /* המשך גם אם enableNetwork נכשל */
    }
    if (csvSeedDoneForUid !== uid) {
      csvSeedDoneForUid = uid
      try {
        await seedClients()
      } catch (e) {
        console.error('seedClients', e)
      }
    }
    try {
      await seedFirestore()
    } catch (e) {
      console.error('seedFirestore', e)
    }
  })()
}

/** מונע שתי זריעות במקביל (מפחית already-exists / Target ID already exists ב-Web) */
let hostingSeedsChain: Promise<void> | null = null

/**
 * זרעת מאגר אחסון + Cloudflare — רץ אחרי התחברות (Firestore דורש auth).
 * אידמפוטנטי: אם האוספים כבר מלאים — מדלג.
 */
function runHostingSeedsAfterLogin(uid: string): void {
  if (!uid) return
  if (hostingSeedsChain) return
  hostingSeedsChain = (async () => {
    try {
      await ensureFirestoreReady()
    } catch {
      /* המשך */
    }
    try {
      await seedHosting()
      await seedCloudflare()
    } catch (e) {
      console.error('seedHosting / seedCloudflare', e)
    } finally {
      hostingSeedsChain = null
    }
  })()
}

async function ensureUserProfile(user: User): Promise<void> {
  const ref = doc(db, 'users', user.uid)
  const snap = await getDoc(ref)
  if (snap.exists()) return
  const name =
    user.displayName?.trim() || user.email?.split('@')[0] || 'משתמש'
  const avatar = name.slice(0, 2)
  await setDoc(ref, {
    name,
    email: user.email ?? '',
    role: 'employee',
    avatar,
    color: '#2563EB',
    active: true,
    createdAt: serverTimestamp(),
  })
}

export interface AuthContextValue {
  user: User | null
  loading: boolean
  firebaseReady: boolean
  signInWithEmail: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOutUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const firebaseReady = isFirebaseConfigured()

  useEffect(() => {
    if (!firebaseReady) {
      queueMicrotask(() => setLoading(false))
      return
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      const setCurrentUser = useHubStore.getState().setCurrentUser
      try {
        if (u) {
          try {
            await ensureUserProfile(u)
          } catch {
            /* נכשל יצירת פרופיל — המשתמש עדיין מחובר */
          }
          try {
            const snap = await getDoc(doc(db, 'users', u.uid))
            if (snap.exists()) setCurrentUser({ uid: u.uid, ...snap.data() })
          } catch {
            /* לדוגמה חוקי Firestore חוסמים קריאה — לא לחסום את המסך */
          }
          runSeedsAfterLogin(u.uid)
          runHostingSeedsAfterLogin(u.uid)
        } else {
          csvSeedDoneForUid = null
          setCurrentUser(null)
          navigate('/login', { replace: true })
        }
      } finally {
        setLoading(false)
      }
    })
    return () => unsub()
  }, [firebaseReady, navigate])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password)
  }, [])

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider()
    await signInWithPopup(auth, provider)
  }, [])

  const signOutUser = useCallback(async () => {
    await firebaseSignOut(auth)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      firebaseReady,
      signInWithEmail,
      signInWithGoogle,
      signOutUser,
    }),
    [user, loading, firebaseReady, signInWithEmail, signInWithGoogle, signOutUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth חייב לרוץ בתוך AuthProvider')
  }
  return ctx
}
