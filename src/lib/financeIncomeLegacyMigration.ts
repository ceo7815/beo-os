import type { FinanceIncome, FinanceIncomeDocumentKind } from '../types'
import {
  isTaxReceiptIncome,
  isTransactionInvoiceIncome,
} from './financeIncomeDocument'
import {
  incomeTotalPaid,
  syncTaxReceiptPaymentDate,
  taxReceiptDocumentDate,
} from './financeIncomePayment'

/** הכנסות שדווחו כנעלמו — לזיהוי ושחזור */
export const KNOWN_PAID_INCOME_TARGETS = [
  {
    clientId: '805b9369-c556-4527-9c33-8791d2fb1540',
    amount: 2596,
    tolerance: 2,
    paymentYm: '2026-04',
    label: 'מדידות טכנולוגיות ניטור מתקדמות',
  },
  {
    clientId: '5b23296f-d6e4-4d97-9f5f-32427f87c7f3',
    amount: 5900,
    tolerance: 2,
    paymentYm: '2026-04',
    label: 'יבואני הממתקים',
  },
  {
    clientId: '000fb27e-7ae6-43c3-9851-3fd8d47e0b95',
    amount: 1133,
    tolerance: 2,
    paymentYm: '2026-04',
    label: 'מרוץ ש.א. הקריות',
  },
] as const

export type KnownPaidIncomeTarget = (typeof KNOWN_PAID_INCOME_TARGETS)[number]

export function isFullyPaidIncome(inc: FinanceIncome): boolean {
  if (inc.status === 'paid') return true
  return incomeTotalPaid(inc) >= inc.amount - 0.01
}

/** הכנסה ששולמה במלואה אך נשארה כחשבונית עסקה — לא מופיעה במס קבלה */
export function needsLegacyTaxReceiptRestore(inc: FinanceIncome): boolean {
  if (isTaxReceiptIncome(inc)) return false
  if (!isTransactionInvoiceIncome(inc)) return false
  return isFullyPaidIncome(inc)
}

export type LegacyTaxReceiptPatch = {
  documentKind: FinanceIncomeDocumentKind
  invoiceDate: string
  paidDate: string
  payments?: FinanceIncome['payments']
  sourceTransactionInvoiceId: string
}

export function buildLegacyTaxReceiptPatch(
  inc: FinanceIncome,
): LegacyTaxReceiptPatch {
  const payD = taxReceiptDocumentDate(inc) || inc.invoiceDate.slice(0, 10)
  const synced = syncTaxReceiptPaymentDate(payD, inc.payments)
  return {
    documentKind: 'tax_receipt',
    invoiceDate: synced.invoiceDate,
    paidDate: synced.paidDate,
    ...(synced.payments ? { payments: synced.payments } : {}),
    sourceTransactionInvoiceId: inc.id,
  }
}

function matchesTarget(inc: FinanceIncome, target: KnownPaidIncomeTarget): boolean {
  return (
    inc.clientId === target.clientId &&
    Math.abs(inc.amount - target.amount) <= target.tolerance
  )
}

export function findMissingKnownIncomeTargets(
  incomes: FinanceIncome[],
): KnownPaidIncomeTarget[] {
  return KNOWN_PAID_INCOME_TARGETS.filter(
    (target) => !incomes.some((inc) => matchesTarget(inc, target)),
  )
}

export function aprilPaymentDateForTarget(target: KnownPaidIncomeTarget): string {
  return `${target.paymentYm}-01`
}
