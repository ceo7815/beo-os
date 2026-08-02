import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from './firebaseAdmin.js'
import {
  computeExpensePairs,
  isBankExpense,
  isGiOnlyRecord,
  requiresGiDocument,
} from './expenseReconcileCore.js'

const EXPENSES_COLLECTION = 'financeExpenses'

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
    type: row.type ?? 'supplier',
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

/*
 * משיכת ההוצאות מחשבונית ירוקה הוסרה במכוון.
 *
 * חשבונית ירוקה היא מקור האמת להכנסות בלבד. הוצאות נכנסות דרך הסוכן,
 * שמתייק את המסמך ושואל את השאלות החסרות, ורק אחרי אישור המשתמש הן
 * נספרות ברווח. שני מקורות מקבילים לאותה הוצאה יצרו כפילויות וסתירות.
 */
