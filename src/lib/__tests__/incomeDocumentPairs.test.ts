import { describe, expect, it } from 'vitest'
import { buildIncomeDocumentPairMap } from '../incomeDocumentPairs'
import type { FinanceIncome } from '../../types'

function inc(
  partial: Partial<FinanceIncome> &
    Pick<FinanceIncome, 'id' | 'documentKind' | 'amount'>,
): FinanceIncome {
  return {
    clientId: 'c1',
    projectId: '',
    amountIncludesVat: true,
    invoiceNumber: partial.invoiceNumber ?? '1',
    invoiceDate: partial.invoiceDate ?? '2026-07-21',
    status: 'paid',
    createdAt: '2026-07-21T00:00:00.000Z',
    source: 'green_invoice',
    ...partial,
  }
}

describe('buildIncomeDocumentPairMap', () => {
  it('pairs receipt with matching tax invoice', () => {
    const invoice = inc({
      id: 'inv',
      documentKind: 'tax_invoice',
      amount: 1750,
      invoiceNumber: '550217',
    })
    const receipt = inc({
      id: 'rec',
      documentKind: 'receipt',
      amount: 1750,
      invoiceNumber: '880135',
    })
    const map = buildIncomeDocumentPairMap([invoice, receipt])
    expect(map.get('rec')?.id).toBe('inv')
  })

  it('does not pair different amounts', () => {
    const invoice = inc({
      id: 'inv',
      documentKind: 'tax_invoice',
      amount: 1750,
    })
    const receipt = inc({
      id: 'rec',
      documentKind: 'receipt',
      amount: 2000,
    })
    expect(buildIncomeDocumentPairMap([invoice, receipt]).size).toBe(0)
  })
})
