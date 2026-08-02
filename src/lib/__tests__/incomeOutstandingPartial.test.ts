import { describe, expect, it } from 'vitest'
import {
  incomeOutstandingAmount,
  incomeTotalPaid,
} from '../financeIncomePayment'
import type { FinanceIncome } from '../../types'

function ta(partial: Partial<FinanceIncome> & Pick<FinanceIncome, 'amount' | 'status'>): FinanceIncome {
  return {
    id: '1',
    clientId: 'c',
    amount: partial.amount,
    amountIncludesVat: true,
    invoiceNumber: '1',
    invoiceDate: '2026-06-01',
    status: partial.status,
    documentKind: 'transaction_account',
    greenInvoiceStatus: 0,
    source: 'green_invoice',
    createdAt: '2026-06-01T00:00:00.000Z',
    ...partial,
  }
}

describe('incomeOutstandingAmount with GI partial payments', () => {
  it('reduces open balance by paidAmount on partial status', () => {
    const row = ta({ amount: 10000, status: 'partial', paidAmount: 3000 })
    expect(incomeTotalPaid(row)).toBe(3000)
    expect(incomeOutstandingAmount(row)).toBe(7000)
  })

  it('still honors paidAmount when display status became overdue', () => {
    const row = ta({ amount: 10000, status: 'overdue', paidAmount: 2500 })
    expect(incomeTotalPaid(row)).toBe(2500)
    expect(incomeOutstandingAmount(row)).toBe(7500)
  })

  it('full amount when no payments recorded', () => {
    const row = ta({ amount: 10000, status: 'pending' })
    expect(incomeOutstandingAmount(row)).toBe(10000)
  })
})
