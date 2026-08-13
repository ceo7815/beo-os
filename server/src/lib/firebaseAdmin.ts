import type { App } from 'firebase-admin/app'

export type FirebaseAdminState =
  | { status: 'ready'; app: App }
  | { status: 'not_configured'; reason: string }

const DISCONNECTED: FirebaseAdminState = {
  status: 'not_configured',
  reason: 'Beo OS אינו מחובר ל-Firebase/Firestore. הנתונים ב-Supabase בלבד.',
}

/** נתק מלא מ-Hub POS / Firestore — אין אתחול Admin SDK. */
export function getFirebaseAdmin(): FirebaseAdminState {
  return DISCONNECTED
}

export async function verifyFirebaseAdmin(): Promise<{
  ok: boolean
  reason?: string
}> {
  return { ok: false, reason: DISCONNECTED.reason }
}

export function getAdminAuth() {
  return null
}

export function getAdminDb() {
  return null
}
