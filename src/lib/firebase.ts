import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore,
  memoryLocalCache,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyAjMt8jq1b25AjXV6oRsK1uzlRpkjv-ADk',
  authDomain: 'hub-pos-f399c.firebaseapp.com',
  projectId: 'hub-pos-f399c',
  storageBucket: 'hub-pos-f399c.firebasestorage.app',
  messagingSenderId: '961483294937',
  appId: '1:961483294937:web:765583ea55dc05cfa416c8',
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

/**
 * זיכרון בלבד — נמנע ממצבי IndexedDB ששוברים את ה־SDK ("INTERNAL ASSERTION FAILED").
 * לא קוראים ל־enableNetwork כאן: קריאות מקבילות אחרי התחברות גרמו ל־Unexpected state ב־10.14.
 */
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
})

/** מקום לריצה אסינכרונית אחרי התחברות — ללא enableNetwork (מסוכן במקביל). */
export async function ensureFirestoreReady(): Promise<void> {
  await Promise.resolve()
}

export function isFirebaseConfigured(): boolean {
  return true
}

export default app
