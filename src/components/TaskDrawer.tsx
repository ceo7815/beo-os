import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { formatDateTimeIL, todayYmd } from '../lib/dates'
import { boardStatusHe } from '../lib/boardTaskLabels'
import { formatRelativeHebrew } from '../lib/relativeTimeHe'
import { reminderBadgeHe } from '../lib/reminderBadgeHe'
import { ClientQuickSelect } from './ClientQuickSelect'
import { useClients } from '../hooks/useClients'
import { useProjects } from '../hooks/useProjects'
import { useSuppliers } from '../hooks/useSuppliers'
import { useTasks } from '../hooks/useTasks'
import { useUsers } from '../hooks/useUsers'
import type { Priority, Task, TaskStatus } from '../types'

type TabKey = 'details' | 'history' | 'stream' | 'reminders'

const statusBadgeClass: Record<TaskStatus, string> = {
  todo: 'bg-[#64748B]/15 text-[#64748B]',
  doing: 'bg-[#2563EB]/15 text-[#2563EB]',
  blocked: 'bg-[#EF4444]/15 text-[#EF4444]',
  done: 'bg-[#10B981]/15 text-[#10B981]',
}

export function TaskDrawer() {
  const {
    tasks,
    drawerTaskId: taskId,
    setDrawerTaskId,
    updateTask,
    addTaskNote,
  } = useTasks()
  const task = tasks.find((t) => t.id === taskId) ?? null
  const { suppliers } = useSuppliers()
  const { clients } = useClients()
  const { projects } = useProjects()
  const { users: teamMembers } = useUsers()

  const { user } = useAuth()
  const userId = user?.uid ?? ''
  const taskOpts = useMemo(
    () => ({
      memberNameById: (id: string) =>
        teamMembers.find((m) => m.id === id)?.name ?? id,
      projectNameById: (id: string) =>
        projects.find((p) => p.id === id)?.name ?? id,
      supplierNameById: (id: string) =>
        suppliers.find((s) => s.id === id)?.name ?? id,
      clientNameById: (id: string) =>
        clients.find((c) => c.id === id)?.name ?? id,
    }),
    [teamMembers, projects, suppliers, clients],
  )

  const [tab, setTab] = useState<TabKey>('details')
  const [tagInput, setTagInput] = useState('')
  const [streamDraft, setStreamDraft] = useState('')
  const [remDate, setRemDate] = useState(todayYmd())
  const [remTime, setRemTime] = useState('09:00')

  useEffect(() => {
    if (taskId) {
      setTab('details')
      setStreamDraft('')
    }
  }, [taskId])

  const projectsForTask = useMemo(() => {
    if (!task) return projects
    const cid = task.clientId?.trim()
    if (!cid) return projects
    return projects.filter((p) => p.clientId === cid)
  }, [projects, task])

  const close = () => setDrawerTaskId(null)

  if (!taskId || !task) return null

  const commitFields = (patch: Partial<Task>) => {
    if (!userId) return
    void updateTask(task.id, patch, taskOpts)
  }

  const onTitleBlur = (title: string) => {
    if (title.trim() === task.title) return
    commitFields({ title: title.trim() })
  }

  const onDescBlur = (description: string) => {
    if (description === task.description) return
    commitFields({ description })
  }

  const onStatusSelect = (status: TaskStatus) => {
    if (!userId || status === task.status) return
    void updateTask(task.id, { status }, taskOpts)
  }

  const onPriorityChange = (priority: Priority) => {
    if (priority === task.priority) return
    commitFields({ priority })
  }

  const onAssigneeChange = (assigneeId: string) => {
    if (assigneeId === task.assigneeId) return
    commitFields({ assigneeId })
  }

  const onSupplierChange = (supplierId: string) => {
    commitFields({ supplierId: supplierId || undefined })
  }

  const onProjectChange = (projectId: string) => {
    commitFields({ projectId: projectId || undefined })
  }

  const onClientChange = (clientId: string) => {
    const cid = clientId.trim() ? clientId.trim() : undefined
    const patch: Partial<Task> = { clientId: cid }
    if (task.projectId) {
      const proj = projects.find((p) => p.id === task.projectId)
      if (!proj || (cid && proj.clientId !== cid)) {
        patch.projectId = undefined
      }
    }
    commitFields(patch)
  }

  const onDueChange = (dueDate: string) => {
    if (dueDate === task.dueDate) return
    commitFields({ dueDate })
  }

  const onTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const t = tagInput.trim()
    if (!t || !userId || task.tags.includes(t)) return
    commitFields({ tags: [...task.tags, t] })
    setTagInput('')
  }

  const addReminderClick = () => {
    if (!remDate || !userId) return
    const iso = new Date(`${remDate}T${remTime}:00`).toISOString()
    const r = { id: crypto.randomUUID(), at: iso }
    void updateTask(
      task.id,
      { reminders: [...task.reminders, r] },
      taskOpts,
    )
  }

  const removeReminderLocal = (reminderId: string) => {
    if (!userId) return
    void updateTask(
      task.id,
      { reminders: task.reminders.filter((x) => x.id !== reminderId) },
      taskOpts,
    )
  }

  return (
    <>
      <button
        type="button"
        aria-label="סגור"
        className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[1px]"
        onClick={close}
      />
      <aside
        className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-[480px] flex-col border-r border-[var(--border)] bg-white shadow-[-8px_0_32px_rgba(26,43,94,0.12)]"
        dir="rtl"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-[var(--border)] px-5 py-4">
          <button
            type="button"
            onClick={close}
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-lg text-[var(--text-mid)] transition hover:bg-[var(--bg-input)]"
            aria-label="סגירה"
          >
            ×
          </button>
          <div className="min-w-0 flex-1">
            <input
              key={task.id}
              defaultValue={task.title}
              onBlur={(e) => onTitleBlur(e.target.value)}
              className="w-full border-0 bg-transparent text-lg font-extrabold text-[var(--blue-dark)] outline-none ring-0 focus:ring-0"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${statusBadgeClass[task.status]}`}
              >
                {boardStatusHe(task.status)}
              </span>
            </div>
          </div>
        </header>

        <div className="flex shrink-0 gap-0 border-b border-[var(--border)] px-4">
          {(
            [
              ['details', 'פרטים'],
              ['history', 'היסטוריה'],
              ['stream', 'שוטף'],
              ['reminders', 'תזכורות'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`relative flex-1 py-3 text-sm font-semibold transition ${
                tab === k
                  ? 'text-[var(--orange)]'
                  : 'text-[var(--text-mid)] hover:text-[var(--text-dark)]'
              }`}
            >
              {label}
              {tab === k ? (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-[var(--orange)]" />
              ) : null}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === 'details' ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                  תיאור
                </label>
                <textarea
                  key={`d-${task.id}`}
                  defaultValue={task.description}
                  onBlur={(e) => onDescBlur(e.target.value)}
                  rows={5}
                  className="min-h-[120px] w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-3 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                    סטטוס
                  </label>
                  <select
                    value={task.status}
                    onChange={(e) =>
                      onStatusSelect(e.target.value as TaskStatus)
                    }
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2.5 text-sm"
                  >
                    <option value="todo">לביצוע</option>
                    <option value="doing">בעבודה</option>
                    <option value="blocked">חסום</option>
                    <option value="done">הושלם</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                    עדיפות
                  </label>
                  <select
                    value={task.priority}
                    onChange={(e) =>
                      onPriorityChange(e.target.value as Priority)
                    }
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2.5 text-sm"
                  >
                    <option value="high">גבוהה</option>
                    <option value="medium">בינונית</option>
                    <option value="low">נמוכה</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                  משויך ל
                </label>
                <select
                  value={task.assigneeId}
                  onChange={(e) => onAssigneeChange(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2.5 text-sm"
                >
                  <option value="">—</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="task-drawer-client"
                  className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]"
                >
                  לקוח (אופציונלי)
                </label>
                <ClientQuickSelect
                  id="task-drawer-client"
                  clients={clients}
                  value={task.clientId ?? ''}
                  onChange={onClientChange}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                  ספק (אופציונלי)
                </label>
                <select
                  value={task.supplierId ?? ''}
                  onChange={(e) => onSupplierChange(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2.5 text-sm"
                >
                  <option value="">—</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                  פרויקט (אופציונלי)
                </label>
                {task.clientId?.trim() ? (
                  <p className="mb-1 text-[10px] text-[var(--text-mid)]">
                    מוצגים רק פרויקטים של הלקוח שנבחר
                  </p>
                ) : (
                  <p className="mb-1 text-[10px] text-[var(--text-mid)]">
                    לבחירת לקוח — רשימת פרויקטים תוצג לפי הלקוח
                  </p>
                )}
                <select
                  value={
                    task.projectId &&
                    projectsForTask.some((p) => p.id === task.projectId)
                      ? task.projectId
                      : ''
                  }
                  onChange={(e) => onProjectChange(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2.5 text-sm"
                >
                  <option value="">—</option>
                  {projectsForTask.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {task.clientId?.trim() && projectsForTask.length === 0 ? (
                  <p className="mt-1 text-[10px] text-[var(--text-light)]">
                    אין פרויקטים ללקוח זה — צרו פרויקט מעמוד הפרויקטים
                  </p>
                ) : null}
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                  תאריך יעד
                </label>
                <input
                  type="date"
                  value={task.dueDate.slice(0, 10)}
                  onChange={(e) => onDueChange(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                  תגיות — Enter להוספה
                </label>
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={onTagKeyDown}
                  placeholder="הקלד תגית…"
                  className="mb-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2.5 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  {task.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--text-dark)]"
                    >
                      {tag}
                      <button
                        type="button"
                        className="text-[var(--text-light)] hover:text-[#EF4444]"
                        aria-label={`הסר ${tag}`}
                        onClick={() => {
                          if (!userId) return
                          void updateTask(
                            task.id,
                            { tags: task.tags.filter((g) => g !== tag) },
                            taskOpts,
                          )
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="w-full min-w-0 overflow-x-hidden rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] p-4">
                <p className="mb-1 text-[12px] font-bold text-[var(--blue-dark)]">
                  שיתוף לביצוע
                </p>
                <p className="mb-3 text-[11px] leading-relaxed text-[var(--text-mid)]">
                  כל מי שמסומן כאן רואה את המשימה בעמודה{' '}
                  <strong className="text-[var(--text-dark)]">משותפות לביצוע</strong>.
                  גם <strong>היוצר</strong> רואה אותה שם כשיש לפחות עובד משותף אחד.
                  בלי שיתוף — המשימה מסודרת לפי תאריך יעד (אחראי ויוצר).
                </p>
                {task.teamWideShared ? (
                  <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                    מצב ישן: גלוי לכל הצוות. סימון עובדים כאן מחליף לשיתוף נקודתי.
                  </p>
                ) : null}
                {(() => {
                  const roster = [...teamMembers]
                    .filter((m) => m.active !== false)
                    .sort((a, b) => a.name.localeCompare(b.name, 'he'))
                  const nSel = task.sharedWithUserIds.length
                  return roster.length === 0 ? (
                    <p className="text-[11px] text-[var(--text-mid)]">
                      אין עובדים ברשימה.
                    </p>
                  ) : (
                    <>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-mid)]">
                        <span className="font-semibold text-[var(--text-dark)]">
                          עובדים ({roster.length})
                        </span>
                        <span>
                          נבחרו: <strong>{nSel}</strong>
                        </span>
                      </div>
                      <ul
                        className="max-h-56 overflow-y-auto overflow-x-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm"
                        style={{ scrollbarGutter: 'stable' }}
                      >
                        {roster.map((m) => {
                          const selected = task.sharedWithUserIds.includes(m.id)
                          const toggle = () => {
                            if (!userId) return
                            const next = selected
                              ? task.sharedWithUserIds.filter((id) => id !== m.id)
                              : [...task.sharedWithUserIds, m.id]
                            void updateTask(
                              task.id,
                              { sharedWithUserIds: next },
                              taskOpts,
                            )
                          }
                          return (
                            <li
                              key={m.id}
                              className="border-b border-[var(--border)] last:border-b-0"
                            >
                              <label className="grid w-full min-w-0 cursor-pointer grid-cols-[1.125rem_minmax(0,1fr)] items-start gap-3 px-3 py-2.5 transition hover:bg-[#F8FAFC]">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={toggle}
                                  className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded border-[var(--border)] accent-[var(--orange)]"
                                  aria-label={`שיתוף עם ${m.name}`}
                                />
                                <span className="min-w-0 break-words text-[13px] font-medium leading-snug text-[var(--text-dark)]">
                                  {m.name}
                                </span>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  )
                })()}
                {task.teamWideShared || task.sharedWithUserIds.length > 0 ? (
                  <button
                    type="button"
                    disabled={!userId}
                    onClick={() => {
                      if (!userId) return
                      void updateTask(
                        task.id,
                        { sharedWithUserIds: [] },
                        taskOpts,
                      )
                    }}
                    className="mt-3 w-full rounded-lg border border-[var(--border)] bg-white py-2 text-center text-[12px] font-semibold text-[var(--text-mid)] transition hover:bg-[#F8FAFC] disabled:opacity-40"
                  >
                    נקה שיתוף
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {tab === 'history' ? (
            <ul className="relative me-3 space-y-0 border-e-2 border-[var(--border)] pe-6">
              {(() => {
                const sorted = [...task.activity].sort(
                  (a, b) =>
                    new Date(a.timestamp).getTime() -
                    new Date(b.timestamp).getTime(),
                )
                const lastIdx = sorted.length - 1
                return sorted.map((a, i) => (
                  <li key={a.id} className="relative pb-8 pe-2 last:pb-0">
                    <span
                      className="absolute -end-[9px] top-1.5 h-3 w-3 rounded-full border-2 border-white ring-2 ring-[var(--border)]"
                      style={{
                        backgroundColor:
                          i === lastIdx ? 'var(--orange)' : 'var(--blue-mid)',
                      }}
                    />
                    <p className="text-[11px] font-bold text-[var(--text-mid)]">
                      {a.userName} · {formatDateTimeIL(a.timestamp)}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--text-dark)]">
                      {a.action}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--text-light)]">
                      {formatRelativeHebrew(a.timestamp)}
                    </p>
                  </li>
                ))
              })()}
            </ul>
          ) : null}

          {tab === 'stream' ? (
            <div className="space-y-4">
              <p className="text-[12px] text-[var(--text-mid)]">
                עדכונים ידניים — כל הודעה נשמרת עם שם המשתמש ותאריך ושעה מדויקים.
              </p>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-3">
                <textarea
                  value={streamDraft}
                  onChange={(e) => setStreamDraft(e.target.value)}
                  rows={4}
                  placeholder="כתבו הערה או עדכון לצוות…"
                  className="mb-2 w-full resize-y rounded-lg border border-[var(--border)] bg-white p-3 text-sm text-[var(--text-dark)] placeholder:text-[var(--text-light)]"
                />
                <button
                  type="button"
                  disabled={!streamDraft.trim() || !userId}
                  onClick={() => {
                    const t = streamDraft.trim()
                    if (!t || !userId) return
                    void (async () => {
                      await addTaskNote(task.id, t)
                      setStreamDraft('')
                    })()
                  }}
                  className="rounded-lg bg-[var(--orange)] px-4 py-2 text-sm font-bold text-white shadow-sm hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  פרסם עדכון
                </button>
              </div>
              <ul className="space-y-3">
                {task.manualNotes.length === 0 ? (
                  <li className="text-sm text-[var(--text-mid)]">
                    עדיין אין עדכונים ידניים למשימה זו.
                  </li>
                ) : null}
                {task.manualNotes.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 shadow-sm"
                  >
                    <p className="text-[11px] font-bold text-[var(--text-mid)]">
                      {n.userName} · {formatDateTimeIL(n.createdAt)}
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-[var(--text-dark)]">
                      {n.text}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {tab === 'reminders' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
                <p className="mb-2 text-xs font-bold text-[var(--text-mid)]">
                  הוסף תזכורת
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="date"
                    value={remDate}
                    onChange={(e) => setRemDate(e.target.value)}
                    className="min-w-[140px] flex-1 rounded-lg border border-[var(--border)] bg-white px-2 py-2 text-sm"
                  />
                  <input
                    type="time"
                    value={remTime}
                    onChange={(e) => setRemTime(e.target.value)}
                    className="w-[120px] rounded-lg border border-[var(--border)] bg-white px-2 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={addReminderClick}
                    className="rounded-lg bg-[var(--orange)] px-4 py-2 text-sm font-bold text-white shadow-sm hover:brightness-105"
                  >
                    + הוסף תזכורת
                  </button>
                </div>
              </div>
              <ul className="space-y-2">
                {task.reminders.length === 0 ? (
                  <li className="text-sm text-[var(--text-mid)]">
                    אין תזכורות למשימה זו
                  </li>
                ) : null}
                {task.reminders.map((r) => {
                  const badge = reminderBadgeHe(r.at)
                  const badgeCls =
                    badge === 'פג תוקף'
                      ? 'bg-[#EF4444]/15 text-[#EF4444]'
                      : badge === 'היום!'
                        ? 'bg-[var(--orange-light)] text-[var(--orange)]'
                        : 'bg-[var(--blue-light)] text-[var(--blue-mid)]'
                  return (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--text-dark)]">
                          {new Date(r.at).toLocaleString('he-IL', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </div>
                        <span
                          className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeCls}`}
                        >
                          {badge}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label="מחק תזכורת"
                        className="shrink-0 text-lg text-[var(--text-light)] hover:text-[#EF4444]"
                        onClick={() => removeReminderLocal(r.id)}
                      >
                        ×
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  )
}
