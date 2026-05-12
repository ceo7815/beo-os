import { useMemo, useState } from 'react'
import { formatDateIL, todayYmd } from '../../lib/dates'
import { hubSectionClass } from '../../lib/hubSectionBorder'
import { Modal } from '../shared/Modal'
import type { TeamMember } from '../../types'

function ymdFirstOfMonth(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function isMemberActive(m: TeamMember): boolean {
  return m.active !== false
}

type Props = {
  users: TeamMember[]
  integrationReady: boolean
  /** טווח תאריכים לסינון — בשלב ה-API יועבר ל-Clockify */
  filterStart: string
  filterEnd: string
  onFilterChange: (start: string, end: string) => void
}

export function ClockifyAdminDashboard({
  users,
  integrationReady,
  filterStart,
  filterEnd,
  onFilterChange,
}: Props) {
  const [detailUser, setDetailUser] = useState<TeamMember | null>(null)

  const rows = useMemo(
    () => [...users].filter(isMemberActive).sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [users],
  )

  return (
    <>
      <section className={`rounded-2xl ${hubSectionClass(1)} p-4 md:p-6`}>
        <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between">
          <div>
            <h2 className="text-[15px] font-extrabold text-[var(--text-dark)] md:text-[17px]">
              צוות ושעות (Clockify)
            </h2>
            <p className="mt-1 max-w-2xl text-[12px] text-[var(--text-mid)] md:text-[13px]">
              סיכום לפי יום / שבוע / חודש וסטטוס מעקב פעיל — יתמלא אוטומטית אחרי חיבור ה-API. לחיצה על שורה תציג
              פירוט כניסות, יציאות ופרויקטים.
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
          </div>
        </div>

        {!integrationReady ? (
          <div
            className="mt-5 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-input)]/50 p-4 text-[13px] text-[var(--text-mid)]"
            role="status"
          >
            כדי לטעון נתונים מ-Clockify יש להגדיר למעלה <strong className="text-[var(--text-dark)]">API Key</strong>{' '}
            ו-<strong className="text-[var(--text-dark)]">Workspace ID</strong> ולשמור. אחר כך יחובר ה-API (כולל
            טיפול ב-CORS).
          </div>
        ) : null}

        <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="min-w-[720px] w-full border-collapse text-right text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-input)]/60 text-[11px] font-bold uppercase tracking-wide text-[var(--text-light)]">
                <th className="px-3 py-3">עובד</th>
                <th className="px-3 py-3">אימייל</th>
                <th className="px-3 py-3 text-center">היום</th>
                <th className="px-3 py-3 text-center">השבוע</th>
                <th className="px-3 py-3 text-center">החודש</th>
                <th className="px-3 py-3 text-center">מעקב פעיל</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m, idx) => (
                <tr
                  key={m.id}
                  className={`cursor-pointer border-b border-[var(--border)] transition hover:bg-[var(--orange-light)]/25 ${
                    idx % 2 === 0 ? 'bg-[var(--dash-panel-bg)]/40' : ''
                  }`}
                  onClick={() => setDetailUser(m)}
                >
                  <td className="px-3 py-3 font-semibold text-[var(--text-dark)]">{m.name}</td>
                  <td className="px-3 py-3 font-mono text-[12px] text-[var(--text-mid)]" dir="ltr">
                    {m.email?.trim() || '—'}
                  </td>
                  <td className="px-3 py-3 text-center tabular-nums text-[var(--text-mid)]">—</td>
                  <td className="px-3 py-3 text-center tabular-nums text-[var(--text-mid)]">—</td>
                  <td className="px-3 py-3 text-center tabular-nums text-[var(--text-mid)]">—</td>
                  <td className="px-3 py-3 text-center">
                    <span className="inline-flex rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-mid)]">
                      {integrationReady ? 'בקרוב (API)' : 'לא מוגדר'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <p className="mt-4 text-center text-sm text-[var(--text-mid)]">אין עובדים פעילים ברשימה.</p>
        ) : null}
      </section>

      <Modal
        isOpen={detailUser != null}
        onClose={() => setDetailUser(null)}
        title={detailUser ? `פירוט נוכחות · ${detailUser.name}` : ''}
        size="xl"
        bodyClassName="max-h-[min(80vh,720px)] overflow-y-auto"
      >
        {detailUser ? (
          <div className="space-y-5 text-[13px]">
            <p className="text-[var(--text-mid)]">
              טווח נבחר:{' '}
              <span className="font-semibold text-[var(--text-dark)]">
                {formatDateIL(filterStart)} – {formatDateIL(filterEnd)}
              </span>
            </p>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)]/40 p-4">
              <h3 className="text-[12px] font-bold uppercase tracking-wide text-[var(--orange)]">
                כניסות / יציאות / פרויקטים
              </h3>
              <p className="mt-2 text-[var(--text-mid)]">
                כאן יוצגו רשומות time entries מ-Clockify לאחר חיבור ה-API (כולל שם פרויקט, משך, התחלה/סיום).
              </p>
              <div className="mt-3 rounded-lg border border-dashed border-[var(--border)] p-6 text-center text-[12px] text-[var(--text-light)]">
                placeholder: רשימת entries
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)]/40 p-4">
              <h3 className="text-[12px] font-bold uppercase tracking-wide text-[var(--orange)]">סיכום יומי</h3>
              <p className="mt-2 text-[var(--text-mid)]">placeholder: טבלת ימים עם סה״כ שעות ליום.</p>
              <div className="mt-3 rounded-lg border border-dashed border-[var(--border)] p-6 text-center text-[12px] text-[var(--text-light)]">
                placeholder: day breakdown
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  )
}
