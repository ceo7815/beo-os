import { useEffect, useMemo, useState } from 'react'
import {
  buildMonthlyScheduledPayments,
  dealScheduleHint,
  earliestPaymentYmdFromSchedule,
  normalizedScheduledPayments,
  validateScheduledPayments,
} from '../../lib/dealSchedule'
import { toastFsError } from '../../lib/fsToast'
import type { Deal, DealKind, DealScheduledPayment } from '../../types'

export type ScheduleRow = {
  id: string
  expectedPaymentYmd: string
  amount: string
  label: string
}

function newRow(partial?: Partial<ScheduleRow>): ScheduleRow {
  return {
    id: partial?.id ?? crypto.randomUUID(),
    expectedPaymentYmd: partial?.expectedPaymentYmd ?? '',
    amount: partial?.amount ?? '',
    label: partial?.label ?? '',
  }
}

function rowsFromDeal(deal: Deal): ScheduleRow[] {
  const payments = normalizedScheduledPayments(deal)
  if (payments.length === 0) return [newRow()]
  return payments.map((p) =>
    newRow({
      id: p.id,
      expectedPaymentYmd: p.expectedPaymentYmd,
      amount: String(p.amount),
      label: p.label ?? '',
    }),
  )
}

export function rowsToScheduledPayments(rows: ScheduleRow[]): DealScheduledPayment[] {
  const out: DealScheduledPayment[] = []
  for (const r of rows) {
    const ymd = r.expectedPaymentYmd.trim().slice(0, 10)
    const amount = Number(r.amount.replace(',', '.'))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !Number.isFinite(amount) || amount <= 0) continue
    out.push({
      id: r.id,
      expectedPaymentYmd: ymd,
      amount: Math.round(amount * 100) / 100,
      ...(r.label.trim() ? { label: r.label.trim() } : {}),
    })
  }
  return out
}

type Props = {
  dealKind: DealKind
  isHostingDeal?: boolean
  /** סכום מוסכם — ממלא שורה ראשונה / יצירה חודשית */
  agreedAmountHint?: string
  initialDeal?: Deal
  rows?: ScheduleRow[]
  onRowsChange?: (rows: ScheduleRow[]) => void
  onSave?: (payments: DealScheduledPayment[], patch: Record<string, string | undefined>) => void
  compact?: boolean
}

export function DealPaymentScheduleEditor({
  dealKind,
  isHostingDeal = false,
  agreedAmountHint = '',
  initialDeal,
  rows: controlledRows,
  onRowsChange,
  onSave,
  compact = false,
}: Props) {
  const [internalRows, setInternalRows] = useState<ScheduleRow[]>(() =>
    initialDeal ? rowsFromDeal(initialDeal) : [newRow({ amount: agreedAmountHint })],
  )
  const [bulkCount, setBulkCount] = useState('6')
  const [bulkStart, setBulkStart] = useState('')

  const rows =
    controlledRows !== undefined && controlledRows.length > 0 ? controlledRows : internalRows
  const setRows = (next: ScheduleRow[] | ((prev: ScheduleRow[]) => ScheduleRow[])) => {
    const resolved = typeof next === 'function' ? next(rows) : next
    if (onRowsChange) onRowsChange(resolved)
    else setInternalRows(resolved)
  }

  useEffect(() => {
    if (!initialDeal) return
    setRows(rowsFromDeal(initialDeal))
  }, [initialDeal?.id])

  useEffect(() => {
    if (initialDeal || !agreedAmountHint) return
    setRows((prev) => {
      if (prev.length !== 1 || prev[0].amount) return prev
      return [newRow({ ...prev[0], amount: agreedAmountHint })]
    })
  }, [agreedAmountHint, initialDeal])

  const paymentsPreview = useMemo(() => rowsToScheduledPayments(rows), [rows])

  const addRow = () => setRows([...rows, newRow({ amount: agreedAmountHint })])
  const removeRow = (id: string) => {
    if (rows.length <= 1) return
    setRows(rows.filter((r) => r.id !== id))
  }

  const generateMonthly = () => {
    const start = bulkStart.trim().slice(0, 10) || rows[0]?.expectedPaymentYmd?.trim().slice(0, 10)
    const count = Math.min(36, Math.max(1, Math.round(Number(bulkCount) || 1)))
    const amount = Number((agreedAmountHint || rows[0]?.amount || '').replace(',', '.'))
    if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      toastFsError('בחרו תאריך התחלה לתשלומים החודשיים', new Error('no start'), 'generateMonthly')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toastFsError('הזינו סכום מוסכם לפני יצירה חודשית', new Error('no amount'), 'generateMonthly')
      return
    }
    const generated = buildMonthlyScheduledPayments(start, count, amount)
    setRows(
      generated.map((p) =>
        newRow({
          id: p.id,
          expectedPaymentYmd: p.expectedPaymentYmd,
          amount: String(p.amount),
        }),
      ),
    )
  }

  const handleSave = () => {
    const payments = rowsToScheduledPayments(rows)
    const v = validateScheduledPayments(payments)
    if (!v.ok) {
      toastFsError(v.message, new Error(v.message), 'DealPaymentScheduleEditor')
      return
    }
    const earliest = earliestPaymentYmdFromSchedule(payments)
    onSave?.(payments, {
      firstPaymentYmd: earliest,
      ...(dealKind === 'retainer_yearly' && earliest ? { annualBillingYmd: earliest } : {}),
      ...(dealKind === 'one_time' && payments[0]
        ? { expectedPaymentYmd: payments[0].expectedPaymentYmd }
        : {}),
    })
  }

  return (
    <div
      className={`rounded-xl border border-dashed border-[var(--border-orange-soft)] bg-white/70 ${compact ? 'p-3' : 'p-4'}`}
    >
      <p className="mb-3 text-[11px] leading-relaxed text-[var(--text-mid)]">
        {dealScheduleHint(dealKind, isHostingDeal)}
      </p>

      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div
            key={row.id}
            className="grid gap-2 rounded-lg border border-[var(--border)] bg-white p-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <label className="space-y-0.5">
              <span className="text-[10px] font-bold text-[var(--text-mid)]">
                תאריך צפי לתשלום {rows.length > 1 ? `#${idx + 1}` : ''}
              </span>
              <input
                type="date"
                value={row.expectedPaymentYmd}
                onChange={(e) =>
                  setRows(
                    rows.map((r) =>
                      r.id === row.id ? { ...r, expectedPaymentYmd: e.target.value } : r,
                    ),
                  )
                }
                dir="ltr"
                className="w-full rounded-lg border border-[var(--border-orange-soft)] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] font-bold text-[var(--text-mid)]">סכום (₪)</span>
              <input
                value={row.amount}
                onChange={(e) =>
                  setRows(
                    rows.map((r) => (r.id === row.id ? { ...r, amount: e.target.value } : r)),
                  )
                }
                dir="ltr"
                className="w-full rounded-lg border border-[var(--border-orange-soft)] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] font-bold text-[var(--text-mid)]">הערה (אופציונלי)</span>
              <input
                value={row.label}
                onChange={(e) =>
                  setRows(
                    rows.map((r) => (r.id === row.id ? { ...r, label: e.target.value } : r)),
                  )
                }
                className="w-full rounded-lg border border-[var(--border-orange-soft)] px-2 py-1.5 text-sm"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                className="text-xs text-[var(--danger)] underline disabled:opacity-40"
                disabled={rows.length <= 1}
                onClick={() => removeRow(row.id)}
              >
                הסרה
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-bold"
          onClick={addRow}
        >
          + תשלום
        </button>
        {(dealKind === 'retainer_monthly' || isHostingDeal) && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1.5">
            <label className="space-y-0.5">
              <span className="text-[10px] font-bold text-[var(--text-mid)]">התחלה</span>
              <input
                type="date"
                value={bulkStart}
                onChange={(e) => setBulkStart(e.target.value)}
                dir="ltr"
                className="rounded border border-[var(--border-orange-soft)] bg-white px-2 py-1 text-sm"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] font-bold text-[var(--text-mid)]">מספר חודשים</span>
              <input
                type="number"
                min={1}
                max={36}
                value={bulkCount}
                onChange={(e) => setBulkCount(e.target.value)}
                dir="ltr"
                className="w-16 rounded border border-[var(--border-orange-soft)] bg-white px-2 py-1 text-sm"
              />
            </label>
            <button
              type="button"
              className="rounded-lg bg-[var(--blue-mid)] px-3 py-1.5 text-xs font-bold text-white"
              onClick={generateMonthly}
            >
              יצירה חודשית
            </button>
          </div>
        )}
      </div>

      {paymentsPreview.length > 0 ? (
        <p className="mt-2 text-[10px] text-[var(--text-mid)]">
          {paymentsPreview.length} תשלומים מתוכננים · סה״כ{' '}
          {paymentsPreview.reduce((s, p) => s + p.amount, 0).toLocaleString('he-IL')} ₪
        </p>
      ) : null}

      {onSave ? (
        <button
          type="button"
          className="mt-3 rounded-lg bg-[var(--orange)] px-4 py-2 text-xs font-bold text-white"
          onClick={handleSave}
        >
          שמירת לוח תשלומים
        </button>
      ) : null}
    </div>
  )
}

/** ולידציה לשימוש באשף לפני שמירה */
export function validateScheduleRows(rows: ScheduleRow[]): { ok: true } | { ok: false; message: string } {
  return validateScheduledPayments(rowsToScheduledPayments(rows))
}
