import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { formatDateIL, todayYmd } from '../lib/dates'
import { ClientQuickSelect } from '../components/ClientQuickSelect'
import { Modal } from '../components/shared/Modal'
import { useClients } from '../hooks/useClients'
import { useHosting } from '../hooks/useHosting'
import type { HostingRecord } from '../types'
import { hubSectionClass } from '../lib/hubSectionBorder'

const SERVER_HINTS = [
  'Hostinger',
  'CloudPanel',
  'Cloudflare',
  'cPanel',
  'VPS',
  'אחר',
] as const
const LOCATION_HINTS = ['ישראל', 'חול'] as const
const PANEL_HINTS = ['cPanel', 'CloudPanel', 'Plesk', 'ללא'] as const
const PLATFORM_HINTS = ['WordPress', 'Laravel', 'Static', 'אחר'] as const

type HostingFormState = {
  clientId: string
  domain: string
  server: string
  serverLocation: string
  controlPanel: string
  username: string
  ipAddress: string
  sslExpiry: string
  domainExpiry: string
  platform: string
  phpVersion: string
  notes: string
}

function emptyForm(): HostingFormState {
  return {
    clientId: '',
    domain: '',
    server: '',
    serverLocation: '',
    controlPanel: '',
    username: '',
    ipAddress: '',
    sslExpiry: '',
    domainExpiry: '',
    platform: '',
    phpVersion: '',
    notes: '',
  }
}

function recordToForm(r: HostingRecord): HostingFormState {
  return {
    clientId: r.clientId,
    domain: r.domain,
    server: r.server,
    serverLocation: r.serverLocation,
    controlPanel: r.controlPanel,
    username: r.username,
    ipAddress: r.ipAddress,
    sslExpiry: r.sslExpiry,
    domainExpiry: r.domainExpiry,
    platform: r.platform,
    phpVersion: r.phpVersion,
    notes: r.notes,
  }
}

/** ימים עד תאריך YYYY-MM-DD מול today; null אם לא תקין */
function daysUntil(targetYmd: string, fromYmd: string): number | null {
  const p = targetYmd.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p)) return null
  const [y, m, d] = p.split('-').map(Number)
  const [fy, fm, fd] = fromYmd.split('-').map(Number)
  const T = Date.UTC(y, m - 1, d)
  const F = Date.UTC(fy, fm - 1, fd)
  return Math.round((T - F) / 86400000)
}

type RenewalUrgency = 'red' | 'yellow' | 'green'

function renewalUrgency(r: HostingRecord, today: string): RenewalUrgency {
  const dSsl = daysUntil(r.sslExpiry, today)
  const dDom = daysUntil(r.domainExpiry, today)
  const vals = [dSsl, dDom].filter((x): x is number => x !== null)
  if (vals.length === 0) return 'green'
  const min = Math.min(...vals)
  if (min < 30) return 'red'
  if (min < 60) return 'yellow'
  return 'green'
}

function urgencyStyles(u: RenewalUrgency): {
  bar: string
  borderS: string
  dot: string
  label: string
} {
  switch (u) {
    case 'red':
      return {
        bar: 'bg-red-50/80',
        borderS: 'border-s-[#EF4444]',
        dot: 'bg-[#EF4444]',
        label: 'text-[#B91C1C]',
      }
    case 'yellow':
      return {
        bar: 'bg-[var(--orange-light)]',
        borderS: 'border-s-amber-500',
        dot: 'bg-amber-500',
        label: 'text-amber-800',
      }
    default:
      return {
        bar: 'bg-emerald-50/60',
        borderS: 'border-s-emerald-500',
        dot: 'bg-emerald-500',
        label: 'text-emerald-800',
      }
  }
}

function urgencyLabelHe(u: RenewalUrgency): string {
  switch (u) {
    case 'red':
      return 'חידוש — פחות מ־30 יום (או פג תוקף)'
    case 'yellow':
      return 'חידוש — פחות מ־60 יום'
    default:
      return 'תקין (מעל 60 יום)'
  }
}

function SiteBlock({
  record,
  today,
  onEdit,
  onDelete,
}: {
  record: HostingRecord
  today: string
  onEdit: () => void
  onDelete: () => void
}) {
  const u = renewalUrgency(record, today)
  const st = urgencyStyles(u)
  const sslDays = daysUntil(record.sslExpiry, today)
  const domDays = daysUntil(record.domainExpiry, today)

  return (
    <div
      className={`rounded-[12px] border border-[var(--border)] border-s-4 p-4 shadow-sm ${st.bar} ${st.borderS}`}
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${st.dot}`}
            title={urgencyLabelHe(u)}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold text-[var(--text-light)]">
              🌐 דומיין
            </p>
            <p
              dir="ltr"
              className="truncate text-[15px] font-extrabold text-[var(--blue-dark)]"
            >
              {record.domain.trim() || '—'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-[11px] font-bold text-[var(--blue-mid)] hover:bg-[var(--blue-light)]"
          >
            עריכה
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100"
          >
            מחק
          </button>
        </div>
      </div>
      <p className={`mb-2 text-[11px] font-semibold ${st.label}`}>
        {urgencyLabelHe(u)}
      </p>
      <ul className="space-y-1.5 text-[12px] text-[var(--text-dark)]">
        <li>
          <span className="text-[var(--text-mid)]">🖥️ שרת · מיקום: </span>
          <span className="font-medium">
            {record.server || '—'} · {record.serverLocation || '—'}
          </span>
        </li>
        <li>
          <span className="text-[var(--text-mid)]">🔑 משתמש: </span>
          <span dir="ltr" className="font-mono text-[13px]">
            {record.username || '—'}
          </span>
        </li>
        <li>
          <span className="text-[var(--text-mid)]">📅 חידוש דומיין: </span>
          <span className="font-medium">
            {record.domainExpiry
              ? formatDateIL(record.domainExpiry)
              : '—'}
            {domDays !== null ? (
              <span className="ms-1 text-[11px] text-[var(--text-light)]">
                ({domDays < 0 ? `פג לפני ${Math.abs(domDays)} ימים` : `עוד ${domDays} ימים`})
              </span>
            ) : null}
          </span>
        </li>
        <li>
          <span className="text-[var(--text-mid)]">🔒 תפוגת SSL: </span>
          <span className="font-medium">
            {record.sslExpiry ? formatDateIL(record.sslExpiry) : '—'}
            {sslDays !== null ? (
              <span className="ms-1 text-[11px] text-[var(--text-light)]">
                ({sslDays < 0 ? `פג לפני ${Math.abs(sslDays)} ימים` : `עוד ${sslDays} ימים`})
              </span>
            ) : null}
          </span>
        </li>
        <li>
          <span className="text-[var(--text-mid)]">⚙️ פלטפורמה · PHP: </span>
          <span className="font-medium">
            {record.platform || '—'} · {record.phpVersion || '—'}
          </span>
        </li>
        {record.ipAddress.trim() ? (
          <li dir="ltr" className="text-end">
            <span className="text-[var(--text-mid)]" dir="rtl">
              IP:{' '}
            </span>
            <span className="font-mono">{record.ipAddress}</span>
          </li>
        ) : null}
        {record.controlPanel.trim() ? (
          <li>
            <span className="text-[var(--text-mid)]">לוח בקרה: </span>
            {record.controlPanel}
          </li>
        ) : null}
        {record.notes.trim() ? (
          <li className="border-t border-[var(--border)] pt-2">
            <span className="text-[var(--text-mid)]">📝 הערות: </span>
            <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed">
              {record.notes}
            </p>
          </li>
        ) : null}
      </ul>
    </div>
  )
}

export function Hosting() {
  const { clients } = useClients()
  const { records, loading, error, addRecord, updateRecord, deleteRecord } =
    useHosting()
  const [q, setQ] = useState('')
  const [serverFilter, setServerFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<HostingFormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  const today = todayYmd()

  const clientById = useMemo(() => {
    const m = new Map<string, string>()
    clients.forEach((c) => m.set(c.id, c.name))
    return m
  }, [clients])

  const serverOptions = useMemo(() => {
    const s = new Set<string>()
    records.forEach((r) => {
      if (r.server.trim()) s.add(r.server.trim())
    })
    SERVER_HINTS.forEach((h) => s.add(h))
    return [...s].sort((a, b) => a.localeCompare(b, 'he'))
  }, [records])

  const filteredRecords = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return records.filter((r) => {
      if (serverFilter && r.server.trim() !== serverFilter) return false
      if (!needle) return true
      const clientName = clientById.get(r.clientId) ?? ''
      const hay = `${r.domain} ${clientName} ${r.notes}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [records, q, serverFilter, clientById])

  const groups = useMemo(() => {
    const m = new Map<string, HostingRecord[]>()
    for (const r of filteredRecords) {
      const cid = r.clientId || '_none'
      const arr = m.get(cid) ?? []
      arr.push(r)
      m.set(cid, arr)
    }
    const out: { clientId: string; name: string; items: HostingRecord[] }[] =
      []
    m.forEach((items, clientId) => {
      const name =
        clientId === '_none'
          ? 'ללא לקוח משויך'
          : (clientById.get(clientId) ?? `לקוח לא ידוע (${clientId})`)
      out.push({ clientId, name, items })
    })
    out.sort((a, b) => a.name.localeCompare(b.name, 'he'))
    for (const g of out) {
      g.items.sort((a, b) =>
        a.domain.localeCompare(b.domain, 'en', { sensitivity: 'base' }),
      )
    }
    return out
  }, [filteredRecords, clientById])

  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (r: HostingRecord) => {
    setEditingId(r.id)
    setForm(recordToForm(r))
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.clientId.trim()) return
    if (!form.domain.trim()) return
    setSaving(true)
    try {
      const payload: Omit<HostingRecord, 'id' | 'createdAt'> = {
        clientId: form.clientId.trim(),
        domain: form.domain.trim(),
        server: form.server.trim(),
        serverLocation: form.serverLocation.trim(),
        controlPanel: form.controlPanel.trim(),
        username: form.username.trim(),
        ipAddress: form.ipAddress.trim(),
        sslExpiry: form.sslExpiry.slice(0, 10),
        domainExpiry: form.domainExpiry.slice(0, 10),
        platform: form.platform.trim(),
        phpVersion: form.phpVersion.trim(),
        notes: form.notes.trim(),
      }
      if (editingId) {
        await updateRecord(editingId, payload)
      } else {
        await addRecord(payload)
      }
      closeModal()
    } finally {
      setSaving(false)
    }
  }

  const onDelete = useCallback(
    (r: HostingRecord) => {
      if (
        !window.confirm(
          `למחוק את האתר ${r.domain || r.id} מהמאגר?`,
        )
      )
        return
      void deleteRecord(r.id)
    },
    [deleteRecord],
  )

  const errMsg = error?.message ?? null

  return (
    <div
      className="mx-auto max-w-[1200px] space-y-6 px-6 py-8 md:px-8"
      style={{ fontFamily: "'Rubik', sans-serif" }}
    >
      <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold text-[var(--blue-dark)]">
            מאגר אחסון 🖥️
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-mid)]">
            מאגר אחסון — מידע בלבד (ללא תשלומים) · צבע לפי קרבת חידוש דומיין ו־SSL
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="rounded-[12px] bg-[var(--orange)] px-5 py-2.5 text-[14px] font-bold text-white shadow-md transition hover:brightness-110"
        >
          + הוסף אתר
        </button>
      </header>

      <div className="rounded-[14px] border-2 border-red-300 bg-red-50 px-5 py-4 text-center shadow-sm">
        <p className="text-[24px] font-extrabold leading-tight text-red-700 md:text-[30px]">
          לאחר הדרכה HUB-POS אשר ואור נכנסים יחד לסדר את הנושא
        </p>
      </div>

      <div className={`flex flex-col gap-3 rounded-2xl ${hubSectionClass(0)} p-4 shadow-sm md:flex-row md:flex-wrap md:items-end`}>
        <div className="min-w-[200px] flex-1">
          <label
            htmlFor="hosting-search"
            className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]"
          >
            חיפוש (דומיין / לקוח / הערות)
          </label>
          <input
            id="hosting-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="למשל example.com או שם לקוח…"
            className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[13px] text-[var(--text-dark)]"
          />
        </div>
        <div className="min-w-[160px]">
          <label
            htmlFor="hosting-server-filter"
            className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]"
          >
            סינון לפי שרת
          </label>
          <select
            id="hosting-server-filter"
            value={serverFilter}
            onChange={(e) => setServerFilter(e.target.value)}
            className="w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text-dark)]"
          >
            <option value="">כל השרתים</option>
            {serverOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-[12px] text-[var(--text-mid)]">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#EF4444]" /> פחות מ־30
          יום או פג תוקף
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> פחות מ־60
          יום
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> תקין
        </span>
      </div>

      {errMsg ? (
        <div className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {errMsg}
        </div>
      ) : null}

      {loading ? (
        <p className="text-[var(--text-mid)]">טוען מאגר…</p>
      ) : groups.length === 0 ? (
        <div className="hub-empty-dashed rounded-[14px] p-10 text-center text-[var(--text-mid)]">
          אין רשומות להצגה. הוסיפו אתר עם הכפתור למעלה.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <article
              key={g.clientId}
              className={`overflow-hidden rounded-2xl ${hubSectionClass(1)} shadow-none`}
            >
              <div className="border-b border-[var(--border)] bg-gradient-to-l from-[var(--blue-light)] to-white px-5 py-3">
                <h2 className="text-[17px] font-extrabold text-[var(--blue-dark)]">
                  {g.name}
                </h2>
                <p className="text-[12px] text-[var(--text-mid)]">
                  {g.items.length}{' '}
                  {g.items.length === 1 ? 'אתר' : 'אתרים'}
                </p>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {g.items.map((r) => (
                  <SiteBlock
                    key={r.id}
                    record={r}
                    today={today}
                    onEdit={() => openEdit(r)}
                    onDelete={() => onDelete(r)}
                  />
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      <datalist id="hosting-server-list">
        {SERVER_HINTS.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      <datalist id="hosting-location-list">
        {LOCATION_HINTS.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      <datalist id="hosting-panel-list">
        {PANEL_HINTS.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      <datalist id="hosting-platform-list">
        {PLATFORM_HINTS.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingId ? 'עריכת אתר במאגר' : 'הוספת אתר למאגר'}
        size="lg"
        bodyClassName="max-h-[min(85vh,720px)] overflow-y-auto"
      >
        <form onSubmit={submit} className="space-y-3 text-[13px]">
          <div>
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              לקוח *
            </label>
            <ClientQuickSelect
              id="hosting-modal-client"
              clients={clients}
              value={form.clientId}
              onChange={(clientId) =>
                setForm((f) => ({ ...f, clientId }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              דומיין *
            </label>
            <input
              dir="ltr"
              value={form.domain}
              onChange={(e) =>
                setForm((f) => ({ ...f, domain: e.target.value }))
              }
              placeholder="example.co.il"
              className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-dark)]"
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                שרת
              </label>
              <input
                list="hosting-server-list"
                value={form.server}
                onChange={(e) =>
                  setForm((f) => ({ ...f, server: e.target.value }))
                }
                placeholder="Hostinger / CloudPanel…"
                className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                מיקום שרת
              </label>
              <input
                list="hosting-location-list"
                value={form.serverLocation}
                onChange={(e) =>
                  setForm((f) => ({ ...f, serverLocation: e.target.value }))
                }
                placeholder="ישראל / חול"
                className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                לוח בקרה
              </label>
              <input
                list="hosting-panel-list"
                value={form.controlPanel}
                onChange={(e) =>
                  setForm((f) => ({ ...f, controlPanel: e.target.value }))
                }
                className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                שם משתמש (cPanel וכו׳)
              </label>
              <input
                dir="ltr"
                value={form.username}
                onChange={(e) =>
                  setForm((f) => ({ ...f, username: e.target.value }))
                }
                className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 font-mono text-[13px]"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              כתובת IP
            </label>
            <input
              dir="ltr"
              value={form.ipAddress}
              onChange={(e) =>
                setForm((f) => ({ ...f, ipAddress: e.target.value }))
              }
              className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 font-mono text-[13px]"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                תפוגת דומיין
              </label>
              <input
                type="date"
                value={form.domainExpiry}
                onChange={(e) =>
                  setForm((f) => ({ ...f, domainExpiry: e.target.value }))
                }
                className="w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                תפוגת SSL
              </label>
              <input
                type="date"
                value={form.sslExpiry}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sslExpiry: e.target.value }))
                }
                className="w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                פלטפורמה
              </label>
              <input
                list="hosting-platform-list"
                value={form.platform}
                onChange={(e) =>
                  setForm((f) => ({ ...f, platform: e.target.value }))
                }
                className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                גרסת PHP
              </label>
              <input
                dir="ltr"
                value={form.phpVersion}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phpVersion: e.target.value }))
                }
                placeholder="8.2"
                className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 font-mono text-[13px]"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              הערות
            </label>
            <textarea
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              rows={3}
              className="w-full resize-y rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-[10px] border border-[var(--border)] bg-white px-4 py-2 text-[13px] font-bold text-[var(--text-dark)] hover:bg-slate-50"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={
                saving || !form.clientId.trim() || !form.domain.trim()
              }
              className="rounded-[10px] bg-[var(--blue-mid)] px-5 py-2 text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-50"
            >
              {saving ? 'שומר…' : editingId ? 'עדכן' : 'שמור'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
