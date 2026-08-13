import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ClientQuickSelect } from '../components/ClientQuickSelect'
import { Badge } from '../components/shared/Badge'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { ExportExcelButton } from '../components/shared/ExportExcelButton'
import { Modal } from '../components/shared/Modal'
import { useClients } from '../hooks/useClients'
import { useHourlyServices } from '../hooks/useHourlyServices'
import {
  filterEntriesByService,
  formatHours,
  hoursPackagePercent,
  hoursRemaining,
  sumHours,
} from '../lib/hourlyServiceCalc'
import {
  HOURLY_SERVICE_KIND_LABEL,
  HOURLY_SERVICE_KINDS,
  HOURLY_SERVICE_STATUS_COLOR,
  HOURLY_SERVICE_STATUS_LABEL,
} from '../lib/hourlyServiceLabels'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { exportHourlyServicesToExcel } from '../lib/excelTableExports'
import type { HourlyServiceKind, HourlyServiceStatus } from '../types'

type FilterStatus = 'all' | HourlyServiceStatus

type ServiceForm = {
  clientId: string
  title: string
  serviceKind: HourlyServiceKind
  status: HourlyServiceStatus
  hourlyRate: string
  hoursPackageTotal: string
  notes: string
}

function emptyForm(): ServiceForm {
  return {
    clientId: '',
    title: '',
    serviceKind: 'support',
    status: 'active',
    hourlyRate: '',
    hoursPackageTotal: '',
    notes: '',
  }
}

const uiBtn =
  'inline-flex h-9 items-center justify-center rounded-[10px] px-4 text-xs font-semibold transition'
const uiBtnBrand = `${uiBtn} bg-[var(--orange)] text-white hover:bg-[var(--brand-hover)]`
const uiBtnGhost = `${uiBtn} border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] text-[var(--text-mid)] hover:bg-[var(--surface-muted)]`

export function HourlyServices() {
  const navigate = useNavigate()
  const { clients } = useClients()
  const { services, entries, loading, addService, deleteService } =
    useHourlyServices()

  const [filter, setFilter] = useState<FilterStatus>('all')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<ServiceForm>(emptyForm)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const clientName = useMemo(() => {
    const m = new Map(clients.map((c) => [c.id, c.name]))
    return (id: string) => m.get(id) ?? '—'
  }, [clients])

  const totals = useMemo(() => {
    return {
      activeCount: services.filter((s) => s.status === 'active').length,
      entryCount: entries.length,
      totalUsedHours: sumHours(entries),
    }
  }, [services, entries])

  const rows = useMemo(() => {
    let list = [...services]
    if (filter !== 'all') list = list.filter((s) => s.status === filter)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((s) => {
        const client = clientName(s.clientId).toLowerCase()
        return (
          s.title.toLowerCase().includes(q) || client.includes(q)
        )
      })
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [services, filter, search, clientName])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.clientId.trim() || !form.title.trim()) return
    const packageHours = Number.parseFloat(form.hoursPackageTotal)
    if (!Number.isFinite(packageHours) || packageHours <= 0) return
    const rate = form.hourlyRate.trim()
      ? Number.parseFloat(form.hourlyRate)
      : undefined
    const id = await addService({
      clientId: form.clientId,
      title: form.title,
      serviceKind: form.serviceKind,
      status: form.status,
      hourlyRate:
        rate != null && Number.isFinite(rate) ? rate : undefined,
      hoursPackageTotal: packageHours,
      notes: form.notes.trim() || undefined,
    })
    if (id) {
      setModalOpen(false)
      setForm(emptyForm())
      navigate(`/hourly-services/${id}`)
    }
  }

  return (
    <div
      className="beo-page space-y-6 pb-24"
      dir="rtl"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="text-right">
          <h1 className="text-[22px] font-extrabold text-[var(--text-dark)]">
            שירותי שעות
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-mid)]">
            בנקי שעות ללקוחות — חבילה, תאריכי ביצוע ותיעוד עבודה (ללא חשבונות חודשיים).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportExcelButton
            onClick={() =>
              exportHourlyServicesToExcel({
                services: rows,
                entries,
                clientNameById: new Map(
                  clients.map((c) => [c.id, c.name] as const),
                ),
              })
            }
            disabled={rows.length === 0 && entries.length === 0}
          />
          <button
            type="button"
            className={uiBtnBrand}
            onClick={() => {
              setForm(emptyForm())
              setModalOpen(true)
            }}
          >
            + בנק שעות חדש
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 [&>*]:min-w-0">
        <KpiCard label="בנקי שעות פעילים" value={String(totals.activeCount)} />
        <KpiCard label="רשומות שעות" value={String(totals.entryCount)} />
        <KpiCard
          label="שעות שתועדו"
          value={formatHours(totals.totalUsedHours)}
        />
      </div>

      <section className={`rounded-2xl ${hubSectionClass()} p-4 sm:p-5`}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {(['all', 'active', 'paused', 'closed'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`${uiBtnGhost} min-w-[72px] ${
                  filter === key
                    ? 'border-[var(--orange)] bg-[var(--orange-light)] text-[var(--orange)]'
                    : ''
                }`}
              >
                {key === 'all' ? 'הכל' : HOURLY_SERVICE_STATUS_LABEL[key]}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי לקוח או שם שירות…"
            className="h-9 w-full max-w-xs rounded-[10px] border border-[var(--border-orange-soft)] bg-white px-3 text-[13px] sm:text-left"
          />
        </div>

        {loading ? (
          <p className="py-8 text-center text-[13px] text-[var(--text-mid)]">
            טוען…
          </p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-[var(--text-mid)]">
            אין בנקי שעות. לחץ &quot;בנק שעות חדש&quot; להתחלה.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-right text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border-orange-soft)] text-[11px] text-[var(--text-mid)]">
                  <th className="px-2 py-2 font-semibold">שירות</th>
                  <th className="px-2 py-2 font-semibold">לקוח</th>
                  <th className="px-2 py-2 font-semibold">סוג</th>
                  <th className="px-2 py-2 font-semibold">סטטוס</th>
                  <th className="px-2 py-2 font-semibold">תעריף</th>
                  <th className="px-2 py-2 font-semibold">חבילה</th>
                  <th className="px-2 py-2 font-semibold">נוצל</th>
                  <th className="px-2 py-2 font-semibold">נותר</th>
                  <th className="px-2 py-2 font-semibold">רשומות</th>
                  <th className="px-2 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const usedTotal = sumHours(
                    filterEntriesByService(entries, s.id),
                  )
                  const remaining = hoursRemaining(
                    s.hoursPackageTotal,
                    usedTotal,
                  )
                  const entryCount = filterEntriesByService(entries, s.id).length
                  const usedPct = hoursPackagePercent(
                    usedTotal,
                    s.hoursPackageTotal,
                  )
                  const low = remaining <= s.hoursPackageTotal * 0.1
                  const over = remaining < 0
                  return (
                    <tr
                      key={s.id}
                      className="border-b border-[var(--border-orange-soft)]/60 hover:bg-[var(--surface-muted)]/50"
                    >
                      <td className="px-2 py-3">
                        <Link
                          to={`/hourly-services/${s.id}`}
                          className="font-semibold text-[var(--text-dark)] hover:text-[var(--orange)]"
                        >
                          {s.title}
                        </Link>
                      </td>
                      <td className="px-2 py-3 text-[var(--text-mid)]">
                        {clientName(s.clientId)}
                      </td>
                      <td className="px-2 py-3">
                        {HOURLY_SERVICE_KIND_LABEL[s.serviceKind]}
                      </td>
                      <td className="px-2 py-3">
                        <Badge
                          label={HOURLY_SERVICE_STATUS_LABEL[s.status]}
                          color={HOURLY_SERVICE_STATUS_COLOR[s.status]}
                        />
                      </td>
                      <td className="px-2 py-3">
                        {s.hourlyRate != null
                          ? `₪${s.hourlyRate.toLocaleString('he-IL')}/שעה`
                          : '—'}
                      </td>
                      <td className="px-2 py-3 font-semibold">
                        {formatHours(s.hoursPackageTotal)}
                      </td>
                      <td className="px-2 py-3">
                        {formatHours(usedTotal)}
                        {usedPct != null ? (
                          <span className="text-[11px] text-[var(--text-mid)]">
                            {' '}
                            ({usedPct}%)
                          </span>
                        ) : null}
                      </td>
                      <td
                        className={`px-2 py-3 font-bold ${
                          over
                            ? 'text-red-600'
                            : low
                              ? 'text-amber-600'
                              : 'text-emerald-700'
                        }`}
                      >
                        {formatHours(remaining)}
                      </td>
                      <td className="px-2 py-3 text-[var(--text-mid)]">
                        {entryCount}
                      </td>
                      <td className="px-2 py-3">
                        <button
                          type="button"
                          className="text-[11px] text-red-600 hover:underline"
                          onClick={() => setDeleteId(s.id)}
                        >
                          מחק
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

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="בנק שעות חדש"
      >
        <form onSubmit={(e) => void handleCreate(e)} className="space-y-3">
          <label className="block text-right text-[12px]">
            <span className="mb-1 block font-semibold text-[var(--text-dark)]">
              לקוח *
            </span>
            <ClientQuickSelect
              clients={clients}
              value={form.clientId}
              onChange={(clientId) => setForm((f) => ({ ...f, clientId }))}
            />
          </label>
          <label className="block text-right text-[12px]">
            <span className="mb-1 block font-semibold">שם השירות *</span>
            <input
              required
              value={form.title}
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
              placeholder="לדוגמה: תחזוקה אתר X — חבילת 10 שעות"
              className="h-9 w-full rounded-[10px] border border-[var(--border-orange-soft)] px-3 text-[13px]"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-right text-[12px]">
              <span className="mb-1 block font-semibold">סוג שירות</span>
              <select
                value={form.serviceKind}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    serviceKind: e.target.value as HourlyServiceKind,
                  }))
                }
                className="h-9 w-full rounded-[10px] border border-[var(--border-orange-soft)] px-2 text-[13px]"
              >
                {HOURLY_SERVICE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {HOURLY_SERVICE_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-right text-[12px]">
              <span className="mb-1 block font-semibold">תעריף לשעה (₪)</span>
              <input
                type="number"
                min={0}
                step="1"
                value={form.hourlyRate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, hourlyRate: e.target.value }))
                }
                className="h-9 w-full rounded-[10px] border border-[var(--border-orange-soft)] px-3 text-[13px]"
              />
            </label>
          </div>
          <label className="block text-right text-[12px] sm:col-span-2">
            <span className="mb-1 block font-semibold">
              חבילת שעות ללקוח *
            </span>
            <input
              type="number"
              required
              min={0.5}
              step="0.5"
              value={form.hoursPackageTotal}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  hoursPackageTotal: e.target.value,
                }))
              }
              placeholder="לדוגמה: 20"
              className="h-9 w-full rounded-[10px] border border-[var(--border-orange-soft)] px-3 text-[13px]"
            />
            <span className="mt-1 block text-[11px] text-[var(--text-mid)]">
              כל רשומת עבודה תנוכה מהיתרה ותוצג בזמן אמת
            </span>
          </label>
          <label className="block text-right text-[12px]">
            <span className="mb-1 block font-semibold">הערות</span>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              className="w-full rounded-[10px] border border-[var(--border-orange-soft)] px-3 py-2 text-[13px]"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className={uiBtnGhost}
              onClick={() => setModalOpen(false)}
            >
              ביטול
            </button>
            <button type="submit" className={uiBtnBrand}>
              צור והמשך לתיעוד
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteId != null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) void deleteService(deleteId)
        }}
        message="הפעולה תמחק גם את כל רשומות השעות. להמשיך?"
      />
    </div>
  )
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--border-orange-soft)]/60 bg-[var(--surface-muted)]/35 p-4 text-right">
      <p className="truncate text-[11px] text-[var(--text-mid)]">{label}</p>
      <p className="mt-1 truncate text-[22px] font-extrabold tabular-nums text-[var(--text-dark)]">
        {value}
      </p>
    </div>
  )
}
