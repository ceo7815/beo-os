import type { ReactNode } from 'react'
import { Modal } from '../shared/Modal'
import { formatDateIL } from '../../lib/dates'
import {
  formatNis,
  profitLossExpensesForMonth,
  profitLossIncomesForMonth,
} from '../../lib/financeCalc'
import {
  FINANCE_INCOME_DOCUMENT_LABELS,
  incomeDocumentKind,
} from '../../lib/financeIncomeDocument'
import { incomePaymentDate } from '../../lib/financeIncomePayment'
import {
  expenseDisplayName,
  resolveExpenseType,
} from '../../lib/financeExpenseTypes'
import {
  EXPENSE_VAT_CLASS_SHORT,
  resolveExpenseVatClass,
} from '../../lib/financeExpenseVat'
import { expenseAccrualMonth, isSalaryLikeExpense } from '../../lib/financeSalaryMonth'
import { resolveExpenseRowVat, resolveIncomeVat } from '../../lib/israeliVat'
import type {
  FinanceExpense,
  FinanceExpenseTypeDef,
  FinanceIncome,
} from '../../types'
import type { ClientFinanceTarget } from './ClientFinanceCardModal'
import { FinanceClickable } from './FinanceClickable'

export type PnlMonthDetailKind = 'income' | 'expense'

export type PnlMonthDetail = {
  ym: string
  label: string
  kind: PnlMonthDetailKind
}

type DetailCell =
  | string
  | { text: string; className?: string }
  | { node: ReactNode; className?: string }

function DetailTable({
  columns,
  rows,
  empty,
}: {
  columns: string[]
  rows: DetailCell[][]
  empty: string
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-4 text-center text-[12px] text-[var(--text-mid)]">
        {empty}
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]/50 text-[11px] font-bold text-[var(--text-mid)]">
            {columns.map((c, i) => (
              <th
                key={c}
                className={`px-2.5 py-2 ${i === columns.length - 1 ? 'text-left' : 'text-right'}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, ri) => (
            <tr
              key={ri}
              className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-muted)]/40"
            >
              {cells.map((cell, ci) => {
                const isObj = typeof cell === 'object' && cell !== null
                const hasNode = isObj && 'node' in cell
                const text = !isObj
                  ? cell
                  : hasNode
                    ? null
                    : (cell as { text: string }).text
                const node = hasNode
                  ? (cell as { node: ReactNode }).node
                  : null
                const cls = isObj
                  ? (cell as { className?: string }).className
                  : undefined
                return (
                  <td
                    key={ci}
                    className={`px-2.5 py-2 ${ci === cells.length - 1 ? 'text-left tabular-nums font-bold' : 'text-right'} ${cls ?? ''}`}
                  >
                    {node ?? text}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function FinancePnlMonthDetailModal({
  detail,
  onClose,
  incomes,
  expenses,
  expenseTypes,
  clientNameById,
  onClientClick,
}: {
  detail: PnlMonthDetail | null
  onClose: () => void
  incomes: FinanceIncome[]
  expenses: FinanceExpense[]
  expenseTypes: FinanceExpenseTypeDef[]
  clientNameById: Map<string, string>
  onClientClick?: (target: ClientFinanceTarget) => void
}) {
  if (!detail) return null

  const expenseTypeById = new Map(expenseTypes.map((t) => [t.id, t]))
  const isIncome = detail.kind === 'income'

  const monthIncomes = profitLossIncomesForMonth(incomes, detail.ym)
  const monthExpenses = profitLossExpensesForMonth(
    expenses,
    expenseTypes,
    detail.ym,
  )

  const items = isIncome ? monthIncomes : monthExpenses
  const totalGross = items.reduce((sum, item) => {
    if (isIncome) {
      return sum + resolveIncomeVat(item as FinanceIncome).gross
    }
    return sum + resolveExpenseRowVat(item as FinanceExpense).gross
  }, 0)

  const title = isIncome
    ? `הכנסות — ${detail.label}`
    : `הוצאות — ${detail.label}`

  return (
    <Modal isOpen onClose={onClose} title={title} size="lg">
      <div className="space-y-4">
        <p className="text-[12px] leading-relaxed text-[var(--text-mid)]">
          {isIncome
            ? 'מסמכי הכנסה שנספרו בדוח רווח והפסד לחודש זה (חשבונית מס קבלה + חשבונית מס − זיכוי).'
            : 'הוצאות שנספרו בדוח רווח והפסד לחודש זה — לפי חודש דיווח (למשל משכורת מאי גם אם שולמה ביוני).'}
        </p>

        {isIncome ? (
          <DetailTable
            columns={['סוג מסמך', 'תאריך', 'לקוח', 'ברוטו']}
            empty="אין הכנסות בחודש זה"
            rows={monthIncomes.map((inc) => {
              const kind = incomeDocumentKind(inc)
              const vat = resolveIncomeVat(inc)
              const date =
                kind === 'tax_invoice_receipt' || kind === 'receipt'
                  ? incomePaymentDate(inc)
                  : inc.invoiceDate
              const client =
                clientNameById.get(inc.clientId) ??
                inc.greenInvoiceClientName ??
                '—'
              const clientCell: DetailCell =
                client !== '—' && onClientClick
                  ? {
                      node: (
                        <FinanceClickable
                          title="כרטיס פיננסי ללקוח"
                          onClick={() =>
                            onClientClick({
                              clientId: inc.clientId?.trim() || undefined,
                              clientName: client,
                              guestName: !inc.clientId?.trim()
                                ? client
                                : undefined,
                            })
                          }
                        >
                          {client}
                        </FinanceClickable>
                      ),
                    }
                  : client
              return [
                FINANCE_INCOME_DOCUMENT_LABELS[kind],
                formatDateIL(date),
                clientCell,
                { text: formatNis(vat.gross), className: 'text-[#10B981]' },
              ]
            })}
          />
        ) : (
          <DetailTable
            columns={['שם', 'סוג', 'חודש דיווח', 'ברוטו']}
            empty="אין הוצאות בחודש זה"
            rows={monthExpenses.map((exp) => {
              const typeDef = resolveExpenseType(exp.type, expenseTypeById)
              const breakdown = resolveExpenseRowVat(exp)
              const reportYm = expenseAccrualMonth(exp)
              const paidNote =
                isSalaryLikeExpense(exp) && exp.paidDate
                  ? ` · שולם ${formatDateIL(exp.paidDate)}`
                  : ''
              return [
                expenseDisplayName(exp, typeDef),
                EXPENSE_VAT_CLASS_SHORT[resolveExpenseVatClass(exp)],
                `${reportYm.slice(5, 7)}/${reportYm.slice(0, 4)}${paidNote}`,
                { text: formatNis(breakdown.gross), className: 'text-[#EF4444]' },
              ]
            })}
          />
        )}

        <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 px-4 py-3">
          <span className="text-[13px] font-bold text-[var(--text-dark)]">
            סה״כ ({items.length} {isIncome ? 'מסמכים' : 'הוצאות'})
          </span>
          <span
            className={`text-[18px] font-extrabold tabular-nums ${isIncome ? 'text-[#10B981]' : 'text-[#EF4444]'}`}
          >
            {formatNis(Math.round(totalGross * 100) / 100)}
          </span>
        </div>
      </div>
    </Modal>
  )
}
