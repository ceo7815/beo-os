import { useMemo, useState } from 'react'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { Modal } from '../components/shared/Modal'
import { formatDateIL, todayYmd } from '../lib/dates'
import { useClients } from '../hooks/useClients'
import { useInvoices, type NewInvoiceInput } from '../hooks/useInvoices'
import type { Invoice, InvoiceStatus } from '../types'

function formatILS(n: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(n)
}

function ymd(s: string): string {
  return s.slice(0, 10)
}

/** חיובי = תאריך יעד בעתיד ביחס להיום */
function daysUntilDue(dueYmd: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueYmd)) return null
  const [y, m, d] = dueYmd.split('-').map(Number)
  const [yt, mt, dt] = today.split('-').map(Number)
  const due = Date.UTC(y, m - 1, d)
  const t = Date.UTC(yt, mt - 1, dt)
  return Math.round((due - t) / 86400000)
}

function sortInvoices(a: Invoice, b: Invoice): number {
  const rank = (s: InvoiceStatus) =>
    s === 'overdue' ? 0 : s === 'pending' ? 1 : 2
  const c = rank(a.status) - rank(b.status)
  if (c !== 0) return c
  return ymd(a.dueDate).localeCompare(ymd(b.dueDate))
}

function statusBadge(status: InvoiceStatus): { label: string; bg: string; color: string } {
  switch (status) {
    case 'pending':
      return { label: 'ממתין', bg: '#F59E0B', color: '#fff' }
    case 'overdue':
      return { label: 'באיחור', bg: '#EF4444', color: '#fff' }
    case 'paid':
      return { label: 'שולם ✓', bg: '#10B981', color: '#fff' }
  }
}

function DaysCell({ inv, today }: { inv: Invoice; today: string }) {
  if (inv.status === 'paid') {
    const pd = inv.paidDate
    return (
      <span className="text-[13px] text-[var(--text-mid)]">
        {pd ? formatDateIL(pd) : '—'}
      </span>
    )
  }
  const due = ymd(inv.dueDate)
  const diff = daysUntilDue(due, today)
  if (diff === null) {
    return <span className="text-[var(--text-light)]">—</span>
  }
  if (diff > 0) {
    return (
      <span className="text-[13px] font-medium text-[#10B981]">
        עוד {diff} ימים
      </span>
    )
  }
  if (diff === 0) {
    return (
      <span className="text-[13px] font-medium text-[#F59E0B]">היום</span>
    )
  }
  return (
    <span className="text-[13px] font-medium text-[#EF4444]">
      איחור {Math.abs(diff)} ימים
    </span>
  )
}

function KpiMini(props: {
  label: string
  value: string
  borderColor: string
}) {
  return (
    <div
      className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[0_2px_12px_rgba(0,0,0,0.08)]"
      style={{ borderTopWidth: 4, borderTopColor: props.borderColor }}
    >
      <div className="text-[22px] font-extrabold tabular-nums text-[var(--text-dark)]">
        {props.value}
      </div>
      <div className="mt-1 text-[12px] text-[var(--text-mid)]">{props.label}</div>
    </div>
  )
}

const emptyForm: NewInvoiceInput = {
  clientId: '',
  invoiceNumber: '',
  amount: 0,
  dueDate: '',
  note: '',
}

export function Collections() {
  const { clients } = useClients()
  const { invoices, loading, addInvoice, markAsPaid, deleteInvoice } =
    useInvoices()
  const today = todayYmd()

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<NewInvoiceInput>(emptyForm)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const currentYm = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const kpis = useMemo(() => {
    let toCollect = 0
    let paidMonth = 0
    let overdueCount = 0
    for (const inv of invoices) {
      if (inv.status === 'pending' || inv.status === 'overdue') {
        toCollect += inv.amount
      }
      if (inv.status === 'paid') {
        const pd = inv.paidDate ? ymd(inv.paidDate) : ''
        if (pd.startsWith(currentYm)) paidMonth += inv.amount
      }
      if (inv.status === 'overdue') overdueCount += 1
    }
    return { toCollect, paidMonth, overdueCount }
  }, [invoices, currentYm])

  const clientName = useMemo(() => {
    const m = new Map<string, string>()
    clients.forEach((c) => m.set(c.id, c.name))
    return m
  }, [clients])

  const sorted = useMemo(
    () => [...invoices].sort(sortInvoices),
    [invoices],
  )

  const openModal = () => {
    setForm({ ...emptyForm, dueDate: today })
    setModalOpen(true)
  }

  const submit = () => {
    if (!form.clientId.trim() || !form.invoiceNumber.trim()) return
    if (!form.dueDate || form.amount <= 0) return
    void addInvoice({
      clientId: form.clientId,
      invoiceNumber: form.invoiceNumber,
      amount: form.amount,
      dueDate: form.dueDate,
      note: form.note?.trim() || undefined,
    })
    setModalOpen(false)
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-8 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={openModal}
          className="hub-btn-orange text-sm"
        >
          + הוספת חשבונית
        </button>
        <div className="min-w-0 flex-1 sm:flex-none">
          <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">
            מעקב גבייה 💰
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-mid)]">
            חשבוניות ותשלומים
          </p>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiMini
          label="לגבייה"
          value={formatILS(kpis.toCollect)}
          borderColor="#2563EB"
        />
        <KpiMini
          label="שולם החודש"
          value={formatILS(kpis.paidMonth)}
          borderColor="#10B981"
        />
        <KpiMini
          label="באיחור"
          value={String(kpis.overdueCount)}
          borderColor="#EF4444"
        />
      </section>

      <div className="overflow-x-auto rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
        <table className="w-full min-w-[880px] border-collapse text-right text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-main)] text-[12px] font-bold text-[var(--text-mid)]">
              <th className="px-4 py-3">לקוח</th>
              <th className="px-4 py-3">מספר חשבונית</th>
              <th className="px-4 py-3">סכום</th>
              <th className="px-4 py-3">תאריך לתשלום</th>
              <th className="px-4 py-3">ימים</th>
              <th className="px-4 py-3">סטטוס</th>
              <th className="px-4 py-3">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-mid)]">
                  טוען…
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-mid)]">
                  אין חשבוניות
                </td>
              </tr>
            ) : (
              sorted.map((inv) => {
                const badge = statusBadge(inv.status)
                const rowBg =
                  inv.status === 'overdue' ? '#FEF2F2' : 'transparent'
                const rowOpacity = inv.status === 'paid' ? 0.6 : 1
                return (
                  <tr
                    key={inv.id}
                    className="border-b border-[var(--border)] transition"
                    style={{
                      backgroundColor: rowBg,
                      opacity: rowOpacity,
                    }}
                  >
                    <td className="px-4 py-3 font-medium text-[var(--text-dark)]">
                      {clientName.get(inv.clientId) ?? '—'}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums">
                      {formatILS(inv.amount)}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-mid)]">
                      {formatDateIL(inv.dueDate)}
                    </td>
                    <td className="px-4 py-3">
                      <DaysCell inv={inv} today={today} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                        style={{ backgroundColor: badge.bg, color: badge.color }}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {(inv.status === 'pending' || inv.status === 'overdue') ? (
                          <button
                            type="button"
                            onClick={() => void markAsPaid(inv.id)}
                            className="rounded-lg bg-[#10B981] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
                          >
                            סמן כשולם
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setDeleteId(inv.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-mid)] transition hover:border-[#EF4444] hover:bg-[#FEF2F2] hover:text-[#EF4444]"
                          aria-label="מחק"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="הוספת חשבונית"
      >
        <div className="space-y-4">
          <label className="block text-[13px] font-semibold text-[var(--text-dark)]">
            לקוח
            <select
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2 text-sm"
              value={form.clientId}
              onChange={(e) =>
                setForm((f) => ({ ...f, clientId: e.target.value }))
              }
            >
              <option value="">בחר לקוח</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[13px] font-semibold text-[var(--text-dark)]">
            מספר חשבונית
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2 text-sm"
              value={form.invoiceNumber}
              onChange={(e) =>
                setForm((f) => ({ ...f, invoiceNumber: e.target.value }))
              }
            />
          </label>
          <label className="block text-[13px] font-semibold text-[var(--text-dark)]">
            סכום (₪)
            <input
              type="number"
              min={0}
              step={0.01}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2 text-sm tabular-nums"
              value={form.amount || ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  amount: e.target.value === '' ? 0 : Number(e.target.value),
                }))
              }
            />
          </label>
          <label className="block text-[13px] font-semibold text-[var(--text-dark)]">
            תאריך לתשלום
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2 text-sm"
              value={form.dueDate.slice(0, 10)}
              onChange={(e) =>
                setForm((f) => ({ ...f, dueDate: e.target.value }))
              }
            />
          </label>
          <label className="block text-[13px] font-semibold text-[var(--text-dark)]">
            הערה (אופציונלי)
            <textarea
              rows={3}
              className="mt-1 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2 text-sm"
              value={form.note ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, note: e.target.value }))
              }
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="hub-btn-secondary text-sm"
            >
              ביטול
            </button>
            <button type="button" onClick={submit} className="hub-btn-primary text-sm">
              שמור
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) void deleteInvoice(deleteId)
          setDeleteId(null)
        }}
        message="למחוק את החשבונית? פעולה זו אינה הפיכה."
      />
    </div>
  )
}
