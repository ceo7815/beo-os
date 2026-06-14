import { useState } from 'react'
import { formatDateIL, formatDateTimeIL, todayYmd } from '../../lib/dates'
import { formatHoursShort } from '../../lib/clockifyService'
import { hubSectionClass } from '../../lib/hubSectionBorder'
import { Modal } from '../shared/Modal'
import { useClockifyUserDetail, type MergedAdminAttendanceRow } from '../../hooks/useClockifyAttendance'

function ymdFirstOfMonth(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

type Props = {
  rows: MergedAdminAttendanceRow[]
  loading: boolean
  error: string | null
  workspaceId: string
  integrationReady: boolean
  filterStart: string
  filterEnd: string
  onFilterChange: (start: string, end: string) => void
  onRefresh: () => void
}

export function ClockifyAdminDashboard({
  rows,
  loading,
  error,
  workspaceId,
  integrationReady,
  filterStart,
  filterEnd,
  onFilterChange,
  onRefresh,
}: Props) {
  const [detailRow, setDetailRow] = useState<MergedAdminAttendanceRow | null>(null)

  const detail = useClockifyUserDetail({
    workspaceId,
    clockifyUserId: detailRow?.clockifyUserId ?? null,
    filterStart,
    filterEnd,
    open: detailRow != null && Boolean(detailRow.clockifyUserId),
  })

  return (
    <>
      <section className={`rounded-2xl ${hubSectionClass(1)} p-4 md:p-6`}>
        <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between">
          <div>
            <h2 className="text-[15px] font-extrabold text-[var(--text-dark)] md:text-[17px]">
              צוות ושעות (Clockify)
            </h2>
            <p className="mt-1 max-w-2xl text-[12px] text-[var(--text-mid)] md:text-[13px]">
              התאמה לפי אימייל (Firebase ↔ Clockify). סיכום היום / השבוע / החודש מתעדכן מרשומות הזמן. לחיצה על שורה
              פותחת פירוט לפי טווח התאריכים שבחרת.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[var(--text-light)]">
                מתאריך
              </label>
              <input
                type="date"
                value={filterStart}
                onChange={(e) => onFilterChange(e.target.value, filterEnd)}
                className="min-h-[44px]"
                dir="ltr"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[var(--text-light)]">
                עד תאריך
              </label>
              <input
                type="date"
                value={filterEnd}
                onChange={(e) => onFilterChange(filterStart, e.target.value)}
                className="min-h-[44px]"
                dir="ltr"
              />
            </div>
            <button
              type="button"
              className="hub-btn-secondary text-[12px]"
              onClick={() => onFilterChange(ymdFirstOfMonth(), todayYmd())}
            >
              חודש נוכחי
            </button>
            <button
              type="button"
              className="hub-btn-orange text-[12px]"
              disabled={!integrationReady || loading}
              onClick={() => onRefresh()}
            >
              {loading ? 'טוען…' : 'רענון'}
            </button>
          </div>
        </div>

        {error ? (
          <div
            className="mt-4 rounded-xl border border-red-200 bg-red-50/80 p-3 text-[13px] text-red-900"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {!integrationReady ? (
          <div
            className="mt-5 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-input)]/50 p-4 text-[13px] text-[var(--text-mid)]"
            role="status"
          >
            כדי לטעון נתונים מ-Clockify יש להגדיר למעלה <strong className="text-[var(--text-dark)]">API Key</strong>{' '}
            ו-<strong className="text-[var(--text-dark)]">Workspace ID</strong> ולשמור. הקריאות עוברות דרך Cloud
            Function מאובטחת (ללא CORS מהדפדפן).
          </div>
        ) : null}

        <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="min-w-[760px] w-full border-collapse text-right text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-input)]/60 text-[11px] font-bold uppercase tracking-wide text-[var(--text-light)]">
                <th className="px-3 py-3">עובד</th>
                <th className="px-3 py-3">אימייל</th>
                <th className="px-3 py-3 text-center">היום</th>
                <th className="px-3 py-3 text-center">השבוע</th>
                <th className="px-3 py-3 text-center">החודש</th>
                <th className="px-3 py-3 text-center">בטווח</th>
                <th className="px-3 py-3 text-center">פעיל</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const { member: m } = row
                return (
                  <tr
                    key={m.id}
                    className={`cursor-pointer border-b border-[var(--border)] transition hover:bg-[var(--orange-light)]/25 ${
                      idx % 2 === 0 ? 'bg-[var(--dash-panel-bg)]/40' : ''
                    }`}
                    onClick={() => setDetailRow(row)}
                  >
                    <td className="px-3 py-3 font-semibold text-[var(--text-dark)]">
                      {m.name}
                      {!row.clockifyUserId ? (
                        <span
                          className="ms-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900"
                          title="אין משתמש Clockify עם אותו אימייל"
                        >
                          ללא התאמה
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 font-mono text-[12px] text-[var(--text-mid)]" dir="ltr">
                      {m.email?.trim() || '—'}
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums text-[var(--text-mid)]">
                      {integrationReady ? `${formatHoursShort(row.hoursToday)} ש׳` : '—'}
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums text-[var(--text-mid)]">
                      {integrationReady ? `${formatHoursShort(row.hoursWeek)} ש׳` : '—'}
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums text-[var(--text-mid)]">
                      {integrationReady ? `${formatHoursShort(row.hoursMonth)} ש׳` : '—'}
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums text-[var(--text-mid)]">
                      {integrationReady ? `${formatHoursShort(row.hoursInRange)} ש׳` : '—'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: row.active ? '#22c55e' : 'var(--text-light)',
                        }}
                        title={row.active ? 'מעקב פעיל' : 'לא פעיל'}
                        aria-label={row.active ? 'מעקב פעיל' : 'לא פעיל'}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {integrationReady && !loading && rows.length > 0 ? (
          <>
            {rows.some((r) => !r.clockifyUserId) ? (
              <div
                className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-[12px] text-amber-950"
                role="status"
              >
                {rows.filter((r) => !r.clockifyUserId).length} עובדים ב-Hub ללא התאמת אימייל ב-Clockify — השעות
                שלהם יוצגו כ-0. ודאו שהאימייל ב-Firebase זהה לאימייל ב-Clockify (אותיות קטנות).
              </div>
            ) : null}
            <p className="mt-3 text-[11px] text-[var(--text-light)]">
            עמודת «בטווח»: סה״כ שעות בין {formatDateIL(filterStart)} ל-{formatDateIL(filterEnd)} (לפי שעון מקומי).
            </p>
          </>
        ) : null}

        {rows.length === 0 && integrationReady && !loading ? (
          <p className="mt-4 text-center text-sm text-[var(--text-mid)]">אין עובדים פעילים ברשימה.</p>
        ) : null}
      </section>

      <Modal
        isOpen={detailRow != null}
        onClose={() => setDetailRow(null)}
        title={detailRow ? `פירוט נוכחות · ${detailRow.member.name}` : ''}
        size="xl"
        bodyClassName="max-h-[min(80vh,720px)] overflow-y-auto"
      >
        {detailRow ? (
          <div className="space-y-5 text-[13px]">
            <p className="text-[var(--text-mid)]">
              טווח נבחר:{' '}
              <span className="font-semibold text-[var(--text-dark)]">
                {formatDateIL(filterStart)} – {formatDateIL(filterEnd)}
              </span>
            </p>

            {!detailRow.clockifyUserId ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-amber-950">
                אין משתמש Clockify עם אותו אימייל כמו בעובד זה — לא ניתן לטעון רשומות זמן.
              </div>
            ) : detail.loading ? (
              <p className="text-[var(--text-mid)]">טוען פירוט…</p>
            ) : detail.error ? (
              <div className="rounded-xl border border-red-200 bg-red-50/80 p-3 text-red-900">{detail.error}</div>
            ) : (
              <>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)]/30 p-4">
                  <h3 className="text-[12px] font-bold uppercase tracking-wide text-[var(--orange)]">
                    סיכום יומי בטווח
                  </h3>
                  <div className="mt-3 space-y-2">
                    {detail.days
                      .filter((d) => d.totalHours > 0.001 || d.entries.length > 0)
                      .map((d) => (
                        <div
                          key={d.ymd}
                          className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)]/60 py-2 last:border-0"
                        >
                          <span className="font-semibold text-[var(--text-dark)]">{formatDateIL(d.ymd)}</span>
                          <span className="tabular-nums text-[var(--text-mid)]">
                            {formatHoursShort(d.totalHours)} ש׳
                          </span>
                        </div>
                      ))}
                    {detail.days.every((d) => d.totalHours <= 0.001 && d.entries.length === 0) ? (
                      <p className="text-[var(--text-mid)]">אין רשומות בטווח זה.</p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)]/30 p-4">
                  <h3 className="text-[12px] font-bold uppercase tracking-wide text-[var(--orange)]">
                    כניסות / יציאות / פרויקטים
                  </h3>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-[560px] w-full border-collapse text-right text-[12px]">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-[10px] font-bold uppercase text-[var(--text-light)]">
                          <th className="py-2 pe-2">יום</th>
                          <th className="py-2 pe-2">התחלה</th>
                          <th className="py-2 pe-2">סיום</th>
                          <th className="py-2 pe-2">פרויקט</th>
                          <th className="py-2 text-center">שעות</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.days.flatMap((d) =>
                          d.entries.map((e) => (
                            <tr key={`${d.ymd}-${e.id}`} className="border-b border-[var(--border)]/50">
                              <td className="py-2 pe-2 whitespace-nowrap">{formatDateIL(d.ymd)}</td>
                              <td className="py-2 pe-2 font-mono text-[11px]" dir="ltr">
                                {formatDateTimeIL(e.start)}
                              </td>
                              <td className="py-2 pe-2 font-mono text-[11px]" dir="ltr">
                                {e.end ? formatDateTimeIL(e.end) : '—'}
                              </td>
                              <td className="py-2 pe-2 text-[var(--text-mid)]">{e.projectName}</td>
                              <td className="py-2 text-center tabular-nums">{formatHoursShort(e.hours)}</td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)]/40 p-4">
                  <h3 className="text-[12px] font-bold text-[var(--text-mid)]">סיכום מהיר (היום / שבוע / חודש)</h3>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {(() => {
                      const barMax = Math.max(
                        0.01,
                        detailRow.hoursToday,
                        detailRow.hoursWeek,
                        detailRow.hoursMonth,
                      )
                      return (['hoursToday', 'hoursWeek', 'hoursMonth'] as const).map((k) => {
                        const v = detailRow[k]
                        return (
                          <div key={k} className="min-w-[100px] flex-1 rounded-lg border border-[var(--border)] p-2">
                            <div className="text-[10px] font-bold uppercase text-[var(--text-light)]">
                              {k === 'hoursToday' ? 'היום' : k === 'hoursWeek' ? 'שבוע' : 'חודש'}
                            </div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--bg-input)]">
                              <div
                                className="h-full rounded-full bg-[var(--orange)]"
                                style={{ width: `${Math.min(100, (v / barMax) * 100)}%` }}
                              />
                            </div>
                            <div className="mt-1 tabular-nums text-[var(--text-dark)]">{formatHoursShort(v)} ש׳</div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}
      </Modal>
    </>
  )
}
