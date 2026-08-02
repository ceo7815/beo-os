import { incomeDocumentKind } from './financeIncomeDocument'
import { resolveIncomeVat } from './israeliVat'
import type { FinanceIncome } from '../types'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function clientKey(inc: FinanceIncome): string {
  return (
    inc.clientId?.trim() ||
    inc.greenInvoiceClientName?.trim().toLowerCase() ||
    ''
  )
}

function amountKey(inc: FinanceIncome): string {
  return String(round2(Math.abs(resolveIncomeVat(inc).gross)))
}

function dateKey(inc: FinanceIncome): string {
  return (inc.invoiceDate || inc.paidDate || '').slice(0, 10)
}

/**
 * התאמת קבלה (400) לחשבונית מס (305) — אותה עסקה בשני מסמכים.
 * התאמה רכה: לקוח + סכום ברוטו + תאריך מסמך.
 * לא משנה חישוב הכנסה — רק לתצוגה/קישור בטבלה.
 */
export function buildIncomeDocumentPairMap(
  rows: FinanceIncome[],
): Map<string, FinanceIncome> {
  const invoices = rows.filter(
    (r) => incomeDocumentKind(r) === 'tax_invoice',
  )
  const receipts = rows.filter((r) => incomeDocumentKind(r) === 'receipt')

  const pairKey = (inc: FinanceIncome): string | null => {
    const client = clientKey(inc)
    const date = dateKey(inc)
    if (!client || !date) return null
    return `${client}|${amountKey(inc)}|${date}`
  }

  const invoiceBuckets = new Map<string, FinanceIncome[]>()
  for (const inv of invoices) {
    const key = pairKey(inv)
    if (!key) continue
    const list = invoiceBuckets.get(key) ?? []
    list.push(inv)
    invoiceBuckets.set(key, list)
  }

  const receiptToInvoice = new Map<string, FinanceIncome>()
  const usedInvoiceIds = new Set<string>()

  for (const receipt of receipts) {
    const key = pairKey(receipt)
    if (!key) continue
    const candidates = (invoiceBuckets.get(key) ?? []).filter(
      (inv) => !usedInvoiceIds.has(inv.id),
    )
    const match = candidates[0]
    if (!match) continue
    usedInvoiceIds.add(match.id)
    receiptToInvoice.set(receipt.id, match)
  }

  return receiptToInvoice
}

/** הפוך: מזהה חשבונית מס → הקבלה המתאימה */
export function buildInvoiceToReceiptMap(
  rows: FinanceIncome[],
): Map<string, FinanceIncome> {
  const receiptToInvoice = buildIncomeDocumentPairMap(rows)
  const byId = new Map(rows.map((r) => [r.id, r]))
  const invoiceToReceipt = new Map<string, FinanceIncome>()
  for (const [receiptId, invoice] of receiptToInvoice) {
    const receipt = byId.get(receiptId)
    if (receipt) invoiceToReceipt.set(invoice.id, receipt)
  }
  return invoiceToReceipt
}
