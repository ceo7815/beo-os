import type { FinanceIncome, FinanceIncomeDocumentKind } from '../types'

export type NormalizedIncomeDocumentKind =
  | 'tax_invoice_receipt'
  | 'tax_invoice'
  | 'receipt'
  | 'transaction_account'
  | 'credit_invoice'

const LEGACY_MAP: Record<string, NormalizedIncomeDocumentKind> = {
  tax_receipt: 'tax_invoice_receipt',
  transaction_invoice: 'transaction_account',
}

/** מנרמל סוג מסמך — כולל ערכים ישנים מ-Firestore */
export function normalizeIncomeDocumentKind(
  raw?: FinanceIncomeDocumentKind | string,
): NormalizedIncomeDocumentKind {
  const s = String(raw ?? '').trim()
  if (s in LEGACY_MAP) return LEGACY_MAP[s]!
  if (
    s === 'tax_invoice_receipt' ||
    s === 'tax_invoice' ||
    s === 'receipt' ||
    s === 'transaction_account' ||
    s === 'credit_invoice'
  ) {
    return s
  }
  return 'transaction_account'
}

export function incomeDocumentKind(
  inc: Pick<FinanceIncome, 'documentKind'>,
): NormalizedIncomeDocumentKind {
  return normalizeIncomeDocumentKind(inc.documentKind)
}

export const FINANCE_INCOME_DOCUMENT_LABELS: Record<
  NormalizedIncomeDocumentKind,
  string
> = {
  tax_invoice_receipt: 'חשבונית מס קבלה',
  tax_invoice: 'חשבונית מס',
  receipt: 'קבלה',
  transaction_account: 'חשבון עסקה',
  credit_invoice: 'חשבונית זיכוי',
}

export const FINANCE_INCOME_DOCUMENT_SHORT: Record<
  NormalizedIncomeDocumentKind,
  string
> = {
  tax_invoice_receipt: 'מס קבלה',
  tax_invoice: 'חשבונית מס',
  receipt: 'קבלה',
  transaction_account: 'חשבון עסקה',
  credit_invoice: 'זיכוי',
}

/** קודי Morning לסוג מסמך */
export const GI_TYPE_BY_KIND: Record<NormalizedIncomeDocumentKind, number> = {
  tax_invoice_receipt: 320,
  tax_invoice: 305,
  receipt: 400,
  transaction_account: 300,
  credit_invoice: 330,
}

/** הכנסות — כל סוגי המסמך שמוצגים בדף הכנסות (לא חשבון עסקה) */
export const INCOME_PAGE_KINDS: NormalizedIncomeDocumentKind[] = [
  'tax_invoice_receipt',
  'tax_invoice',
  'receipt',
  'credit_invoice',
]

/**
 * סוגי מסמך שנספרים כהכנסה בפועל לחישוב הרווח והמע״מ:
 * חשבונית מס קבלה (320) + חשבונית מס (305) + חשבונית זיכוי (330, שלילית).
 * קבלה (400) אינה נספרת — היא תקבול כנגד חשבונית מס שכבר נספרה (מניעת כפילות).
 */
export const REVENUE_KINDS: NormalizedIncomeDocumentKind[] = [
  'tax_invoice_receipt',
  'tax_invoice',
  'credit_invoice',
]

/** הכנסה בפועל לרווח/מע״מ — חשבונית מס קבלה + חשבונית מס + זיכוי (לא קבלה) */
export function isActualIncome(
  inc: Pick<FinanceIncome, 'documentKind'>,
): boolean {
  return REVENUE_KINDS.includes(incomeDocumentKind(inc))
}

/** קבלה בלבד — תקבול, לא נספר כהכנסה */
export function isReceiptOnly(
  inc: Pick<FinanceIncome, 'documentKind'>,
): boolean {
  return incomeDocumentKind(inc) === 'receipt'
}

/** חשבון עסקה — גבייה */
export function isCollectionDoc(
  inc: Pick<FinanceIncome, 'documentKind'>,
): boolean {
  return incomeDocumentKind(inc) === 'transaction_account'
}

/**
 * חשבון עסקה פתוח לגבייה — תואם לסטטוס בחשבונית ירוקה אחד-לאחד.
 * סטטוס 1 (סגור) / 2 (נסגר ידנית) = הופקה חשבונית מס קבלה → לא פתוח לגבייה.
 * רשומה ידנית (ללא סטטוס GI) נחשבת פתוחה.
 */
export function isOpenTransactionAccount(
  inc: Pick<FinanceIncome, 'documentKind' | 'greenInvoiceStatus'>,
): boolean {
  if (!isCollectionDoc(inc)) return false
  const s = inc.greenInvoiceStatus
  if (s === 1 || s === 2 || s === 3 || s === 4) return false
  return true
}

/** @deprecated — מסמך שמעוגן לפי תאריך תשלום (חשבונית מס קבלה / קבלה) */
export function isTaxReceiptIncome(
  inc: Pick<FinanceIncome, 'documentKind'>,
): boolean {
  return incomeUsesPaymentAnchor(inc)
}

/** @deprecated — השתמשו ב-isCollectionDoc */
export function isTransactionInvoiceIncome(
  inc: Pick<FinanceIncome, 'documentKind'>,
): boolean {
  return isCollectionDoc(inc)
}

export function isIncomePageDoc(
  inc: Pick<FinanceIncome, 'documentKind'>,
): boolean {
  return INCOME_PAGE_KINDS.includes(incomeDocumentKind(inc))
}

export function incomeDocumentNumberLabel(
  kind: NormalizedIncomeDocumentKind,
): string {
  return `מספר ${FINANCE_INCOME_DOCUMENT_LABELS[kind]}`
}

export function incomeUsesPaymentAnchor(
  inc: Pick<FinanceIncome, 'documentKind'>,
): boolean {
  const k = incomeDocumentKind(inc)
  return k === 'tax_invoice_receipt' || k === 'receipt'
}

export function incomeDocumentDateLabel(
  kind: NormalizedIncomeDocumentKind,
): string {
  if (kind === 'tax_invoice_receipt' || kind === 'receipt') {
    return 'תאריך תשלום'
  }
  return 'תאריך מסמך'
}
