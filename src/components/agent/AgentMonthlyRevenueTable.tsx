import { useMemo } from 'react'
import { monthShortLabelHe } from '../../lib/agentRevenue'
import type { AgentRevenueBar } from './AgentRevenueChart'

const ils = (n: number) =>
  new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: n % 1 === 0 ? 0 : 1,
  }).format(n)

export function AgentMonthlyRevenueTable({
  bars,
  commissionPercent,
  incomeColumnHeading = 'הכנסות ששולמו',
}: {
  bars: AgentRevenueBar[]
  commissionPercent: number
  /** לטבלת הכנסות משוערות: «הכנסות משוערות» */
  incomeColumnHeading?: string
}) {
  const rows = useMemo(
    () =>
      bars.map((b) => ({
        ...b,
        commission:
          typeof b.commission === 'number' && Number.isFinite(b.commission)
            ? Math.round(b.commission)
            : Math.round((b.total * commissionPercent) / 100),
      })),
    [bars, commissionPercent],
  )

  const totals = useMemo(() => {
    let rev = 0
    let com = 0
    for (const r of rows) {
      rev += r.total
      com += r.commission
    }
    return { rev: Math.round(rev * 100) / 100, com }
  }, [rows])

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[320px] border-collapse text-sm" dir="rtl">
        <thead className="bg-[var(--surface-muted)]">
          <tr className="text-right text-[11px] font-bold text-[var(--text-light)]">
            <th className="px-3 py-2.5">חודש</th>
            <th className="px-3 py-2.5">{incomeColumnHeading}</th>
            <th className="px-3 py-2.5">עמלה</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ym} className="border-t border-[var(--border)]">
              <td className="px-3 py-2.5 font-semibold text-[var(--text-dark)]">
                {monthShortLabelHe(r.ym)}
              </td>
              <td className="px-3 py-2.5 tabular-nums text-[var(--text-mid)]">{ils(r.total)}</td>
              <td className="px-3 py-2.5 tabular-nums text-[#059669]">{ils(r.commission)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--border)] bg-[#FFFBF7]">
            <td className="px-3 py-2.5 text-xs font-extrabold text-[var(--text-dark)]">סה״כ</td>
            <td className="px-3 py-2.5 text-xs font-extrabold tabular-nums text-[var(--text-dark)]">
              {ils(totals.rev)}
            </td>
            <td className="px-3 py-2.5 text-xs font-extrabold tabular-nums text-[#059669]">
              {ils(totals.com)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
