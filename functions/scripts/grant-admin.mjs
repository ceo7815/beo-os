/**
 * One-off: grant admin role to an existing Auth user by email.
 * Uses Firebase CLI OAuth (run `firebase login` if missing).
 *
 * Usage: node functions/scripts/grant-admin.mjs info@dntrade.co.il
 */
import { readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const email = (process.argv[2] ?? process.env.GRANT_ADMIN_EMAIL ?? '')
  .trim()
  .toLowerCase()
if (!email || !email.includes('@')) {
  console.error('Usage: node functions/scripts/grant-admin.mjs <email>')
  process.exit(1)
}

const projectId = 'hub-pos-f399c'
const FIREBASE_CLI_CLIENT_ID =
  '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'

async function firebaseCliClientSecret() {
  if (process.env.FIREBASE_CLIENT_SECRET?.trim()) {
    return process.env.FIREBASE_CLIENT_SECRET.trim()
  }
  try {
    const { createRequire } = await import('module')
    const require = createRequire(import.meta.url)
    const api = require('firebase-tools/lib/api')
    return typeof api.clientSecret === 'function' ? api.clientSecret() : api.clientSecret
  } catch {
    return null
  }
}

function configPath() {
  return join(homedir(), '.config', 'configstore', 'firebase-tools.json')
}

function loadConfig() {
  return JSON.parse(readFileSync(configPath(), 'utf8'))
}

function saveConfig(cfg) {
  writeFileSync(configPath(), JSON.stringify(cfg, null, '\t'), 'utf8')
}

async function refreshAccessToken(cfg) {
  const refreshToken = cfg?.tokens?.refresh_token
  if (!refreshToken) {
    throw new Error('Firebase CLI not logged in. Run: firebase login --reauth')
  }
  const clientSecret = await firebaseCliClientSecret()
  if (!clientSecret) {
    throw new Error('Cannot resolve Firebase CLI client secret. Run: firebase login --reauth')
  }
  const body = new URLSearchParams({
    client_id: FIREBASE_CLI_CLIENT_ID,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error_description ?? json.error ?? 'Token refresh failed')
  }
  cfg.tokens = {
    ...cfg.tokens,
    access_token: json.access_token,
    expires_in: json.expires_in,
    expires_at: Date.now() + Number(json.expires_in ?? 3600) * 1000,
    ...(json.refresh_token ? { refresh_token: json.refresh_token } : {}),
  }
  saveConfig(cfg)
  return cfg.tokens.access_token
}

async function getAccessToken() {
  const cfg = loadConfig()
  const expiresAt = Number(cfg?.tokens?.expires_at ?? 0)
  if (cfg?.tokens?.access_token && expiresAt > Date.now() + 60_000) {
    return cfg.tokens.access_token
  }
  return refreshAccessToken(cfg)
}

async function authLookupByEmail(accessToken, targetEmail) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: [targetEmail] }),
    },
  )
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(json?.error?.message ?? 'Auth lookup failed')
  }
  const user = json?.users?.[0]
  if (!user?.localId) {
    throw new Error(`No Auth user for email: ${targetEmail}`)
  }
  return {
    uid: user.localId,
    displayName: user.displayName ?? '',
    email: user.email ?? targetEmail,
  }
}

async function firestorePatchAdmin(accessToken, uid, doc) {
  const fields = {
    name: { stringValue: doc.name },
    email: { stringValue: doc.email },
    role: { stringValue: 'admin' },
    avatar: { stringValue: doc.avatar },
    color: { stringValue: doc.color },
    active: { booleanValue: true },
    isAgent: { booleanValue: false },
    updatedAt: { timestampValue: new Date().toISOString() },
  }
  const mask = [
    'name',
    'email',
    'role',
    'avatar',
    'color',
    'active',
    'isAgent',
    'updatedAt',
  ]
    .map((f) => `updateMask.fieldPaths=${f}`)
    .join('&')

  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?${mask}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    },
  )
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(json?.error?.message ?? 'Firestore write failed')
  }
  return json
}

try {
  const accessToken = await getAccessToken()
  const { uid, displayName, email: authEmail } = await authLookupByEmail(
    accessToken,
    email,
  )
  const name =
    displayName.trim() ||
    authEmail.split('@')[0] ||
    'משתמש'
  await firestorePatchAdmin(accessToken, uid, {
    name,
    email: authEmail,
    avatar: name.slice(0, 2).toUpperCase(),
    color: '#2563EB',
  })
  console.log(
    JSON.stringify({
      ok: true,
      uid,
      email: authEmail,
      role: 'admin',
      message: 'המשתמש קיבל הרשאת מנהל מערכת. יש להתנתק ולהתחבר מחדש.',
    }),
  )
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: e?.message ?? String(e) }))
  process.exit(1)
}
