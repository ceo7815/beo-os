import { formatDateIL, formatDateTimeIL, formatWeekdayShortIL, todayYmd } from '../../lib/dates'
import { formatHoursShort } from '../../lib/clockifyService'
import { hubSectionClass } from '../../lib/hubSectionBorder'
import type { EmployeeAttendanceState } from '../../hooks/useClockifyAttendance'

type Props = {
  userEmail: string
  workspaceId: string
  integrationReady: boolean
  state: EmployeeAttendanceState
  onRefresh: () => void
}

export function ClockifyEmployeeDashboard({
  userEmail,
  workspaceId,
  integrationReady,
  state,
  onRefresh,
}: Props) {
  const loading = state.status === 'loading'
  const maxWeek = (() => {
    if (state.status !== 'ok') return 0.01
    return Math.max(0.01, ...state.weekBars.map((b) => b.hours))
  })()

  return (
    <div className="space-y-5">
      <section className={`rounded-2xl ${hubSectionClass(2)} p-4 md:p-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <h2 className="text-[15px] font-extrabold text-[var(--text-dark)] md:text-[17px]">הנוכחות שלי</h2>
            <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-[var(--text-mid)] md:text-[13px]">
              הנתונים מגיעים מ-Clockify לפי <strong className="text-[var(--text-dark)]">אותו אימייל</strong> כמו בחשבון
              Firebase. אין כתיבה כאן — תצוגה בלבד.
            </p>
          </div>
          <button
            type="button"
            className="hub-btn-orange shrink-0 text-[12px]"
            disabled={!integrationReady || loading}
            onClick={() => onRefresh()}
          >
            {loading ? 'טוען…' : 'רענון'}
          </button>
        </div>
        <dl className="mt-4 grid gap-3 text-[13px] sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)]/50 p-3">
            <dt className="text-[11px] font-bold text-[var(--text-light)]">אימייל לזיהוי</dt>
            <dd className="mt-1 font-mono text-[var(--text-dark)]" dir="ltr">
              {userEmail || '—'}
            </dd>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)]/50 p-3">
            <dt className="text-[11px] font-bold text-[var(--text-light)]">תאריך היום</dt>
            <dd className="mt-1 font-semibold text-[var(--text-dark)]">{formatDateIL(todayYmd())}</dd>
          </div>
        </dl>
      </section>

      {state.status === 'loading' && integrationReady ? (
        <section className={`rounded-2xl ${hubSectionClass(3)} p-4 text-[13px] text-[var(--text-mid)]`} role="status">
          טוען נתונים מ-Clockify…
        </section>
      ) : null}

      {!integrationReady || !workspaceId ? (
        <section
          className={`rounded-2xl ${hubSectionClass(3)} p-4 text-[13px] text-[var(--text-mid)]`}
          role="status"
        >
          האדמין עדיין לא הגדיר Workspace לנוכחות, או שחסרות הרשאות. כשההגדרה תושלם יוצגו כאן הנתונים מ-Clockify.
        </section>
      ) : null}

      {state.status === 'error' ? (
        <section
          className={`rounded-2xl border border-red-200 bg-red-50/80 p-4 text-[13px] text-red-900`}
          role="alert"
        >
          {state.message}
        </section>
      ) : null}

      {state.status === 'no_clockify_user' && integrationReady ? (
        <section className={`rounded-2xl ${hubSectionClass(3)} p-4 text-[13px] text-[var(--text-mid)]`}>
          לא נמצא משתמש Clockify עם האימייל שלך. ודא שהאימייל ב-Clockify תואם לאימייל ההתחברות כאן.
        </section>
      ) : null}

      {state.status === 'ok' ? (
        <>
          <section className={`rounded-2xl ${hubSectionClass(3)} p-4 md:p-6`}>
            <h3 className="text-[14px] font-extrabold text-[var(--text-dark)]">שעות החודש הנוכחי</h3>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-[34px] font-black tabular-nums text-[var(--text-dark)]">
                {formatHoursShort(state.monthHours)}
              </span>
              <span className="text-[14px] text-[var(--text-mid)]">שעות</span>
            </div>
          </section>

          <section className={`rounded-2xl ${hubSectionClass(4)} p-4 md:p-6`}>
            <h3 className="text-[14px] font-extrabold text-[var(--text-dark)]">מצב מעקב עכשיו</h3>
            <div className="mt-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-input)] px-4 py-2 text-[13px] font-semibold text-[var(--text-mid)]">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: state.active ? '#22c55e' : 'var(--text-light)' }}
                  aria-hidden
                />
                {state.active ? 'מעקב פעיל (טיימר / רשומה פתוחה)' : 'לא פעיל'}
              </span>
            </div>
          </section>

          <section className={`rounded-2xl ${hubSectionClass(5)} p-4 md:p-6`}>
            <h3 className="text-[14px] font-extrabold text-[var(--text-dark)]">גרף שבועי (השבוע הנוכחי)</h3>
            <p className="mt-1 text-[11px] text-[var(--text-light)]">ראשון–שבת — שעות לפי יום מקומי</p>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-2 border-b border-[var(--border)] pb-1">
              {state.weekBars.map((b) => (
                <div key={b.ymd} className="flex min-w-[40px] flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full max-w-[48px] rounded-t-md bg-[var(--orange)]/90 transition-[height]"
                    style={{ height: `${Math.max(4, (b.hours / maxWeek) * 120)}px` }}
                    title={`${formatDateIL(b.ymd)}: ${formatHoursShort(b.hours)} ש׳`}
                  />
                  <span className="text-[10px] font-bold text-[var(--text-light)]">
                    {formatWeekdayShortIL(b.ymd)}
                  </span>
                  <span className="tabular-nums text-[11px] text-[var(--text-mid)]">{formatHoursShort(b.hours)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={`rounded-2xl ${hubSectionClass(6)} p-4 md:p-6`}>
            <h3 className="text-[14px] font-extrabold text-[var(--text-dark)]">פרויקטים (החודש)</h3>
            <ul className="mt-3 space-y-2 text-[13px]">
              {state.projectRows.length === 0 ? (
                <li className="text-[var(--text-mid)]">אין נתונים לחודש זה.</li>
              ) : (
                state.projectRows.map((p) => (
                  <li
                    key={p.name}
                    className="flex justify-between gap-2 rounded-lg border border-[var(--border)]/80 bg-[var(--dash-panel-bg)]/40 px-3 py-2"
                  >
                    <span className="text-[var(--text-dark)]">{p.name}</span>
                    <span className="shrink-0 tabular-nums text-[var(--text-mid)]">{formatHoursShort(p.hours)} ש׳</span>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className={`rounded-2xl ${hubSectionClass(7)} p-4 md:p-6`}>
            <h3 className="text-[14px] font-extrabold text-[var(--text-dark)]">היסטוריית ימים</h3>
            <div className="mt-4 space-y-3">
              {state.dayDetails.length === 0 ? (
                <p className="text-[13px] text-[var(--text-mid)]">אין ימים עם שעות בחודש הנוכחי.</p>
              ) : (
                state.dayDetails.map((d) => (
                  <div key={d.ymd} className="rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)]/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)]/60 pb-2">
                      <span className="font-bold text-[var(--text-dark)]">{formatDateIL(d.ymd)}</span>
                      <span className="tabular-nums text-[var(--text-mid)]">סה״כ {formatHoursShort(d.totalHours)} ש׳</span>
                    </div>
                    <ul className="mt-2 space-y-1.5 text-[12px]">
                      {d.entries.map((e) => (
                        <li key={e.id} className="flex flex-wrap gap-x-3 gap-y-1 text-[var(--text-mid)]">
                          <span className="font-mono text-[11px]" dir="ltr">
                            {formatDateTimeIL(e.start)} → {e.end ? formatDateTimeIL(e.end) : '…'}
                          </span>
                          <span className="text-[var(--text-dark)]">{e.projectName}</span>
                          <span className="tabular-nums">({formatHoursShort(e.hours)} ש׳)</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
