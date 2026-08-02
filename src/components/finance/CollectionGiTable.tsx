import { todayYmd } from '../../lib/dates'
import { formatDateIL } from '../../lib/dates'
import {
  formatNis,
  INCOME_STATUS_LABEL,
  INCOME_STATUS_STYLE,
} from '../../lib/financeCalc'
import { incomeOutstandingAmount } from '../../lib/financeIncomePayment'
import type { FinanceIncome } from '../../types'

function daysOpen(invoiceDate: string, today = todayYmd()): number {
  const due = invoiceDate.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return 0
  const ms =
    new Date(today.slice(0, 10)).getTime() - new Date(due).getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}

export function CollectionGiTable({
  rows,
  clientNameById,
  projectNameById,
}: {
  rows: FinanceIncome[]
  clientNameById: Map<string, string>
  projectNameById: Map<string, string>
}) {
  if (rows.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-[var(--text-mid)]">
        אין חשבונות עסקה בטווח הנבחר
      </p>
    )
  }

  const totals = rows.reduce(
    (acc, row) => {
      acc.amount += row.amount
      acc.outstanding += incomeOutstandingAmount(row)
      return acc
    },
    { amount: 0, outstanding: 0 },
  )
  const round2 = (n: number) => Math.round(n * 100) / 100

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead className="sticky top-0 z-[1]">
          <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]/80 text-[11px] font-bold text-[var(--text-mid)] backdrop-blur-sm">
            <th className="px-2.5 py-2.5 text-right">תאריך מסמך</th>
            <th className="px-2.5 py-2.5 text-right">מספר</th>
            <th className="px-2.5 py-2.5 text-right">לקוח</th>
            <th className="px-2.5 py-2.5 text-right">פרויקט</th>
            <th className="px-2.5 py-2.5 text-right">סכום</th>
            <th className="px-2.5 py-2.5 text-right">יתרה פתוחה</th>
            <th className="px-2.5 py-2.5 text-right">ימים פתוח</th>
            <th className="px-2.5 py-2.5 text-right">סטטוס</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const badge = INCOME_STATUS_STYLE[row.status]
            const openDays = daysOpen(row.invoiceDate)
            const outstanding = incomeOutstandingAmount(row)
            const isPartial =
              row.status === 'partial' ||
              (typeof row.paidAmount === 'number' &&
                row.paidAmount > 0 &&
                outstanding > 0)
            return (
              <tr
                key={`${row.id}-${row.invoiceDate}`}
                className={`border-b border-[var(--border)]/80 transition ${
                  isPartial
                    ? 'bg-[#FFFBEB] hover:bg-[#FEF3C7]'
                    : openDays > 30 && outstanding > 0
                      ? 'bg-[#FEF2F2] hover:bg-[#FEE2E2]'
                      : 'hover:bg-[var(--surface-muted)]/70'
                }`}
              >
                <td className="px-2.5 py-3 tabular-nums">
                  {formatDateIL(row.invoiceDate)}
                </td>
                <td className="px-2.5 py-3 tabular-nums text-[11px]">
                  #{row.invoiceNumber || row.greenInvoiceNumber || '—'}
                </td>
                <td className="px-2.5 py-3">
                  {clientNameById.get(row.clientId) ??
                    row.greenInvoiceClientName ??
                    '—'}
                </td>
                <td className="px-2.5 py-3">
                  {projectNameById.get(row.projectId) ?? '—'}
                </td>
                <td className="px-2.5 py-3 tabular-nums font-bold">
                  {formatNis(row.amount)}
                </td>
                <td className="px-2.5 py-3 tabular-nums font-extrabold text-[#D97706]">
                  {formatNis(outstanding)}
                </td>
                <td className="px-2.5 py-3 tabular-nums">
                  <span
                    className={
                      openDays > 30
                        ? 'font-bold text-[#DC2626]'
                        : openDays > 14
                          ? 'font-semibold text-[#D97706]'
                          : ''
                    }
                  >
                    {openDays} ימים
                  </span>
                </td>
                <td className="px-2.5 py-3">
                  <span
                    className="inline-block rounded-lg px-2 py-0.5 text-[10px] font-bold"
                    style={{ backgroundColor: badge.bg, color: badge.color }}
                  >
                    {INCOME_STATUS_LABEL[row.status]}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-muted)]/70 text-[13px] font-extrabold text-[var(--text-dark)]">
            <td className="px-2.5 py-3" colSpan={4}>
              סה״כ ({rows.length})
            </td>
            <td className="px-2.5 py-3 tabular-nums">
              {formatNis(round2(totals.amount))}
            </td>
            <td className="px-2.5 py-3 tabular-nums text-[#D97706]">
              {formatNis(round2(totals.outstanding))}
            </td>
            <td className="px-2.5 py-3" colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
