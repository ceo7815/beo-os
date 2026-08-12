/**
 * Compare GI expense API pull vs expected list from Green Invoice UI.
 * Run: node scripts/verify-gi-expenses.mjs
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnvLocal() {
  const path = resolve(root, 'server/.env.local')
  const text = readFileSync(path, 'utf8')
  const env = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim()
  }
  return env
}

const EXPECTED = [
  // June 2026 (14)
  { num: '926002017308', date: '2026-06-20', supplier: '6 - חוצה צפון בע"מ', amount: 9.88, vat: 1.51 },
  { num: '70408700', date: '2026-06-16', supplier: '019 MOBILE', amount: 124.5, vat: 18.99 },
  { num: '84000933101', date: '2026-06-13', supplier: 'Hetzner Online Gmbh', amount: 78.03, vat: 0 },
  { num: '202606610', date: '2026-06-11', supplier: 'xCloud Hosting LLC', amount: 14.83, vat: 0 },
  { num: '260172347', date: '2026-06-11', supplier: 'ימים - תאגיד המים של קרית ים בע"מ', amount: 456.62, vat: 69.65 },
  { num: '207038', date: '2026-06-11', supplier: 'ביטאיט בע"מ', amount: 93, vat: 14.19 },
  { num: '410960839', date: '2026-06-11', supplier: 'חברת חשמל לישראל בע"מ', amount: 1304.62, vat: 199.01 },
  { num: '9057', date: '2026-06-11', supplier: 'אמיל רשת הדפסות בע~מ', amount: 3000, vat: 0 },
  { num: '35534765', date: '2026-06-10', supplier: 'כללי', amount: -178.38, vat: 0 },
  { num: '245930806', date: '2026-06-07', supplier: 'בזק החברה הישראלית לתקשורת בע"מ', amount: 1022.16, vat: 155.92 },
  { num: '63058', date: '2026-06-04', supplier: 'איגוד השיווק הישראלי (ע"ר)', amount: 779, vat: 118.83 },
  { num: '1', date: '2026-06-03', supplier: 'SUNO', amount: 28.72, vat: 0 },
  { num: '873939', date: '2026-06-02', supplier: 'קבוצת כרמלטון בע"מ', amount: 23.64, vat: 3.61 },
  { num: '2556922', date: '2026-06-01', supplier: 'חשבונית ירוקה בע"מ', amount: 97.94, vat: 14.94 },
  // May 2026 (14)
  { num: '449558598', date: '2026-05-31', supplier: 'ישראכרט בע"מ', amount: -138.63, vat: -21.16 },
  { num: '29199369', date: '2026-05-31', supplier: 'פרימיום אקספרס בע"מ', amount: -14.94, vat: -2.28 },
  { num: '1672400', date: '2026-05-30', supplier: 'Israel Credit Cards Ltd.', amount: 38.2, vat: 6.28 },
  { num: '1344479', date: '2026-05-25', supplier: 'לייבדיאנס בע"מ', amount: 850, vat: 129.66 },
  { num: '0008', date: '2026-05-22', supplier: 'כללי', amount: 174.42, vat: 0 },
  { num: '223962', date: '2026-05-20', supplier: 'אס.פי.די הוסטינג בע"מ', amount: 518.26, vat: 79.06 },
  { num: '261', date: '2026-05-19', supplier: 'Cal.', amount: 125, vat: 19.07 },
  { num: '7', date: '2026-05-18', supplier: 'Cursor', amount: 70.15, vat: 11.7 },
  { num: '70160396', date: '2026-05-16', supplier: '019 MOBILE', amount: 124.5, vat: 18.99 },
  { num: '86000863626', date: '2026-05-13', supplier: 'Hetzner Online Gmbh', amount: 98.56, vat: 13.63 },
  { num: '204447', date: '2026-05-11', supplier: 'ביטאיט בע"מ', amount: 93, vat: 14.19 },
  { num: '0255', date: '2026-05-05', supplier: 'Google Commerce Limited', amount: 469, vat: 0 },
  { num: '80139', date: '2026-05-04', supplier: 'אס.טי.טי. טימופיי לפיצקי', amount: 600, vat: 0 },
  { num: '2511142', date: '2026-05-01', supplier: 'חשבונית ירוקה בע"מ', amount: 97.94, vat: 14.94 },
  // April 2026 (14)
  { num: '29093379', date: '2026-04-30', supplier: 'פרימיום אקספרס בע"מ', amount: -14.94, vat: -2.28 },
  { num: '449440496', date: '2026-04-30', supplier: 'ישראכרט בע"מ', amount: -155.21, vat: -23.68 },
  { num: '53825', date: '2026-04-30', supplier: 'Google Commerce Limited', amount: 469, vat: 0 },
  { num: '436724', date: '2026-04-19', supplier: 'דומיין דה נט טכנולוגיות בע"מ', amount: 136.8, vat: 20.87 },
  { num: '490610119', date: '2026-04-17', supplier: 'חברת חשמל לישראל בע"מ', amount: 1173.74, vat: 179.05 },
  { num: '260090750', date: '2026-04-16', supplier: 'ימים - תאגיד המים של קרית ים בע"מ', amount: 350.35, vat: 53.44 },
  { num: '49910402', date: '2026-04-16', supplier: '019 MOBILE', amount: 124.5, vat: 18.99 },
  { num: '24158315', date: '2026-04-15', supplier: 'Hostinger International', amount: 1163.88, vat: 0 },
  { num: '88000847825', date: '2026-04-13', supplier: 'Hetzner Online Gmbh', amount: 147.75, vat: 0 },
  { num: '201827', date: '2026-04-11', supplier: 'ביטאיט בע"מ', amount: 93, vat: 14.19 },
  { num: '520027', date: '2026-04-06', supplier: 'קבוצת כרמלטון בע"מ', amount: 11.83, vat: 1.8 },
  { num: '243467101', date: '2026-04-06', supplier: 'בזק החברה הישראלית לתקשורת בע"מ', amount: 741.84, vat: 113.16 },
  { num: '20260401', date: '2026-04-01', supplier: 'xCloud Hosting LLC', amount: 6.33, vat: 0 },
  { num: '2472563', date: '2026-04-01', supplier: 'חשבונית ירוקה בע"מ', amount: 97.94, vat: 14.94 },
  // March 2026 (12)
  { num: '028988081', date: '2026-03-31', supplier: 'פרימיום אקספרס בע"מ', amount: 14.94, vat: 2.28 },
  { num: '449324041', date: '2026-03-31', supplier: 'ישראכרט בע"מ', amount: 213.01, vat: 32.49 },
  { num: '280938941', date: '2026-03-25', supplier: 'רשם החברות', amount: 1338, vat: 0 },
  { num: '7746416', date: '2026-03-21', supplier: 'Google Commerce Limited', amount: 74.9, vat: 0 },
  { num: '23153901', date: '2026-03-18', supplier: 'Hostinger International', amount: 37.68, vat: 0 },
  { num: '49674119', date: '2026-03-16', supplier: '019 MOBILE', amount: 304, vat: 46.37 },
  { num: '49672673', date: '2026-03-16', supplier: 'טלזר 019 שרותי תיקשורת בינלאומיים בע"מ', amount: 124.5, vat: 18.99 },
  { num: '85000835166', date: '2026-03-13', supplier: 'Hetzner Online Gmbh', amount: 149.92, vat: 0 },
  { num: '199304', date: '2026-03-11', supplier: 'ביטאיט בע"מ', amount: 93, vat: 14.19 },
  { num: '242228917', date: '2026-03-08', supplier: 'בזק החברה הישראלית לתקשורת בע"מ', amount: 270.84, vat: 41.31 },
  { num: '20260301', date: '2026-03-01', supplier: 'xCloud Hosting LLC', amount: 6.24, vat: 0.97 },
  { num: '2429241', date: '2026-03-01', supplier: 'חשבונית ירוקה בע"מ', amount: 97.94, vat: 14.94 },
]

const BASE = {
  sandbox: 'https://sandbox.d.greeninvoice.co.il/api/v1',
  production: 'https://api.greeninvoice.co.il/api/v1',
}

const AUTH = {
  sandbox: 'https://api.sandbox.morning.dev/idp/v1/oauth/token',
  production: 'https://api.morning.co/idp/v1/oauth/token',
}

function round2(n) {
  return Math.round(n * 100) / 100
}

function normNum(s) {
  return String(s ?? '').replace(/^0+/, '') || '0'
}

function normSupplier(s) {
  return String(s ?? '')
    .replace(/בע~מ/g, 'בע"מ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function mapExpense(doc) {
  const greenInvoiceId = String(doc.id ?? doc._id ?? '')
  const number = String(doc.number ?? doc.documentNumber ?? doc.num ?? '')
  const documentDate = String(doc.documentDate ?? doc.date ?? '').slice(0, 10)
  const supplier = doc.supplier ?? {}
  const supplierName = String(supplier.name ?? supplier.companyName ?? doc.supplierName ?? '')

  const businessAmount = doc.businessAmount
  const businessVat = doc.businessVat
  let amount, vat
  if (typeof businessAmount === 'number' && businessAmount < 0) {
    amount = round2(businessAmount)
    vat = typeof businessVat === 'number' ? round2(businessVat) : undefined
  } else {
    amount = round2(doc.amountLocal ?? doc.amount ?? 0)
    vat = typeof doc.businessVat === 'number' ? round2(doc.businessVat)
      : typeof doc.vatAccounting === 'number' ? round2(doc.vatAccounting)
      : typeof doc.vat === 'number' ? round2(doc.vat) : undefined
  }
  return { greenInvoiceId, number, documentDate, amount, vat, supplierName }
}

async function getToken(env) {
  const envKey = env.MORNING_ENV === 'sandbox' ? 'sandbox' : 'production'
  const base = BASE[envKey]
  const authUrl = AUTH[envKey]

  // API 2.0 — OAuth IdP תחילה
  const idpRes = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: env.MORNING_KEY_ID,
      client_secret: env.MORNING_KEY_SECRET,
    }),
  })
  const idpData = await idpRes.json().catch(() => ({}))
  const idpToken = idpData.accessToken || idpData.access_token || idpData.token
  if (idpRes.ok && idpToken) return { token: idpToken, base }

  // נפילה חזרה — /account/token עם grant_type (עדכון יוני 2026)
  const res = await fetch(`${base}/account/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: env.MORNING_KEY_ID,
      secret: env.MORNING_KEY_SECRET,
      grant_type: 'client_credentials',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Auth failed: ${JSON.stringify(data)}`)
  const token = data.token || data.accessToken || data.access_token
  if (!token) throw new Error(`Auth failed: no token in ${JSON.stringify(data)}`)
  return { token, base }
}

async function searchAll(token, base, fromDate, toDate) {
  const all = []
  let page = 1
  let pages = 1
  do {
    const res = await fetch(`${base}/expenses/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ fromDate, toDate, page, pageSize: 100, sort: 'documentDate' }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(`Search failed: ${JSON.stringify(data)}`)
    all.push(...(data.items ?? []))
    pages = data.pages ?? 1
    page += 1
  } while (page <= pages)
  return all
}

const env = loadEnvLocal()
const { token, base } = await getToken(env)
const raw = await searchAll(token, base, '2026-03-01', '2026-06-30')
const fetched = raw.map(mapExpense)

console.log(`\n=== GI Expense Verification ===`)
console.log(`API fetched: ${fetched.length} docs`)
console.log(`Expected:    ${EXPECTED.length} docs`)

const byNumber = new Map(fetched.map((d) => [normNum(d.number), d]))
const missing = []
const mismatches = []

for (const exp of EXPECTED) {
  const hit = byNumber.get(normNum(exp.num))
  if (!hit) {
    missing.push(exp)
    continue
  }
  const issues = []
  if (hit.documentDate !== exp.date) issues.push(`date ${hit.documentDate} ≠ ${exp.date}`)
  if (Math.abs(hit.amount - exp.amount) > 0.02) issues.push(`amount ${hit.amount} ≠ ${exp.amount}`)
  if (exp.vat !== undefined && hit.vat !== undefined && Math.abs(hit.vat - exp.vat) > 0.02) {
    issues.push(`vat ${hit.vat} ≠ ${exp.vat}`)
  }
  if (normSupplier(hit.supplierName) !== normSupplier(exp.supplier)) {
    issues.push(`supplier "${hit.supplierName}" ≠ "${exp.supplier}"`)
  }
  if (issues.length) mismatches.push({ ...exp, issues, api: hit })
}

const expectedNums = new Set(EXPECTED.map((e) => normNum(e.num)))
const extra = fetched.filter((d) => !expectedNums.has(normNum(d.number)))

// Mapper filter simulation (zero amount dropped)
const droppedByMapper = fetched.filter((d) => d.amount === 0)

console.log(`\nMissing from API: ${missing.length}`)
for (const m of missing) console.log(`  #${m.num} ${m.date} ${m.supplier} ₪${m.amount}`)

console.log(`\nField mismatches: ${mismatches.length}`)
for (const m of mismatches) {
  console.log(`  #${m.num}: ${m.issues.join('; ')}`)
}

console.log(`\nExtra in API (not in list): ${extra.length}`)
for (const e of extra.slice(0, 20)) {
  console.log(`  #${e.number} ${e.documentDate} ${e.supplierName} ₪${e.amount}`)
}

console.log(`\nWould be DROPPED by mapMorningExpense (amount===0): ${droppedByMapper.length}`)
for (const d of droppedByMapper) {
  console.log(`  #${d.number} ${d.documentDate} ${d.supplierName} ₪${d.amount}`)
}

const ok = missing.length === 0 && mismatches.length === 0 && extra.length === 0
console.log(ok ? '\n✓ PERFECT MATCH' : '\n✗ DIFFERENCES FOUND')
process.exit(ok ? 0 : 1)
