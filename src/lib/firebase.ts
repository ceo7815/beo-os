import {
  initializeApp,
  getApp,
  getApps,
  type FirebaseApp,
} from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  enableNetwork,
  getFirestore,
  type Firestore,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyAjMt8jq1b25AjXV6oRsK1uzlRpkjv-ADk',
  authDomain: 'hub-pos-f399c.firebaseapp.com',
  projectId: 'hub-pos-f399c',
  storageBucket: 'hub-pos-f399c.firebasestorage.app',
  messagingSenderId: '961483294937',
  appId: '1:961483294937:web:765583ea55dc05cfa416c8',
}

/**
 * אפליקציה יחידה — initializeApp רץ פעם אחת לפני כל שירות (Auth / Firestore).
 */
function getOrInitApp(): FirebaseApp {
  if (getApps().length === 0) {
    return initializeApp(firebaseConfig)
  }
  return getApp()
}

const app = getOrInitApp()
export default app

export function getFirebaseApp(): FirebaseApp {
  return app
}

export const auth: Auth = getAuth(app)

let firestoreSingleton: Firestore | null = null

function connectEmulatorIfConfigured(db: Firestore): void {
  if (typeof window === 'undefined') return
  const raw = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST as
    | string
    | undefined
  if (!raw?.trim()) return
  const [hostPart, portPart] = raw.trim().split(':')
  const host = hostPart || '127.0.0.1'
  const port = portPart ? parseInt(portPart, 10) : 8080
  if (Number.isNaN(port)) return
  try {
    connectFirestoreEmulator(db, host, port)
  } catch {
    /* כבר הופעל connectFirestoreEmulator לאותו מופע */
  }
}

/** Firestore — ברירת מחדל של ה-SDK (פשוט ויציב לפריסה). */
function createFirestore(): Firestore {
  const db = getFirestore(app)
  connectEmulatorIfConfigured(db)
  return db
}

export function getDb(): Firestore {
  if (!firestoreSingleton) {
    firestoreSingleton = createFirestore()
  }
  return firestoreSingleton
}

/** תאימות: אותו מופע כמו getDb() */
export const db = getDb()

/**
 * ממתין לרשת Firestore לפני כתיבה — מפחית "send was called before connect".
 */
export async function ensureFirestoreReady(): Promise<void> {
  await enableNetwork(getDb())
}

export function getFirebaseAuth(): Auth {
  return auth
}

export function isFirebaseConfigured(): boolean {
  return true
}
