import { readFileSync } from 'node:fs'
import { resolve, isAbsolute } from 'node:path'
import { getApps, initializeApp, cert, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { env } from '../config/env.js'
import { serverRoot } from '../config/loadEnv.js'

export type FirebaseAdminState =
  | { status: 'ready'; app: App }
  | { status: 'not_configured'; reason: string }

let cached: FirebaseAdminState | null = null

function resolveServiceAccountPath(): string {
  const raw = env.firebaseServiceAccountPath
  if (!raw) return ''
  if (isAbsolute(raw)) return raw
  return resolve(serverRoot, raw)
}

export function getFirebaseAdmin(): FirebaseAdminState {
  if (cached) return cached

  const saPath = resolveServiceAccountPath()
  if (!saPath) {
    cached = {
      status: 'not_configured',
      reason: 'חסר FIREBASE_SERVICE_ACCOUNT_PATH ב-.env.local',
    }
    return cached
  }

  try {
    const json = readFileSync(saPath, 'utf8')
    const serviceAccount = JSON.parse(json) as Record<string, unknown>
    const app =
      getApps()[0] ??
      initializeApp({
        credential: cert(serviceAccount as Parameters<typeof cert>[0]),
      })
    cached = { status: 'ready', app }
    return cached
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    cached = {
      status: 'not_configured',
      reason: `לא ניתן לטעון service account: ${msg}`,
    }
    return cached
  }
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
