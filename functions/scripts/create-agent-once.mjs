/**
 * One-off: create Auth user + Firestore users/{uid} as sales agent.
 * Uses Firebase CLI OAuth tokens from configstore (run `firebase login` if missing).
 */
import { readFileSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { homedir } from 'os'
import { join } from 'path'

const requireFt = createRequire(import.meta.url)

const email = (process.argv[2] ?? process.env.AGENT_EMAIL ?? 'tom.greenlime@gmail.com')
  .trim()
  .toLowerCase()
const password = (process.argv[3] ?? process.env.AGENT_PASSWORD ?? 'tom123456').trim()
const name = (process.argv[4] ?? process.env.AGENT_NAME ?? 'tom-owl').trim()
const projectId = 'hub-pos-f399c'
const FIREBASE_CLI_CLIENT_ID =
  '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'

/** Same OAuth client as global `firebase-tools` (not a project secret). */
function firebaseCliClientSecret() {
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

async function authRequest(path, accessToken, init) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    },
  )
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json?.error?.message ?? JSON.stringify(json)
    throw new Error(msg)
  }
  return json
}

async function firestoreSetUser(accessToken, uid, doc) {
  const fields = {
    name: { stringValue: doc.name },
    email: { stringValue: doc.email },
    role: { stringValue: doc.role },
    avatar: { stringValue: doc.avatar },
    color: { stringValue: doc.color },
    active: { booleanValue: doc.active },
    isAgent: { booleanValue: doc.isAgent },
    createdAt: { timestampValue: new Date().toISOString() },
    updatedAt: { timestampValue: new Date().toISOString() },
  }
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=name&updateMask.fieldPaths=email&updateMask.fieldPaths=role&updateMask.fieldPaths=avatar&updateMask.fieldPaths=color&updateMask.fieldPaths=active&updateMask.fieldPaths=isAgent&updateMask.fieldPaths=createdAt&updateMask.fieldPaths=updatedAt`,
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

  let uid
  try {
    const lookup = await authRequest(
      `/accounts:lookup`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ email: [email] }),
      },
    )
    uid = lookup?.users?.[0]?.localId
    if (uid) {
      console.error(JSON.stringify({ ok: false, reason: 'USER_EXISTS', uid, email }))
      process.exit(2)
    }
  } catch {
    // lookup may fail if user missing — continue to create
  }

  const created = await authRequest(`/accounts`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      displayName: name,
      disabled: false,
    }),
  })
  uid = created.localId
  if (!uid) throw new Error('Auth user created but no localId returned')

  await firestoreSetUser(accessToken, uid, {
    name,
    email,
    role: 'employee',
    avatar: name.slice(0, 2),
    color: '#2563EB',
    active: true,
    isAgent: true,
  })

  console.log(JSON.stringify({ ok: true, uid, email, name, isAgent: true }))
} catch (e) {
  const msg = e?.message ?? String(e)
  if (/EMAIL_EXISTS|already exists/i.test(msg)) {
    console.error(JSON.stringify({ ok: false, reason: 'EMAIL_EXISTS', email }))
    process.exit(2)
  }
  console.error(JSON.stringify({ ok: false, error: msg }))
  process.exit(1)
}
