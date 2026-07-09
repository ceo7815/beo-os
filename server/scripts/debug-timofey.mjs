import '../src/config/loadEnv.js'
import { getAdminDb } from '../src/lib/firebaseAdmin.js'
import {
  computeExpensePairs,
  isBankExpense,
  isGiOnlyRecord,
} from '../src/lib/expenseReconcileCore.js'

const db = getAdminDb()
const all = []
let last
while (true) {
  let q = db.collection('financeExpenses').orderBy('__name__').limit(50)
  if (last) q = q.startAfter(last)
  const snap = await q.get()
  if (snap.empty) break
  for (const d of snap.docs) all.push({ id: d.id, ...d.data() })
  last = snap.docs[snap.docs.length - 1]
  if (snap.size < 50) break
}

const label = (e) =>
  e.greenInvoiceSupplierName ?? e.supplierName ?? e.name ?? e.description ?? ''

const gi80139 = all.filter(
  (e) => String(e.greenInvoiceNumber ?? '') === '80139' || e.id.includes('80139'),
)
const timofey = all.filter((e) => label(e).includes('טימופיי') || label(e).includes('לפיצקי'))
const bank600May = all.filter(
  (e) =>
    isBankExpense(e) &&
    e.billingMonth === '2026-05' &&
    e.amount >= 590 &&
    e.amount <= 610,
)

console.log('gi80139', gi80139.length)
for (const g of gi80139) {
  console.log('GI', g.id, g.greenInvoiceNumber, g.billingMonth, g.amount, label(g))
}

console.log('timofey all', timofey.length)
for (const e of timofey) {
  console.log(
    isGiOnlyRecord(e) ? 'GI' : 'BANK',
    e.paidDate,
    e.billingMonth,
    e.amount,
    label(e).slice(0, 50),
    e.greenInvoiceNumber ?? '',
  )
}

console.log('bank600May', bank600May.length)
for (const b of bank600May) {
  console.log('BANK', b.paidDate, b.amount, label(b).slice(0, 55))
}

const pairs = computeExpensePairs(all)
for (const e of [...gi80139, ...timofey.filter(isBankExpense)]) {
  const p = pairs.find((x) => x.bank.id === e.id || x.gi.id === e.id)
  if (p) {
    console.log(
      'PAIR',
      label(p.bank).slice(0, 30),
      p.bank.amount,
      '<->',
      label(p.gi).slice(0, 30),
      p.gi.amount,
      p.score,
    )
  }
}
