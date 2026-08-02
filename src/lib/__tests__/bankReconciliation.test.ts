import { describe, expect, it } from 'vitest'
import type { FinanceExpense } from '../../types'
import {
  computeExpenseCoverage,
  hasAttachedDocument,
  isOpenReconciliationRow,
  listOpenReconciliationRows,
  listReconciliationRows,
} from '../expenseReconciliation'
import { buildBankReconciliationReport } from '../bankReconciliationReport'

function expense(over: Partial<FinanceExpense> = {}): FinanceExpense {
  return {
    id: 'exp-1',
    type: 'supplier',
    amount: 1180,
    amountIncludesVat: true,
    vatClass: 'vat_liable',
    recurring: false,
    billingMonth: '2026-07',
    paidDate: '2026-07-10',
    bankRef: 'bank-ref-1',
    source: 'bank_import',
    createdAt: '2026-07-10T00:00:00.000Z',
    ...over,
  }
}

const JULY = ['2026-07', '2026-07'] as const

describe('תשלום נחשב מתועד רק כשיש לו חשבונית', () => {
  it('תשלום בנק ללא חשבונית נשאר פתוח', () => {
    const rows = listReconciliationRows([expense()], ...JULY)

    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('bank_missing_document')
    expect(isOpenReconciliationRow(rows[0]!)).toBe(true)
  })

  it('קובץ חשבונית מוצמד סוגר את השורה', () => {
    const rows = listReconciliationRows(
      [expense({ documentUrl: 'https://storage/invoice.pdf' })],
      ...JULY,
    )

    expect(rows[0]!.status).toBe('manual_ok')
    expect(isOpenReconciliationRow(rows[0]!)).toBe(false)
  })

  it('מספר חשבונית לבדו מספיק לסגירת השורה', () => {
    const rows = listReconciliationRows([expense({ invoiceNumber: '10432' })], ...JULY)

    expect(rows[0]!.status).toBe('manual_ok')
  })

  it('מחרוזת ריקה אינה נחשבת תיעוד', () => {
    expect(hasAttachedDocument(expense({ invoiceNumber: '   ' }))).toBe(false)
    expect(hasAttachedDocument(expense({ documentUrl: '' }))).toBe(false)
  })

  it('משכורת אינה דורשת חשבונית ואינה נספרת כפתוחה', () => {
    const rows = listReconciliationRows(
      [expense({ type: 'salary', vatClass: 'statutory' })],
      ...JULY,
    )

    expect(rows[0]!.status).toBe('document_not_required')
    expect(isOpenReconciliationRow(rows[0]!)).toBe(false)
  })

  it('יובל שכטר נסגר תמיד — החשבונית אצל רואה החשבון', () => {
    const bank = listReconciliationRows(
      [expense({ name: 'יובל שכטר', supplierName: 'יובל שכטר רואה חשבון' })],
      ...JULY,
    )
    expect(bank[0]!.status).toBe('document_not_required')
    expect(isOpenReconciliationRow(bank[0]!)).toBe(false)

    const manual = listOpenReconciliationRows(
      [
        expense({
          name: 'שכטר',
          source: 'manual',
          bankRef: undefined as unknown as string,
        }),
      ],
      ...JULY,
    )
    expect(manual).toHaveLength(0)
  })

  it('הוצאה שהוזנה ידנית ללא חשבונית נספרת כפתוחה', () => {
    const rows = listOpenReconciliationRows(
      [expense({ source: 'manual', bankRef: undefined as unknown as string })],
      ...JULY,
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('manual_pending')
  })
})

describe('אחוז הכיסוי משקלל סכומים ולא שורות', () => {
  it('שורה גדולה ללא חשבונית מורידה את הכיסוי יותר משורה קטנה', () => {
    const coverage = computeExpenseCoverage(
      [
        expense({ id: 'a', amount: 9000, bankRef: 'a' }),
        expense({ id: 'b', amount: 1000, bankRef: 'b', invoiceNumber: '1' }),
      ],
      ...JULY,
    )

    expect(coverage.percent).toBe(10)
  })

  it('הצמדת החשבונית לשורה הגדולה מזיזה את הכיסוי ל-100%', () => {
    const coverage = computeExpenseCoverage(
      [
        expense({ id: 'a', amount: 9000, bankRef: 'a', invoiceNumber: '2' }),
        expense({ id: 'b', amount: 1000, bankRef: 'b', invoiceNumber: '1' }),
      ],
      ...JULY,
    )

    expect(coverage.percent).toBe(100)
  })
})

describe('דוח ההתאמות', () => {
  const expenses = [
    expense({ id: 'a', amount: 9000, bankRef: 'a' }),
    expense({ id: 'b', amount: 1000, bankRef: 'b', invoiceNumber: '1' }),
    // משכורת לא נכנסת לדוח — לא דורשת חשבונית
    expense({ id: 'c', amount: 500, bankRef: 'c', type: 'salary', vatClass: 'statutory' }),
  ]

  it('מפריד בין ממתין למגובה ומסכם את שניהם', () => {
    const data = buildBankReconciliationReport(expenses, '2026-07', '2026-07')

    expect(data.rows).toHaveLength(2)
    expect(data.openRows).toBe(1)
    expect(data.openAmount).toBe(9000)
    expect(data.closedRows).toBe(1)
    expect(data.closedAmount).toBe(1000)
    expect(data.totalAmount).toBe(10000)
  })

  it('לא כולל משכורת/מיסים בדוח, ואחוז הכיסוי רק על שורות שדורשות חשבונית', () => {
    const data = buildBankReconciliationReport(expenses, '2026-07', '2026-07')
    const rowsSum = data.rows.reduce((s, r) => s + r.amount, 0)

    expect(rowsSum).toBe(data.totalAmount)
    expect(data.coveragePercent).toBeCloseTo(10, 1)
    expect(data.rows.every((r) => r.status !== 'document_not_required')).toBe(
      true,
    )
  })

  it('תקופה ריקה אינה מדווחת ככשל', () => {
    const data = buildBankReconciliationReport([], '2026-09', '2026-09')

    expect(data.rows).toHaveLength(0)
    expect(data.coveragePercent).toBe(100)
  })
})
