import { readFileSync } from 'node:fs'
import { resolve, isAbsolute } from 'node:path'
import {
  getApps,
  initializeApp,
  cert,
  applicationDefault,
  type App,
} from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { env } from '../config/env.js'
import { serverRoot } from '../config/loadEnv.js'

export type FirebaseAdminState =
  | { status: 'ready'; app: App }
  | { status: 'not_configured'; reason: string }

const PROJECT_ID = 'hub-pos-f399c'

let cached: FirebaseAdminState | null = null
/** מטמון לתוצאת בדיקת ה-Firestore (אימות אמיתי שהאישורים עובדים) */
let verifyCache: { ok: boolean; reason?: string } | null = null

function resolveServiceAccountPath(): string {
  const raw = env.firebaseServiceAccountPath
  if (!raw) return ''
  if (isAbsolute(raw)) return raw
  return resolve(serverRoot, raw)
}

/** ניסיון 1 — קובץ service account (FIREBASE_SERVICE_ACCOUNT_PATH) */
function tryServiceAccount(): App | null {
  const saPath = resolveServiceAccountPath()
  if (!saPath) return null
  const json = readFileSync(saPath, 'utf8')
  const serviceAccount = JSON.parse(json) as Record<string, unknown>
  return initializeApp({
    credential: cert(serviceAccount as Parameters<typeof cert>[0]),
    projectId: PROJECT_ID,
  })
}

/** ניסיון 2 — Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS) */
function tryApplicationDefault(): App | null {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) return null
  return initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  })
}

export function getFirebaseAdmin(): FirebaseAdminState {
  if (cached) return cached

  const existing = getApps()[0]
  if (existing) {
    cached = { status: 'ready', app: existing }
    return cached
  }

  const attempts: Array<{ label: string; fn: () => App | null }> = [
    { label: 'service account', fn: tryServiceAccount },
    { label: 'application default', fn: tryApplicationDefault },
  ]

  const errors: string[] = []
  for (const attempt of attempts) {
    try {
      const app = attempt.fn()
      if (app) {
        cached = { status: 'ready', app }
        return cached
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`${attempt.label}: ${msg}`)
    }
  }

  cached = {
    status: 'not_configured',
    reason:
      errors.length > 0
        ? `אימות Firebase Admin נכשל — ${errors.join(' · ')}`
        : 'חסר FIREBASE_SERVICE_ACCOUNT_PATH ב-server/.env.local',
  }
  return cached
}

/**
 * אימות אמיתי שהאישורים מאפשרים גישת Firestore (קריאה זעירה).
 * חיוני כי initializeApp מצליח גם עם אישורים שלא תקפים ל-Firestore.
 */
export async function verifyFirebaseAdmin(): Promise<{
  ok: boolean
  reason?: string
}> {
  if (verifyCache) return verifyCache
  const state = getFirebaseAdmin()
  if (state.status !== 'ready') {
    verifyCache = { ok: false, reason: state.reason }
    return verifyCache
  }
  try {
    await getFirestore(state.app).collection('users').limit(1).get()
    verifyCache = { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    verifyCache = {
      ok: false,
      reason: `Firestore לא נגיש עם האישורים הנוכחיים — ${msg}`,
    }
  }
  return verifyCache
}

export function getAdminAuth() {
  const state = getFirebaseAdmin()
  if (state.status !== 'ready') return null
  return getAuth(state.app)
}

export function getAdminDb() {
  const state = getFirebaseAdmin()
  if (state.status !== 'ready') return null
  return getFirestore(state.app)
}
