import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../components/shared/Modal'
import {
  BeoExpensesProvider,
  expenseHasInvoice,
  useBeoExpenses,
  type BeoExpense,
  type BeoExpenseAllocation,
  type BeoExpenseCurrency,
  type BeoExpenseInput,
} from '../hooks/useBeoExpenses'
import { useProjects } from '../hooks/useProjects'
import { useSuppliers } from '../hooks/useSuppliers'
import { todayYmd } from '../lib/dates'
import { CURRENCY_SYMBOL, fetchIlsMarketRate } from '../lib/foreignCurrency'
import { currentYm, formatNis, monthLabelHe, monthOptions } from '../lib/financeCalc'
import { addMonths } from '../lib/financeMonthRange'

type Filter = 'all' | 'waiting' | 'ready' | 'fixed' | 'operating' | 'office' | 'project'

type ExpenseKind = 'fixed' | 'operating'

type FormState = {
  name: string
  amount: string
  expenseDate: string
  supplierId: string
  description: string
  notes: string
  paymentMethod: string
  kind: ExpenseKind
  allocation: BeoExpenseAllocation
  projectId: string
  currency: BeoExpenseCurrency
  exchangeRate: string
}

function emptyForm(ym: string): FormState {
  const today = todayYmd()
  const dateInMonth = today.startsWith(ym) ? today : `${ym}-01`
  return {
    name: '',
    amount: '',
    expenseDate: dateInMonth,
    supplierId: '',
    description: '',
    notes: '',
    paymentMethod: '',
    kind: 'operating',
    allocation: 'office',
    projectId: '',
    currency: 'ILS',
    exchangeRate: '',
  }
}

function InvoiceBadge({ expense }: { expense: BeoExpense }) {
  const ok = expenseHasInvoice(expense)
  if (ok) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden />
        התקבל
        {expense.invoiceNumber ? (
          <span className="font-mono text-[10px] text-emerald-700/80">#{expense.invoiceNumber}</span>
        ) : null}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
      ממתין
    </span>
  )
}

function KindChip({ fixed }: { fixed: boolean }) {
  return fixed ? (
    <span className="inline-flex rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
      קבועה
    </span>
  ) : (
    <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
      שוטפת
    </span>
  )
}

function AllocChip({
  allocation,
  label,
}: {
  allocation: 'office' | 'project'
  label: string
}) {
  return (
    <span
      className={`inline-flex max-w-[140px] truncate rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
        allocation === 'project'
          ? 'border-violet-200 bg-violet-50 text-violet-900'
          : 'border-orange-200 bg-orange-50 text-orange-950'
      }`}
      title={label}
    >
      {label}
    </span>
  )
}

const actionBtn =
  'inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-[11px] font-semibold transition'
const actionBtnMuted = `${actionBtn} border-[var(--border)] bg-white text-[var(--text-mid)] hover:bg-[var(--surface-muted)]`

function ExpenseRowActions({
  expense,
  onUpload,
  onMarkReceived,
  onDelete,
}: {
  expense: BeoExpense
  onUpload: () => void
  onMarkReceived: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const ready = expenseHasInvoice(expense)

  useEffect(() => {
    if (!open) return
    const onDoc = (ev: MouseEvent) => {
      if (!wrapRef.current?.contains(ev.target as Node)) setOpen(false)
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="relative inline-flex justify-end">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={`${actionBtnMuted} gap-1 px-3`}
      >
        פעולות
        <span className="text-[10px] opacity-70" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute end-0 top-[calc(100%+4px)] z-30 min-w-[160px] overflow-hidden rounded-xl border border-[var(--border)] bg-white py-1 shadow-[0_12px_40px_rgba(15,23,42,0.14)]"
        >
          {ready && expense.documentUrl ? (
            <a
              role="menuitem"
              href={expense.documentUrl}
              target="_blank"
              rel="noreferrer"
              className="block px-3 py-2 text-[13px] font-semibold text-emerald-800 hover:bg-emerald-50"
              onClick={() => setOpen(false)}
            >
              פתח מסמך
            </a>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-start text-[13px] font-semibold text-[var(--brand)] hover:bg-[var(--brand)]/5"
              onClick={() => {
                setOpen(false)
                onUpload()
              }}
            >
              העלה חשבונית
            </button>
          )}
          {!ready ? (
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-start text-[13px] font-semibold text-[var(--text-dark)] hover:bg-[var(--surface-muted)]"
              onClick={() => {
                setOpen(false)
                onMarkReceived()
              }}
            >
              סמן כהתקבל
            </button>
          ) : null}
          <div className="my-1 border-t border-[var(--border)]" />
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-start text-[13px] font-semibold text-red-600 hover:bg-red-50"
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
          >
            מחק
          </button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * הוצאות Beo בלבד — לפי חודש, קבועות, וממתין/ירוק לפי חשבונית.
 * לא מחובר לריווחית.
 */
export function BeoExpenses() {
  return (
    <BeoExpensesProvider>
      <BeoExpensesInner />
    </BeoExpensesProvider>
  )
}

function BeoExpensesInner() {
  const {
    expenses,
    catalog,
    loading,
    addExpense,
    updateExpense,
    deleteExpense,
    addCatalogItem,
    deleteCatalogItem,
    ensureFixedForMonth,
    uploadInvoice,
  } = useBeoExpenses()
  const { projects } = useProjects()
  const { suppliers, addSupplier } = useSuppliers()

  const [ym, setYm] = useState(currentYm())
  const [filter, setFilter] = useState<Filter>('all')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false)
  const [quickSupplierName, setQuickSupplierName] = useState('')
  const [quickSupplierPhone, setQuickSupplierPhone] = useState('')
  const [quickSupplierEmail, setQuickSupplierEmail] = useState('')
  const [form, setForm] = useState<FormState>(() => emptyForm(currentYm()))
  const [catName, setCatName] = useState('')
  const [catAmount, setCatAmount] = useState('')
  const [catDay, setCatDay] = useState('1')
  const [busy, setBusy] = useState(false)
  const [uploadFor, setUploadFor] = useState<BeoExpense | null>(null)
  const [invoiceNo, setInvoiceNo] = useState('')
  const [rateLoading, setRateLoading] = useState(false)
  const [rateSource, setRateSource] = useState<'boi' | 'frankfurter' | 'manual' | null>(
    null,
  )
  const [rateError, setRateError] = useState<string | null>(null)

  const months = useMemo(() => monthOptions(24), [])
  const projectNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of projects) map.set(p.id, p.name)
    return map
  }, [projects])
  const supplierById = useMemo(() => {
    const map = new Map(suppliers.map((s) => [s.id, s]))
    return map
  }, [suppliers])
  const activeSuppliers = useMemo(
    () =>
      [...suppliers]
        .filter((s) => s.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [suppliers],
  )

  const monthCounts = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>()
    for (const e of expenses) {
      const cur = map.get(e.billingMonth) ?? { count: 0, total: 0 }
      cur.count += 1
      cur.total += e.amount
      map.set(e.billingMonth, cur)
    }
    return map
  }, [expenses])

  /** חודשים חכמים: נוכחי + חודשים עם הוצאות + שכנים */
  const smartMonths = useMemo(() => {
    const set = new Set<string>()
    set.add(currentYm())
    set.add(ym)
    for (const key of monthCounts.keys()) set.add(key)
    set.add(addMonths(ym, -1))
    set.add(addMonths(ym, 1))
    return [...set].sort((a, b) => b.localeCompare(a)).slice(0, 14)
  }, [monthCounts, ym])

  const convertedNis = useMemo(() => {
    const raw = Number(form.amount)
    if (!Number.isFinite(raw) || raw <= 0) return 0
    if (form.currency === 'ILS') return Math.round(raw * 100) / 100
    const rate = Number(form.exchangeRate)
    if (!Number.isFinite(rate) || rate <= 0) return 0
    return Math.round(raw * rate * 100) / 100
  }, [form.amount, form.currency, form.exchangeRate])

  const loadMarketRate = async (currency: 'USD' | 'EUR', force = true) => {
    setRateLoading(true)
    setRateError(null)
    const quote = await fetchIlsMarketRate(currency)
    if (!quote) {
      setRateSource(null)
      setRateError('לא הצלחנו לטעון שער שוק עדכני. נסו שוב או הזינו ידנית.')
      setRateLoading(false)
      return
    }
    setForm((f) => {
      if (f.currency !== currency) return f
      if (!force && f.exchangeRate.trim()) return f
      return { ...f, exchangeRate: String(quote.rate) }
    })
    setRateSource(quote.source)
    setRateError(null)
    setRateLoading(false)
  }

  useEffect(() => {
    if (!addOpen) return
    if (form.currency === 'ILS') {
      setRateSource(null)
      setRateError(null)
      return
    }
    void loadMarketRate(form.currency, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- רק בפתיחה / החלפת מטבע
  }, [addOpen, form.currency])

  const monthRows = useMemo(() => {
    let rows = expenses.filter((e) => e.billingMonth === ym)
    if (supplierFilter.startsWith('name:')) {
      const name = supplierFilter.slice(5)
      rows = rows.filter((e) => e.supplierName === name)
    } else if (supplierFilter) {
      rows = rows.filter((e) => e.supplierId === supplierFilter)
    }
    if (filter === 'waiting') rows = rows.filter((e) => !expenseHasInvoice(e))
    if (filter === 'ready') rows = rows.filter((e) => expenseHasInvoice(e))
    if (filter === 'fixed') rows = rows.filter((e) => e.recurring || e.type === 'fixed')
    if (filter === 'operating')
      rows = rows.filter((e) => !e.recurring && e.type !== 'fixed')
    if (filter === 'office') rows = rows.filter((e) => e.allocation !== 'project')
    if (filter === 'project') rows = rows.filter((e) => e.allocation === 'project')
    return rows
  }, [expenses, ym, filter, supplierFilter, supplierById])

  const suppliersInMonth = useMemo(() => {
    const ids = new Set<string>()
    const names = new Map<string, string>()
    for (const e of expenses.filter((x) => x.billingMonth === ym)) {
      if (e.supplierId) {
        ids.add(e.supplierId)
        const n = supplierById.get(e.supplierId)?.name || e.supplierName
        if (n) names.set(e.supplierId, n)
      } else if (e.supplierName) {
        names.set(`name:${e.supplierName}`, e.supplierName)
      }
    }
    return [...names.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'))
  }, [expenses, ym, supplierById])

  const kpis = useMemo(() => {
    const monthAll = expenses.filter((e) => e.billingMonth === ym)
    const waiting = monthAll.filter((e) => !expenseHasInvoice(e))
    const ready = monthAll.filter((e) => expenseHasInvoice(e))
    const total = monthAll.reduce((s, e) => s + e.amount, 0)
    const waitingSum = waiting.reduce((s, e) => s + e.amount, 0)
    return {
      count: monthAll.length,
      total,
      waiting: waiting.length,
      waitingSum,
      ready: ready.length,
      fixed: monthAll.filter((e) => e.recurring).length,
    }
  }, [expenses, ym])

  async function submitExpense() {
    const name = form.name.trim()
    const entered = Number(form.amount)
    if (!name || !Number.isFinite(entered) || entered <= 0) return
    if (!form.expenseDate) return
    if (!form.supplierId) return
    if (form.allocation === 'project' && !form.projectId) return
    if (form.currency !== 'ILS') {
      const rate = Number(form.exchangeRate)
      if (!Number.isFinite(rate) || rate <= 0) return
    }
    const amountNis = convertedNis
    if (amountNis <= 0) return
    const supplier = supplierById.get(form.supplierId)
    if (!supplier) return
    const billingMonth = form.expenseDate.slice(0, 7)
    setBusy(true)
    const input: BeoExpenseInput = {
      name,
      amount: amountNis,
      billingMonth,
      expenseDate: form.expenseDate,
      type: form.kind === 'fixed' ? 'fixed' : 'operating',
      recurring: form.kind === 'fixed',
      allocation: form.allocation,
      projectId: form.allocation === 'project' ? form.projectId : null,
      supplierId: form.supplierId,
      supplierName: supplier.name,
      description: form.description.trim() || undefined,
      notes: form.notes.trim() || undefined,
      paymentMethod: form.paymentMethod.trim() || undefined,
      currency: form.currency,
      originalAmount: form.currency === 'ILS' ? null : entered,
      exchangeRate: form.currency === 'ILS' ? null : Number(form.exchangeRate),
      supplierInvoiceReceived: false,
      source: 'manual',
    }
    await addExpense(input)
    setBusy(false)
    setYm(billingMonth)
    setForm(emptyForm(billingMonth))
    setAddOpen(false)
  }

  async function createQuickSupplier() {
    const name = quickSupplierName.trim()
    if (!name) return
    setBusy(true)
    const id = await addSupplier({
      name,
      phone: quickSupplierPhone.trim(),
      email: quickSupplierEmail.trim(),
      active: true,
    })
    setBusy(false)
    if (!id) return
    setForm((f) => ({ ...f, supplierId: id }))
    setQuickSupplierName('')
    setQuickSupplierPhone('')
    setQuickSupplierEmail('')
    setQuickSupplierOpen(false)
  }

  function openAdd() {
    setForm(emptyForm(ym))
    setAddOpen(true)
  }

  async function submitCatalog() {
    const name = catName.trim()
    const amount = Number(catAmount)
    const day = Math.min(31, Math.max(1, Number(catDay) || 1))
    if (!name || !Number.isFinite(amount) || amount <= 0) return
    setBusy(true)
    await addCatalogItem({
      name,
      amount,
      dayOfMonth: day,
      paymentMethod: 'bank_transfer',
      type: 'fixed',
      active: true,
    })
    setBusy(false)
    setCatName('')
    setCatAmount('')
    setCatDay('1')
  }

  async function onUpload(file: File | null) {
    if (!uploadFor || !file) return
    setBusy(true)
    await uploadInvoice(uploadFor.id, file, invoiceNo)
    setBusy(false)
    setUploadFor(null)
    setInvoiceNo('')
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 pb-16 sm:p-6" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--text-dark)]">הוצאות</h1>
          <p className="mt-1 max-w-2xl text-[14px] text-[var(--text-mid)]">
            מודול פנימי של Beo OS — לפי חודשים, הוצאות קבועות, וממתין לחשבונית עד להעלאה
            (ירוק).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/suppliers"
            className="rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-[13px] font-bold text-[var(--text-dark)]"
          >
            ניהול ספקים
          </Link>
          <button
            type="button"
            onClick={() => setCatalogOpen(true)}
            className="rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-[13px] font-bold"
          >
            הוצאות קבועות ({catalog.filter((c) => c.active).length})
          </button>
          <button
            type="button"
            disabled={busy || catalog.length === 0}
            onClick={() => void ensureFixedForMonth(ym)}
            className="rounded-xl border border-emerald-700 bg-emerald-50 px-4 py-2 text-[13px] font-bold text-emerald-900 disabled:opacity-50"
          >
            צור קבועות ל־{monthLabelHe(ym)}
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="rounded-xl bg-[var(--brand)] px-4 py-2 text-[13px] font-bold text-white"
          >
            + הוצאה לחודש
          </button>
        </div>
      </header>

      <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[13px] font-bold"
              onClick={() => setYm(addMonths(ym, -1))}
              aria-label="חודש קודם"
            >
              ‹
            </button>
            <div className="min-w-[140px] text-center text-[15px] font-extrabold">
              {monthLabelHe(ym)}
            </div>
            <button
              type="button"
              className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[13px] font-bold"
              onClick={() => setYm(addMonths(ym, 1))}
              aria-label="חודש הבא"
            >
              ›
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] font-bold text-[var(--text-mid)]"
              onClick={() => setYm(currentYm())}
            >
              החודש
            </button>
          </div>
          <select
            className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-[13px] font-semibold"
            value={ym}
            onChange={(e) => setYm(e.target.value)}
            aria-label="קפיצה לחודש"
          >
            {months.map((m) => {
              const c = monthCounts.get(m.value)
              return (
                <option key={m.value} value={m.value}>
                  {m.label}
                  {c ? ` · ${c.count}` : ''}
                </option>
              )
            })}
          </select>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {smartMonths.map((m) => {
            const c = monthCounts.get(m)
            const active = m === ym
            return (
              <button
                key={m}
                type="button"
                onClick={() => setYm(m)}
                className={`shrink-0 rounded-xl px-3 py-2 text-[12px] font-bold transition ${
                  active
                    ? 'bg-[var(--brand)] text-white'
                    : 'bg-[var(--surface-muted)] text-[var(--text-mid)] hover:bg-black/[0.06]'
                }`}
              >
                {monthLabelHe(m).replace(/ \d{4}$/, '')}
                {c ? (
                  <span className={`ms-1 ${active ? 'text-white/80' : 'text-[var(--text-light)]'}`}>
                    ({c.count})
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
          <label className="text-[12px] font-bold text-[var(--text-mid)]">ספק</label>
          <select
            className="min-w-[180px] rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-[13px] font-semibold"
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
          >
            <option value="">כל הספקים</option>
            {suppliersInMonth.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            {activeSuppliers
              .filter((s) => !suppliersInMonth.some((x) => x.id === s.id))
              .map((s) => (
                <option key={`all-${s.id}`} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ['all', 'הכל'],
                ['waiting', 'ממתין לחשבונית'],
                ['ready', 'עם חשבונית'],
                ['fixed', 'קבועות'],
                ['operating', 'שוטפות'],
                ['office', 'משרד'],
                ['project', 'פרויקט'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`rounded-xl px-3 py-2 text-[13px] font-bold transition ${
                  filter === id
                    ? 'bg-[var(--brand)] text-white'
                    : 'text-[var(--text-mid)] hover:bg-black/[0.04]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'הוצאות בחודש', value: String(kpis.count) },
          { label: 'סה״כ', value: formatNis(kpis.total) },
          {
            label: 'ממתין לחשבונית',
            value: `${kpis.waiting} · ${formatNis(kpis.waitingSum)}`,
            tone: 'amber' as const,
          },
          {
            label: 'עם חשבונית',
            value: String(kpis.ready),
            tone: 'green' as const,
          },
        ].map((k) => (
          <div
            key={k.label}
            className={`rounded-2xl border px-4 py-3 shadow-sm ${
              k.tone === 'amber'
                ? 'border-amber-200 bg-amber-50'
                : k.tone === 'green'
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-[var(--border)] bg-white'
            }`}
          >
            <div className="text-[12px] font-bold text-[var(--text-mid)]">{k.label}</div>
            <div className="mt-1 text-[18px] font-extrabold text-[var(--text-dark)]">{k.value}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-muted)]/40 px-5 py-3">
          <h2 className="text-[15px] font-extrabold tracking-tight text-[var(--text-dark)]">
            {monthLabelHe(ym)}
          </h2>
          <span className="text-[12px] font-semibold text-[var(--text-mid)]">
            {loading ? 'טוען…' : `${monthRows.length} הוצאות`}
          </span>
        </div>
        {monthRows.length === 0 ? (
          <div className="px-5 py-12 text-center text-[14px] text-[var(--text-mid)]">
            אין הוצאות בחודש זה לפי הסינון. הוסיפו הוצאה או צרו מהקטלוג הקבוע.
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-right">
              <thead>
                <tr className="border-b border-[var(--border)] bg-white">
                  <th className="w-[100px] px-3 py-2.5 text-[11px] font-bold text-[var(--text-light)]">
                    תאריך
                  </th>
                  <th className="min-w-[200px] px-3 py-2.5 text-[11px] font-bold text-[var(--text-light)]">
                    הוצאה
                  </th>
                  <th className="w-[18%] px-3 py-2.5 text-[11px] font-bold text-[var(--text-light)]">
                    ספק
                  </th>
                  <th className="w-[120px] px-3 py-2.5 text-[11px] font-bold text-[var(--text-light)]">
                    סכום
                  </th>
                  <th className="w-[100px] px-3 py-2.5 text-[11px] font-bold text-[var(--text-light)]">
                    חשבונית
                  </th>
                  <th className="w-[108px] px-3 py-2.5 text-[11px] font-bold text-[var(--text-light)]">
                    פעולות
                  </th>
                </tr>
              </thead>
              <tbody>
                {monthRows.map((e) => {
                  const ready = expenseHasInvoice(e)
                  const fixed = e.recurring || e.type === 'fixed'
                  const allocLabel =
                    e.allocation === 'project'
                      ? projectNameById.get(e.projectId ?? '') || 'פרויקט'
                      : 'משרד'
                  const supplierLabel = e.supplierId
                    ? supplierById.get(e.supplierId)?.name || e.supplierName || '—'
                    : e.supplierName || '—'
                  const dateLabel = e.expenseDate
                    ? e.expenseDate.split('-').reverse().join('.')
                    : '—'
                  return (
                    <tr
                      key={e.id}
                      className="border-b border-[var(--border)]/80 transition hover:bg-slate-50/80"
                    >
                      <td className="px-3 py-3.5 align-middle">
                        <div
                          className={`border-e-2 pe-2.5 ${
                            ready ? 'border-emerald-400' : 'border-amber-400'
                          }`}
                        >
                          <div className="font-mono text-[12px] font-semibold tabular-nums text-[var(--text-dark)]">
                            {dateLabel}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 align-middle">
                        <div className="text-[13px] font-bold text-[var(--text-dark)]">
                          {e.name}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <KindChip fixed={fixed} />
                          <AllocChip allocation={e.allocation} label={allocLabel} />
                          {e.paymentMethod ? (
                            <span className="text-[11px] text-[var(--text-mid)]">
                              {e.paymentMethod}
                            </span>
                          ) : null}
                        </div>
                        {e.description ? (
                          <div className="mt-1 line-clamp-1 text-[11px] text-[var(--text-mid)]">
                            {e.description}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3.5 align-middle">
                        <div className="truncate text-[13px] font-medium text-[var(--text-dark)]">
                          {supplierLabel}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 align-middle">
                        <div className="text-[14px] font-extrabold tabular-nums text-[var(--text-dark)]">
                          {formatNis(e.amount)}
                        </div>
                        {e.currency && e.currency !== 'ILS' && e.originalAmount ? (
                          <div className="mt-0.5 font-mono text-[10px] tabular-nums text-[var(--text-light)]">
                            {CURRENCY_SYMBOL[e.currency] ?? e.currency}
                            {e.originalAmount.toLocaleString('he-IL', {
                              maximumFractionDigits: 2,
                            })}
                            {e.exchangeRate ? ` × ${e.exchangeRate}` : ''}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3.5 align-middle">
                        <InvoiceBadge expense={e} />
                      </td>
                      <td className="px-3 py-3.5 align-middle">
                        <ExpenseRowActions
                          expense={e}
                          onUpload={() => {
                            setUploadFor(e)
                            setInvoiceNo(e.invoiceNumber ?? '')
                          }}
                          onMarkReceived={() =>
                            void updateExpense(e.id, { supplierInvoiceReceived: true })
                          }
                          onDelete={() => {
                            if (window.confirm('למחוק את ההוצאה?')) void deleteExpense(e.id)
                          }}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        title="הוצאה חדשה"
        size="xl"
        bodyClassName="overflow-y-auto max-h-[min(75vh,780px)]"
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[12px] font-bold">תאריך ההוצאה *</label>
              <input
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                type="date"
                value={form.expenseDate}
                onChange={(e) => {
                  const expenseDate = e.target.value
                  setForm((f) => ({ ...f, expenseDate }))
                  if (/^\d{4}-\d{2}/.test(expenseDate)) setYm(expenseDate.slice(0, 7))
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-bold">שם ההוצאה *</label>
              <input
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="שכירות / תוכנה / פרסום…"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[12px] font-bold">מטבע *</label>
              <select
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                value={form.currency}
                onChange={(e) => {
                  const currency = e.target.value as BeoExpenseCurrency
                  setRateSource(null)
                  setRateError(null)
                  setForm((f) => ({
                    ...f,
                    currency,
                    exchangeRate: '',
                  }))
                }}
              >
                <option value="ILS">שקל ₪</option>
                <option value="USD">דולר $</option>
                <option value="EUR">יורו €</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-bold">
                סכום {form.currency === 'ILS' ? '₪' : CURRENCY_SYMBOL[form.currency]} *
              </label>
              <input
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-bold">ספק *</label>
              <div className="flex gap-2">
                <select
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                  value={form.supplierId}
                  onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
                >
                  <option value="">בחרו ספק…</option>
                  {activeSuppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[12px] font-bold whitespace-nowrap"
                  onClick={() => setQuickSupplierOpen(true)}
                >
                  + ספק
                </button>
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-mid)]">
                חובה לשייך לספק רשום.{' '}
                <Link to="/suppliers" className="font-bold text-[var(--brand)] hover:underline">
                  ניהול ספקים
                </Link>
              </p>
            </div>
          </div>

          {form.currency !== 'ILS' ? (
            <div className="grid gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="block text-[12px] font-bold">
                    שער המרה ל־₪ {rateLoading ? '(טוען…)' : ''}
                  </label>
                  <button
                    type="button"
                    className="text-[11px] font-bold text-[var(--brand)] hover:underline disabled:opacity-50"
                    disabled={rateLoading}
                    onClick={() => void loadMarketRate(form.currency as 'USD' | 'EUR', true)}
                  >
                    רענון שער שוק
                  </button>
                </div>
                <input
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.exchangeRate}
                  onChange={(e) => {
                    setRateSource('manual')
                    setForm((f) => ({ ...f, exchangeRate: e.target.value }))
                  }}
                />
                <p className="mt-1 text-[11px] text-[var(--text-mid)]">
                  {rateSource === 'boi'
                    ? 'נטען מבנק ישראל (שער יציג).'
                    : rateSource === 'frankfurter'
                      ? 'נטען משער שוק עדכני.'
                      : rateSource === 'manual'
                        ? 'נערך ידנית — אפשר לפי שער כרטיס האשראי.'
                        : 'נטען אוטומטית לפי שער השוק.'}
                </p>
                {rateError ? (
                  <p className="mt-1 text-[11px] font-semibold text-amber-800">{rateError}</p>
                ) : null}
              </div>
              <div className="flex flex-col justify-center">
                <div className="text-[12px] font-bold text-[var(--text-mid)]">סכום בשקלים</div>
                <div className="mt-1 text-[20px] font-extrabold text-[var(--text-dark)]">
                  {convertedNis > 0 ? formatNis(convertedNis) : '—'}
                </div>
              </div>
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-[12px] font-bold">אופן תשלום</label>
            <input
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              value={form.paymentMethod}
              onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
              placeholder="למשל: ויזה ****1234 · מקס · העברה מבנק הפועלים"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-bold">סוג הוצאה *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, kind: 'operating' }))}
                className={`rounded-xl border px-3 py-2.5 text-[13px] font-bold transition ${
                  form.kind === 'operating'
                    ? 'border-sky-600 bg-sky-50 text-sky-900 ring-2 ring-sky-200'
                    : 'border-[var(--border)] bg-white text-[var(--text-mid)] hover:bg-black/[0.03]'
                }`}
              >
                הוצאה שוטפת
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, kind: 'fixed' }))}
                className={`rounded-xl border px-3 py-2.5 text-[13px] font-bold transition ${
                  form.kind === 'fixed'
                    ? 'border-slate-700 bg-slate-100 text-slate-900 ring-2 ring-slate-300'
                    : 'border-[var(--border)] bg-white text-[var(--text-mid)] hover:bg-black/[0.03]'
                }`}
              >
                הוצאה קבועה
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-bold">שיוך *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, allocation: 'office', projectId: '' }))
                }
                className={`rounded-xl border px-3 py-2.5 text-[13px] font-bold transition ${
                  form.allocation === 'office'
                    ? 'border-orange-600 bg-orange-50 text-orange-950 ring-2 ring-orange-200'
                    : 'border-[var(--border)] bg-white text-[var(--text-mid)] hover:bg-black/[0.03]'
                }`}
              >
                הוצאות משרד
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, allocation: 'project' }))}
                className={`rounded-xl border px-3 py-2.5 text-[13px] font-bold transition ${
                  form.allocation === 'project'
                    ? 'border-violet-600 bg-violet-50 text-violet-950 ring-2 ring-violet-200'
                    : 'border-[var(--border)] bg-white text-[var(--text-mid)] hover:bg-black/[0.03]'
                }`}
              >
                שיוך לפרויקט
              </button>
            </div>
            {form.allocation === 'project' ? (
              <div className="mt-2">
                <label className="mb-1 block text-[12px] font-bold">פרויקט *</label>
                <select
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                  value={form.projectId}
                  onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                >
                  <option value="">בחרו פרויקט…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {projects.length === 0 ? (
                  <p className="mt-1 text-[11px] text-amber-800">
                    אין פרויקטים במערכת — צרו פרויקט או שייכו להוצאות משרד.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-1.5 text-[11px] text-[var(--text-mid)]">
                תסווג כהוצאת משרד כללית (לא משויכת לפרויקט לקוח).
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[12px] font-bold">חודש ליומן</label>
              <input
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[var(--text-mid)]"
                readOnly
                value={
                  form.expenseDate
                    ? monthLabelHe(form.expenseDate.slice(0, 7))
                    : monthLabelHe(ym)
                }
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-bold">תיאור</label>
            <input
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-bold">הערות</label>
            <textarea
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-[13px] font-bold"
              onClick={() => setAddOpen(false)}
            >
              ביטול
            </button>
            <button
              type="button"
              disabled={
                busy ||
                !form.name.trim() ||
                !form.amount ||
                !form.expenseDate ||
                convertedNis <= 0 ||
                (form.currency !== 'ILS' && !Number(form.exchangeRate)) ||
                (form.allocation === 'project' && !form.projectId) ||
                !form.supplierId
              }
              className="rounded-xl bg-[var(--brand)] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
              onClick={() => void submitExpense()}
            >
              שמור
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={quickSupplierOpen}
        onClose={() => setQuickSupplierOpen(false)}
        title="ספק חדש"
        size="md"
      >
        <div className="space-y-3">
          <p className="text-[13px] text-[var(--text-mid)]">
            נפתח כרטיס ספק במערכת ומייד משויך להוצאה.
          </p>
          <div>
            <label className="mb-1 block text-[12px] font-bold">שם ספק *</label>
            <input
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              value={quickSupplierName}
              onChange={(e) => setQuickSupplierName(e.target.value)}
              placeholder="Google / חברת חשמל / …"
              autoFocus
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[12px] font-bold">טלפון</label>
              <input
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                value={quickSupplierPhone}
                onChange={(e) => setQuickSupplierPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-bold">אימייל</label>
              <input
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                value={quickSupplierEmail}
                onChange={(e) => setQuickSupplierEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-[13px] font-bold"
              onClick={() => setQuickSupplierOpen(false)}
            >
              ביטול
            </button>
            <button
              type="button"
              disabled={busy || !quickSupplierName.trim()}
              className="rounded-xl bg-[var(--brand)] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
              onClick={() => void createQuickSupplier()}
            >
              שמור ושייך
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        title="קטלוג הוצאות קבועות"
        size="xl"
        bodyClassName="overflow-y-auto max-h-[min(70vh,720px)]"
      >
        <p className="mb-4 text-[13px] text-[var(--text-mid)]">
          תבניות חודשיות. לחצו «צור קבועות לחודש» במסך הראשי כדי לפתוח שורות בחודש
          הנבחר — כל אחת מתחילה כ«ממתין לחשבונית».
        </p>
        <div className="mb-4 grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 sm:grid-cols-[1fr_120px_80px_auto]">
          <input
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
            placeholder="שם (שכירות, אינטרנט…)"
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
          />
          <input
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
            type="number"
            placeholder="סכום"
            value={catAmount}
            onChange={(e) => setCatAmount(e.target.value)}
          />
          <input
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
            type="number"
            min={1}
            max={31}
            placeholder="יום"
            value={catDay}
            onChange={(e) => setCatDay(e.target.value)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void submitCatalog()}
            className="rounded-lg bg-[var(--brand)] px-3 py-2 text-[13px] font-bold text-white"
          >
            הוסף
          </button>
        </div>
        {catalog.length === 0 ? (
          <p className="text-[13px] text-[var(--text-mid)]">עדיין אין הוצאות קבועות בקטלוג.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {catalog.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <div className="font-bold">{c.name}</div>
                  <div className="text-[12px] text-[var(--text-mid)]">
                    {formatNis(c.amount)} · יום {c.dayOfMonth} בחודש
                    {!c.active ? ' · לא פעיל' : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-[12px] font-semibold text-red-600 hover:underline"
                  onClick={() => {
                    if (window.confirm('להסיר מהקטלוג?')) void deleteCatalogItem(c.id)
                  }}
                >
                  הסר
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(uploadFor)}
        onClose={() => setUploadFor(null)}
        title={uploadFor ? `העלאת חשבונית · ${uploadFor.name}` : 'העלאת חשבונית'}
        size="md"
      >
        {uploadFor ? (
          <div className="space-y-3">
            <p className="text-[13px] text-[var(--text-mid)]">
              אחרי ההעלאה השורה מסומנת בירוק («יש חשבונית»).
            </p>
            <div>
              <label className="mb-1 block text-[12px] font-bold">מספר חשבונית (אופציונלי)</label>
              <input
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-bold">קובץ PDF / תמונה</label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                disabled={busy}
                onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
