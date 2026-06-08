/**
 * Find finance incomes by amount / client / month
 * Usage: node functions/scripts/find-finance-incomes.mjs
 */
import { readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const projectId = 'hub-pos-f399c'
const FIREBASE_CLI_CLIENT_ID =
  '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'

const TARGET_AMOUNTS = [2596, 5900, 1133]
const TARGET_CLIENTS = [
  '805b9369-c556-4527-9c33-8791d2fb1540',
  '5b23296f-d6e4-4d97-9f5f-32427f87c7f3',
  '000fb27e-7ae6-43c3-9851-3fd8d47e0b95',
]

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
    throw new Error('Cannot resolve Firebase CLI client secret.')
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

function fieldString(fields, key) {
  return fields?.[key]?.stringValue ?? ''
}

function fieldNumber(fields, key) {
  const v = fields?.[key]
  if (!v) return 0
  if (v.doubleValue != null) return Number(v.doubleValue)
  if (v.integerValue != null) return Number(v.integerValue)
  return 0
}

async function listAllIncomes(accessToken) {
  const docs = []
  let pageToken = ''
  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/financeIncomes`,
    )
    url.searchParams.set('pageSize', '300')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error?.message ?? 'List failed')
    docs.push(...(json.documents ?? []))
    pageToken = json.nextPageToken ?? ''
  } while (pageToken)
  return docs
}

function summarize(doc) {
  const fields = doc.fields ?? {}
  const id = doc.name.split('/').pop()
  return {
    id,
    amount: fieldNumber(fields, 'amount'),
    clientId: fieldString(fields, 'clientId'),
    documentKind: fieldString(fields, 'documentKind') || '(missing→transaction_invoice)',
    status: fieldString(fields, 'status'),
    invoiceDate: fieldString(fields, 'invoiceDate'),
    paidDate: fieldString(fields, 'paidDate'),
    invoiceNumber: fieldString(fields, 'invoiceNumber'),
    description: fieldString(fields, 'description'),
    projectId: fieldString(fields, 'projectId'),
  }
}

try {
  const accessToken = await getAccessToken()
  const docs = await listAllIncomes(accessToken)
  console.log(`Total incomes: ${docs.length}\n`)

  const april2026 = docs
    .map(summarize)
    .filter((r) => {
      const d = r.paidDate || r.invoiceDate
      return d.startsWith('2026-04')
    })
  console.log(`April 2026 (invoice/paid date): ${april2026.length}`)
  for (const r of april2026) console.log(JSON.stringify(r, null, 2))

  console.log('\n--- Target amounts ---')
  for (const doc of docs) {
    const r = summarize(doc)
    if (
      TARGET_AMOUNTS.includes(Math.round(r.amount)) ||
      TARGET_CLIENTS.includes(r.clientId)
    ) {
      console.log(JSON.stringify(r, null, 2))
    }
  }
} catch (e) {
  console.error('ERROR:', e.message)
  process.exit(1)
}
