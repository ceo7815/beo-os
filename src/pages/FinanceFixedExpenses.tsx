import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState } from '../components/shared/EmptyState'
import { ExportExcelButton } from '../components/shared/ExportExcelButton'
import { FinanceKpiCard } from '../components/finance/FinanceKpi'
import { FinanceTabs } from '../components/finance/FinanceTabs'
import { SortableTh } from '../components/finance/SortableTh'
import { useFinanceAttention } from '../hooks/useFinanceAttention'
import { useFinanceExpenseTypes } from '../hooks/useFinanceExpenseTypes'
import { useFinanceExpenses } from '../hooks/useFinanceExpenses'
import { useFinanceFixedExpenseCatalog } from '../hooks/useFinanceFixedExpenseCatalog'
import { formatNis } from '../lib/financeCalc'
import { expenseTypeMap, resolveExpenseType } from '../lib/financeExpenseTypes'
import { PAYMENT_METHOD_LABEL } from '../lib/financeIncomePayment'
import { sortByKey, useTableSort } from '../lib/financeTableSort'
import {
  catalogItemTimingHint,
  fixedExpenseLabel,
  groupFixedExpenses,
  groupToCatalogItem,
} from '../lib/fixedExpenses'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { exportFixedExpensesCatalogToExcel } from '../lib/excelTableExports'
import type { FinanceFixedExpenseCatalogItem, FinancePaymentMethod } from '../types'

type SortKey = 'name' | 'type' | 'amount' | 'payment' | 'timing'

type AddForm = {
  type: string
  name: string
  amount: string
  paymentMethod: FinancePaymentMethod
  dayOfMonth: string
}

const defaultAddForm = (): AddForm => ({
  type: 'fixed',
  name: '',
  amount: '',
  paymentMethod: 'bank_transfer',
  dayOfMonth: '1',
})

function catalogItemsEqual(
  a: FinanceFixedExpenseCatalogItem[],
  b: FinanceFixedExpenseCatalogItem[],
): boolean {
  if (a.length !== b.length) return false
  return a.every((row, i) => {
    const other = b[i]
    if (!other) return false
    return (
      row.id === other.id &&
      row.type === other.type &&
      row.name === other.name &&
      row.amount === other.amount &&
      row.paymentMethod === other.paymentMethod &&
      row.dayOfMonth === other.dayOfMonth
    )
  })
}

export function FinanceFixedExpenses() {
  const { expenses, loading: expensesLoading } = useFinanceExpenses()
  const { types: expenseTypes } = useFinanceExpenseTypes()
  const { items: savedItems, loading: catalogLoading, saveCatalog } =
    useFinanceFixedExpenseCatalog()
  const attention = useFinanceAttention()
  const typeMap = useMemo(() => expenseTypeMap(expenseTypes), [expenseTypes])
  const { sort, toggle } = useTableSort<SortKey>('name', 'asc')

  const [draft, setDraft] = useState<FinanceFixedExpenseCatalogItem[]>([])
  const [draftReady, setDraftReady] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState<AddForm>(defaultAddForm)
  const [addError, setAddError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editAmount, setEditAmount] = useState<{ id: string; value: string } | null>(
    null,
  )

  useEffect(() => {
    if (catalogLoading) return
    setDraft((prev) => {
      const isDirty = !catalogItemsEqual(prev, savedItems)
      if (isDirty && draftReady) return prev
      return savedItems
    })
    setDraftReady(true)
  }, [catalogLoading, savedItems, draftReady])

  const dirty = draftReady && !catalogItemsEqual(draft, savedItems)
  const loading = expensesLoading || catalogLoading

  const sortedDraft = useMemo(
    () =>
      sortByKey(draft, sort, (row, key) => {
        switch (key) {
          case 'name':
            return row.name.toLowerCase()
          case 'type':
            return resolveExpenseType(row.type, typeMap).label
          case 'amount':
            return row.amount
          case 'payment':
            return row.paymentMethod
          case 'timing':
            return catalogItemTimingHint(row)
          default:
            return row.name
        }
      }),
    [draft, sort, typeMap],
  )

  const totalMonthly = useMemo(
    () => draft.reduce((s, row) => s + row.amount, 0),
    [draft],
  )

  const recurringImportCount = useMemo(() => {
    const savedNames = new Set(draft.map((d) => `${d.type}::${d.name}`))
    return groupFixedExpenses(expenses).filter(
      (g) => !savedNames.has(`${g.template.type}::${fixedExpenseLabel(g.template)}`),
    ).length
  }, [expenses, draft])

  const updateDraftItem = useCallback(
    (id: string, patch: Partial<FinanceFixedExpenseCatalogItem>) => {
      setDraft((prev) =>
        prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      )
    },
    [],
  )

  const removeDraftItem = (item: FinanceFixedExpenseCatalogItem) => {
    if (
      !window.confirm(`להסיר את «${item.name}» מרשימת ההוצאות הקבועות?`)
    ) {
      return
    }
    setDraft((prev) => prev.filter((row) => row.id !== item.id))
  }

  const importFromRecurring = () => {
    const savedNames = new Set(draft.map((d) => `${d.type}::${d.name}`))
    const toAdd = groupFixedExpenses(expenses)
      .filter(
        (g) =>
          !savedNames.has(`${g.template.type}::${fixedExpenseLabel(g.template)}`),
      )
      .map(groupToCatalogItem)
    if (toAdd.length === 0) return
    setDraft((prev) => [...prev, ...toAdd])
  }

  const submitAdd = () => {
    setAddError('')
    const parsed = Number.parseFloat(addForm.amount.replace(/,/g, ''))
    const day = Number.parseInt(addForm.dayOfMonth, 10)
    if (!addForm.name.trim()) {
      setAddError('יש למלא שם הוצאה')
      return
    }
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setAddError('יש למלא סכום תקין')
      return
    }
    const item: FinanceFixedExpenseCatalogItem = {
      id: crypto.randomUUID(),
      type: addForm.type,
      name: addForm.name.trim(),
      amount: Math.round(parsed * 100) / 100,
      paymentMethod: addForm.paymentMethod,
      dayOfMonth:
        addForm.paymentMethod === 'credit_card'
          ? 1
          : Number.isFinite(day) && day >= 1 && day <= 31
            ? day
            : 1,
      amountIncludesVat: true,
    }
    setDraft((prev) => [...prev, item])
    setAddOpen(false)
    setAddForm(defaultAddForm())
  }

  const saveDraft = async () => {
    setSaving(true)
    try {
      const ok = await saveCatalog(draft)
      if (ok) setDraftReady(true)
    } finally {
      setSaving(false)
    }
  }

  const saveAmount = (item: FinanceFixedExpenseCatalogItem) => {
    if (!editAmount || editAmount.id !== item.id) return
    const parsed = Number.parseFloat(editAmount.value.replace(/,/g, ''))
    if (!Number.isFinite(parsed) || parsed <= 0) return
    setEditAmount(null)
    updateDraftItem(item.id, { amount: Math.round(parsed * 100) / 100 })
  }

  return (
    <div className="mx-auto min-w-0 w-full max-w-[1400px] space-y-6 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-[var(--text-dark)] md:text-[26px]">
            הוצאות קבועות
          </h1>
          <p className="mt-1.5 text-[12px] text-[var(--text-mid)] md:text-[13px]">
            רק הרשימה השמורה כאן נכנסת לתחזית התזרים — ערכו ולחצו «שמור הוצאות קבועות»
          </p>
        </div>
        <ExportExcelButton
          onClick={() =>
            exportFixedExpensesCatalogToExcel({
              items: draft,
              expenseTypeById: typeMap,
            })
          }
          disabled={draft.length === 0}
        />
      </header>

      <FinanceTabs badges={attention} />

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/40 p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-extrabold text-[var(--text-dark)]">סיכום</h2>
          {dirty ? (
            <span className="rounded-full bg-[#FEF3C7] px-2.5 py-1 text-[11px] font-bold text-[#92400E]">
              יש שינויים שלא נשמרו
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FinanceKpiCard
            index={1}
            seq={0}
            label="הוצאות קבועות ברשימה"
            value={String(draft.length)}
            hint="רק מה שנשמר כאן משפיע על התזרים"
          />
          <FinanceKpiCard
            index={2}
            seq={1}
            label="סה״כ חודשי"
            value={formatNis(totalMonthly)}
            valueClass="text-[#DC2626]"
            hint="סכום כל ההוצאות הקבועות ברשימה"
          />
        </div>
      </section>

      <section
        className={`rounded-2xl ${hubSectionClass(5)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:p-5`}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-[var(--text-dark)]">
            רשימת הוצאות קבועות
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {recurringImportCount > 0 ? (
              <button
                type="button"
                onClick={importFromRecurring}
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-[12px] font-bold text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)]"
              >
                ייבוא {recurringImportCount} מ-recurring
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setAddForm(defaultAddForm())
                setAddError('')
                setAddOpen(true)
              }}
              className="rounded-xl border border-[var(--border-orange-soft)] px-3 py-2 text-[12px] font-bold text-[var(--orange)] transition hover:bg-[var(--orange-light)]"
            >
              + הוצאה חדשה
            </button>
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => void saveDraft()}
              className="rounded-xl bg-[var(--accent)] px-4 py-2 text-[12px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'שומר…' : 'שמור הוצאות קבועות'}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--text-mid)]">טוען…</p>
        ) : sortedDraft.length === 0 ? (
          <EmptyState
            title="אין הוצאות קבועות שמורות"
            description="הוסיפו הוצאות או ייבאו מ-recurring, ואז לחצו «שמור הוצאות קבועות»."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-right text-[12px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-bold text-[var(--text-mid)]">
                  <SortableTh
                    label="שם"
                    columnKey="name"
                    sort={sort}
                    onSort={toggle}
                    defaultDir="asc"
                  />
                  <SortableTh
                    label="סוג"
                    columnKey="type"
                    sort={sort}
                    onSort={toggle}
                  />
                  <SortableTh
                    label="סכום"
                    columnKey="amount"
                    sort={sort}
                    onSort={toggle}
                  />
                  <SortableTh
                    label="אופן תשלום"
                    columnKey="payment"
                    sort={sort}
                    onSort={toggle}
                  />
                  <SortableTh
                    label="מועד בתזרים"
                    columnKey="timing"
                    sort={sort}
                    onSort={toggle}
                  />
                  <th className="px-2 py-2.5 text-right">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {sortedDraft.map((item) => {
                  const typeDef = resolveExpenseType(item.type, typeMap)
                  const isCredit = item.paymentMethod === 'credit_card'
                  const isEditingAmount =
                    editAmount?.id === item.id ? editAmount.value : null

                  return (
                    <tr
                      key={item.id}
                      className="border-b border-[var(--border)]/60 hover:bg-[var(--surface-muted)]/30"
                    >
                      <td className="max-w-[200px] px-2 py-2.5 font-bold text-[var(--text-dark)]">
                        {item.name}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-[var(--text-mid)]">
                        {typeDef.label}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 tabular-nums">
                        {isEditingAmount != null ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            className="w-24 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[12px]"
                            value={isEditingAmount}
                            onChange={(e) =>
                              setEditAmount({ id: item.id, value: e.target.value })
                            }
                            onBlur={() => saveAmount(item)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveAmount(item)
                              if (e.key === 'Escape') setEditAmount(null)
                            }}
                            autoFocus
                          />
                        ) : (
                          <button
                            type="button"
                            className="font-bold text-[#DC2626] hover:underline"
                            onClick={() =>
                              setEditAmount({
                                id: item.id,
                                value: String(item.amount),
                              })
                            }
                            title="לחצו לעריכת סכום"
                          >
                            {formatNis(item.amount)}
                          </button>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5">
                        <select
                          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[12px]"
                          value={item.paymentMethod}
                          onChange={(e) =>
                            updateDraftItem(item.id, {
                              paymentMethod: e.target.value as FinancePaymentMethod,
                            })
                          }
                        >
                          <option value="bank_transfer">
                            {PAYMENT_METHOD_LABEL.bank_transfer}
                          </option>
                          <option value="credit_card">
                            {PAYMENT_METHOD_LABEL.credit_card}
                          </option>
                        </select>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-[var(--text-mid)]">
                        {isCredit ? (
                          <span className="text-[11px]">
                            {catalogItemTimingHint(item)}
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px]">יום</span>
                            <input
                              type="number"
                              min={1}
                              max={31}
                              className="w-14 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[12px] tabular-nums"
                              value={item.dayOfMonth}
                              onChange={(e) => {
                                const day = Number.parseInt(e.target.value, 10)
                                if (!Number.isFinite(day)) return
                                updateDraftItem(item.id, {
                                  dayOfMonth: Math.min(31, Math.max(1, day)),
                                })
                              }}
                            />
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5">
                        <button
                          type="button"
                          onClick={() => removeDraftItem(item)}
                          className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] font-bold text-[var(--text-mid)] transition hover:border-[#DC2626] hover:text-[#DC2626]"
                        >
                          הסר
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {addOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-fixed-expense-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
            <h2
              id="add-fixed-expense-title"
              className="text-lg font-extrabold text-[var(--text-dark)]"
            >
              הוצאה קבועה חדשה
            </h2>
            <p className="mt-1 text-[12px] text-[var(--text-mid)]">
              תתווסף לרשימה — לחצו «שמור הוצאות קבועות» כדי להחיל על התזרים
            </p>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                  סוג
                </span>
                <select
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[13px]"
                  value={addForm.type}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, type: e.target.value }))
                  }
                >
                  {expenseTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                  שם
                </span>
                <input
                  type="text"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[13px]"
                  value={addForm.name}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="למשל: Google Workspace, Claude Team"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                  סכום ₪ (חודשי)
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[13px]"
                  value={addForm.amount}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, amount: e.target.value }))
                  }
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                  אופן תשלום
                </span>
                <select
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[13px]"
                  value={addForm.paymentMethod}
                  onChange={(e) =>
                    setAddForm((f) => ({
                      ...f,
                      paymentMethod: e.target.value as FinancePaymentMethod,
                    }))
                  }
                >
                  <option value="bank_transfer">
                    {PAYMENT_METHOD_LABEL.bank_transfer}
                  </option>
                  <option value="credit_card">
                    {PAYMENT_METHOD_LABEL.credit_card}
                  </option>
                </select>
              </label>

              {addForm.paymentMethod === 'bank_transfer' ? (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                    יום יציאה מהבנק (בכל חודש)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[13px]"
                    value={addForm.dayOfMonth}
                    onChange={(e) =>
                      setAddForm((f) => ({ ...f, dayOfMonth: e.target.value }))
                    }
                  />
                </label>
              ) : (
                <p className="rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-[12px] text-[var(--text-mid)]">
                  כרטיס אשראי — הכסף יוצא ב-2 לחודש שלאחר החיוב
                </p>
              )}

              {addError ? (
                <p className="text-[12px] font-bold text-[#DC2626]">{addError}</p>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-[12px] font-bold text-[var(--text-mid)]"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={submitAdd}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-[12px] font-bold text-white"
              >
                הוסף לרשימה
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
