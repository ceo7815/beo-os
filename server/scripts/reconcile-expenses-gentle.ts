/**
 * Gentle expense reconcile — paginated reads + batched writes.
 * Run: npx tsx server/scripts/reconcile-expenses-gentle.ts
 */
import '../src/config/loadEnv.js'
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '../src/lib/firebaseAdmin.js'
import {
  computeExpensePairs,
  isBankExpense,
  isGiOnlyRecord,
  requiresGiDocument,
  type ReconcileExpense,
} from '../src/lib/expenseReconcileCore.js'

const COLLECTION = 'financeExpenses'
const PAGE_SIZE = 100
const BATCH_SIZE = 50
const DELAY_MS = 400

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function mapDoc(d: QueryDocumentSnapshot): ReconcileExpense {
  const x = d.data()
  return {
    id: d.id,
    amount: typeof x.amount === 'number' ? x.amount : 0,
    amountBeforeVat:
      typeof x.amountBeforeVat === 'number' ? x.amountBeforeVat : undefined,
    vatAmount: typeof x.vatAmount === 'number' ? x.vatAmount : undefined,
    type: typeof x.type === 'string' ? x.type : undefined,
    paidDate:
      typeof x.paidDate === 'string' && x.paidDate.trim()
        ? x.paidDate.trim().slice(0, 10)
        : undefined,
    billingMonth:
      typeof x.billingMonth === 'string' ? x.billingMonth.slice(0, 7) : '',
    bankRef:
      typeof x.bankRef === 'string' && x.bankRef.trim()
        ? x.bankRef.trim()
        : undefined,
    source: typeof x.source === 'string' ? x.source : undefined,
    greenInvoiceId:
      typeof x.greenInvoiceId === 'string' ? x.greenInvoiceId : undefined,
    greenInvoiceNumber:
      typeof x.greenInvoiceNumber === 'string'
        ? x.greenInvoiceNumber
        : undefined,
    supplierName:
      typeof x.supplierName === 'string' ? x.supplierName : undefined,
    greenInvoiceSupplierName:
      typeof x.greenInvoiceSupplierName === 'string'
        ? x.greenInvoiceSupplierName
        : undefined,
    greenInvoiceSupplierTaxId:
      typeof x.greenInvoiceSupplierTaxId === 'string'
        ? x.greenInvoiceSupplierTaxId
        : undefined,
    supplierTaxId:
      typeof x.supplierTaxId === 'string' ? x.supplierTaxId : undefined,
    name: typeof x.name === 'string' ? x.name : undefined,
    description: typeof x.description === 'string' ? x.description : undefined,
    supplierInvoiceReceived: x.supplierInvoiceReceived === true,
    matchedExpenseId:
      typeof x.matchedExpenseId === 'string' ? x.matchedExpenseId : undefined,
    linkedGreenInvoiceId:
      typeof x.linkedGreenInvoiceId === 'string'
        ? x.linkedGreenInvoiceId
        : undefined,
  }
}

async function loadAll(db: Firestore): Promise<ReconcileExpense[]> {
  const all: ReconcileExpense[] = []
  let last: QueryDocumentSnapshot | undefined
  let page = 0
  while (true) {
    page += 1
    let q = db.collection(COLLECTION).orderBy('__name__').limit(PAGE_SIZE)
    if (last) q = q.startAfter(last)
    const snap = await q.get()
    if (snap.empty) break
    for (const d of snap.docs) all.push(mapDoc(d))
    last = snap.docs[snap.docs.length - 1]
    console.log(`[reconcile] loaded page ${page}, total ${all.length}`)
    if (snap.size < PAGE_SIZE) break
    await sleep(DELAY_MS)
  }
  return all
}

const db = getAdminDb()
if (!db) throw new Error('Firebase Admin not configured')

console.log('[reconcile] Loading expenses…')
const expenses = await loadAll(db)
console.log(`[reconcile] ${expenses.length} rows loaded`)

const pairs = computeExpensePairs(expenses)
const matchedBank = new Set(pairs.map((p) => p.bank.id))
const matchedGi = new Set(pairs.map((p) => p.gi.id))

type Patch = { id: string; patch: Record<string, unknown> }
const updates: Patch[] = []

for (const pair of pairs) {
  updates.push({
    id: pair.bank.id,
    patch: {
      matchedExpenseId: pair.gi.id,
      matchedBankExpenseId: pair.bank.id,
      reconciliationStatus: 'matched',
      supplierInvoiceReceived: true,
      linkedGreenInvoiceId: pair.gi.greenInvoiceId ?? FieldValue.delete(),
      greenInvoiceNumber: pair.gi.greenInvoiceNumber ?? FieldValue.delete(),
    },
  })
  updates.push({
    id: pair.gi.id,
    patch: {
      matchedExpenseId: pair.bank.id,
      matchedBankExpenseId: pair.bank.id,
      reconciliationStatus: 'matched',
      linkedBankExpenseId: pair.bank.id,
    },
  })
}

for (const exp of expenses) {
  if (isBankExpense(exp) && !matchedBank.has(exp.id)) {
    const needsDoc = requiresGiDocument(exp)
    updates.push({
      id: exp.id,
      patch: {
        reconciliationStatus: needsDoc
          ? 'bank_missing_document'
          : 'document_not_required',
        supplierInvoiceReceived: false,
        matchedExpenseId: FieldValue.delete(),
        matchedBankExpenseId: FieldValue.delete(),
        linkedGreenInvoiceId: FieldValue.delete(),
        greenInvoiceNumber: FieldValue.delete(),
      },
    })
  } else if (isGiOnlyRecord(exp) && !matchedGi.has(exp.id)) {
    updates.push({
      id: exp.id,
      patch: {
        reconciliationStatus: 'gi_unpaid',
        matchedExpenseId: FieldValue.delete(),
        matchedBankExpenseId: FieldValue.delete(),
        linkedBankExpenseId: FieldValue.delete(),
      },
    })
  }
}

console.log(`[reconcile] ${pairs.length} pairs, ${updates.length} patches`)

let written = 0
for (let i = 0; i < updates.length; i += BATCH_SIZE) {
  const slice = updates.slice(i, i + BATCH_SIZE)
  const batch = db.batch()
  for (const { id, patch } of slice) {
    batch.set(db.collection(COLLECTION).doc(id), patch, { merge: true })
  }
  await batch.commit()
  written += slice.length
  console.log(`[reconcile] wrote ${written}/${updates.length}`)
  if (i + BATCH_SIZE < updates.length) await sleep(DELAY_MS)
}

let bankMissing = 0
let giUnpaid = 0
for (const exp of expenses) {
  if (isBankExpense(exp) && !matchedBank.has(exp.id) && requiresGiDocument(exp)) {
    bankMissing += 1
  }
  if (isGiOnlyRecord(exp) && !matchedGi.has(exp.id)) giUnpaid += 1
}

console.log(
  JSON.stringify(
    {
      ok: true,
      matched: pairs.length,
      bankMissingDocument: bankMissing,
      giUnpaid,
      totalExpenses: expenses.length,
    },
    null,
    2,
  ),
)
