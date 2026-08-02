import { describe, it, expect } from 'vitest'
import {
  buildIndexCsv,
  collectAccountantDocuments,
  documentFileName,
} from '../accountantPackage'
import type { FinanceExpense } from '../../types'

function expense(over: Partial<FinanceExpense>): FinanceExpense {
  return {
    id: over.id ?? 'e1',
    type: 'general',
    amount: 100,
    billingMonth: '2026-07',
    paymentMethod: 'bank_transfer',
    ...over,
  } as FinanceExpense
}

describe('accountant package', () => {
  it('includes only expenses that have an uploaded document', () => {
    const docs = collectAccountantDocuments([
      expense({ id: 'with', documentUrl: 'https://x/a.pdf' }),
      expense({ id: 'without' }),
      expense({ id: 'number-only', invoiceNumber: '123' }),
    ])
    expect(docs.map((d) => d.expense.id)).toEqual(['with'])
  })

  it('sorts by date and files each document under its month folder', () => {
    const docs = collectAccountantDocuments([
      expense({
        id: 'late',
        paidDate: '2026-08-03',
        billingMonth: '2026-08',
        documentUrl: 'https://x/b.pdf',
      }),
      expense({
        id: 'early',
        paidDate: '2026-07-02',
        documentUrl: 'https://x/a.pdf',
      }),
    ])
    expect(docs.map((d) => d.expense.id)).toEqual(['early', 'late'])
    expect(docs.map((d) => d.month)).toEqual(['2026-07', '2026-08'])
  })

  it('builds a file name that identifies the document outside the system', () => {
    const name = documentFileName(
      expense({
        paidDate: '2026-07-02',
        supplierName: 'ספק א/ב',
        amount: 1234.5,
        invoiceNumber: '77',
        documentFileName: 'scan.PDF',
      }),
      7,
    )
    expect(name).toBe('007_2026-07-02_ספק א_ב_1234.50_חשבונית-77.pdf')
  })

  it('keeps names unique when two documents share supplier, date and amount', () => {
    const docs = collectAccountantDocuments([
      expense({ id: 'a', paidDate: '2026-07-02', documentUrl: 'https://x/a.pdf' }),
      expense({ id: 'b', paidDate: '2026-07-02', documentUrl: 'https://x/b.pdf' }),
    ])
    expect(new Set(docs.map((d) => d.fileName)).size).toBe(2)
  })

  it('writes an index row per document with the path inside the zip', () => {
    const docs = collectAccountantDocuments([
      expense({
        paidDate: '2026-07-02',
        supplierName: 'ספק',
        amount: 118,
        vatAmount: 18,
        invoiceNumber: '77',
        documentUrl: 'https://x/a.pdf',
      }),
    ])
    const csv = buildIndexCsv(docs)
    const lines = csv.trimEnd().split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]!.startsWith('\uFEFF')).toBe(true)
    expect(lines[1]).toContain('118.00')
    expect(lines[1]).toContain('18.00')
    expect(lines[1]).toContain('100.00')
    expect(lines[1]).toContain(`2026-07/${docs[0]!.fileName}`)
  })

  it('quotes values that contain a comma so the index stays parsable', () => {
    const docs = collectAccountantDocuments([
      expense({
        paidDate: '2026-07-02',
        supplierName: 'ספק, בע״מ',
        documentUrl: 'https://x/a.pdf',
      }),
    ])
    expect(buildIndexCsv(docs)).toContain('"ספק, בע״מ"')
  })
})
