import { useEffect, useMemo, useState } from 'react'
import {
  defaultAgentPaymentDateYmd,
  useAgentCommissionPayments,
} from '../../hooks/useAgentCommissionPayments'
import { useAgentWorkspaceForUid } from '../../hooks/useAgentWorkspaceForUid'
import {
  commissionOnPaidAllTimeForClients,
  effectiveCommissionPercent,
  sumAgentCommissionPayments,
} from '../../lib/agentRevenue'
import type { TeamMember } from '../../types'

const ils = (n: number) =>
  new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: n % 1 === 0 ? 0 : 1,
  }).format(n)

type Props = {
  agent: TeamMember
  isOpen: boolean
  onClose: () => void
}

export function RecordAgentPaymentDialog({ agent, isOpen, onClose }: Props) {
  const { payments, addPayment } = useAgentCommissionPayments()
  const { myInvoices, myClientIds } = useAgentWorkspaceForUid(agent.id)

  const [amount, setAmount] = useState('')
  const [paidDate, setPaidDate] = useState(defaultAgentPaymentDateYmd())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const pct = effectiveCommissionPercent(agent.agentCommissionPercent)

  const accrued = useMemo(
    () => commissionOnPaidAllTimeForClients(myInvoices, myClientIds, pct),
    [myInvoices, myClientIds, pct],
  )

  const paidToAgent = useMemo(
    () => sumAgentCommissionPayments(payments, new Set([agent.id])),
    [payments, agent.id],
  )

  const balance = Math.round((accrued - paidToAgent) * 100) / 100

  useEffect(() => {
    if (!isOpen) return
    setAmount('')
    setPaidDate(defaultAgentPaymentDateYmd())
    setNote('')
  }, [isOpen, agent.id])

  if (!isOpen) return null

  const submit = async () => {
    const n = Math.round(Number(amount.replace(',', '.')) * 100) / 100
    if (!Number.isFinite(n) || n <= 0) return
    setSaving(true)
    try {
      await addPayment({
        agentUserId: agent.id,
        amount: n,
        paidDate,
        note: note.trim() || undefined,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-agent-payment-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border-orange-soft)] bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="record-agent-payment-title" className="text-base font-extrabold text-[var(--text-dark)]">
          תשלום לסוכן — {agent.name}
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-mid)]">
          רישום כסף ששילמתם לסוכן <strong className="font-bold">אחרי</strong> שתועד תקבול מהלקוח. זה
          לא רישום תקבול מלקוח.
        </p>

        <div className="mt-3 rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-[11px] text-[var(--text-mid)]">
          <p>
            עמלה שנצברה (על תקבולים):{' '}
            <strong className="text-[var(--text-dark)]">{ils(accrued)}</strong>
          </p>
          <p className="mt-0.5">
            כבר שולם לסוכן: <strong className="text-[var(--text-dark)]">{ils(paidToAgent)}</strong>
          </p>
          <p className="mt-0.5 font-bold text-[#059669]">יתרה מומלצת: {ils(Math.max(0, balance))}</p>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-[11px] font-bold text-[var(--text-mid)]">סכום (₪)</span>
            <input
              type="number"
              min={0}
              step={0.01}
              dir="ltr"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2 text-sm font-semibold"
              placeholder={balance > 0 ? String(balance) : '0'}
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold text-[var(--text-mid)]">תאריך תשלום</span>
            <input
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold text-[var(--text-mid)]">הערה (אופציונלי)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2 text-sm"
              placeholder="למשל אסמכתא / חודש"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-bold text-[var(--text-mid)]"
            onClick={onClose}
            disabled={saving}
          >
            ביטול
          </button>
          <button
            type="button"
            className="hub-btn-primary rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-50"
            disabled={saving || !amount.trim()}
            onClick={() => void submit()}
          >
            {saving ? 'שומר…' : 'רשום תשלום'}
          </button>
        </div>
      </div>
    </div>
  )
}
