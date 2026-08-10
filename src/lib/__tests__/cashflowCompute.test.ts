import { describe, expect, it } from 'vitest'
import { buildCashflowLedger, computeCashflowForecast } from '../cashflowCompute'
import type { FinanceExpense, FinanceIncome } from '../../types'

const baseIncome: FinanceIncome = {
  id: 'i1',
  projectId: '',
  clientId: 'c1',
  amount: 1000,
  invoiceNumber: 'TX-1',
  invoiceDate: '2026-02-01',
  status: 'pending',
  documentKind: 'transaction_account',
  greenInvoiceStatus: 0,
  createdAt: '2026-02-01T00:00:00.000Z',
}

const baseExpense: FinanceExpense = {
  id: 'e1',
  type: 'fixed',
  amount: 500,
  recurring: true,
  billingMonth: '2026-01',
  paidDate: '2026-01-05',
  name: 'Google Workspace',
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('computeCashflowForecast', () => {
  it('includes split collection lines from expectedPaymentSchedule', () => {
    const result = computeCashflowForecast({
      openingBalance: 10000,
      asOfDate: '2026-08-01',
      ymFrom: '2026-08',
      ymTo: '2026-12',
      giRecurring: [],
      giRetainers: [],
      incomes: [
        {
          ...baseIncome,
          amount: 1000,
          greenInvoiceClientName: 'לקוח דוגמה',
          expectedPaymentSchedule: [
            { id: 'p1', expectedDate: '2026-09-01', amount: 400 },
            { id: 'p2', expectedDate: '2026-10-15', amount: 600 },
          ],
        },
      ],
      expenses: [],
      expenseTypes: [],
    })
    const txn = result.lines.filter((l) => l.kind === 'collection_txn')
    expect(txn).toHaveLength(2)
    expect(txn[0]?.amount).toBe(400)
    expect(txn[0]?.date).toBe('2026-09-01')
    expect(txn[1]?.amount).toBe(600)
    expect(txn[1]?.date).toBe('2026-10-15')
    expect(txn[0]?.label).toBe('גבייה (1/2) · לקוח דוגמה')
    expect(txn[1]?.label).toBe('גבייה (2/2) · לקוח דוגמה')
    expect(result.missingExpectedDates).toBe(0)
  })

  it('includes collection line when expectedPaymentDate is set', () => {
    const result = computeCashflowForecast({
      openingBalance: 10000,
      asOfDate: '2026-08-01',
      ymFrom: '2026-08',
      ymTo: '2026-12',
      giRecurring: [],
      giRetainers: [],
      incomes: [
        {
          ...baseIncome,
          expectedPaymentDate: '2026-09-15',
        },
      ],
      expenses: [],
      expenseTypes: [],
    })
    const txn = result.lines.filter((l) => l.kind === 'collection_txn')
    expect(txn).toHaveLength(1)
    expect(txn[0]?.amount).toBe(1000)
    expect(txn[0]?.date).toBe('2026-09-15')
  })

  it('projects fixed expense catalog as outflow', () => {
    const result = computeCashflowForecast({
      openingBalance: 5000,
      asOfDate: '2026-08-01',
      ymFrom: '2026-08',
      ymTo: '2026-09',
      giRecurring: [],
      giRetainers: [],
      incomes: [],
      expenses: [],
      expenseTypes: [],
      fixedExpenseCatalog: [
        {
          id: 'cat-1',
          type: 'fixed',
          name: 'Google Workspace',
          amount: 500,
          paymentMethod: 'bank_transfer',
          dayOfMonth: 5,
        },
      ],
    })
    const out = result.lines.filter((l) => l.kind === 'expense_recurring')
    expect(out.length).toBeGreaterThan(0)
    expect(out.every((l) => l.amount < 0)).toBe(true)
  })

  it('counts missing expected dates without adding txn lines', () => {
    const result = computeCashflowForecast({
      openingBalance: 0,
      asOfDate: '2026-08-01',
      ymFrom: '2026-08',
      ymTo: '2026-12',
      giRecurring: [],
      giRetainers: [],
      incomes: [baseIncome],
      expenses: [],
      expenseTypes: [],
    })
    expect(result.missingExpectedDates).toBe(1)
    expect(result.lines.some((l) => l.kind === 'collection_txn')).toBe(false)
  })

  it('projects credit card fixed catalog expense on 2nd of next month', () => {
    const result = computeCashflowForecast({
      openingBalance: 5000,
      asOfDate: '2026-08-01',
      ymFrom: '2026-08',
      ymTo: '2026-09',
      giRecurring: [],
      giRetainers: [],
      incomes: [],
      expenses: [],
      expenseTypes: [],
      fixedExpenseCatalog: [
        {
          id: 'cat-cc',
          type: 'fixed',
          name: 'Claude Team',
          amount: 395.64,
          paymentMethod: 'credit_card',
          dayOfMonth: 1,
        },
      ],
    })
    const augBill = result.lines.find(
      (l) => l.kind === 'expense_recurring' && l.id.endsWith('-2026-08'),
    )
    expect(augBill?.date).toBe('2026-09-02')
  })

  it('includes manual expected expense in forecast', () => {
    const result = computeCashflowForecast({
      openingBalance: 5000,
      asOfDate: '2026-08-01',
      ymFrom: '2026-08',
      ymTo: '2026-12',
      giRecurring: [],
      giRetainers: [],
      incomes: [],
      expenses: [],
      expenseTypes: [],
      expectedExpenses: [
        {
          id: 'm1',
          name: 'מקדמה לספק',
          amount: 3000,
          expectedDate: '2026-09-10',
          paymentMethod: 'bank_transfer',
          notes: 'ידני',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    })
    const line = result.lines.find((l) => l.kind === 'expense_expected')
    expect(line?.amount).toBe(-3000)
    expect(line?.date).toBe('2026-09-10')
    expect(line?.label).toBe('הוצאה צפויה · מקדמה לספק')
  })

  it('shifts credit card expected expense to 2nd of next month', () => {
    const result = computeCashflowForecast({
      openingBalance: 5000,
      asOfDate: '2026-08-01',
      ymFrom: '2026-08',
      ymTo: '2026-12',
      giRecurring: [],
      giRetainers: [],
      incomes: [],
      expenses: [],
      expenseTypes: [],
      expectedExpenses: [
        {
          id: 'm2',
          name: 'יונתן דובאי',
          amount: 5250,
          expectedDate: '2026-08-10',
          paymentMethod: 'credit_card',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    })
    const line = result.lines.find((l) => l.kind === 'expense_expected')
    expect(line?.date).toBe('2026-09-02')
    expect(line?.amount).toBe(-5250)
  })

  it('shows prior month VAT on bank date 2nd (e.g. Jul VAT on 02/09)', () => {
    const incomes: FinanceIncome[] = [
      {
        ...baseIncome,
        documentKind: 'tax_invoice_receipt',
        invoiceDate: '2026-07-10',
        amount: 11800,
      },
    ]
    const result = computeCashflowForecast({
      openingBalance: 5000,
      asOfDate: '2026-08-01',
      ymFrom: '2026-08',
      ymTo: '2026-12',
      giRecurring: [],
      giRetainers: [],
      incomes,
      expenses: [],
      expenseTypes: [],
    })
    const vat = result.lines.find(
      (l) => l.kind === 'vat_payment' && l.sourceId === '2026-07',
    )
    expect(vat?.date).toBe('2026-09-02')
  })

  it('uses manual VAT estimate override when set', () => {
    const incomes: FinanceIncome[] = [
      {
        ...baseIncome,
        documentKind: 'tax_invoice_receipt',
        invoiceDate: '2026-08-10',
        amount: 11800,
      },
    ]
    const result = computeCashflowForecast({
      openingBalance: 5000,
      asOfDate: '2026-08-01',
      ymFrom: '2026-08',
      ymTo: '2026-12',
      giRecurring: [],
      giRetainers: [],
      incomes,
      expenses: [],
      expenseTypes: [],
      vatEstimates: [
        {
          id: '2026-08',
          vatYm: '2026-08',
          amount: 12000,
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    })
    const vat = result.lines.find(
      (l) => l.kind === 'vat_payment' && l.sourceId === '2026-08',
    )
    expect(vat?.amount).toBe(-12000)
    expect(vat?.confidence).toBe('manual')
  })

  it('projects VAT estimate on credit card bank date (2nd after 15th charge)', () => {
    const incomes: FinanceIncome[] = [
      {
        ...baseIncome,
        documentKind: 'tax_invoice_receipt',
        invoiceDate: '2026-08-10',
        amount: 11700,
      },
    ]
    const result = computeCashflowForecast({
      openingBalance: 5000,
      asOfDate: '2026-08-01',
      ymFrom: '2026-08',
      ymTo: '2026-12',
      giRecurring: [],
      giRetainers: [],
      incomes,
      expenses: [],
      expenseTypes: [],
    })
    const vat = result.lines.find((l) => l.kind === 'vat_payment' && l.sourceId === '2026-08')
    expect(vat).toBeDefined()
    expect(vat?.date).toBe('2026-10-02')
    expect(vat?.amount).toBe(-1784.75)
    expect(vat?.label).toBe('אומדן מע״מ · 2026-08')
    expect(vat?.confidence).toBe('medium')

    const ledger = buildCashflowLedger({
      forecast: result,
      asOfDate: '2026-08-01',
      incomes,
    })
    const row = ledger.find((r) => r.kind === 'vat_payment')
    expect(row?.paymentMethod).toBe('כרטיס אשראי')
    expect(row?.notes).toContain('אומדן בלבד')
    expect(row?.notes).toContain('15/09/2026')
    expect(row?.outflow).toBe(1784.75)
  })

  it('builds ledger with running balance', () => {
    const incomes = [
      {
        ...baseIncome,
        expectedPaymentDate: '2026-09-15',
      },
    ]
    const result = computeCashflowForecast({
      openingBalance: 10000,
      asOfDate: '2026-08-01',
      ymFrom: '2026-08',
      ymTo: '2026-12',
      giRecurring: [],
      giRetainers: [],
      incomes,
      expenses: [],
      expenseTypes: [],
    })
    const ledger = buildCashflowLedger({
      forecast: result,
      asOfDate: '2026-08-01',
      incomes,
    })
    expect(ledger[0]?.balance).toBe(10000)
    const txn = ledger.find((r) => r.kind === 'collection_txn')
    expect(txn?.inflow).toBe(1000)
    expect(txn?.balance).toBe(11000)
  })
})
