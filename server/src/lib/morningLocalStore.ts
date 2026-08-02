import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { env } from '../config/env.js'

/**
 * אחסון מקומי לאינטגרציית חשבונית ירוקה — על דיסק השרת (נפח Docker),
 * בלי תלות ב-Firestore לסטטוס / מפתחות / מצב סנכרון אחרון.
 *
 * כתיבת ההכנסות עצמן ל-Firestore נשארת ב-morningSync כמו שהייתה.
 */

export type LocalMorningEnv = 'sandbox' | 'production'

export type LocalMorningCredentials = {
  keyId: string
  keySecret: string
  env: LocalMorningEnv
}

type StoredBundle = {
  credentials?: LocalMorningCredentials | null
  syncState?: Record<string, unknown> | null
  updatedAt?: string
}

function dataDir(): string {
  return path.resolve(env.morningDataDir)
}

function storePath(): string {
  return path.join(dataDir(), 'morning-integration.json')
}

async function ensureDir(): Promise<void> {
  await mkdir(dataDir(), { recursive: true })
}

async function readBundle(): Promise<StoredBundle> {
  try {
    const raw = await readFile(storePath(), 'utf8')
    const parsed = JSON.parse(raw) as StoredBundle
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

async function writeBundle(next: StoredBundle): Promise<void> {
  await ensureDir()
  const payload: StoredBundle = {
    ...next,
    updatedAt: new Date().toISOString(),
  }
  await writeFile(storePath(), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

function normalizeEnv(raw: unknown): LocalMorningEnv {
  return raw === 'sandbox' ? 'sandbox' : 'production'
}

export async function readLocalCredentials(): Promise<LocalMorningCredentials | null> {
  const bundle = await readBundle()
  const c = bundle.credentials
  if (!c) return null
  const keyId = String(c.keyId ?? '').trim()
  const keySecret = String(c.keySecret ?? '').trim()
  if (!keyId || !keySecret) return null
  return {
    keyId,
    keySecret,
    env: normalizeEnv(c.env),
  }
}

export async function writeLocalCredentials(
  creds: LocalMorningCredentials,
): Promise<void> {
  const bundle = await readBundle()
  await writeBundle({
    ...bundle,
    credentials: {
      keyId: creds.keyId,
      keySecret: creds.keySecret,
      env: normalizeEnv(creds.env),
    },
  })
}

export async function readLocalSyncState(): Promise<Record<
  string,
  unknown
> | null> {
  const bundle = await readBundle()
  const state = bundle.syncState
  return state && typeof state === 'object' ? state : null
}

export async function writeLocalSyncState(
  state: Record<string, unknown>,
): Promise<void> {
  const bundle = await readBundle()
  await writeBundle({
    ...bundle,
    syncState: state,
  })
}
