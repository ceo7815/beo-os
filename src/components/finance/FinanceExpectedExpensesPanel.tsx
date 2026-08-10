import { useMemo, useState } from 'react'
import { EmptyState } from '../shared/EmptyState'
import { formatDateIL, todayYmd } from '../../lib/dates'
import { formatNis } from '../../lib/financeCalc'
import { PAYMENT_METHOD_LABEL } from '../../lib/financeIncomePayment'
import type {
  ExpectedExpensePatchInput,
  NewExpectedExpenseInput,
} from '../../hooks/useFinanceCashflow'
import type {
  FinanceCashflowExpectedExpense,
  FinancePaymentMethod,
} from '../../types'

type FormState = {
  name: string
  amount: string
  expectedDate: string
  paymentMethod: FinancePaymentMethod
  notes: string
}

const emptyForm = (): FormState => ({
  name: '',
  amount: '',
  expectedDate: todayYmd(),
  paymentMethod: 'bank_transfer',
  notes: '',
})

type Props = {
  items: FinanceCashflowExpectedExpense[]
  onAdd: (data: NewExpectedExpenseInput) => Promise<boolean>
  onUpdate: (id: string, patch: ExpectedExpensePatchInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function formFromItem(item: FinanceCashflowExpectedExpense): FormState {
  return {
    name: item.name,
    amount: String(item.amount),
    expectedDate: item.expectedDate,
    paymentMethod: item.paymentMethod,
    notes: item.notes ?? '',
  }
}

export function FinanceExpectedExpensesPanel({
  items,
  onAdd,
  onUpdate,
  onDelete,
}: Props) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) =>
        a.expectedDate.localeCompare(b.expectedDate) || a.name.localeCompare(b.name, 'he'),
      ),
    [items],
  )

  const resetForm = () => {
    setForm(emptyForm())
    setEditingId(null)
    setError('')
  }

  const startEdit = (item: FinanceCashflowExpectedExpense) => {
    setEditingId(item.id)
    setForm(formFromItem(item))
    setError('')
  }

  const submit = async () => {
    setError('')
    const parsed = Number.parseFloat(form.amount.replace(/,/g, ''))
    if (!form.name.trim()) {
      setError('יש למלא שם הוצאה')
      return
    }
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('יש למלא סכום תקין')
      return
    }
    if (!form.expectedDate.trim()) {
      setError('יש לבחור תאריך')
      return
    }

    setSaving(true)
    try {
      if (editingId) {
        await onUpdate(editingId, {
          name: form.name.trim(),
          amount: parsed,
          expectedDate: form.expectedDate,
          paymentMethod: form.paymentMethod,
          notes: form.notes.trim() || null,
        })
        resetForm()
      } else {
        const ok = await onAdd({
          name: form.name.trim(),
          amount: parsed,
          expectedDate: form.expectedDate,
          paymentMethod: form.paymentMethod,
          notes: form.notes.trim() || undefined,
        })
        if (ok) resetForm()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 p-4">
        <h4 className="mb-3 text-[13px] font-extrabold text-[var(--text-dark)]">
          {editingId ? 'עריכת הוצאה צפויה' : 'הוצאה צפויה חדשה'}
        </h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block sm:col-span-2 lg:col-span-1">
            <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              שם ההוצאה
            </span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="למשל: תשלום לספק, מקדמה לפרויקט"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-[13px] outline-none focus:border-[var(--orange)]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              סכום ₪
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-[13px] tabular-nums outline-none focus:border-[var(--orange)]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              תאריך צפוי
            </span>
            <input
              type="date"
              value={form.expectedDate}
              onChange={(e) =>
                setForm((f) => ({ ...f, expectedDate: e.target.value }))
              }
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-[13px] outline-none focus:border-[var(--orange)]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              אופן תשלום
            </span>
            <select
              value={form.paymentMethod}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  paymentMethod: e.target.value as FinancePaymentMethod,
                }))
              }
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-[13px] outline-none focus:border-[var(--orange)]"
            >
              <option value="bank_transfer">
                {PAYMENT_METHOD_LABEL.bank_transfer}
              </option>
              <option value="credit_card">
                {PAYMENT_METHOD_LABEL.credit_card}
              </option>
            </select>
            {form.paymentMethod === 'credit_card' ? (
              <p className="mt-1 text-[10px] text-[var(--text-mid)]">
                כרטיס אשראי — הכסף יוצא ב-2 לחודש שלאחר תאריך העסקה
              </p>
            ) : null}
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              הערות
            </span>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="אופציונלי — יופיע ביומן התזרים"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-[13px] outline-none focus:border-[var(--orange)]"
            />
          </label>
        </div>

        {error ? (
          <p className="mt-2 text-[12px] font-bold text-[#DC2626]">{error}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="rounded-[10px] bg-[var(--orange)] px-4 py-2 text-[12px] font-bold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {saving ? 'שומר…' : editingId ? 'עדכן הוצאה' : 'שמור הוצאה צפויה'}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-[10px] border border-[var(--border)] px-4 py-2 text-[12px] font-semibold text-[var(--text-mid)]"
            >
              ביטול
            </button>
          ) : null}
        </div>
      </div>

      {sortedItems.length === 0 ? (
        <EmptyState
          title="אין הוצאות צפויות ידניות"
          description="הוסיפו הוצאה שאתם יודעים שתגיע — היא תופיע ביומן התזרים ובגרף."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full min-w-[560px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]/80 text-[11px] font-bold text-[var(--text-mid)]">
                <th className="px-3 py-2.5 text-right">תאריך</th>
                <th className="px-3 py-2.5 text-right">שם</th>
                <th className="px-3 py-2.5 text-right">סכום</th>
                <th className="px-3 py-2.5 text-right">אופן תשלום</th>
                <th className="px-3 py-2.5 text-right">הערות</th>
                <th className="px-3 py-2.5 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-[var(--border)]/70 hover:bg-[var(--surface-muted)]/30"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                    {formatDateIL(item.expectedDate)}
                  </td>
                  <td className="px-3 py-2.5 font-bold text-[var(--text-dark)]">
                    {item.name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums font-bold text-[#DC2626]">
                    {formatNis(item.amount)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[var(--text-mid)]">
                    {PAYMENT_METHOD_LABEL[item.paymentMethod]}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2.5 text-[var(--text-mid)]">
                    {item.notes || '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="text-[11px] font-bold text-[var(--orange)] hover:underline"
                      >
                        ערוך
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(`למחוק את «${item.name}» מהתזרים?`)
                          ) {
                            void onDelete(item.id)
                          }
                        }}
                        className="text-[11px] font-bold text-[#DC2626] hover:underline"
                      >
                        מחק
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
