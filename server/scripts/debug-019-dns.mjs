/**
 * Debug 019 / DNS matching. Run: npx tsx server/scripts/debug-019-dns.mjs
 */
import '../src/config/loadEnv.js'
import { getAdminDb } from '../src/lib/firebaseAdmin.js'
import {
  computeExpensePairs,
  isBankExpense,
  isGiOnlyRecord,
} from '../src/lib/expenseReconcileCore.js'

const needles = ['019', 'dns', 'דומיין', 'domain', 'טלזר', 'telzar', 'mobile', 'dnet', 'נט']

function label(e) {
  return (
    e.greenInvoiceSupplierName ??
    e.supplierName ??
    e.name ??
    e.description ??
    ''
  )
}

function hit(e) {
  const t = label(e).toLowerCase()
  return needles.some((n) => t.includes(n))
}

async function loadAll() {
  const db = getAdminDb()
  if (!db) throw new Error('no db')
  const all = []
  let last
  while (true) {
    let q = db.collection('financeExpenses').orderBy('__name__').limit(100)
    if (last) q = q.startAfter(last)
    const snap = await q.get()
    if (snap.empty) break
    for (const d of snap.docs) all.push({ id: d.id, ...d.data() })
    last = snap.docs[snap.docs.length - 1]
    if (snap.size < 100) break
  }
  return all
}

const all = await loadAll()
const pairs = computeExpensePairs(all)
const matchedBank = new Set(pairs.map((p) => p.bank.id))
const matchedGi = new Set(pairs.map((p) => p.gi.id))

console.log(`loaded ${all.length}, pairs ${pairs.length}\n`)

console.log('=== BANK 019/DNS ===')
for (const b of all.filter((e) => isBankExpense(e) && hit(e))) {
  const m = matchedBank.has(b.id) ? 'MATCHED' : 'OPEN'
  const pair = pairs.find((p) => p.bank.id === b.id)
  console.log(
    m,
    b.paidDate,
    '|',
    label(b).slice(0, 50),
    '|',
    b.amount,
    '|',
    b.billingMonth,
    pair ? `-> ${label(pair.gi).slice(0, 35)} #${pair.gi.greenInvoiceNumber}` : '',
  )
}

console.log('\n=== GI 019/DNS unmatched ===')
for (const g of all.filter((e) => isGiOnlyRecord(e) && !matchedGi.has(e.id) && hit(e))) {
  console.log(
    'OPEN',
    `#${g.greenInvoiceNumber ?? '?'}`,
    g.billingMonth,
    '|',
    label(g).slice(0, 50),
    '|',
    g.amount,
  )
}

console.log('\n=== PAIRS ===')
for (const p of pairs) {
  if (!hit(p.bank) && !hit(p.gi)) continue
  console.log(
    label(p.bank).slice(0, 30),
    p.bank.amount,
    p.bank.billingMonth,
    '<->',
    label(p.gi).slice(0, 30),
    p.gi.amount,
    p.gi.billingMonth,
    `#${p.gi.greenInvoiceNumber}`,
    'score',
    p.score,
  )
}
