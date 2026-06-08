/**
 * סנכרון שדה recurring על financeExpenses:
 * - רק הוצאות מהקטלוג החודשי → recurring: true
 * - כל השאר → recurring: false
 *
 * Usage:
 *   node functions/scripts/migrate-finance-expenses-recurring.mjs --dry-run
 *   node functions/scripts/migrate-finance-expenses-recurring.mjs
 */
import { readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const projectId = 'hub-pos-f399c'
const dryRun = process.argv.includes('--dry-run')
const FIREBASE_CLI_CLIENT_ID =
  '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'

const RULES = [
  { id: 'green-invoice', label: 'חשבונית ירוקה', terms: ['חשבונית ירוקה', 'ירוקה'], amount: 97.94, tolerance: 8 },
  { id: 'paycall', label: 'Paycall', terms: ['paycall'], amount: 93, tolerance: 8 },
  { id: 'bituach-leumi', label: 'ביטוח לאומי', terms: ['ביטוח לאומי'], amount: 2082, tolerance: 150, keywordOnly: true },
  { id: 'income-tax-withholding', label: 'מס הכנסה ניכויים', terms: ['ניכויים', 'מ"ה ניכויים', 'מס הכנסה ניכויים'], amount: 2175, tolerance: 150, keywordOnly: true },
  { id: 'google-workspace', label: 'Google Workspace', terms: ['google workspace'], amount: 117.6, tolerance: 15 },
  { id: 'anthropic', label: 'Anthropic Claude Team', terms: ['anthropic', 'claude team'], amount: 379.94, tolerance: 25 },
  { id: 'openai', label: 'OpenAI ChatGPT', terms: ['openai', 'chatgpt'], amount: 62, tolerance: 20 },
  { id: 'hetzner', label: 'Hetzner', terms: ['hetzner'], amount: 140, tolerance: 40 },
  { id: 'telezar-019', label: 'טלזר 019', terms: ['טלזר', '019'], amount: 124.5, tolerance: 20 },
  { id: 'spd', label: 'אס.פי.די', terms: ['אס.פי.די', 'אס פי די', 'spd', 'ס.פ.י'], amount: 518.26, tolerance: 30 },
  { id: 'xcloud', label: 'Xcloud Hosting', terms: ['xcloud'], amount: 80.46, tolerance: 15 },
  { id: 'cursor', label: 'Cursor', terms: ['cursor'], amount: 60, tolerance: 25 },
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

function fieldBool(fields, key) {
  return fields?.[key]?.booleanValue === true
}

function expenseSearchBlob(fields) {
  return [
    fieldString(fields, 'name'),
    fieldString(fields, 'description'),
    fieldString(fields, 'supplierName'),
    fieldString(fields, 'platformName'),
    fieldString(fields, 'employeeName'),
  ]
    .join(' ')
    .toLowerCase()
}

function matchRule(fields) {
  const text = expenseSearchBlob(fields)
  const amount = fieldNumber(fields, 'amount')
  for (const rule of RULES) {
    const termHit = rule.terms.some((t) => text.includes(t.toLowerCase()))
    if (!termHit) continue
    if (rule.keywordOnly) return rule
    if (Math.abs(amount - rule.amount) <= (rule.tolerance ?? 10)) return rule
  }
  return null
}

async function listAllExpenses(accessToken) {
  const docs = []
  let pageToken = ''
  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/financeExpenses`,
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

async function patchRecurring(accessToken, docName, recurring) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=recurring`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          recurring: { booleanValue: recurring },
        },
      }),
    },
  )
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error?.message ?? 'Patch failed')
}

try {
  const accessToken = await getAccessToken()
  const docs = await listAllExpenses(accessToken)
  const summary = {
    total: docs.length,
    setRecurring: [],
    setOneTime: [],
    unchanged: [],
    dryRun,
  }

  for (const doc of docs) {
    const fields = doc.fields ?? {}
    const id = doc.name.split('/').pop()
    const name = fieldString(fields, 'name') || fieldString(fields, 'description') || id
    const amount = fieldNumber(fields, 'amount')
    const wasRecurring = fieldBool(fields, 'recurring')
    const rule = matchRule(fields)
    const shouldRecur = rule != null

    const row = {
      id,
      name,
      amount,
      rule: rule?.label ?? null,
      wasRecurring,
      willRecur: shouldRecur,
    }

    if (wasRecurring === shouldRecur) {
      summary.unchanged.push(row)
      continue
    }

    if (shouldRecur) summary.setRecurring.push(row)
    else summary.setOneTime.push(row)

    if (!dryRun) {
      await patchRecurring(accessToken, doc.name, shouldRecur)
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        total: summary.total,
        updatedRecurring: summary.setRecurring.length,
        updatedOneTime: summary.setOneTime.length,
        unchanged: summary.unchanged.length,
        recurring: summary.setRecurring,
        oneTime: summary.setOneTime,
      },
      null,
      2,
    ),
  )
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: e?.message ?? String(e) }))
  process.exit(1)
}
