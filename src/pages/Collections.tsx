import { useMemo, useState } from 'react'
import { ClientQuickSelect } from '../components/ClientQuickSelect'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { Modal } from '../components/shared/Modal'
import { formatDateIL, todayYmd } from '../lib/dates'
import { clientDepartmentLabel } from '../lib/clientDepartment'
import {
  getCollectionTrackingStatus,
  type CollectionTrackingDisplayStatus,
} from '../lib/collectionTrackingStatus'
import { useClients } from '../hooks/useClients'
import {
  useCollectionTracking,
  type CollectionTrackingInput,
} from '../hooks/useCollectionTracking'
import type { Client, CollectionTracking } from '../types'

const GREEN_INVOICE_URL =
  (import.meta.env.VITE_GREEN_INVOICE_URL as string | undefined)?.trim() ||
  'https://www.greeninvoice.co.il/'

function ymd(s: string): string {
  return s.slice(0, 10)
}

function daysLate(dueYmd: string, today: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueYmd)) return 0
  const [y, m, d] = dueYmd.split('-').map(Number)
  const [yt, mt, dt] = today.split('-').map(Number)
  const due = Date.UTC(y, m - 1, d)
  const t = Date.UTC(yt, mt - 1, dt)
  return Math.max(0, Math.round((t - due) / 86400000))
}

function statusBadge(
  s: CollectionTrackingDisplayStatus,
): { label: string; bg: string; color: string } {
  switch (s) {
    case 'paid':
      return { label: 'שולם ✓', bg: '#10B981', color: '#fff' }
    case 'overdue':
      return { label: 'באיחור', bg: '#EF4444', color: '#fff' }
    default:
      return { label: 'במעקב', bg: '#F59E0B', color: '#fff' }
  }
}

function sortEntries(a: CollectionTracking, b: CollectionTracking, today: string): number {
  const sa = getCollectionTrackingStatus(a, today)
  const sb = getCollectionTrackingStatus(b, today)
  const rank = (x: CollectionTrackingDisplayStatus) =>
    x === 'overdue' ? 0 : x === 'pending' ? 1 : 2
  const c = rank(sa) - rank(sb)
  if (c !== 0) return c
  return ymd(a.dueDate).localeCompare(ymd(b.dueDate))
}

function KpiMini(props: {
  label: string
  value: string
  borderColor: string
  sub?: string
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
      {props.sub ? (
        <div className="mt-0.5 text-[10px] text-[var(--text-light)]">{props.sub}</div>
      ) : null}
    </div>
  )
}

const emptyForm: CollectionTrackingInput = {
  clientId: '',
  lastRequestDate: '',
  dueDate: '',
  paidDate: '',
  note: '',
}

export function Collections() {
  const { clients } = useClients()
  const {
    entries,
    loading,
    upsertTracking,
    removeFromTracking,
    markPaid,
    clearPaid,
  } = useCollectionTracking()
  const today = todayYmd()

  const [addModal, setAddModal] = useState(false)
  const [form, setForm] = useState<CollectionTrackingInput>(emptyForm)
  const [editing, setEditing] = useState<CollectionTracking | null>(null)
  const [removeId, setRemoveId] = useState<string | null>(null)

  const trackedClientIds = useMemo(
    () => new Set(entries.map((e) => e.clientId)),
    [entries],
  )

  const clientsById = useMemo(() => {
    const m = new Map<string, Client>()
    clients.forEach((c) => m.set(c.id, c))
    return m
  }, [clients])

  const availableForAdd = useMemo(
    () => clients.filter((c) => !trackedClientIds.has(c.id)),
    [clients, trackedClientIds],
  )

  const currentYm = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const kpis = useMemo(() => {
    let openCount = 0
    let paidMonth = 0
    let overdueCount = 0
    for (const row of entries) {
      const st = getCollectionTrackingStatus(row, today)
      if (st !== 'paid') openCount += 1
      if (st === 'overdue') overdueCount += 1
      const pd = row.paidDate ? ymd(row.paidDate) : ''
      if (pd && pd.startsWith(currentYm)) paidMonth += 1
    }
    return { openCount, paidMonth, overdueCount }
  }, [entries, today, currentYm])

  const sorted = useMemo(
    () => [...entries].sort((a, b) => sortEntries(a, b, today)),
    [entries, today],
  )

  const collectionByDepartment = useMemo(() => {
    const map = new Map<
      string,
      { total: number; open: number; overdue: number; paidMonth: number }
    >()
    for (const row of entries) {
      const client = clientsById.get(row.clientId)
      const dept = clientDepartmentLabel(client)
      const st = getCollectionTrackingStatus(row, today)
      const cur = map.get(dept) ?? {
        total: 0,
        open: 0,
        overdue: 0,
        paidMonth: 0,
      }
      cur.total += 1
      if (st !== 'paid') cur.open += 1
      if (st === 'overdue') cur.overdue += 1
      const pd = row.paidDate ? ymd(row.paidDate) : ''
      if (pd && pd.startsWith(currentYm)) cur.paidMonth += 1
      map.set(dept, cur)
    }
    const rows = [...map.entries()].map(([department, stats]) => ({
      department,
      ...stats,
    }))
    rows.sort((a, b) => {
      const unk = 'ללא מחלקה'
      if (a.department === unk && b.department !== unk) return 1
      if (b.department === unk && a.department !== unk) return -1
      return a.department.localeCompare(b.department, 'he')
    })
    return rows
  }, [entries, clientsById, today, currentYm])

  const collectionDeptTotals = useMemo(
    () =>
      collectionByDepartment.reduce(
        (acc, r) => ({
          total: acc.total + r.total,
          open: acc.open + r.open,
          overdue: acc.overdue + r.overdue,
          paidMonth: acc.paidMonth + r.paidMonth,
        }),
        { total: 0, open: 0, overdue: 0, paidMonth: 0 },
      ),
    [collectionByDepartment],
  )

  const openGreenInvoice = () => {
    window.open(GREEN_INVOICE_URL, '_blank', 'noopener,noreferrer')
  }

  const openAdd = () => {
    setForm({
      ...emptyForm,
      lastRequestDate: today,
      dueDate: today,
    })
    setAddModal(true)
  }

  const submitAdd = () => {
    if (!form.clientId.trim() || !form.lastRequestDate || !form.dueDate) return
    void upsertTracking({
      clientId: form.clientId,
      lastRequestDate: form.lastRequestDate,
      dueDate: form.dueDate,
      paidDate: form.paidDate?.trim() || undefined,
      note: form.note?.trim() || undefined,
    })
    setAddModal(false)
  }

  const submitEdit = () => {
    if (!editing) return
    if (!form.lastRequestDate || !form.dueDate) return
    void upsertTracking({
      clientId: editing.clientId,
      lastRequestDate: form.lastRequestDate,
      dueDate: form.dueDate,
      paidDate: form.paidDate?.trim() || undefined,
      note: form.note?.trim() || undefined,
    })
    setEditing(null)
  }

  const openEdit = (row: CollectionTracking) => {
    setForm({
      clientId: row.clientId,
      lastRequestDate: row.lastRequestDate.slice(0, 10),
      dueDate: row.dueDate.slice(0, 10),
      paidDate: row.paidDate?.slice(0, 10) ?? '',
      note: row.note ?? '',
    })
    setEditing(row)
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-8 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openAdd}
            disabled={availableForAdd.length === 0}
            className="hub-btn-orange text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            + הוסף לקוח למעקב
          </button>
          <button
            type="button"
            onClick={openGreenInvoice}
            className="rounded-[10px] border border-[#16A34A] bg-[#ECFDF5] px-4 py-2 text-sm font-bold text-[#15803D] transition hover:bg-[#D1FAE5]"
          >
            חשבונית ירוקה ↗
          </button>
        </div>
        <div className="min-w-0 flex-1 sm:flex-none sm:text-right">
          <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">
            מעקב גבייה
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-mid)]">
            מעקב עצמאי ללקוחות — חשבוניות ותשלומים מנוהלים בחשבונית ירוקה
          </p>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiMini
          label="במעקב (לא סומן שולם)"
          value={String(kpis.openCount)}
          borderColor="#2563EB"
          sub="לקוחות ברשימת המעקב"
        />
        <KpiMini
          label="סומנו כשולמו החודש"
          value={String(kpis.paidMonth)}
          borderColor="#10B981"
        />
        <KpiMini
          label="באיחור (לפי יעד)"
          value={String(kpis.overdueCount)}
          borderColor="#EF4444"
        />
      </section>

      {entries.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-[14px] font-bold text-[var(--blue-dark)]">
            פירוט לפי מחלקת לקוח
          </h2>
          <p className="text-[11px] text-[var(--text-mid)]">
            המחלקה מוגדרת בכרטיס הלקוח. לקוח בלי מחלקה נספר תחת «ללא מחלקה». חודש
            «שולמו» = {currentYm}.
          </p>
          <div className="overflow-x-auto rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <table className="w-full min-w-[520px] border-collapse text-right text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-main)] text-[11px] font-bold text-[var(--text-mid)]">
                  <th className="px-4 py-2.5">מחלקה</th>
                  <th className="px-4 py-2.5">במעקב</th>
                  <th className="px-4 py-2.5 text-[#EF4444]">באיחור</th>
                  <th className="px-4 py-2.5 text-[#15803D]">שולמו החודש</th>
                  <th className="px-4 py-2.5">סה״כ</th>
                </tr>
              </thead>
              <tbody>
                {collectionByDepartment.map((r) => (
                  <tr
                    key={r.department}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-4 py-2 font-semibold text-[var(--text-dark)]">
                      {r.department}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-[var(--text-mid)]">
                      {r.open}
                    </td>
                    <td className="px-4 py-2 tabular-nums font-semibold text-[#EF4444]">
                      {r.overdue}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-[#15803D]">
                      {r.paidMonth}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-[var(--text-dark)]">
                      {r.total}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border)] bg-[var(--bg-main)] text-[12px] font-bold text-[var(--text-dark)]">
                  <td className="px-4 py-2.5">סה״כ</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {collectionDeptTotals.open}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-[#EF4444]">
                    {collectionDeptTotals.overdue}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-[#15803D]">
                    {collectionDeptTotals.paidMonth}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {collectionDeptTotals.total}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
        <table className="w-full min-w-[1180px] border-collapse text-right text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-main)] text-[12px] font-bold text-[var(--text-mid)]">
              <th className="px-4 py-3">לקוח</th>
              <th className="px-4 py-3">מחלקה</th>
              <th className="px-4 py-3">איש קשר / טלפון</th>
              <th className="px-4 py-3">מייל</th>
              <th className="px-4 py-3">בקשת תשלום אחרונה</th>
              <th className="px-4 py-3">יעד תשלום</th>
              <th className="px-4 py-3">תאריך תשלום</th>
              <th className="px-4 py-3">הערות</th>
              <th className="px-4 py-3">סטטוס</th>
              <th className="px-4 py-3">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-[var(--text-mid)]">
                  טוען…
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-[var(--text-mid)]">
                  <p className="mb-2 font-medium text-[var(--text-dark)]">
                    אין לקוחות במעקב
                  </p>
                  <p className="text-[13px]">
                    הוסיפו לקוח מהרשימה כדי לעקוב אחרי בקשות תשלום ויעדים. לנפק חשבוניות
                    השתמשו ב־
                    <button
                      type="button"
                      onClick={openGreenInvoice}
                      className="mx-1 font-semibold text-[#15803D] underline"
                    >
                      חשבונית ירוקה
                    </button>
                  </p>
                </td>
              </tr>
            ) : (
              sorted.map((row) => {
                const client = clientsById.get(row.clientId)
                const st = getCollectionTrackingStatus(row, today)
                const badge = statusBadge(st)
                const rowBg = st === 'overdue' ? '#FEF2F2' : 'transparent'
                const rowOpacity = st === 'paid' ? 0.72 : 1
                return (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--border)] transition"
                    style={{
                      backgroundColor: rowBg,
                      opacity: rowOpacity,
                    }}
                  >
                    <td className="px-4 py-3 font-semibold text-[var(--text-dark)]">
                      {client?.name ?? 'לקוח לא נמצא'}
                    </td>
                    <td className="max-w-[140px] px-4 py-3 text-[12px] text-[var(--text-mid)]">
                      <span className="font-semibold text-[var(--blue-dark)]">
                        {clientDepartmentLabel(client)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[var(--text-mid)]">
                      <div>{client?.contact || '—'}</div>
                      <div className="tabular-nums text-[var(--text-light)]">
                        {client?.phone || '—'}
                      </div>
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-[12px] text-[var(--text-mid)]">
                      {client?.email || '—'}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[var(--text-mid)]">
                      {formatDateIL(row.lastRequestDate)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[var(--text-mid)]">
                      {formatDateIL(row.dueDate)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[var(--text-mid)]">
                      {row.paidDate ? formatDateIL(row.paidDate) : '—'}
                    </td>
                    <td
                      className="max-w-[240px] px-4 py-3 align-top text-[12px] text-[var(--text-mid)]"
                      title={row.note?.trim() ? row.note.trim() : undefined}
                    >
                      {row.note?.trim() ? (
                        <span className="line-clamp-4 whitespace-pre-wrap break-words">
                          {row.note.trim()}
                        </span>
                      ) : (
                        <span className="text-[var(--text-light)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                        style={{ backgroundColor: badge.bg, color: badge.color }}
                      >
                        {badge.label}
                      </span>
                      {st === 'overdue' ? (
                        <div className="mt-1 text-[11px] text-[#EF4444]">
                          איחור {daysLate(ymd(row.dueDate), today)} ימים
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-dark)] transition hover:bg-[var(--blue-light)]"
                        >
                          עריכה
                        </button>
                        {st !== 'paid' ? (
                          <button
                            type="button"
                            onClick={() => void markPaid(row.clientId)}
                            className="rounded-lg bg-[#10B981] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
                          >
                            סמן שולם
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void clearPaid(row.clientId)}
                            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-mid)] transition hover:bg-[var(--bg-main)]"
                          >
                            בטל תשלום
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setRemoveId(row.clientId)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-mid)] transition hover:border-[#EF4444] hover:bg-[#FEF2F2] hover:text-[#EF4444]"
                          aria-label="הסר ממעקב"
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
        isOpen={addModal}
        onClose={() => setAddModal(false)}
        title="הוספת לקוח למעקב גבייה"
        bodyClassName="overflow-visible max-h-none"
      >
        <div className="space-y-4">
          <p className="text-[12px] text-[var(--text-mid)]">
            הזינו תאריכי מעקב בלבד. לנפק חשבונית מסודרת השתמשו בחשבונית ירוקה.
          </p>
          <div className="block text-[13px] font-semibold text-[var(--text-dark)]">
            <label htmlFor="collection-add-client" className="block">
              לקוח — חיפוש חכם
            </label>
            <div className="relative z-10 mt-1 rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2">
              <ClientQuickSelect
                id="collection-add-client"
                clients={availableForAdd}
                value={form.clientId}
                onChange={(clientId) =>
                  setForm((f) => ({ ...f, clientId }))
                }
              />
            </div>
          </div>
          <label className="block text-[13px] font-semibold text-[var(--text-dark)]">
            תאריך בקשת תשלום אחרונה
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2 text-sm"
              value={form.lastRequestDate.slice(0, 10)}
              onChange={(e) =>
                setForm((f) => ({ ...f, lastRequestDate: e.target.value }))
              }
            />
          </label>
          <label className="block text-[13px] font-semibold text-[var(--text-dark)]">
            יעד תשלום (לזיהוי איחור)
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
            תאריך תשלום בפועל (אופציונלי)
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2 text-sm"
              value={form.paidDate?.slice(0, 10) ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, paidDate: e.target.value }))
              }
            />
          </label>
          <label className="block text-[13px] font-semibold text-[var(--text-dark)]">
            הערה (אופציונלי)
            <textarea
              rows={2}
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
              onClick={() => setAddModal(false)}
              className="hub-btn-secondary text-sm"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={submitAdd}
              disabled={!form.clientId.trim()}
              className="hub-btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              שמור
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={
          editing
            ? `עריכת מעקב — ${clientsById.get(editing.clientId)?.name ?? ''}`
            : 'עריכה'
        }
      >
        <div className="space-y-4">
          <label className="block text-[13px] font-semibold text-[var(--text-dark)]">
            תאריך בקשת תשלום אחרונה
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2 text-sm"
              value={form.lastRequestDate.slice(0, 10)}
              onChange={(e) =>
                setForm((f) => ({ ...f, lastRequestDate: e.target.value }))
              }
            />
          </label>
          <label className="block text-[13px] font-semibold text-[var(--text-dark)]">
            יעד תשלום
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
            תאריך תשלום בפועל
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2 text-sm"
              value={form.paidDate?.slice(0, 10) ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, paidDate: e.target.value }))
              }
            />
          </label>
          <label className="block text-[13px] font-semibold text-[var(--text-dark)]">
            הערה
            <textarea
              rows={2}
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
              onClick={() => setEditing(null)}
              className="hub-btn-secondary text-sm"
            >
              ביטול
            </button>
            <button type="button" onClick={submitEdit} className="hub-btn-primary text-sm">
              שמור
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={removeId !== null}
        onClose={() => setRemoveId(null)}
        onConfirm={() => {
          if (removeId) void removeFromTracking(removeId)
          setRemoveId(null)
        }}
        message="להסיר את הלקוח ממעקב הגבייה? הנתונים בחשבונית ירוקה לא יושפעו."
      />
    </div>
  )
}
