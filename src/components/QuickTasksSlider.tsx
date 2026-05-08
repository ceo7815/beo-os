import { useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { todayYmd } from '../lib/dates'
import { priorityColor } from '../lib/priorityColor'
import { useTasks } from '../hooks/useTasks'
import type { Task } from '../types'

function addDaysYmd(base: string, days: number): string {
  const [y, m, d] = base.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function QuickTasksSlider() {
  const {
    tasks,
    quickSliderOpen: quickOpen,
    setQuickSliderOpen: setQuickOpen,
    setDrawerTaskId,
    addTask,
    toggleQuickDone,
  } = useTasks()

  const { user } = useAuth()
  const uid = user?.uid ?? ''

  const [quickTitle, setQuickTitle] = useState('')

  /** רק משימות שהמשתמש המחובר מוגדר כאחראי עליהן */
  const mine = useMemo(
    () => (uid ? tasks.filter((t) => t.assigneeId === uid) : []),
    [tasks, uid],
  )

  const today = todayYmd()
  const weekEnd = addDaysYmd(today, 7)

  const { urgent, week, rest } = useMemo(() => {
    const urgentL: Task[] = []
    const weekL: Task[] = []
    const restL: Task[] = []
    for (const t of mine) {
      const d = t.dueDate.slice(0, 10)
      if (d === today) urgentL.push(t)
      else if (d > today && d <= weekEnd) weekL.push(t)
      else restL.push(t)
    }
    return { urgent: urgentL, week: weekL, rest: restL }
  }, [mine, today, weekEnd])

  const submitQuick = () => {
    const title = quickTitle.trim()
    if (!title) return
    const assignee = uid || mine[0]?.assigneeId || ''
    void (async () => {
      const id = await addTask({
        title,
        description: '',
        status: 'todo',
        priority: 'medium',
        assigneeId: assignee,
        dueDate: today,
        tags: [],
        reminders: [],
        sharedWithUserIds: [],
        clientId: undefined,
        supplierId: undefined,
        projectId: undefined,
        reminderDate: undefined,
      })
      setQuickTitle('')
      if (id) setDrawerTaskId(id)
    })()
  }

  return (
    <>
      {quickOpen ? (
        <>
          <button
            type="button"
            aria-label="סגור"
            className="fixed inset-0 z-[75] bg-black/20"
            onClick={() => setQuickOpen(false)}
          />
          <aside
            className="fixed bottom-0 left-0 top-0 z-[80] flex w-full max-w-[320px] flex-col border-e border-[var(--border)] bg-white shadow-[4px_0_24px_rgba(26,43,94,0.12)]"
            dir="rtl"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <h2 className="text-lg font-extrabold text-[var(--blue-dark)]">
                המשימות שלי
              </h2>
              <button
                type="button"
                onClick={() => setQuickOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-lg text-[var(--text-mid)] hover:bg-[var(--bg-input)]"
                aria-label="סגירה"
              >
                ×
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
              <Section
                emoji="🔴"
                title="דחוף היום"
                tasks={urgent}
                onPick={(id) => {
                  setDrawerTaskId(id)
                  setQuickOpen(false)
                }}
                onToggleDone={(id, checked) => {
                  void toggleQuickDone(id, checked)
                }}
              />
              <Section
                emoji="🟡"
                title="השבוע"
                tasks={week}
                onPick={(id) => {
                  setDrawerTaskId(id)
                  setQuickOpen(false)
                }}
                onToggleDone={(id, checked) => {
                  void toggleQuickDone(id, checked)
                }}
              />
              <Section
                emoji="⚪"
                title="שאר"
                tasks={rest}
                onPick={(id) => {
                  setDrawerTaskId(id)
                  setQuickOpen(false)
                }}
                onToggleDone={(id, checked) => {
                  void toggleQuickDone(id, checked)
                }}
              />
            </div>

            <footer className="shrink-0 border-t border-[var(--border)] p-4">
              <p className="mb-2 text-[11px] font-bold text-[var(--text-mid)]">
                + משימה מהירה
              </p>
              <input
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    submitQuick()
                  }
                }}
                placeholder="כותרת והקש Enter…"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2.5 text-sm"
              />
            </footer>
          </aside>
        </>
      ) : null}
    </>
  )
}

function Section(props: {
  emoji: string
  title: string
  tasks: Task[]
  onPick: (id: string) => void
  onToggleDone: (id: string, checked: boolean) => void
}) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[var(--blue-dark)]">
        <span>{props.emoji}</span>
        {props.title}
      </h3>
      {props.tasks.length === 0 ? (
        <p className="text-xs text-[var(--text-light)]">אין משימות</p>
      ) : (
        <ul className="space-y-2">
          {props.tasks.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-2 py-2"
            >
              <input
                type="checkbox"
                checked={t.status === 'done'}
                onChange={(e) => props.onToggleDone(t.id, e.target.checked)}
                className="h-4 w-4 shrink-0 accent-[var(--orange)]"
                aria-label={`בוצע: ${t.title}`}
              />
              <button
                type="button"
                onClick={() => props.onPick(t.id)}
                className="min-w-0 flex-1 text-start text-sm font-semibold text-[var(--text-dark)] hover:text-[var(--blue-mid)]"
              >
                <span
                  className="me-2 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ backgroundColor: priorityColor(t.priority) }}
                />
                {t.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
