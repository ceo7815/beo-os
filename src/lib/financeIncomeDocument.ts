import type { FinanceIncome, FinanceIncomeDocumentKind } from '../types'

export const FINANCE_INCOME_DOCUMENT_LABELS: Record<
  FinanceIncomeDocumentKind,
  string
> = {
  tax_receipt: 'חשבונית מס קבלה',
  transaction_invoice: 'יתרה לגבייה',
}

export const FINANCE_INCOME_DOCUMENT_SHORT: Record<
  FinanceIncomeDocumentKind,
  string
> = {
  tax_receipt: 'מס קבלה',
  transaction_invoice: 'גבייה',
}

/** ברירת מחדל לרשומות ישנות — יתרה לגבייה */
export function incomeDocumentKind(
  inc: Pick<FinanceIncome, 'documentKind'>,
): FinanceIncomeDocumentKind {
  return inc.documentKind ?? 'transaction_invoice'
}

export function isTaxReceiptIncome(
  inc: Pick<FinanceIncome, 'documentKind'>,
): boolean {
  return incomeDocumentKind(inc) === 'tax_receipt'
}

export function isTransactionInvoiceIncome(
  inc: Pick<FinanceIncome, 'documentKind'>,
): boolean {
  return incomeDocumentKind(inc) === 'transaction_invoice'
}

export function incomeDocumentNumberLabel(
  kind: FinanceIncomeDocumentKind,
): string {
  return kind === 'tax_receipt'
    ? 'מספר חשבונית מס קבלה *'
    : 'מספר מסמך / חשבון עסקה *'
}

export function incomeDocumentDateLabel(
  kind: FinanceIncomeDocumentKind,
): string {
  return kind === 'tax_receipt'
    ? 'תאריך מס קבלה (= תאריך תשלום) *'
    : 'תאריך מסמך *'
}
