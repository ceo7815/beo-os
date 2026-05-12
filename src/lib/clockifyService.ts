import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { ClockifyIntegrationConfig } from '../types'

/** ברירת מחדל Clockify — בשלב ה-API אפשר לשמור `apiBaseUrl` ב-Firestore */
export const CLOCKIFY_API_V1_DEFAULT = 'https://api.clockify.me/api/v1'

const CLOCKIFY_DOC = () => doc(db, 'attendanceConfig', 'clockify')

export function parseClockifyConfig(data: Record<string, unknown> | undefined): ClockifyIntegrationConfig {
  if (!data) return {}
  return {
    apiKey: typeof data.apiKey === 'string' ? data.apiKey : '',
    workspaceId: typeof data.workspaceId === 'string' ? data.workspaceId : '',
    apiBaseUrl: typeof data.apiBaseUrl === 'string' && data.apiBaseUrl.trim() ? data.apiBaseUrl.trim() : undefined,
  }
}

export async function saveClockifyConfigToFirestore(input: {
  apiKey: string
  workspaceId: string
  apiBaseUrl?: string
}): Promise<void> {
  const apiKey = input.apiKey.trim()
  const workspaceId = input.workspaceId.trim()
  const patch: Record<string, unknown> = {
    apiKey,
    workspaceId,
    updatedAt: serverTimestamp(),
  }
  if (input.apiBaseUrl?.trim()) {
    patch.apiBaseUrl = input.apiBaseUrl.trim()
  }
  await setDoc(CLOCKIFY_DOC(), patch, { merge: true })
}

/**
 * בשלב הבא: קריאות HTTP ל-Clockify.
 * מהדפדפן יש CORS — בדרך כלל נעביר דרך Cloud Function (`httpsCallable`) או proxy מאובטח.
 */
export async function clockifyApiGetJson<T>(_path: string, _config: ClockifyIntegrationConfig): Promise<T> {
  void _path
  void _config
  throw new Error(
    'Clockify API: יחובר בשלב הבא (מפתח + Workspace כבר נשמרים ב-Firestore). שימוש ב-Cloud Function מומלץ בגלל CORS.',
  )
}
