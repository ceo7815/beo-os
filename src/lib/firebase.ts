import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFunctions, type Functions } from 'firebase/functions'
import {
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'
import { isSupabaseConfigured } from './backend'

const apiKey = String(import.meta.env.VITE_FIREBASE_API_KEY ?? '').trim()

export function isFirebaseConfigured(): boolean {
  if (isSupabaseConfigured()) return false
  return apiKey.length > 0
}

/** חיבור Firestore של החברה הישנה — כבוי לגמרי כש-Supabase מוגדר או שאין מפתחות Firebase. */
export function canUseLegacyFirestore(): boolean {
  return isFirebaseConfigured()
}

const firebaseConfig = isFirebaseConfigured()
  ? {
      apiKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    }
  : null

const app: FirebaseApp | null = firebaseConfig ? initializeApp(firebaseConfig) : null

export const auth = (app ? getAuth(app) : null) as Auth
const fnRegionRaw = import.meta.env.VITE_FUNCTIONS_REGION
const functionsRegion =
  (typeof fnRegionRaw === 'string' && fnRegionRaw.trim()) || 'us-central1'
export const functionsClient = (app ? getFunctions(app, functionsRegion) : null) as Functions

export const db = (
  app
    ? initializeFirestore(app, {
        localCache: memoryLocalCache(),
      })
    : null
) as Firestore

export const storage = (app ? getStorage(app) : null) as FirebaseStorage

export async function ensureFirestoreReady(): Promise<void> {
  await Promise.resolve()
}

export default app
