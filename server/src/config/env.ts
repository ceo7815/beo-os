import './loadEnv.js'

function readString(key: string, fallback = ''): string {
  const v = process.env[key]
  return typeof v === 'string' ? v.trim() : fallback
}

function readPort(key: string, fallback: number): number {
  const raw = readString(key)
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : fallback
}

function readOrigins(raw: string): string[] {
  if (!raw) return ['http://localhost:5173', 'http://127.0.0.1:5173']
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export const env = {
  nodeEnv: readString('NODE_ENV', 'development'),
  isDev: readString('NODE_ENV', 'development') !== 'production',
  host: readString('SERVER_HOST', '127.0.0.1'),
  port: readPort('SERVER_PORT', 8787),
  corsOrigins: readOrigins(readString('CORS_ORIGINS')),
  firebaseServiceAccountPath: readString('FIREBASE_SERVICE_ACCOUNT_PATH'),
  morning: {
    env: readString('MORNING_ENV', 'sandbox') as 'sandbox' | 'production',
    keyId: readString('MORNING_KEY_ID'),
    keySecret: readString('MORNING_KEY_SECRET'),
  },
  sync: {
    fromDate: readString('SYNC_FROM_DATE', '2026-04-01'),
    overlapDays: Math.max(1, readPort('SYNC_OVERLAP_DAYS', 7)),
  },
} as const

export function morningConfigured(): boolean {
  return Boolean(env.morning.keyId && env.morning.keySecret)
}
