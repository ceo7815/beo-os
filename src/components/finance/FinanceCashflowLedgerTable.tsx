import { Fragment, useEffect, useMemo, useState } from 'react'
import { formatDateIL } from '../../lib/dates'
import { formatNis } from '../../lib/financeCalc'
import type { CashflowLedgerRow } from '../../lib/cashflowCompute'
import { EmptyState } from '../shared/EmptyState'

type Props = {
  rows: CashflowLedgerRow[]
  onVatAmountChange?: (vatYm: string, amount: number) => void | Promise<void>
}

function parseMoneyInput(raw: string): number {
  let s = raw.replace(/[₪\s]/g, '').trim()
  if (!s) return Number.NaN
  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    s = s.replace(/,/g, '')
  } else if (hasComma) {
    s = s.replace(',', '.')
  }
  return Number(s)
}

function VatOutflowEditor({
  vatYm,
  amount,
  onSave,
}: {
  vatYm: string
  amount: number
  onSave: (vatYm: string, amount: number) => void | Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [displayAmount, setDisplayAmount] = useState(amount)

  useEffect(() => {
    if (!editing) setDisplayAmount(amount)
  }, [amount, editing])

  function startEdit() {
    setDraft(String(displayAmount))
    setEditing(true)
  }

  async function commit() {
    const n = parseMoneyInput(draft)
    if (!Number.isFinite(n) || n < 0) {
      setEditing(false)
      return
    }
    const rounded = Math.round(n * 100) / 100
    if (rounded === displayAmount) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      setDisplayAmount(rounded)
      await onSave(vatYm, rounded)
      setEditing(false)
    } catch {
      setDisplayAmount(amount)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <input
        type="text"
        inputMode="decimal"
        autoFocus
        disabled={saving}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void commit()
          }
          if (e.key === 'Escape') setEditing(false)
        }}
        className="w-full min-w-[88px] rounded-md border border-[var(--orange)] bg-white px-1.5 py-0.5 text-[12px] font-bold tabular-nums text-[#DC2626] outline-none"
        title="Enter לשמירה · Esc לביטול"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className="group inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-bold tabular-nums text-[#DC2626] transition hover:bg-[#FEE2E2]/60"
      title="לחצו לעריכת סכום אומדן המע״מ"
    >
      {formatNis(displayAmount)}
      <span className="text-[9px] font-extrabold text-[var(--orange)] opacity-0 transition group-hover:opacity-100">
        ✎
      </span>
    </button>
  )
}

export function FinanceCashflowLedgerTable({ rows, onVatAmountChange }: Props) {
  const txRows = useMemo(
    () => rows.filter((r) => r.kind !== 'opening_balance'),
    [rows],
  )

  if (txRows.length === 0) {
    return (
      <EmptyState
        title="אין תנועות צפויות בתקופה"
        description="שנו את טווח התקופה, עדכנו יתרת פתיחה, או הוסיפו תאריכי צפי לגבייה."
      />
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full min-w-[960px] border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]/90 text-[11px] font-bold text-[var(--text-mid)]">
            <th className="px-2.5 py-2.5 text-right">תאריך</th>
            <th className="px-2.5 py-2.5 text-right">סוג</th>
            <th className="px-2.5 py-2.5 text-right">תיאור</th>
            <th className="px-2.5 py-2.5 text-right">נכנס</th>
            <th className="px-2.5 py-2.5 text-right">יצא</th>
            <th className="px-2.5 py-2.5 text-right">יתרה זמינה</th>
            <th className="px-2.5 py-2.5 text-right">אופן תשלום</th>
            <th className="px-2.5 py-2.5 text-right">הערות</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const prevDate = idx > 0 ? rows[idx - 1]!.date : ''
            const showDateSep = row.date !== prevDate && row.kind !== 'opening_balance'
            const isOpening = row.kind === 'opening_balance'
            const vatYm = row.sourceId ?? row.id.replace(/^vat-/, '')
            const vatEditable =
              row.editable && row.kind === 'vat_payment' && !!onVatAmountChange

            return (
              <Fragment key={row.id}>
                {showDateSep ? (
                  <tr className="bg-[var(--surface-muted)]/40">
                    <td
                      colSpan={8}
                      className="px-2.5 py-1.5 text-[10px] font-extrabold text-[var(--text-mid)]"
                    >
                      {formatDateIL(row.date)}
                    </td>
                  </tr>
                ) : null}
                <tr
                  className={`border-b border-[var(--border)]/70 ${
                    isOpening ? 'bg-[#FFFBEB]/60 font-semibold' : 'hover:bg-black/[0.02]'
                  } ${vatEditable ? 'bg-[#FFF7ED]/30' : ''}`}
                >
                  <td className="whitespace-nowrap px-2.5 py-2 tabular-nums">
                    {formatDateIL(row.date)}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2">
                    <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-bold">
                      {row.category}
                    </span>
                  </td>
                  <td className="max-w-[220px] px-2.5 py-2">{row.description}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 tabular-nums font-bold text-[#059669]">
                    {row.inflow > 0 ? formatNis(row.inflow) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2 tabular-nums">
                    {row.outflow > 0 ? (
                      vatEditable ? (
                        <VatOutflowEditor
                          key={vatYm}
                          vatYm={vatYm}
                          amount={row.outflow}
                          onSave={onVatAmountChange}
                        />
                      ) : (
                        <span className="font-bold text-[#DC2626]">
                          {formatNis(row.outflow)}
                        </span>
                      )
                    ) : (
                      '—'
                    )}
                  </td>
                  <td
                    className={`whitespace-nowrap px-2.5 py-2 tabular-nums font-extrabold ${
                      row.balance >= 0 ? 'text-[var(--text-dark)]' : 'text-[#DC2626]'
                    }`}
                  >
                    {formatNis(row.balance)}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2 text-[var(--text-mid)]">
                    {row.paymentMethod}
                  </td>
                  <td className="max-w-[180px] px-2.5 py-2 text-[11px] leading-snug text-[var(--text-mid)]">
                    {row.notes || '—'}
                  </td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
