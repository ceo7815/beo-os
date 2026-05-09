import { useMemo, useState } from 'react'
import { ClientQuickSelect } from '../components/ClientQuickSelect'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { Modal } from '../components/shared/Modal'
import { formatDateIL, formatDateTimeIL, todayYmd } from '../lib/dates'
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
import { toastFsError } from '../lib/fsToast'
import type { Client, CollectionTracking } from '../types'
import { hubSectionClass } from '../lib/hubSectionBorder'

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

function collectionTrackingNotesTitle(row: CollectionTracking): string | undefined {
  const parts: string[] = []
  if (row.lastDemandRecordedAt?.trim()) {
    parts.push(`נרשם: ${formatDateTimeIL(row.lastDemandRecordedAt)}`)
  }
  if (row.lastDemandMethod?.trim()) {
    parts.push(`אופן דרישה: ${row.lastDemandMethod.trim()}`)
  }
  if (row.lastDemandClientReply?.trim()) {
    parts.push(`מענה לקוח: ${row.lastDemandClientReply.trim()}`)
  }
  if (row.note?.trim()) {
    parts.push(`הערה: ${row.note.trim()}`)
  }
  return parts.length ? parts.join('\n') : undefined
}

function lastRequestDisplay(row: CollectionTracking): string {
  if (row.lastDemandRecordedAt?.trim()) {
    return formatDateTimeIL(row.lastDemandRecordedAt)
  }
  return formatDateIL(row.lastRequestDate) || '—'
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
  seq: number
  label: string
  value: string
  sub?: string
}) {
  return (
    <div
      className={`rounded-2xl ${hubSectionClass(props.seq)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.08)]`}
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
    recordPaymentDemand,
  } = useCollectionTracking()
  const today = todayYmd()

  const [addModal, setAddModal] = useState(false)
  const [form, setForm] = useState<CollectionTrackingInput>(emptyForm)
  const [editing, setEditing] = useState<CollectionTracking | null>(null)
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [demandRow, setDemandRow] = useState<CollectionTracking | null>(null)
  const [demandMethod, setDemandMethod] = useState('')
  const [demandClientReply, setDemandClientReply] = useState('')

  /** רק סבב גבייה פתוח חוסם הוספה — אחרי «שולם» הרשומה נמחקת וניתן לפתוח מעקב חדש */
  const openTrackingClientIds = useMemo(
    () =>
      new Set(
        entries
          .filter((e) => getCollectionTrackingStatus(e, today) !== 'paid')
          .map((e) => e.clientId),
      ),
    [entries, today],
  )

  const clientsById = useMemo(() => {
    const m = new Map<string, Client>()
    clients.forEach((c) => m.set(c.id, c))
    return m
  }, [clients])

  const availableForAdd = useMemo(
    () => clients.filter((c) => !openTrackingClientIds.has(c.id)),
    [clients, openTrackingClientIds],
  )

  const currentYm = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const activeRows = useMemo(
    () =>
      entries.filter(
        (row) => getCollectionTrackingStatus(row, today) !== 'paid',
      ),
    [entries, today],
  )

  const kpis = useMemo(() => {
    let openCount = 0
    let overdueCount = 0
    for (const row of activeRows) {
      openCount += 1
      if (getCollectionTrackingStatus(row, today) === 'overdue') overdueCount += 1
    }
    return { openCount, overdueCount }
  }, [activeRows, today])

  const sorted = useMemo(
    () => [...activeRows].sort((a, b) => sortEntries(a, b, today)),
    [activeRows, today],
  )
  const collectionByDepartment = useMemo(() => {
    const map = new Map<
      string,
      { total: number; open: number; overdue: number }
    >()
    for (const row of activeRows) {
      const client = clientsById.get(row.clientId)
      const dept = clientDepartmentLabel(client)
      const st = getCollectionTrackingStatus(row, today)
      const cur = map.get(dept) ?? {
        total: 0,
        open: 0,
        overdue: 0,
      }
      cur.total += 1
      cur.open += 1
      if (st === 'overdue') cur.overdue += 1
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
  }, [activeRows, clientsById, today])

  const collectionDeptTotals = useMemo(
    () =>
      collectionByDepartment.reduce(
        (acc, r) => ({
          total: acc.total + r.total,
          open: acc.open + r.open,
          overdue: acc.overdue + r.overdue,
        }),
        { total: 0, open: 0, overdue: 0 },
      ),
    [collectionByDepartment],
  )

  const openGreenInvoice = () => {
    window.open(GREEN_INVOICE_URL, '_blank', 'noopener,noreferrer')
  }

  const closeDemandModal = () => {
    setDemandRow(null)
    setDemandMethod('')
    setDemandClientReply('')
  }

  const submitDemandFollowUp = () => {
    if (!demandRow) return
    void recordPaymentDemand(demandRow.clientId, {
      method: demandMethod,
      clientReply: demandClientReply,
    }).then((ok) => {
      if (ok) closeDemandModal()
    })
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
    if (openTrackingClientIds.has(form.clientId)) {
      toastFsError(
        'לקוח זה כבר במעקב גבייה פתוח לסבב הנוכחי',
        new Error('duplicate client'),
        'collections submitAdd',
      )
      return
    }
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
    <div className="mx-auto min-w-0 w-full max-w-[1400px] space-y-6 px-4 py-8 sm:px-8">
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

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiMini
          seq={0}
          label="במעקב (לא סומן שולם)"
          value={String(kpis.openCount)}
          sub="לקוחות ברשימת המעקב"
        />
        <KpiMini
          seq={1}
          label="באיחור (לפי יעד)"
          value={String(kpis.overdueCount)}
        />
      </section>

      {activeRows.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-[14px] font-bold text-[var(--blue-dark)]">
            פירוט לפי מחלקת לקוח
          </h2>
          <p className="text-[11px] text-[var(--text-mid)]">
            המחלקה מוגדרת בכרטיס הלקוח. לקוח בלי מחלקה נספר תחת «ללא מחלקה». חודש
            נוכחי: {currentYm}.
          </p>
          <div className={`overflow-x-hidden rounded-2xl ${hubSectionClass(2)} shadow-[0_2px_8px_rgba(0,0,0,0.04)]`}>
            <table className="w-full table-fixed border-collapse text-right text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-main)] text-[11px] font-bold text-[var(--text-mid)]">
                  <th className="px-2 py-2.5 sm:px-4">מחלקה</th>
                  <th className="px-2 py-2.5 sm:px-4">במעקב</th>
                  <th className="px-2 py-2.5 text-[#EF4444] sm:px-4">באיחור</th>
                  <th className="px-2 py-2.5 sm:px-4">סה״כ</th>
                </tr>
              </thead>
              <tbody>
                {collectionByDepartment.map((r) => (
                  <tr
                    key={r.department}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-2 py-2 font-semibold text-[var(--text-dark)] sm:px-4">
                      {r.department}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-[var(--text-mid)] sm:px-4">
                      {r.open}
                    </td>
                    <td className="px-2 py-2 tabular-nums font-semibold text-[#EF4444] sm:px-4">
                      {r.overdue}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-[var(--text-dark)] sm:px-4">
                      {r.total}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border)] bg-[var(--bg-main)] text-[12px] font-bold text-[var(--text-dark)]">
                  <td className="px-2 py-2.5 sm:px-4">סה״כ</td>
                  <td className="px-2 py-2.5 tabular-nums sm:px-4">
                    {collectionDeptTotals.open}
                  </td>
                  <td className="px-2 py-2.5 tabular-nums text-[#EF4444] sm:px-4">
                    {collectionDeptTotals.overdue}
                  </td>
                  <td className="px-2 py-2.5 tabular-nums sm:px-4">
                    {collectionDeptTotals.total}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : null}

      <div className={`overflow-x-hidden rounded-2xl ${hubSectionClass(activeRows.length > 0 ? 3 : 2)} shadow-[0_2px_12px_rgba(0,0,0,0.06)]`}>
        <table className="w-full table-fixed border-collapse text-right text-[11px] sm:text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-main)] text-[10px] font-bold text-[var(--text-mid)] sm:text-[12px]">
              <th className="w-[12%] px-1.5 py-2 sm:px-2 sm:py-3">לקוח</th>
              <th className="w-[7%] px-1.5 py-2 sm:px-2 sm:py-3">מחלקה</th>
              <th className="w-[10%] px-1.5 py-2 sm:px-2 sm:py-3">איש קשר / טלפון</th>
              <th className="w-[9%] px-1.5 py-2 sm:px-2 sm:py-3">מייל</th>
              <th className="w-[10%] px-1.5 py-2 sm:px-2 sm:py-3">בקשת תשלום אחרונה</th>
              <th className="w-[7%] px-1.5 py-2 sm:px-2 sm:py-3">יעד תשלום</th>
              <th className="w-[7%] px-1.5 py-2 sm:px-2 sm:py-3">תאריך תשלום</th>
              <th className="w-[21%] px-1.5 py-2 sm:px-2 sm:py-3">הערות / דרישה</th>
              <th className="w-[8%] px-1.5 py-2 sm:px-2 sm:py-3">סטטוס</th>
              <th className="w-[9%] px-1.5 py-2 sm:px-2 sm:py-3">פעולות</th>
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
                    אין לקוחות פתוחים במעקב
                  </p>
                  <p className="text-[13px]">
                    מוצגים כאן רק סבבי גבייה פתוחים. אחרי סימון «שולם» הרשומה
                    נסגרת — אותו לקוח יכול להיכנס שוב למעקב כשיש חשבונית/תשלום
                    חדש.
                  </p>
                  <p className="mt-1 text-[13px]">
                    כדי להוסיף לקוח למעקב, ודאו שהונפקה לו חשבונית/עסקה בחשבונית ירוקה ואז הוסיפו אותו.
                    לנפק מסמך השתמשו ב־
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
                return (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--border)] transition"
                    style={{
                      backgroundColor: rowBg,
                    }}
                  >
                    <td
                      className="max-w-0 px-1.5 py-2 align-top font-semibold text-[var(--text-dark)] sm:px-2 sm:py-3"
                      title={client?.name}
                    >
                      <span className="line-clamp-2 break-words">
                        {client?.name ?? 'לקוח לא נמצא'}
                      </span>
                    </td>
                    <td className="max-w-0 px-1.5 py-2 align-top text-[var(--text-mid)] sm:px-2 sm:py-3">
                      <span className="line-clamp-3 break-words font-semibold text-[var(--blue-dark)]">
                        {clientDepartmentLabel(client)}
                      </span>
                    </td>
                    <td className="max-w-0 px-1.5 py-2 align-top text-[var(--text-mid)] sm:px-2 sm:py-3">
                      <div className="break-words">{client?.contact || '—'}</div>
                      <div className="break-all tabular-nums text-[var(--text-light)]">
                        {client?.phone || '—'}
                      </div>
                    </td>
                    <td
                      className="max-w-0 truncate px-1.5 py-2 align-top text-[var(--text-mid)] sm:px-2 sm:py-3"
                      title={client?.email || undefined}
                    >
                      {client?.email || '—'}
                    </td>
                    <td className="max-w-0 px-1.5 py-2 align-top break-words text-[var(--text-mid)] sm:px-2 sm:py-3">
                      {lastRequestDisplay(row)}
                    </td>
                    <td className="max-w-0 whitespace-nowrap px-1.5 py-2 align-top tabular-nums text-[var(--text-mid)] sm:px-2 sm:py-3">
                      {formatDateIL(row.dueDate)}
                    </td>
                    <td className="max-w-0 whitespace-nowrap px-1.5 py-2 align-top tabular-nums text-[var(--text-mid)] sm:px-2 sm:py-3">
                      {row.paidDate ? formatDateIL(row.paidDate) : '—'}
                    </td>
                    <td
                      className="max-w-0 px-1.5 py-2 align-top break-words text-[var(--text-mid)] sm:px-2 sm:py-3"
                      title={collectionTrackingNotesTitle(row)}
                    >
                      {(() => {
                        const hasDemand =
                          !!row.lastDemandMethod?.trim() ||
                          !!row.lastDemandClientReply?.trim()
                        const hasNote = !!row.note?.trim()
                        if (!hasDemand && !hasNote) {
                          return (
                            <span className="text-[var(--text-light)]">—</span>
                          )
                        }
                        return (
                          <div className="space-y-2">
                            {hasDemand ? (
                              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-main)] p-2.5">
                                <div className="text-[11px] font-bold text-[var(--blue-dark)]">
                                  דרישת תשלום אחרונה
                                </div>
                                {row.lastDemandRecordedAt?.trim() ? (
                                  <div className="mt-1 tabular-nums text-[11px] text-[var(--text-mid)]">
                                    <span className="font-semibold text-[var(--text-dark)]">
                                      עדכון:{' '}
                                    </span>
                                    {formatDateTimeIL(row.lastDemandRecordedAt)}
                                  </div>
                                ) : null}
                                {row.lastDemandMethod?.trim() ? (
                                  <div className="mt-1.5 whitespace-pre-wrap break-words">
                                    <span className="font-semibold text-[var(--text-dark)]">
                                      אופן:{' '}
                                    </span>
                                    {row.lastDemandMethod.trim()}
                                  </div>
                                ) : null}
                                {row.lastDemandClientReply?.trim() ? (
                                  <div className="mt-1 whitespace-pre-wrap break-words">
                                    <span className="font-semibold text-[var(--text-dark)]">
                                      מענה לקוח:{' '}
                                    </span>
                                    {row.lastDemandClientReply.trim()}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            {hasNote ? (
                              <div className="line-clamp-4 whitespace-pre-wrap break-words">
                                {hasDemand ? (
                                  <span className="text-[10px] font-bold text-[var(--text-light)]">
                                    הערה כללית:{' '}
                                  </span>
                                ) : null}
                                {row.note!.trim()}
                              </div>
                            ) : null}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="max-w-0 px-1.5 py-2 align-top sm:px-2 sm:py-3">
                      <span
                        className="inline-block max-w-full rounded-full px-1.5 py-0.5 text-[9px] font-bold sm:px-2.5 sm:text-[11px]"
                        style={{ backgroundColor: badge.bg, color: badge.color }}
                      >
                        {badge.label}
                      </span>
                      {st === 'overdue' ? (
                        <div className="mt-1 text-[9px] text-[#EF4444] sm:text-[11px]">
                          איחור {daysLate(ymd(row.dueDate), today)} ימים
                        </div>
                      ) : null}
                    </td>
                    <td className="max-w-0 px-1 py-2 align-top sm:px-1.5 sm:py-3">
                      <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="rounded-lg border border-[var(--border)] px-1.5 py-1 text-[10px] font-semibold text-[var(--text-dark)] transition hover:bg-[var(--blue-light)] sm:px-3 sm:py-1.5 sm:text-xs"
                        >
                          עריכה
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDemandMethod('')
                            setDemandClientReply('')
                            setDemandRow(row)
                          }}
                          className="rounded-lg border border-[#2563EB] bg-[#EFF6FF] px-1.5 py-1 text-[10px] font-semibold leading-tight text-[#1D4ED8] transition hover:bg-[#DBEAFE] sm:px-3 sm:py-1.5 sm:text-xs"
                        >
                          דרישת תשלום
                        </button>
                        <button
                          type="button"
                          onClick={() => void markPaid(row.clientId)}
                          className="rounded-lg bg-[#10B981] px-1.5 py-1 text-[10px] font-semibold text-white transition hover:brightness-110 sm:px-3 sm:py-1.5 sm:text-xs"
                        >
                          סמן שולם
                        </button>
                        <button
                          type="button"
                          onClick={() => setRemoveId(row.clientId)}
                          className="flex h-7 min-h-[1.75rem] items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-mid)] transition hover:border-[#EF4444] hover:bg-[#FEF2F2] hover:text-[#EF4444] sm:h-8"
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
            ניתן להוסיף לקוח למעקב לאחר שהונפקה לו חשבונית/עסקה בחשבונית ירוקה.
            החיפוש מכסה את כל לקוחות המערכת; לקוח עם מעקב גבייה פתוח לסבב הנוכחי
            מוצג באפור ולא ניתן לבחור.
          </p>
          <div className="block text-[13px] font-semibold text-[var(--text-dark)]">
            <label htmlFor="collection-add-client" className="block">
              לקוח — חיפוש חכם
            </label>
            <div className="relative z-10 mt-1 rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2">
              <ClientQuickSelect
                id="collection-add-client"
                clients={clients}
                disabledClientIds={openTrackingClientIds}
                disabledClientHint="מעקב גבייה פתוח"
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

      <Modal
        isOpen={demandRow !== null}
        onClose={closeDemandModal}
        title={
          demandRow
            ? `דרישת תשלום — ${clientsById.get(demandRow.clientId)?.name ?? ''}`
            : 'דרישת תשלום'
        }
        bodyClassName="max-h-none"
      >
        <div className="space-y-4">
          <p className="text-[12px] text-[var(--text-mid)]">
            רשמו בחופשיות איך בוצעה דרישת התשלום ומה היה מענה הלקוח. בעת השמירה
            המערכת תרשום אוטומטית את התאריך והשעה בעמודה «בקשת תשלום אחרונה»
            ובתיבת המעקב.
          </p>
          <label className="block text-[13px] font-semibold text-[var(--text-dark)]">
            באיזה דרך בוצעה דרישת התשלום?
            <textarea
              rows={3}
              className="mt-1 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2 text-sm"
              value={demandMethod}
              onChange={(e) => setDemandMethod(e.target.value)}
              placeholder="למשל: טלפון, מייל, וואטסאפ, מכתב מעורך דין…"
            />
          </label>
          <label className="block text-[13px] font-semibold text-[var(--text-dark)]">
            מה היה מענה הלקוח?
            <textarea
              rows={3}
              className="mt-1 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2 text-sm"
              value={demandClientReply}
              onChange={(e) => setDemandClientReply(e.target.value)}
              placeholder="למשל: מבטיח לשלם עד סוף השבוע, מבקש פריסה…"
            />
          </label>
          <p className="text-[11px] text-[var(--text-light)]">
            ניתן למלא שדה אחד או את שניהם.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeDemandModal}
              className="hub-btn-secondary text-sm"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={submitDemandFollowUp}
              className="hub-btn-primary text-sm"
            >
              שמור במעקב
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
