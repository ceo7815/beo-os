import { useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Badge } from '../components/shared/Badge'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { Modal } from '../components/shared/Modal'
import { ProgressBar } from '../components/shared/ProgressBar'
import { useClients } from '../hooks/useClients'
import { useHourlyServices } from '../hooks/useHourlyServices'
import { formatDateIL, todayYmd } from '../lib/dates'
import {
  amountFromHours,
  filterEntriesByService,
  formatHours,
  hoursPackagePercent,
  hoursRemaining,
  hoursToFreeMinutesDisplay,
  parseFreeMinutesInput,
  sumHours,
} from '../lib/hourlyServiceCalc'
import {
  HOURLY_ENTRY_STATUS_COLOR,
  HOURLY_ENTRY_STATUS_LABEL,
  HOURLY_ENTRY_STATUSES,
  HOURLY_SERVICE_KIND_LABEL,
  HOURLY_SERVICE_STATUS_COLOR,
  HOURLY_SERVICE_STATUS_LABEL,
  HOURLY_WORK_CATEGORIES,
  HOURLY_WORK_CATEGORY_LABEL,
} from '../lib/hourlyServiceLabels'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { hourlyServiceShareUrl } from '../lib/hourlyServiceShare'
import type {
  HourlyEntryStatus,
  HourlyServiceEntry,
  HourlyWorkCategory,
} from '../types'

type EntryForm = {
  workDate: string
  hours: string
  performerName: string
  taskTitle: string
  description: string
  workCategory: HourlyWorkCategory
  billable: boolean
  status: HourlyEntryStatus
}

function defaultPerformerName(
  user: { displayName?: string | null; email?: string | null } | null,
): string {
  if (!user) return ''
  return user.displayName?.trim() || user.email?.split('@')[0] || ''
}

function emptyEntryForm(performerName = ''): EntryForm {
  return {
    workDate: todayYmd(),
    hours: '1',
    performerName,
    taskTitle: '',
    description: '',
    workCategory: 'support',
    billable: true,
    status: 'logged',
  }
}

function entryToForm(e: HourlyServiceEntry): EntryForm {
  return {
    workDate: e.workDate,
    hours: String(e.hours),
    performerName: e.performerName,
    taskTitle: e.taskTitle,
    description: e.description ?? '',
    workCategory: e.workCategory,
    billable: e.billable,
    status: e.status,
  }
}

const HOUR_QUICK_PRESETS = [
  { label: '15 דק׳', hours: 0.25 },
  { label: 'חצי שעה', hours: 0.5 },
  { label: 'שעה', hours: 1 },
] as const

const hourPresetBtn =
  'inline-flex h-8 min-w-[4.5rem] items-center justify-center rounded-[10px] border px-3 text-[12px] font-semibold transition'

function hourPresetBtnClass(active: boolean): string {
  return active
    ? `${hourPresetBtn} border-[var(--orange)] bg-[var(--orange-light)] text-[var(--orange)]`
    : `${hourPresetBtn} border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] text-[var(--text-mid)] hover:bg-[var(--surface-muted)]`
}

function activePresetHours(hoursRaw: string): number | null {
  const parsed = parseFreeMinutesInput(hoursRaw)
  if (parsed == null) return null
  const match = HOUR_QUICK_PRESETS.find((p) => p.hours === parsed)
  return match?.hours ?? null
}

function resolveHoursFromForm(
  hoursRaw: string,
  freeMinutesDraft: string | null,
): number | null {
  return parseFreeMinutesInput(freeMinutesDraft ?? hoursRaw)
}

const hourFreeInput =
  'h-8 min-w-[7.5rem] flex-1 rounded-[10px] border bg-white px-3 text-[12px] text-[var(--text-dark)] outline-none transition focus:ring-2 focus:ring-[var(--orange)]/15 sm:min-w-[9rem]'

const uiBtn =
  'inline-flex h-9 items-center justify-center rounded-[10px] px-4 text-xs font-semibold transition'
const uiBtnBrand = `${uiBtn} bg-[var(--orange)] text-white hover:bg-[#ea6c0a]`
const uiBtnGhost = `${uiBtn} border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] text-[var(--text-mid)] hover:bg-[var(--surface-muted)]`

const fieldLabel =
  'mb-1.5 block text-[12px] font-semibold text-[var(--text-dark)]'
const fieldInput =
  'h-10 w-full rounded-[10px] border border-[var(--border-orange-soft)] bg-white px-3 text-[13px] text-[var(--text-dark)] outline-none transition focus:border-[var(--orange)] focus:ring-2 focus:ring-[var(--orange)]/15'

function entryDateRangeLabel(entries: HourlyServiceEntry[]): string | null {
  if (entries.length === 0) return null
  const dates = entries.map((e) => e.workDate).sort()
  const first = dates[0]
  const last = dates[dates.length - 1]
  if (first === last) return formatDateIL(first)
  return `${formatDateIL(first)} – ${formatDateIL(last)}`
}

export function HourlyServiceDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { clients } = useClients()
  const {
    services,
    entries,
    addEntry,
    updateEntry,
    deleteEntry,
    updateService,
    publishServiceShare,
    refreshServiceShare,
    revokeServiceShare,
  } = useHourlyServices()

  const service = services.find((s) => s.id === id)
  const client = clients.find((c) => c.id === service?.clientId)

  const [entryModal, setEntryModal] = useState(false)
  const [editEntry, setEditEntry] = useState<HourlyServiceEntry | null>(null)
  const [form, setForm] = useState<EntryForm>(emptyEntryForm)
  const [freeMinutesDraft, setFreeMinutesDraft] = useState<string | null>(null)
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null)
  const [shareBusy, setShareBusy] = useState(false)

  const serviceEntries = useMemo(() => {
    if (!id) return []
    return filterEntriesByService(entries, id).sort((a, b) =>
      b.workDate.localeCompare(a.workDate),
    )
  }, [entries, id])

  const packageStats = useMemo(() => {
    if (!service) {
      return { usedTotal: 0, remaining: 0, usedPct: null as number | null }
    }
    const usedTotal = sumHours(serviceEntries)
    const remaining = hoursRemaining(service.hoursPackageTotal, usedTotal)
    const usedPct = hoursPackagePercent(usedTotal, service.hoursPackageTotal)
    return { usedTotal, remaining, usedPct }
  }, [serviceEntries, service])

  const billableTotal = useMemo(
    () =>
      serviceEntries
        .filter((e) => e.billable)
        .reduce((acc, e) => acc + e.hours, 0),
    [serviceEntries],
  )

  const estimatedAmount = amountFromHours(billableTotal, service?.hourlyRate)

  const reportEntries = useMemo(
    () =>
      [...serviceEntries].sort((a, b) => a.workDate.localeCompare(b.workDate)),
    [serviceEntries],
  )

  const openNewEntry = () => {
    setEditEntry(null)
    setFreeMinutesDraft(null)
    setForm(emptyEntryForm(defaultPerformerName(user)))
    setEntryModal(true)
  }

  const openEditEntry = (e: HourlyServiceEntry) => {
    setEditEntry(e)
    setFreeMinutesDraft(null)
    setForm(entryToForm(e))
    setEntryModal(true)
  }

  const setQuickHours = (hours: number) => {
    setFreeMinutesDraft(null)
    setForm((f) => ({
      ...f,
      hours: String(hours),
    }))
  }

  const normalizeHoursInput = () => {
    const raw = freeMinutesDraft ?? form.hours
    const parsed = parseFreeMinutesInput(raw)
    if (parsed != null) {
      setForm((f) => ({ ...f, hours: String(parsed) }))
      setFreeMinutesDraft(null)
    }
  }

  const handleSaveEntry = async (e: FormEvent) => {
    e.preventDefault()
    if (!id || !service || !user) return
    const hours = resolveHoursFromForm(form.hours, freeMinutesDraft)
    if (
      !form.taskTitle.trim() ||
      !form.performerName.trim() ||
      hours == null ||
      hours <= 0
    ) {
      return
    }

    const payload = {
      clientId: service.clientId,
      performerId: editEntry?.performerId ?? user.uid,
      performerName: form.performerName.trim(),
      workDate: form.workDate,
      hours,
      taskTitle: form.taskTitle.trim(),
      description: form.description.trim() || undefined,
      workCategory: form.workCategory,
      billable: form.billable,
      status: form.status,
    }

    if (editEntry) {
      await updateEntry(id, editEntry.id, payload)
    } else {
      await addEntry(id, payload)
    }
    setEntryModal(false)
  }

  if (!service) {
    return (
      <div className="hub-dash-page mx-auto min-w-0 w-full max-w-[1400px] px-4 py-6 pb-24 sm:px-8">
        <p className="text-[var(--text-mid)]">בנק שעות לא נמצא.</p>
        <Link to="/hourly-services" className="mt-2 text-[var(--orange)]">
          חזרה לרשימה
        </Link>
      </div>
    )
  }

  const pendingHours =
    resolveHoursFromForm(form.hours, freeMinutesDraft) ?? 0
  const freeFieldMinutesDisplay =
    freeMinutesDraft ??
    (() => {
      const h = parseFreeMinutesInput(form.hours)
      return h != null ? hoursToFreeMinutesDisplay(h) : form.hours
    })()
  const hoursDelta = editEntry ? pendingHours - editEntry.hours : pendingHours
  const afterRemaining = packageStats.remaining - hoursDelta

  const usagePct = packageStats.usedPct ?? 0
  const progressColor =
    packageStats.remaining < 0
      ? '#EF4444'
      : usagePct >= 90
        ? '#F59E0B'
        : '#10B981'

  return (
    <div
      className="mx-auto min-w-0 w-full max-w-[1400px] space-y-6 px-4 py-6 pb-24 sm:px-8"
      dir="rtl"
    >
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 text-right">
          <Link
            to="/hourly-services"
            className="text-[12px] text-[var(--text-mid)] hover:text-[var(--orange)]"
          >
            ← שירותי שעות
          </Link>
          <h1 className="mt-1 break-words text-[22px] font-extrabold leading-tight text-[var(--text-dark)] md:text-[26px]">
            {service.title}
          </h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-mid)]">
            {client?.name ?? '—'} · {HOURLY_SERVICE_KIND_LABEL[service.serviceKind]}
            {service.hourlyRate != null
              ? ` · ₪${service.hourlyRate.toLocaleString('he-IL')}/שעה`
              : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge
              label={HOURLY_SERVICE_STATUS_LABEL[service.status]}
              color={HOURLY_SERVICE_STATUS_COLOR[service.status]}
            />
            <Badge
              label={`חבילה: ${formatHours(service.hoursPackageTotal)} שעות`}
              color="#6366F1"
            />
            <Badge
              label={`נותר: ${formatHours(packageStats.remaining)} שעות`}
              color={
                packageStats.remaining < 0
                  ? '#EF4444'
                  : packageStats.remaining <= service.hoursPackageTotal * 0.1
                    ? '#F59E0B'
                    : '#10B981'
              }
            />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
          <select
            value={service.status}
            onChange={(e) =>
              void updateService(service.id, {
                status: e.target.value as typeof service.status,
              })
            }
            className="h-9 min-w-[108px] rounded-[10px] border border-[var(--border-orange-soft)] bg-white px-2 text-[12px]"
          >
            <option value="active">פעיל</option>
            <option value="paused">מושהה</option>
            <option value="closed">נסגר</option>
          </select>
          <button type="button" className={uiBtnBrand} onClick={openNewEntry}>
            + רשומת שעות
          </button>
        </div>
      </header>

      <section className={`rounded-2xl ${hubSectionClass()} p-4 sm:p-5`}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 text-right">
            <h2 className="text-[15px] font-bold text-[var(--text-dark)]">
              חבילת שעות
            </h2>
            <p className="mt-1 text-[12px] text-[var(--text-mid)]">
              נוצלו {formatHours(packageStats.usedTotal)} מתוך{' '}
              {formatHours(service.hoursPackageTotal)} שעות
            </p>
          </div>
          <div className="w-full min-w-0 sm:max-w-md">
            <ProgressBar
              done={packageStats.usedTotal}
              total={service.hoursPackageTotal}
              color={progressColor}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 [&>*]:min-w-0">
          <StatCell
            label="שעות בחבילה"
            value={formatHours(service.hoursPackageTotal)}
          />
          <StatCell label="נוצלו" value={formatHours(packageStats.usedTotal)} />
          <StatCell
            label="נותר ללקוח"
            value={formatHours(packageStats.remaining)}
            warn={
              packageStats.remaining < 0 ||
              packageStats.remaining <= service.hoursPackageTotal * 0.1
            }
          />
          <StatCell
            label="ניצול חבילה"
            value={
              packageStats.usedPct != null ? `${packageStats.usedPct}%` : '—'
            }
            warn={packageStats.usedPct != null && packageStats.usedPct >= 90}
          />
        </div>
      </section>

      {service.notes ? (
        <div
          className={`rounded-2xl ${hubSectionClass()} p-4 text-right text-[13px] leading-relaxed text-[var(--text-mid)] sm:p-5`}
        >
          {service.notes}
        </div>
      ) : null}

      <section className={`rounded-2xl ${hubSectionClass()} overflow-hidden p-4 sm:p-5`}>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-right">
            <h2 className="text-[15px] font-bold text-[var(--text-dark)]">
              יומן ביצוע
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--text-mid)]">
              {serviceEntries.length > 0
                ? `${serviceEntries.length} רשומות · ${entryDateRangeLabel(serviceEntries) ?? ''}`
                : 'תיעוד לפי תאריך ביצוע — ללא חלוקה לחודשים'}
            </p>
          </div>
          <button type="button" className={uiBtnBrand} onClick={openNewEntry}>
            + רשומת שעות
          </button>
        </div>
        {serviceEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-orange-soft)] bg-[var(--surface-muted)]/30 px-4 py-10 text-center">
            <p className="text-[14px] font-semibold text-[var(--text-dark)]">
              אין רשומות עדיין
            </p>
            <p className="mt-1 max-w-sm text-[13px] text-[var(--text-mid)]">
              הוסף מתי בוצעה העבודה, כמה שעות ומה נעשה — החבילה תתעדכן אוטומטית.
            </p>
            <button
              type="button"
              className={`${uiBtnBrand} mt-4`}
              onClick={openNewEntry}
            >
              + רשומת שעות ראשונה
            </button>
          </div>
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[760px] text-right text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border-orange-soft)] text-[11px] text-[var(--text-mid)]">
                  <th className="px-2 py-2 font-semibold">תאריך</th>
                  <th className="px-2 py-2 font-semibold">שעות</th>
                  <th className="min-w-[180px] px-2 py-2 font-semibold">משימה</th>
                  <th className="px-2 py-2 font-semibold">קטגוריה</th>
                  <th className="px-2 py-2 font-semibold">מבצע</th>
                  <th className="px-2 py-2 font-semibold">סטטוס</th>
                  <th className="px-2 py-2 font-semibold">לחיוב</th>
                  <th className="w-[88px] px-2 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {serviceEntries.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--border-orange-soft)]/50 hover:bg-[var(--surface-muted)]/40"
                  >
                    <td className="px-2 py-2.5 whitespace-nowrap tabular-nums">
                      {formatDateIL(row.workDate)}
                    </td>
                    <td className="px-2 py-2.5 font-semibold tabular-nums">
                      {formatHours(row.hours)}
                    </td>
                    <td className="max-w-[280px] px-2 py-2.5">
                      <div className="truncate font-medium">{row.taskTitle}</div>
                      {row.description ? (
                        <div className="mt-0.5 line-clamp-2 text-[11px] text-[var(--text-mid)]">
                          {row.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-[12px]">
                      {HOURLY_WORK_CATEGORY_LABEL[row.workCategory]}
                    </td>
                    <td className="max-w-[120px] truncate px-2 py-2.5 text-[12px] text-[var(--text-mid)]">
                      {row.performerName}
                    </td>
                    <td className="px-2 py-2.5">
                      <Badge
                        label={HOURLY_ENTRY_STATUS_LABEL[row.status]}
                        color={HOURLY_ENTRY_STATUS_COLOR[row.status]}
                      />
                    </td>
                    <td className="px-2 py-2.5">{row.billable ? 'כן' : 'לא'}</td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <button
                        type="button"
                        className="text-[11px] text-[var(--orange)] hover:underline"
                        onClick={() => openEditEntry(row)}
                      >
                        ערוך
                      </button>
                      <span className="mx-1 text-[var(--text-mid)]">|</span>
                      <button
                        type="button"
                        className="text-[11px] text-red-600 hover:underline"
                        onClick={() => setDeleteEntryId(row.id)}
                      >
                        מחק
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={`rounded-2xl ${hubSectionClass()} p-4 sm:p-5`}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-[15px] font-bold text-[var(--text-dark)]">
              דוח סיכום ללקוח
            </h2>
            <p className="mt-1 text-[12px] text-[var(--text-mid)]">
              תצוגה מוכנה לשיתוף — {client?.name ?? ''}
              {entryDateRangeLabel(serviceEntries)
                ? ` · ${entryDateRangeLabel(serviceEntries)}`
                : ''}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {service.shareEnabled && service.shareToken ? (
              <>
                <button
                  type="button"
                  className={uiBtnGhost}
                  disabled={shareBusy}
                  onClick={() => {
                    if (!id) return
                    setShareBusy(true)
                    void refreshServiceShare(id, client?.name ?? '').finally(
                      () => setShareBusy(false),
                    )
                  }}
                >
                  רענן דוח
                </button>
                <button
                  type="button"
                  className={uiBtnGhost}
                  disabled={shareBusy}
                  onClick={() => {
                    if (!id) return
                    setShareBusy(true)
                    void revokeServiceShare(id).finally(() => setShareBusy(false))
                  }}
                >
                  בטל שיתוף
                </button>
                <a
                  href={hourlyServiceShareUrl(service.shareToken)}
                  target="_blank"
                  rel="noreferrer"
                  className={uiBtnBrand}
                >
                  פתח תצוגת לקוח
                </a>
              </>
            ) : (
              <button
                type="button"
                className={uiBtnBrand}
                disabled={shareBusy || serviceEntries.length === 0}
                onClick={() => {
                  if (!id) return
                  setShareBusy(true)
                  void publishServiceShare(id, client?.name ?? '').finally(() =>
                    setShareBusy(false),
                  )
                }}
              >
                צור קישור ללקוח
              </button>
            )}
          </div>
        </div>

        {service.shareEnabled && service.shareToken ? (
          <div className="mb-4 flex flex-col gap-2 rounded-xl border border-[var(--border-orange-soft)] bg-[var(--surface-muted)]/30 p-3 sm:flex-row sm:items-center">
            <input
              readOnly
              value={hourlyServiceShareUrl(service.shareToken)}
              className="min-w-0 flex-1 rounded-[10px] border border-[var(--border-orange-soft)] bg-white px-3 py-2 text-[12px] text-[var(--text-mid)]"
              dir="ltr"
            />
            <button
              type="button"
              className={uiBtnBrand}
              onClick={() => {
                void navigator.clipboard.writeText(
                  hourlyServiceShareUrl(service.shareToken!),
                )
              }}
            >
              העתק קישור
            </button>
          </div>
        ) : null}

        <div className="rounded-xl border border-[var(--border-orange-soft)] bg-white p-4 text-right text-[13px] sm:p-5">
          <p className="font-bold text-[var(--text-dark)]">{service.title}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <p>
              חבילה:{' '}
              <strong className="tabular-nums">
                {formatHours(service.hoursPackageTotal)}
              </strong>{' '}
              שעות
            </p>
            <p>
              נוצלו:{' '}
              <strong className="tabular-nums">
                {formatHours(packageStats.usedTotal)}
              </strong>
            </p>
            <p>
              נותר:{' '}
              <strong className="tabular-nums">
                {formatHours(packageStats.remaining)}
              </strong>
            </p>
          </div>
          <p className="mt-2 text-[12px] text-[var(--text-mid)]">
            סה״כ שתועדו: {formatHours(packageStats.usedTotal)} שעות
            {billableTotal !== packageStats.usedTotal
              ? ` · לחיוב: ${formatHours(billableTotal)}`
              : ''}
          </p>
          {estimatedAmount != null ? (
            <p className="mt-1">
              סכום משוער (לפי תעריף):{' '}
              <strong className="tabular-nums">
                ₪{estimatedAmount.toLocaleString('he-IL')}
              </strong>
            </p>
          ) : null}
          {reportEntries.length > 0 ? (
            <ul className="mt-4 space-y-2.5 border-t border-[var(--border-orange-soft)] pt-4">
              {reportEntries.map((row) => (
                <li key={row.id} className="leading-relaxed">
                  <span className="text-[var(--text-mid)] tabular-nums">
                    {formatDateIL(row.workDate)}
                  </span>
                  {' — '}
                  <strong className="tabular-nums">
                    {formatHours(row.hours)} שעות
                  </strong>
                  {' — '}
                  <span>{row.taskTitle}</span>
                  {' — '}
                  <span className="text-[var(--text-mid)]">{row.performerName}</span>
                  {row.description ? (
                    <span className="text-[var(--text-mid)]">
                      {' '}
                      ({row.description})
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 border-t border-[var(--border-orange-soft)] pt-4 text-[12px] text-[var(--text-mid)]">
              אין רשומות בדוח עדיין.
            </p>
          )}
        </div>
      </section>

      <Modal
        isOpen={entryModal}
        onClose={() => setEntryModal(false)}
        title={editEntry ? 'עריכת רשומת שעות' : 'רשומת שעות חדשה'}
        size="lg"
        bodyClassName="max-h-none overflow-visible"
      >
        <form
          onSubmit={(e) => void handleSaveEntry(e)}
          className="flex flex-col gap-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block min-w-0 text-right">
              <span className={fieldLabel}>תאריך *</span>
              <input
                type="date"
                required
                value={form.workDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, workDate: e.target.value }))
                }
                className={fieldInput}
              />
            </label>
            <label className="block min-w-0 text-right">
              <span className={fieldLabel}>מבצע המטלה *</span>
              <input
                type="text"
                required
                value={form.performerName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, performerName: e.target.value }))
                }
                placeholder="שם המבצע"
                className={fieldInput}
              />
            </label>
          </div>

          <div className="rounded-xl border border-[var(--border-orange-soft)] bg-[var(--surface-muted)]/25 p-3 sm:p-4">
            <span className={fieldLabel}>שעות *</span>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {HOUR_QUICK_PRESETS.map((preset) => {
                const active = activePresetHours(form.hours) === preset.hours
                return (
                  <button
                    key={preset.hours}
                    type="button"
                    className={hourPresetBtnClass(active)}
                    onClick={() => setQuickHours(preset.hours)}
                  >
                    {preset.label}
                  </button>
                )
              })}
              <input
                type="text"
                inputMode="numeric"
                required
                value={freeFieldMinutesDisplay}
                onChange={(e) => setFreeMinutesDraft(e.target.value)}
                onBlur={normalizeHoursInput}
                placeholder="דקות: 20, 90, 1000"
                aria-label="הזנת דקות — המרה אוטומטית לשעות"
                className={`${hourFreeInput} ${
                  activePresetHours(form.hours) == null &&
                  resolveHoursFromForm(form.hours, freeMinutesDraft) != null
                    ? 'border-[var(--orange)] bg-[var(--orange-light)]/40 focus:border-[var(--orange)]'
                    : 'border-[var(--border-orange-soft)] focus:border-[var(--orange)]'
                }`}
              />
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-mid)]">
              15 דק׳, חצי שעה או שעה בלחיצה — בשדה החופשי הקלד{' '}
              <strong>דקות</strong>
              {pendingHours > 0 ? (
                <>
                  {' '}
                  (≈ {formatHours(pendingHours)} שעות)
                </>
              ) : null}
            </p>
          </div>

          <label className="block text-right">
            <span className={fieldLabel}>משימה / נושא *</span>
            <input
              required
              value={form.taskTitle}
              onChange={(e) =>
                setForm((f) => ({ ...f, taskTitle: e.target.value }))
              }
              placeholder="מה בוצע?"
              className={fieldInput}
            />
          </label>

          <label className="block text-right">
            <span className={fieldLabel}>פירוט</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder="תיעוד מפורט ללקוח…"
              className={`${fieldInput} min-h-[88px] resize-y py-2.5`}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block min-w-0 text-right">
              <span className={fieldLabel}>קטגוריה</span>
              <select
                value={form.workCategory}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    workCategory: e.target.value as HourlyWorkCategory,
                  }))
                }
                className={fieldInput}
              >
                {HOURLY_WORK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {HOURLY_WORK_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0 text-right">
              <span className={fieldLabel}>סטטוס</span>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as HourlyEntryStatus,
                  }))
                }
                className={fieldInput}
              >
                {HOURLY_ENTRY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {HOURLY_ENTRY_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center justify-end gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={form.billable}
              onChange={(e) =>
                setForm((f) => ({ ...f, billable: e.target.checked }))
              }
            />
            שעות לחיוב
          </label>

          {pendingHours > 0 && afterRemaining < 0 ? (
            <p className="rounded-[10px] border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              אזהרה: לאחר שמירה יחרגו החבילה ב-
              {formatHours(Math.abs(afterRemaining))} שעות (יתרה:{' '}
              {formatHours(packageStats.remaining)}).
            </p>
          ) : pendingHours > 0 ? (
            <p className="text-[12px] text-[var(--text-mid)]">
              לאחר שמירה יישארו {formatHours(afterRemaining)} שעות בחבילה.
            </p>
          ) : null}

          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[var(--border-orange-soft)] pt-4">
            <button
              type="button"
              className={uiBtnGhost}
              onClick={() => setEntryModal(false)}
            >
              ביטול
            </button>
            <button type="submit" className={uiBtnBrand}>
              שמור
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteEntryId != null}
        onClose={() => setDeleteEntryId(null)}
        onConfirm={() => {
          if (deleteEntryId && id) void deleteEntry(id, deleteEntryId)
        }}
        message="למחוק את רשומת השעות?"
      />
    </div>
  )
}

function StatCell({
  label,
  value,
  warn,
}: {
  label: string
  value: string
  warn?: boolean
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--border-orange-soft)]/60 bg-[var(--surface-muted)]/35 px-3 py-3 text-right sm:px-4 sm:py-3.5">
      <p className="truncate text-[11px] text-[var(--text-mid)]">{label}</p>
      <p
        className={`mt-1 truncate text-[20px] font-extrabold tabular-nums sm:text-[22px] ${
          warn ? 'text-red-600' : 'text-[var(--text-dark)]'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
