import { useEffect, useMemo, useState } from 'react'
import { formatNis } from '../../lib/financeCalc'
import {
  expectedCollectionPatchFromRows,
  expectedCollectionRowsFromIncome,
  rowsToExpectedCollectionSchedule,
  scheduleRowsTotal,
  type ExpectedCollectionRow,
} from '../../lib/expectedCollectionSchedule'
import type { FinanceIncome } from '../../types'

type Props = {
  income: FinanceIncome
  outstanding: number
  onSave: (
    patch: ReturnType<typeof expectedCollectionPatchFromRows>,
  ) => void | Promise<void>
}

function newRow(amountHint = ''): ExpectedCollectionRow {
  return {
    id: crypto.randomUUID(),
    date: '',
    amount: amountHint,
  }
}

function rowsKey(rows: ExpectedCollectionRow[]): string {
  return rows
    .map((r) => `${r.id}|${r.date}|${r.amount}`)
    .join(';')
}

export function ExpectedCollectionScheduleEditor({
  income,
  outstanding,
  onSave,
}: Props) {
  const savedRows = useMemo(
    () => expectedCollectionRowsFromIncome(income, outstanding),
    [income, outstanding],
  )
  const savedKey = useMemo(
    () =>
      `${income.expectedPaymentDate ?? ''}|${JSON.stringify(income.expectedPaymentSchedule ?? [])}|${outstanding}`,
    [income.expectedPaymentDate, income.expectedPaymentSchedule, outstanding],
  )

  const [rows, setRows] = useState<ExpectedCollectionRow[]>(savedRows)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setRows(savedRows)
    setError('')
  }, [income.id, savedKey, savedRows])

  const total = useMemo(() => scheduleRowsTotal(rows), [rows])
  const remainder = useMemo(
    () => Math.round((outstanding - total) * 100) / 100,
    [outstanding, total],
  )
  const sumMismatch =
    rows.some((r) => r.date.trim() || r.amount.trim()) && Math.abs(remainder) > 0.01
  const isDirty = rowsKey(rows) !== rowsKey(savedRows)
  const validSchedule = useMemo(() => rowsToExpectedCollectionSchedule(rows), [rows])
  const canSave = validSchedule.length > 0 && isDirty && !saving

  const updateRow = (id: string, patch: Partial<ExpectedCollectionRow>) => {
    setError('')
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const addRow = () => {
    setError('')
    const hint =
      remainder > 0 ? String(remainder) : outstanding > 0 ? String(outstanding) : ''
    setRows((prev) => [...prev, newRow(hint)])
  }

  const removeRow = (id: string) => {
    setError('')
    setRows((prev) => {
      if (prev.length <= 1) return [newRow(String(outstanding))]
      return prev.filter((r) => r.id !== id)
    })
  }

  const splitEvenly = () => {
    if (rows.length < 2 || outstanding <= 0) return
    setError('')
    const each = Math.round((outstanding / rows.length) * 100) / 100
    let assigned = 0
    setRows((prev) =>
      prev.map((r, i) => {
        const amt =
          i === prev.length - 1
            ? Math.round((outstanding - assigned) * 100) / 100
            : each
        assigned += amt
        return { ...r, amount: String(amt) }
      }),
    )
  }

  const handleSave = async () => {
    setError('')
    const schedule = rowsToExpectedCollectionSchedule(rows)
    if (schedule.length === 0) {
      setError('יש למלא לפחות שורה עם תאריך וסכום')
      return
    }
    if (Math.abs(remainder) > 0.01) {
      setError(`סכום התשלומים חייב להיות שווה ליתרה (${formatNis(outstanding)})`)
      return
    }
    setSaving(true)
    try {
      await onSave(expectedCollectionPatchFromRows(rows))
    } catch {
      setError('שגיאה בשמירה — נסו שוב')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_120px_32px] gap-2 px-0.5 text-[10px] font-bold text-[var(--text-mid)]">
        <span>תאריך צפי</span>
        <span>סכום</span>
        <span aria-hidden />
      </div>

      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div
            key={row.id}
            className="grid grid-cols-[1fr_120px_32px] items-center gap-2"
          >
            <input
              type="date"
              value={row.date}
              onChange={(e) => updateRow(row.id, { date: e.target.value })}
              className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--dash-panel-bg)] px-2.5 py-2 text-[13px] outline-none focus:border-[var(--orange)]"
              aria-label={`תאריך צפי ${idx + 1}`}
            />
            <input
              type="text"
              inputMode="decimal"
              value={row.amount}
              onChange={(e) => updateRow(row.id, { amount: e.target.value })}
              placeholder="0"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--dash-panel-bg)] px-2.5 py-2 text-[13px] tabular-nums outline-none focus:border-[var(--orange)]"
              aria-label={`סכום ${idx + 1}`}
            />
            {rows.length > 1 ? (
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[16px] font-bold text-[var(--text-mid)] transition hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                title="הסר תשלום"
                aria-label="הסר תשלום"
              >
                ×
              </button>
            ) : (
              <span className="h-8 w-8 shrink-0" aria-hidden />
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)]/60 pt-3">
        <button
          type="button"
          onClick={addRow}
          className="rounded-lg border border-[var(--border-orange-soft)] bg-[var(--orange-light)] px-3 py-1.5 text-[11px] font-bold text-[var(--orange)] transition hover:brightness-95"
        >
          + תשלום
        </button>
        {rows.length > 1 ? (
          <button
            type="button"
            onClick={splitEvenly}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)]"
          >
            חלק שווה
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-[var(--surface-muted)]/50 px-3 py-2.5">
        <div className="min-w-0 space-y-0.5">
          {sumMismatch ? (
            <p className="text-[12px] font-bold text-[#92400E]">
              סה״כ {formatNis(total)} · נותר {formatNis(remainder)} מתוך{' '}
              {formatNis(outstanding)}
            </p>
          ) : validSchedule.length > 0 ? (
            <p className="text-[12px] text-[var(--text-mid)]">
              {validSchedule.length > 1
                ? `${validSchedule.length} תשלומים · ${formatNis(total)}`
                : `תשלום אחד · ${formatNis(total)}`}
            </p>
          ) : (
            <p className="text-[12px] text-[var(--text-mid)]">
              יתרה לגבייה: {formatNis(outstanding)}
            </p>
          )}
          {error ? (
            <p className="text-[11px] font-bold text-[#DC2626]">{error}</p>
          ) : null}
          {isDirty ? (
            <p className="text-[10px] font-semibold text-[var(--orange)]">
              יש שינויים שלא נשמרו
            </p>
          ) : null}
        </div>

        <button
          type="button"
          disabled={!canSave}
          onClick={() => void handleSave()}
          className="shrink-0 rounded-[10px] bg-[var(--orange)] px-4 py-2 text-[12px] font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'שומר…' : 'שמור תשלומים'}
        </button>
      </div>
    </div>
  )
}
