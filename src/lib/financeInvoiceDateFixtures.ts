import type { FinanceIncome } from '../types'
import { isTaxReceiptIncome } from './financeIncomeDocument'
import {
  syncTaxReceiptPaymentDate,
  taxReceiptDatesOutOfSync,
} from './financeIncomePayment'

/** תיקוני תאריך מסמך ידועים — לפי מספר חשבונית */
export const INVOICE_DATE_FIXTURES = [
  {
    invoiceNumber: '660575',
    invoiceDate: '2026-04-16',
    amount: 2064,
    amountTolerance: 2,
    clientId: '7202798d-b452-40a5-8137-7b85382f4857',
    monthlyRetainer: false,
    label: 'סגסוגת — שדרוג אתר (אפריל)',
  },
  {
    invoiceNumber: '660583',
    invoiceDate: '2026-05-04',
    amount: 2065,
    amountTolerance: 2,
    clientId: '7202798d-b452-40a5-8137-7b85382f4857',
    monthlyRetainer: false,
    label: 'סגסוגת — שדרוג אתר (מאי)',
  },
] as const

export type InvoiceDateFixture = (typeof INVOICE_DATE_FIXTURES)[number]

function invoiceNumberMatches(inc: FinanceIncome, fixture: InvoiceDateFixture): boolean {
  const num = inc.invoiceNumber.trim()
  return num === fixture.invoiceNumber || num.includes(fixture.invoiceNumber)
}

export function matchInvoiceFixture(
  inc: FinanceIncome,
  fixture: InvoiceDateFixture,
): boolean {
  if (!invoiceNumberMatches(inc, fixture)) return false
  if (fixture.clientId && inc.clientId !== fixture.clientId) return false
  if (
    typeof fixture.amount === 'number' &&
    Math.abs(inc.amount - fixture.amount) > (fixture.amountTolerance ?? 2)
  ) {
    return false
  }
  return true
}

export function findInvoiceFixture(inc: FinanceIncome): InvoiceDateFixture | null {
  return INVOICE_DATE_FIXTURES.find((f) => matchInvoiceFixture(inc, f)) ?? null
}

export function invoiceFixtureNeedsFix(
  inc: FinanceIncome,
  fixture: InvoiceDateFixture,
): boolean {
  if (!matchInvoiceFixture(inc, fixture)) return false
  const doc = inc.invoiceDate.trim().slice(0, 10)
  if (doc !== fixture.invoiceDate) return true
  if (inc.monthlyRetainer === true && fixture.monthlyRetainer === false) return true
  if (isTaxReceiptIncome(inc) && taxReceiptDatesOutOfSync(inc)) return true
  return false
}

export type InvoiceFixturePatch = {
  invoiceDate: string
  paidDate?: string
  payments?: FinanceIncome['payments']
  monthlyRetainer: boolean
}

export function buildInvoiceFixturePatch(
  inc: FinanceIncome,
  fixture: InvoiceDateFixture,
): InvoiceFixturePatch {
  if (isTaxReceiptIncome(inc)) {
    const synced = syncTaxReceiptPaymentDate(fixture.invoiceDate, inc.payments)
    return {
      invoiceDate: synced.invoiceDate,
      paidDate: synced.paidDate,
      ...(synced.payments ? { payments: synced.payments } : {}),
      monthlyRetainer: fixture.monthlyRetainer,
    }
  }
  return {
    invoiceDate: fixture.invoiceDate,
    monthlyRetainer: fixture.monthlyRetainer,
  }
}
