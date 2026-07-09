import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { env } from '../config/env.js'
import { getAdminDb } from './firebaseAdmin.js'
import { MorningClient } from './morningClient.js'
import {
  loadMorningCredentials,
  readSyncState,
  writeSyncState,
} from './morningCredentials.js'
import { mapMorningExpense, type MappedExpense } from './expenseMapper.js'
import {
  computeExpensePairs,
  isBankExpense,
  isGiOnlyRecord,
  requiresGiDocument,
} from './expenseReconcileCore.js'

const EXPENSES_COLLECTION = 'financeExpenses'
const GI_DOC_PREFIX = 'gi_'
const GI_EXPENSE_TYPE = 'supplier'

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

function ymFromDate(ymd: string): string {
  return ymd.slice(0, 7)
}

/** Firestore Admin SDK rejects `undefined` field values */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj }
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key]
  }
  return out
}

type StoredExpense = {
  id: string
  type?: string
  amount: number
  amountBeforeVat?: number
  vatAmount?: number
  billingMonth: string
  paidDate?: string
  bankRef?: string
  source?: string
  greenInvoiceId?: string
  greenInvoiceNumber?: string
  supplierName?: string
  greenInvoiceSupplierName?: string
  greenInvoiceSupplierTaxId?: string
  supplierTaxId?: string
  name?: string
  description?: string
  supplierInvoiceReceived?: boolean
}

function mapStoredExpenseDoc(d: QueryDocumentSnapshot): StoredExpense {
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
  }
}

/** טעינה בעמודים — מונעת RESOURCE_EXHAUSTED על אוסף גדול */
async function loadStoredExpenses(db: Firestore): Promise<StoredExpense[]> {
  const all: StoredExpense[] = []
  const pageSize = 150
  let lastDoc: QueryDocumentSnapshot | undefined

  while (true) {
    let q = db
      .collection(EXPENSES_COLLECTION)
      .orderBy('__name__')
      .limit(pageSize)
    if (lastDoc) q = q.startAfter(lastDoc)
    const snap = await q.get()
    if (snap.empty) break
    for (const d of snap.docs) {
      all.push(mapStoredExpenseDoc(d))
    }
    lastDoc = snap.docs[snap.docs.length - 1]
    if (snap.size < pageSize) break
    await new Promise((r) => setTimeout(r, 200))
  }

  return all
}

function asFinanceExpense(row: StoredExpense) {
  return {
    ...row,
    type: row.type ?? GI_EXPENSE_TYPE,
    recurring: false,
    createdAt: '',
  }
}

/** שומר התאמות ל-Firestore — בנק + GI */
async function persistExpenseReconciliation(
  db: Firestore,
  expenses: StoredExpense[],
): Promise<{ matched: number; bankMissingDocument: number; giUnpaid: number }> {
  const pairs = computeExpensePairs(expenses.map(asFinanceExpense))
  const matchedBank = new Set(pairs.map((p) => p.bank.id))
  const matchedGi = new Set(pairs.map((p) => p.gi.id))
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = []

  for (const pair of pairs) {
    updates.push({
      id: pair.bank.id,
      patch: stripUndefined({
        matchedExpenseId: pair.gi.id,
        matchedBankExpenseId: pair.bank.id,
        reconciliationStatus: 'matched',
        supplierInvoiceReceived: true,
        ...(pair.gi.greenInvoiceId
          ? { linkedGreenInvoiceId: pair.gi.greenInvoiceId }
          : {}),
        ...(pair.gi.greenInvoiceNumber
          ? { greenInvoiceNumber: pair.gi.greenInvoiceNumber }
          : {}),
      }),
    })
    updates.push({
      id: pair.gi.id,
      patch: stripUndefined({
        matchedExpenseId: pair.bank.id,
        matchedBankExpenseId: pair.bank.id,
        reconciliationStatus: 'matched',
        ...(pair.bank.id ? { linkedBankExpenseId: pair.bank.id } : {}),
      }),
    })
  }

  for (const exp of expenses) {
    if (isBankExpense(asFinanceExpense(exp)) && !matchedBank.has(exp.id)) {
      const needsDoc = requiresGiDocument(exp)
      updates.push({
        id: exp.id,
        patch: needsDoc
          ? {
              reconciliationStatus: 'bank_missing_document',
              supplierInvoiceReceived: false,
              matchedExpenseId: FieldValue.delete(),
              matchedBankExpenseId: FieldValue.delete(),
              linkedGreenInvoiceId: FieldValue.delete(),
              greenInvoiceNumber: FieldValue.delete(),
            }
          : {
              reconciliationStatus: 'document_not_required',
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

  for (let i = 0; i < updates.length; i += 400) {
    const batch = db.batch()
    for (const { id, patch } of updates.slice(i, i + 400)) {
      batch.set(db.collection(EXPENSES_COLLECTION).doc(id), patch, { merge: true })
    }
    await batch.commit()
  }

  let bankMissingDocument = 0
  let giUnpaid = 0
  for (const exp of expenses) {
    const fe = asFinanceExpense(exp)
    if (isBankExpense(fe) && !matchedBank.has(exp.id) && requiresGiDocument(exp)) {
      bankMissingDocument += 1
    }
    if (isGiOnlyRecord(fe) && !matchedGi.has(exp.id)) giUnpaid += 1
  }

  return { matched: pairs.length, bankMissingDocument, giUnpaid }
}

export type ReconcileResult = {
  ok: true
  matched: number
  bankMissingDocument: number
  giUnpaid: number
  durationMs: number
}

export async function runExpenseReconcile(): Promise<ReconcileResult> {
  const startedAt = Date.now()
  const db = getAdminDb()
  if (!db) throw new Error('Firebase Admin not configured')
  const expenses = await loadStoredExpenses(db)
  const result = await persistExpenseReconciliation(db, expenses)
  return { ok: true, ...result, durationMs: Date.now() - startedAt }
}

export type ExpenseSyncResult = {
  ok: true
  fromDate: string
  toDate: string
  fetched: number
  imported: number
  matched: number
  bankMissingDocument: number
  durationMs: number
}

/**
 * משיכת הוצאות מ-Morning והעלאתן ל-Firestore.
 * idempotent — מזהה gi_<greenInvoiceId>.
 * לאחר הסנכרון — התאמה אוטומטית מול ייבוא בנק.
 */
export async function runMorningExpenseSync(options?: {
  fromDate?: string
}): Promise<ExpenseSyncResult> {
  const startedAt = Date.now()
  const db = getAdminDb()
  if (!db) throw new Error('Firebase Admin not configured')

  const creds = await loadMorningCredentials()
  if (!creds) throw new Error('Morning credentials not configured')

  const fromDate = (options?.fromDate ?? env.sync.fromDate).slice(0, 10)
  const toDate = todayYmd()

  const client = new MorningClient(creds)
  const docs = await client.searchAllExpenses({
    fromDate,
    toDate,
    pageSize: 100,
  })

  const mapped: MappedExpense[] = []
  for (const raw of docs) {
    const m = mapMorningExpense(raw)
    if (m) mapped.push(m)
  }

  let imported = 0
  for (let i = 0; i < mapped.length; i += 400) {
    const slice = mapped.slice(i, i + 400)
    const batch = db.batch()
    for (const m of slice) {
      const ref = db
        .collection(EXPENSES_COLLECTION)
        .doc(GI_DOC_PREFIX + m.greenInvoiceId)
      const billingMonth = ymFromDate(
        m.reportingDate ?? m.paidDate ?? m.documentDate,
      )
      const row = stripUndefined({
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
        ...(m.amountBeforeVat !== undefined
          ? { amountBeforeVat: m.amountBeforeVat }
          : {}),
        ...(m.greenInvoiceStatus !== undefined
          ? { greenInvoiceStatus: m.greenInvoiceStatus }
          : {}),
        reconciliationStatus: 'gi_unpaid',
        syncedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      })
      batch.set(ref, row, { merge: true })
      imported += 1
    }
    await batch.commit()
  }

  let matched = 0
  let bankMissingDocument = 0
  try {
    const allRows = await loadStoredExpenses(db)
    const result = await persistExpenseReconciliation(db, allRows)
    matched = result.matched
    bankMissingDocument = result.bankMissingDocument
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`[expense-sync] reconcile skipped: ${msg}`)
  }

  const prevState = (await readSyncState()) ?? {}
  await writeSyncState({
    ...prevState,
    lastExpenseSyncAt: new Date().toISOString(),
    lastExpenseFromDate: fromDate,
    lastExpenseToDate: toDate,
    lastExpenseFetched: docs.length,
    lastExpenseImported: imported,
    lastExpenseMatched: matched,
    lastExpenseBankMissingDocument: bankMissingDocument,
  })

  return {
    ok: true,
    fromDate,
    toDate,
    fetched: docs.length,
    imported,
    matched,
    bankMissingDocument,
    durationMs: Date.now() - startedAt,
  }
}
