import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFunctions } from 'firebase/functions'
import {
  initializeFirestore,
  memoryLocalCache,
} from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAjMt8jq1b25AjXV6oRsK1uzlRpkjv-ADk',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'hub-pos-f399c.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'hub-pos-f399c',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'hub-pos-f399c.firebasestorage.app',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '961483294937',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:961483294937:web:765583ea55dc05cfa416c8',
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
const fnRegionRaw = import.meta.env.VITE_FUNCTIONS_REGION
const functionsRegion =
  (typeof fnRegionRaw === 'string' && fnRegionRaw.trim()) || 'us-central1'
export const functionsClient = getFunctions(app, functionsRegion)

/**
 * זיכרון בלבד — נמנע ממצבי IndexedDB ששוברים את ה־SDK ("INTERNAL ASSERTION FAILED").
 * לא קוראים ל־enableNetwork כאן: קריאות מקבילות אחרי התחברות גרמו ל־Unexpected state ב־10.14.
 */
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
})

/** באקט ברירת המחדל של הפרויקט — מתאים לחוקי Storage שפורסמו ל־gs://…appspot.com */
export const storage = getStorage(app, `gs://${firebaseConfig.projectId}.appspot.com`)

/** מקום לריצה אסינכרונית אחרי התחברות — ללא enableNetwork (מסוכן במקביל). */
export async function ensureFirestoreReady(): Promise<void> {
  await Promise.resolve()
}

export function isFirebaseConfigured(): boolean {
  return true
}

export default app
