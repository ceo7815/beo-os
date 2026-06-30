import { env } from '../config/env.js'
import { getAdminDb } from './firebaseAdmin.js'

export type MorningEnv = 'sandbox' | 'production'

export type MorningCredentials = {
  keyId: string
  keySecret: string
  env: MorningEnv
}

/** מסמך ההגדרות של האינטגרציה ב-Firestore (נגיש רק ל-Admin SDK) */
const SETTINGS_COLLECTION = 'integrations'
const SETTINGS_DOC = 'morning'

function normalizeEnv(raw: unknown): MorningEnv {
  return raw === 'sandbox' ? 'sandbox' : 'production'
}

/**
 * מקור המפתחות:
 * 1. משתני סביבה (MORNING_KEY_ID/SECRET) — גוברים אם קיימים.
 * 2. מסמך Firestore integrations/morning — נשמר דרך כפתור באפליקציה.
 */
export async function loadMorningCredentials(): Promise<MorningCredentials | null> {
  if (env.morning.keyId && env.morning.keySecret) {
    return {
      keyId: env.morning.keyId,
      keySecret: env.morning.keySecret,
      env: normalizeEnv(env.morning.env),
    }
  }

  const db = getAdminDb()
  if (!db) return null

  const snap = await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC).get()
  if (!snap.exists) return null
  const data = snap.data() ?? {}
  const keyId = String(data.keyId ?? '').trim()
  const keySecret = String(data.keySecret ?? '').trim()
  if (!keyId || !keySecret) return null
  return { keyId, keySecret, env: normalizeEnv(data.env) }
}

/** שמירת המפתחות ב-Firestore (נגיש רק לשרת) */
export async function saveMorningCredentials(
  creds: MorningCredentials,
): Promise<void> {
  const db = getAdminDb()
  if (!db) throw new Error('Firebase Admin not configured')
  await db
    .collection(SETTINGS_COLLECTION)
    .doc(SETTINGS_DOC)
    .set(
      {
        keyId: creds.keyId,
        keySecret: creds.keySecret,
        env: creds.env,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    )
}

/** האם המפתחות הגיעו ממשתני סביבה (לא ניתנים לעריכה מהאפליקציה) */
export function credentialsFromEnv(): boolean {
  return Boolean(env.morning.keyId && env.morning.keySecret)
}

/** קריאת מצב הסנכרון האחרון */
export async function readSyncState(): Promise<Record<string, unknown> | null> {
  const db = getAdminDb()
  if (!db) return null
  const snap = await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC).get()
  if (!snap.exists) return null
  const data = snap.data() ?? {}
  return (data.syncState as Record<string, unknown>) ?? null
}

/** עדכון מצב הסנכרון האחרון */
export async function writeSyncState(
  state: Record<string, unknown>,
): Promise<void> {
  const db = getAdminDb()
  if (!db) return
  await db
    .collection(SETTINGS_COLLECTION)
    .doc(SETTINGS_DOC)
    .set({ syncState: state }, { merge: true })
}
