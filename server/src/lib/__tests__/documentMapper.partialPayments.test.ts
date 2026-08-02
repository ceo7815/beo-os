import { describe, expect, it } from 'vitest'
import {
  applyPartialPaidToMappedIncome,
  mapMorningDocument,
  sumDocumentPaymentArray,
  sumLinkedPaymentDocuments,
  type MappedIncome,
} from '../documentMapper.js'

describe('partial payments on transaction accounts', () => {
  it('sums payment array on a document', () => {
    expect(
      sumDocumentPaymentArray({
        payment: [
          { price: 1000, type: 4 },
          { amount: 500.5, type: 3 },
        ],
      }),
    ).toBe(1500.5)
  })

  it('maps open transaction account with payment array as partial', () => {
    const mapped = mapMorningDocument({
      id: 'ta-1',
      type: 300,
      status: 0,
      number: '440726',
      documentDate: '2026-07-01',
      amount: 10000,
      payment: [{ price: 3000, type: 4 }],
      client: { name: 'לקוח', id: 'c1' },
    })
    expect(mapped).not.toBeNull()
    expect(mapped!.documentKind).toBe('transaction_account')
    expect(mapped!.status).toBe('partial')
    expect(mapped!.paidAmount).toBe(3000)
    expect(mapped!.amount).toBe(10000)
  })

  it('does not mark closed transaction account as partial', () => {
    const mapped = mapMorningDocument({
      id: 'ta-2',
      type: 300,
      status: 1,
      number: '1',
      documentDate: '2026-07-01',
      amount: 10000,
      payment: [{ price: 10000, type: 4 }],
      client: { name: 'לקוח', id: 'c1' },
    })
    expect(mapped!.status).toBe('paid')
    expect(mapped!.paidAmount).toBe(10000)
  })

  it('sums only receipt-like linked documents', () => {
    const sum = sumLinkedPaymentDocuments([
      { type: 400, status: 0, amount: 2000 },
      { type: 320, status: 0, amount: 1500 },
      { type: 305, status: 0, amount: 9999 }, // לא תקבול
      { type: 400, status: 4, amount: 500 }, // מבוטל
    ])
    expect(sum).toBe(3500)
  })

  it('applyPartialPaidToMappedIncome upgrades pending open TA', () => {
    const base: MappedIncome = {
      greenInvoiceId: 'ta-3',
      greenInvoiceType: 300,
      greenInvoiceNumber: '9',
      documentKind: 'transaction_account',
      amount: 8000,
      amountIncludesVat: true,
      invoiceNumber: '9',
      invoiceDate: '2026-06-01',
      status: 'pending',
      greenInvoiceStatus: 0,
      clientName: 'x',
      clientTaxId: '',
      clientEmail: '',
      clientGreenInvoiceId: 'c',
      source: 'green_invoice',
      cancelled: false,
    }
    const next = applyPartialPaidToMappedIncome(base, 2500)
    expect(next.status).toBe('partial')
    expect(next.paidAmount).toBe(2500)
    // לא סוגר — GI עדיין פתוח
    expect(next.greenInvoiceStatus).toBe(0)
  })

  it('keeps max paid when applying linked on top of payment array', () => {
    const base: MappedIncome = {
      greenInvoiceId: 'ta-4',
      greenInvoiceType: 300,
      greenInvoiceNumber: '9',
      documentKind: 'transaction_account',
      amount: 8000,
      amountIncludesVat: true,
      invoiceNumber: '9',
      invoiceDate: '2026-06-01',
      status: 'partial',
      paidAmount: 1000,
      greenInvoiceStatus: 0,
      clientName: 'x',
      clientTaxId: '',
      clientEmail: '',
      clientGreenInvoiceId: 'c',
      source: 'green_invoice',
      cancelled: false,
    }
    expect(applyPartialPaidToMappedIncome(base, 4000).paidAmount).toBe(4000)
    expect(applyPartialPaidToMappedIncome(base, 500).paidAmount).toBe(1000)
  })
})
