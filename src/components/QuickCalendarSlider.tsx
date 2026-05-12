import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDaysYmd, formatDateIL, formatTaskDueDisplay, todayYmd } from '../lib/dates'
import { useMeetings } from '../hooks/useMeetings'
import type { Meeting } from '../types'

function startYmd(m: Meeting): string {
  return (m.startDate || '').slice(0, 10)
}

export function QuickCalendarSlider() {
  const navigate = useNavigate()
  const {
    meetings,
    quickCalendarSliderOpen: open,
    setQuickCalendarSliderOpen: setOpen,
    setDrawerMeetingId,
    openNewMeetingDraft,
  } = useMeetings()

  const today = todayYmd()
  const weekEnd = addDaysYmd(today, 7)

  const { todayList, weekList } = useMemo(() => {
    const tL: Meeting[] = []
    const wL: Meeting[] = []
    for (const m of meetings) {
      const d = startYmd(m)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
      if (d === today) tL.push(m)
      else if (d > today && d <= weekEnd) wL.push(m)
    }
    tL.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
    wL.sort((a, b) => a.startDate.localeCompare(b.startDate))
    return { todayList: tL, weekList: wL }
  }, [meetings, today, weekEnd])

  return (
    <>
      {open ? (
        <>
          <button
            type="button"
            aria-label="סגור"
            className="fixed inset-0 z-[75] bg-black/20"
            onClick={() => setOpen(false)}
          />
          <aside
            className="fixed bottom-0 left-0 top-0 z-[80] flex w-full max-w-[320px] flex-col border-e-2 border-[#0EA5E9] bg-[var(--dash-panel-bg)] shadow-[4px_0_20px_rgba(15,23,42,0.07)]"
            dir="rtl"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-[rgba(14,165,233,0.45)] px-4 py-3">
              <h2 className="text-lg font-extrabold text-[var(--text-dark)]">
                יומן מהיר
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-lg text-[var(--text-mid)] hover:bg-[var(--bg-input)]"
                aria-label="סגירה"
              >
                ×
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
              <section>
                <h3 className="mb-2 text-sm font-extrabold text-[var(--text-dark)]">
                  היום ({formatDateIL(today)})
                </h3>
                {todayList.length === 0 ? (
                  <p className="text-xs text-[var(--text-light)]">אין פגישות מתוזמנות להיום</p>
                ) : (
                  <ul className="space-y-2">
                    {todayList.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setDrawerMeetingId(m.id)
                            setOpen(false)
                          }}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-start text-sm font-semibold text-[var(--text-dark)] transition hover:bg-[var(--surface-muted)]"
                        >
                          <span className="block text-[11px] font-normal text-[var(--text-mid)]">
                            {formatTaskDueDisplay(m.startDate, m.startTime)}
                          </span>
                          {m.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <h3 className="mb-2 text-sm font-extrabold text-[var(--text-dark)]">
                  בשבוע הקרוב
                </h3>
                {weekList.length === 0 ? (
                  <p className="text-xs text-[var(--text-light)]">אין פגישות בשבוע הזה</p>
                ) : (
                  <ul className="space-y-2">
                    {weekList.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setDrawerMeetingId(m.id)
                            setOpen(false)
                          }}
                          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-start text-sm font-semibold transition hover:bg-[var(--surface-muted)]"
                        >
                          <span className="block text-[11px] text-[var(--text-mid)]">
                            {formatDateIL(m.startDate)} ·{' '}
                            {formatTaskDueDisplay(m.startDate, m.startTime)}
                          </span>
                          {m.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <footer className="shrink-0 space-y-2 border-t border-[rgba(14,165,233,0.35)] p-4">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  navigate('/calendar')
                }}
                className="w-full rounded-xl border border-[#0EA5E9] bg-[#E0F2FE] py-2.5 text-sm font-bold text-[#0369A1] transition hover:bg-[#BAE6FD]"
              >
                פתיחת יומן מלא
              </button>
              <button
                type="button"
                onClick={() => {
                  openNewMeetingDraft({ startDate: today })
                  setOpen(false)
                }}
                className="w-full rounded-xl bg-[#0EA5E9] py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-110"
              >
                + פגישה חדשה להיום
              </button>
            </footer>
          </aside>
        </>
      ) : null}
    </>
  )
}
