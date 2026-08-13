import type { App } from 'firebase-admin/app'
import type { Auth } from 'firebase-admin/auth'
import type { Firestore } from 'firebase-admin/firestore'

export type FirebaseAdminState =
  | { status: 'ready'; app: App }
  | { status: 'not_configured'; reason: string }

const DISCONNECTED_REASON =
  'Beo OS אינו מחובר ל-Firebase/Firestore. הנתונים ב-Supabase בלבד.'

const DISCONNECTED: FirebaseAdminState = {
  status: 'not_configured',
  reason: DISCONNECTED_REASON,
}

/** נתק מלא מ-Hub POS / Firestore — אין אתחול Admin SDK. */
export function getFirebaseAdmin(): FirebaseAdminState {
  return DISCONNECTED
}

export async function verifyFirebaseAdmin(): Promise<{
  ok: boolean
  reason?: string
}> {
  return { ok: false, reason: DISCONNECTED_REASON }
}

export function getAdminAuth(): Auth | null {
  return null
}

export function getAdminDb(): Firestore | null {
  return null
}
