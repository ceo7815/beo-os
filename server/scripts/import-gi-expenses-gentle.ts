/**
 * Gentle GI → Firestore import (minimal reads, small batches, delays).
 * Run: npx tsx server/scripts/import-gi-expenses-gentle.ts
 */
import '../src/config/loadEnv.js'
import { env } from '../src/config/env.js'
import { getAdminDb } from '../src/lib/firebaseAdmin.js'
import { MorningClient } from '../src/lib/morningClient.js'
import { loadMorningCredentials } from '../src/lib/morningCredentials.js'
import { mapMorningExpense } from '../src/lib/expenseMapper.js'

const GI_DOC_PREFIX = 'gi_'
const GI_EXPENSE_TYPE = 'supplier'
const FROM_DATE = process.argv[2] ?? '2026-03-01'
const BATCH_SIZE = 5
const DELAY_MS = 2500

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function ymFromDate(ymd: string): string {
  return ymd.slice(0, 7)
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj }
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key]
  }
  return out
}

const creds = await loadMorningCredentials()
if (!creds) throw new Error('Morning credentials not configured')

const db = getAdminDb()
if (!db) throw new Error('Firebase Admin not configured')

const toDate = new Date().toISOString().slice(0, 10)
console.log(`[gentle-import] GI ${FROM_DATE} → ${toDate}`)

const client = new MorningClient(creds)
const docs = await client.searchAllExpenses({
  fromDate: FROM_DATE,
  toDate,
  pageSize: 100,
})

const mapped = docs
  .map((raw) => mapMorningExpense(raw))
  .filter((m): m is NonNullable<typeof m> => m !== null)

console.log(`[gentle-import] API: ${docs.length} docs, mapped: ${mapped.length}`)

let written = 0
let failed = 0

for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
  const slice = mapped.slice(i, i + BATCH_SIZE)
  const batch = db.batch()
  for (const m of slice) {
    const ref = db.collection('financeExpenses').doc(GI_DOC_PREFIX + m.greenInvoiceId)
      const billingMonth = ymFromDate(
        m.reportingDate ?? m.paidDate ?? m.documentDate,
      )
    batch.set(
      ref,
      stripUndefined({
        type: GI_EXPENSE_TYPE,
        amount: m.amount,
        amountIncludesVat: m.amountIncludesVat,
        billingMonth,
        recurring: false,
        ...(m.supplierName ? { supplierName: m.supplierName } : {}),
        name:
          m.supplierName ||
          m.description ||
          `הוצאה ${m.greenInvoiceNumber || m.greenInvoiceId}`,
        ...(m.description ? { description: m.description } : {}),
        paidDate: m.paidDate ?? m.documentDate,
        paymentMethod: m.paymentMethod ?? 'bank_transfer',
        supplierInvoiceReceived: true,
        source: m.source,
        greenInvoiceId: m.greenInvoiceId,
        greenInvoiceDocType: m.greenInvoiceDocType,
        greenInvoiceDocKind: m.greenInvoiceDocKind,
        ...(m.greenInvoiceNumber ? { greenInvoiceNumber: m.greenInvoiceNumber } : {}),
        ...(m.supplierName ? { greenInvoiceSupplierName: m.supplierName } : {}),
        ...(m.supplierTaxId ? { greenInvoiceSupplierTaxId: m.supplierTaxId } : {}),
        ...(m.vatAmount !== undefined ? { vatAmount: m.vatAmount } : {}),
        ...(m.amountBeforeVat !== undefined ? { amountBeforeVat: m.amountBeforeVat } : {}),
        ...(m.greenInvoiceStatus !== undefined
          ? { greenInvoiceStatus: m.greenInvoiceStatus }
          : {}),
        reconciliationStatus: 'gi_unpaid',
        syncedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      { merge: true },
    )
  }

  try {
    await batch.commit()
    written += slice.length
    console.log(`[gentle-import] wrote ${written}/${mapped.length}`)
  } catch (e) {
    failed += slice.length
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[gentle-import] batch failed (${i}): ${msg}`)
    if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota exceeded')) {
      console.error('[gentle-import] Firestore quota — stopping. Retry tomorrow.')
      break
    }
  }

  if (i + BATCH_SIZE < mapped.length) await sleep(DELAY_MS)
}

// Update sync state (single doc write)
try {
  await db
    .collection('integrations')
    .doc('morning')
    .set(
      {
        syncState: {
          lastExpenseSyncAt: new Date().toISOString(),
          lastExpenseFromDate: FROM_DATE,
          lastExpenseToDate: toDate,
          lastExpenseFetched: docs.length,
          lastExpenseImported: written,
        },
      },
      { merge: true },
    )
  console.log('[gentle-import] sync state updated')
} catch (e) {
  console.warn('[gentle-import] sync state write failed (non-fatal)')
}

console.log(
  JSON.stringify(
    { ok: failed === 0 && written === mapped.length, written, failed, total: mapped.length },
    null,
    2,
  ),
)

process.exit(written === mapped.length ? 0 : 1)
