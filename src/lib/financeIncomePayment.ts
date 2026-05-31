import type {
  FinanceIncome,
  FinanceIncomePaymentRecord,
  FinanceIncomeStatus,
  FinancePaymentMethod,
} from '../types'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function parsePaymentRecord(raw: unknown): FinanceIncomePaymentRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const x = raw as Record<string, unknown>
  const amount = typeof x.amount === 'number' ? x.amount : Number(x.amount)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const methodRaw = String(x.paymentMethod ?? '').trim()
  const paymentMethod: FinancePaymentMethod =
    methodRaw === 'credit_card' ? 'credit_card' : 'bank_transfer'
  const paidDate =
    typeof x.paidDate === 'string' && x.paidDate.trim()
      ? x.paidDate.slice(0, 10)
      : ''
  if (!paidDate) return null
  const id =
    typeof x.id === 'string' && x.id.trim() ? x.id.trim() : crypto.randomUUID()
  const createdAt =
    typeof x.createdAt === 'string' && x.createdAt.trim()
      ? x.createdAt
      : undefined
  return {
    id,
    amount: round2(amount),
    paymentMethod,
    paidDate,
    ...(createdAt ? { createdAt } : {}),
  }
}

/** רשימת תשלומים — כולל המרה מרשומות ישנות */
export function incomePaymentRecords(
  inc: FinanceIncome,
): FinanceIncomePaymentRecord[] {
  if (Array.isArray(inc.payments) && inc.payments.length > 0) {
    return inc.payments
  }
  if (
    (inc.status === 'paid' || inc.status === 'partial') &&
    typeof inc.paidAmount === 'number' &&
    inc.paidAmount > 0
  ) {
    return [
      {
        id: 'legacy',
        amount: round2(inc.paidAmount),
        paymentMethod: inc.paymentMethod ?? 'bank_transfer',
        paidDate: inc.paidDate?.slice(0, 10) ?? inc.invoiceDate.slice(0, 10),
      },
    ]
  }
  return []
}

/** סה״כ ששולם על ההכנסה */
export function incomeTotalPaid(inc: FinanceIncome): number {
  const records = incomePaymentRecords(inc)
  if (records.length > 0) {
    return round2(records.reduce((s, p) => s + p.amount, 0))
  }
  if (inc.status === 'paid') return inc.amount
  if (inc.status === 'partial') return inc.paidAmount ?? 0
  return 0
}

/** סכום שזוכה כהכנסה (שולם בפועל) */
export function incomeRecognizedPaid(inc: FinanceIncome): number {
  return incomeTotalPaid(inc)
}

/** יתרה פתוחה על ההכנסה */
export function incomeOutstandingAmount(inc: FinanceIncome): number {
  if (inc.status === 'paid') return 0
  return Math.max(0, round2(inc.amount - incomeTotalPaid(inc)))
}

/** כמה מהיתרה נכנס ליתרת הלקוח */
export function incomeBalanceDelta(inc: FinanceIncome): number {
  if (inc.status !== 'partial') return 0
  return incomeOutstandingAmount(inc)
}

export function resolveIncomeStatusFromPayment(
  grossAmount: number,
  paidAmount: number,
  selectedStatus: FinanceIncomeStatus,
): FinanceIncomeStatus {
  if (selectedStatus !== 'paid') return selectedStatus
  return resolveIncomeStatusFromPaidTotal(grossAmount, paidAmount)
}

export function resolveIncomeStatusFromPaidTotal(
  grossAmount: number,
  totalPaid: number,
): FinanceIncomeStatus {
  if (totalPaid >= grossAmount - 0.001) return 'paid'
  if (totalPaid > 0) return 'partial'
  return 'pending'
}

export function normalizeIncomePayments(
  inc: FinanceIncome,
): FinanceIncomePaymentRecord[] {
  return incomePaymentRecords(inc).map((p) => ({
    ...p,
    id: p.id === 'legacy' ? crypto.randomUUID() : p.id,
  }))
}

export function maxPaymentAmountForEdit(
  grossAmount: number,
  records: FinanceIncomePaymentRecord[],
  paymentId: string,
): number {
  const others = records
    .filter((p) => p.id !== paymentId)
    .reduce((s, p) => s + p.amount, 0)
  return Math.max(0, round2(grossAmount - others))
}

export type IncomePaymentInput = {
  amount: number
  paymentMethod: FinancePaymentMethod
  paidDate: string
}

export function buildIncomePaymentRecord(
  input: IncomePaymentInput,
): FinanceIncomePaymentRecord {
  return {
    id: crypto.randomUUID(),
    amount: round2(input.amount),
    paymentMethod: input.paymentMethod,
    paidDate: input.paidDate.slice(0, 10),
    createdAt: new Date().toISOString(),
  }
}

export function parseIncomePaymentRecords(raw: unknown): FinanceIncomePaymentRecord[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => parsePaymentRecord(item))
    .filter((p): p is FinanceIncomePaymentRecord => p != null)
}

export const PAYMENT_METHOD_LABEL: Record<FinancePaymentMethod, string> = {
  bank_transfer: 'העברה בנקאית',
  credit_card: 'כרטיס אשראי',
}
