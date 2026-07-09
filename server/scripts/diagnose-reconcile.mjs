/**
 * List remaining unmatched bank/GI after reconcile.
 * Run: npx tsx server/scripts/diagnose-reconcile.mjs
 */
import '../src/config/loadEnv.js'
import { getAdminDb } from '../src/lib/firebaseAdmin.js'
import {
  computeExpensePairs,
  isBankExpense,
  isGiOnlyRecord,
  requiresGiDocument,
} from '../src/lib/expenseReconcileCore.js'

function label(exp) {
  return (
    exp.greenInvoiceSupplierName ??
    exp.supplierName ??
    exp.name ??
    exp.description ??
    ''
  )
}

const db = getAdminDb()
if (!db) throw new Error('no db')

const snap = await db.collection('financeExpenses').get()
const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
const pairs = computeExpensePairs(all)
const matchedBank = new Set(pairs.map((p) => p.bank.id))
const matchedGi = new Set(pairs.map((p) => p.gi.id))

const missingBank = all.filter(
  (e) => isBankExpense(e) && requiresGiDocument(e) && !matchedBank.has(e.id),
)
const missingGi = all.filter((e) => isGiOnlyRecord(e) && !matchedGi.has(e.id))

console.log(`pairs=${pairs.length} missingBank=${missingBank.length} missingGi=${missingGi.length}\n`)

console.log('=== Still missing bank (first 25) ===')
for (const b of missingBank.slice(0, 25)) {
  console.log(
    `${b.paidDate ?? b.billingMonth} | ${label(b).slice(0, 45)} | ₪${b.amount}`,
  )
}

console.log('\n=== Unmatched GI docs (first 25) ===')
for (const g of missingGi.slice(0, 25)) {
  console.log(
    `#${g.greenInvoiceNumber ?? '?'} ${g.billingMonth} | ${label(g).slice(0, 40)} | ₪${g.amount}`,
  )
}
