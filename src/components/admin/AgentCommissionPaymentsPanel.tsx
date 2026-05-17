import { useMemo, useState } from 'react'
import { useAgentCommissionPayments } from '../../hooks/useAgentCommissionPayments'
import { ConfirmDialog } from '../shared/ConfirmDialog'

const ils = (n: number) =>
  new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: n % 1 === 0 ? 0 : 1,
  }).format(n)

function formatYmdHe(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd
  const d = new Date(`${ymd}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ymd
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Props = {
  agentUserId: string
}

export function AgentCommissionPaymentsPanel({ agentUserId }: Props) {
  const { payments, loading, deletePayment } = useAgentCommissionPayments()
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const agentPayments = useMemo(
    () => payments.filter((p) => p.agentUserId === agentUserId),
    [payments, agentUserId],
  )

  if (loading) {
    return <p className="text-[11px] text-[var(--text-mid)]">טוען תשלומים לסוכן…</p>
  }

  if (agentPayments.length === 0) {
    return (
      <p className="text-[11px] text-[var(--text-mid)]">
        עדיין לא נרשמו תשלומים לסוכן זה. השתמשו ב«תשלום לסוכן» לאחר תקבול מהלקוח.
      </p>
    )
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full min-w-[400px] border-collapse text-sm">
          <thead className="bg-[var(--surface-muted)] text-[11px] font-bold text-[var(--text-light)]">
            <tr>
              <th className="px-3 py-2 text-right">תאריך</th>
              <th className="px-3 py-2 text-right">סכום</th>
              <th className="px-3 py-2 text-right">הערה</th>
              <th className="px-3 py-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {agentPayments.map((p) => (
              <tr key={p.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 text-[var(--text-mid)]">{formatYmdHe(p.paidDate)}</td>
                <td className="px-3 py-2 font-bold tabular-nums text-[#059669]">{ils(p.amount)}</td>
                <td className="px-3 py-2 text-[var(--text-mid)]">{p.note ?? '—'}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="text-[10px] font-semibold text-red-600 underline"
                    onClick={() => setDeleteId(p.id)}
                  >
                    מחק
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) void deletePayment(deleteId)
        }}
        message="למחוק רישום תשלום זה לסוכן?"
      />
    </>
  )
}
