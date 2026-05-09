import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAuth } from '../contexts/AuthContext'
import { formatDateTimeIL, todayYmd, toDateInputYmd } from '../lib/dates'
import { boardStatusHe } from '../lib/boardTaskLabels'
import { formatRelativeHebrew } from '../lib/relativeTimeHe'
import { reminderBadgeHe } from '../lib/reminderBadgeHe'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import { NEW_TASK_DRAWER_ID } from '../lib/taskDrawerIds'
import { ClientQuickSelect } from './ClientQuickSelect'
import { useClients } from '../hooks/useClients'
import { useProjects } from '../hooks/useProjects'
import { SUPPLIER_NAME_MISSING } from '../lib/supplierDisplay'
import { useSuppliers } from '../hooks/useSuppliers'
import { useTasks } from '../hooks/useTasks'
import { useUsers } from '../hooks/useUsers'
import type { Priority, Task, TaskReminderEntry, TaskStatus } from '../types'

type TabKey = 'details' | 'history' | 'stream' | 'reminders'

const statusBadgeClass: Record<TaskStatus, string> = {
  todo: 'bg-[#64748B]/15 text-[#64748B]',
  doing: 'bg-[#2563EB]/15 text-[#2563EB]',
  blocked: 'bg-[#EF4444]/15 text-[#EF4444]',
  done: 'bg-[#10B981]/15 text-[#10B981]',
}

type TaskDraft = {
  title: string
  description: string
  status: TaskStatus
  priority: Priority
  assigneeId: string
  clientId: string
  projectId: string
  supplierId: string
  dueDate: string
  tags: string[]
  reminders: TaskReminderEntry[]
}

function initDraft(t: Task): TaskDraft {
  return {
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assigneeId: t.assigneeId,
    clientId: t.clientId ?? '',
    projectId: t.projectId ?? '',
    supplierId: t.supplierId ?? '',
    dueDate: t.dueDate,
    tags: [...t.tags],
    reminders: t.reminders.map((r) => ({ ...r })),
  }
}

function buildPatch(task: Task, d: TaskDraft): Partial<Task> {
  const patch: Partial<Task> = {}
  if (d.title.trim() !== task.title) patch.title = d.title.trim()
  if (d.description !== task.description) patch.description = d.description
  if (d.status !== task.status) patch.status = d.status
  if (d.priority !== task.priority) patch.priority = d.priority
  if (d.assigneeId !== task.assigneeId) patch.assigneeId = d.assigneeId
  const dc = d.clientId.trim() || undefined
  if ((dc ?? '') !== (task.clientId ?? '')) patch.clientId = dc
  const dp = d.projectId.trim() || undefined
  if ((dp ?? '') !== (task.projectId ?? '')) patch.projectId = dp
  const ds = d.supplierId.trim() || undefined
  if ((ds ?? '') !== (task.supplierId ?? '')) patch.supplierId = ds
  if (d.dueDate !== task.dueDate) patch.dueDate = d.dueDate
  if (JSON.stringify(d.tags) !== JSON.stringify(task.tags)) patch.tags = [...d.tags]
  if (JSON.stringify(d.reminders) !== JSON.stringify(task.reminders)) {
    patch.reminders = d.reminders.map((r) => ({ ...r }))
  }
  return patch
}

function localUnsavedTaskFromSeed(
  seed: { assigneeId: string; dueDate: string },
  createdBy: string,
): Task {
  return {
    id: NEW_TASK_DRAWER_ID,
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    assigneeId: seed.assigneeId,
    clientId: undefined,
    projectId: undefined,
    supplierId: undefined,
    dueDate: seed.dueDate,
    tags: [],
    reminders: [],
    createdAt: new Date().toISOString(),
    createdBy,
    sharedWithUserIds: [],
    teamWideShared: false,
    activity: [],
    manualNotes: [],
  }
}

function applyPatchToTask(task: Task, patch: Partial<Task>): Task {
  return {
    ...task,
    ...patch,
    tags: patch.tags ?? task.tags,
    reminders: patch.reminders ?? task.reminders,
    clientId:
      patch.clientId !== undefined
        ? patch.clientId || undefined
        : task.clientId,
    projectId:
      patch.projectId !== undefined
        ? patch.projectId || undefined
        : task.projectId,
    supplierId:
      patch.supplierId !== undefined
        ? patch.supplierId || undefined
        : task.supplierId,
  }
}

export function TaskDrawer() {
  const {
    tasks,
    drawerTaskId: taskId,
    newTaskDraftSeed,
    setDrawerTaskId,
    updateTask,
    addTask,
    addTaskNote,
  } = useTasks()
  const { user } = useAuth()
  const userId = user?.uid ?? ''

  const task = useMemo(() => {
    if (taskId === NEW_TASK_DRAWER_ID) {
      if (!newTaskDraftSeed || !userId) return null
      return localUnsavedTaskFromSeed(newTaskDraftSeed, userId)
    }
    return tasks.find((t) => t.id === taskId) ?? null
  }, [taskId, newTaskDraftSeed, tasks, userId])

  const isNewUnsaved = taskId === NEW_TASK_DRAWER_ID
  const { suppliers } = useSuppliers()
  const { clients } = useClients()
  const { projects } = useProjects()
  const { users: teamMembers } = useUsers()
  const taskOpts = useMemo(
    () => ({
      memberNameById: (id: string) =>
        teamMembers.find((m) => m.id === id)?.name ?? id,
      projectNameById: (id: string) =>
        projects.find((p) => p.id === id)?.name ?? id,
      supplierNameById: (id: string) => {
        const t = id.trim()
        if (!t) return id
        const s = suppliers.find((x) => x.id.trim() === t)
        return s?.name ?? SUPPLIER_NAME_MISSING
      },
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
  const [draft, setDraft] = useState<TaskDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const prevTaskIdRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (!taskId || !task) {
      setDraft(null)
      prevTaskIdRef.current = null
      return
    }
    if (prevTaskIdRef.current !== taskId) {
      prevTaskIdRef.current = taskId
      setDraft(initDraft(task))
    }
  }, [taskId, task])

  useEffect(() => {
    if (taskId) {
      setTab('details')
      setStreamDraft('')
    }
  }, [taskId])

  const projectsForTask = useMemo(() => {
    if (!draft) return projects
    const cid = draft.clientId?.trim()
    if (!cid) return projects
    return projects.filter((p) => p.clientId === cid)
  }, [projects, draft])

  const dirty = useMemo(() => {
    if (!task || !draft) return false
    return Object.keys(buildPatch(task, draft)).length > 0
  }, [task, draft])

  const canSaveNew =
    isNewUnsaved &&
    Boolean(draft?.title?.trim()) &&
    Boolean(draft?.assigneeId?.trim())

  const requestClose = () => {
    if (dirty) {
      if (!window.confirm('יש שינויים שלא נשמרו. לסגור בלי לשמור?')) return
    }
    setDrawerTaskId(null)
  }

  const saveTask = async () => {
    if (!userId || !task || !draft) return

    if (isNewUnsaved) {
      const title = draft.title.trim()
      if (!title) {
        toastFsError(
          'נא להזין כותרת למשימה',
          new Error('validation'),
          'saveTask',
        )
        return
      }
      if (!draft.assigneeId.trim()) {
        toastFsError(
          'נא לבחור אחראי למשימה',
          new Error('validation'),
          'saveTask',
        )
        return
      }
      setSaving(true)
      try {
        const id = await addTask(
          {
            title,
            description: draft.description,
            status: draft.status,
            priority: draft.priority,
            assigneeId: draft.assigneeId,
            clientId: draft.clientId.trim() || undefined,
            projectId: draft.projectId.trim() || undefined,
            supplierId: draft.supplierId.trim() || undefined,
            dueDate: draft.dueDate,
            reminderDate: undefined,
            tags: draft.tags,
            reminders: draft.reminders,
            sharedWithUserIds: [],
          },
          { quiet: true },
        )
        if (id) {
          toastFsSuccess('המשימה נשמרה')
          setDrawerTaskId(id)
        }
      } finally {
        setSaving(false)
      }
      return
    }

    const patch = buildPatch(task, draft)
    if (Object.keys(patch).length === 0) {
      toastFsSuccess('אין שינויים לשמירה')
      return
    }
    setSaving(true)
    try {
      await updateTask(task.id, patch, taskOpts)
      setDraft(initDraft(applyPatchToTask(task, patch)))
    } finally {
      setSaving(false)
    }
  }

  const setClientIdInDraft = (clientId: string) => {
    const cid = clientId.trim() ? clientId.trim() : ''
    setDraft((prev) => {
      if (!prev) return prev
      let projectId = prev.projectId
      if (prev.projectId) {
        const proj = projects.find((p) => p.id === prev.projectId)
        if (!proj || (cid && proj.clientId !== cid)) projectId = ''
      }
      return { ...prev, clientId: cid, projectId }
    })
  }

  if (!taskId || !task || !draft) return null

  const onTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const t = tagInput.trim()
    if (!t || draft.tags.includes(t)) return
    setDraft((d) => (d ? { ...d, tags: [...d.tags, t] } : d))
    setTagInput('')
  }

  const addReminderClick = () => {
    if (!remDate || !draft) return
    const iso = new Date(`${remDate}T${remTime}:00`).toISOString()
    const r = { id: crypto.randomUUID(), at: iso }
    setDraft((d) => (d ? { ...d, reminders: [...d.reminders, r] } : d))
  }

  const removeReminderLocal = (reminderId: string) => {
    setDraft((d) =>
      d ? { ...d, reminders: d.reminders.filter((x) => x.id !== reminderId) } : d,
    )
  }

  return (
    <>
      <button
        type="button"
        aria-label="סגור"
        className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[1px]"
        onClick={requestClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-[480px] flex-col border-r-2 border-[var(--orange)] bg-[var(--dash-panel-bg)] shadow-[-8px_0_32px_rgba(15,23,42,0.1)]"
        dir="rtl"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-[rgba(249,115,22,0.25)] px-5 py-4">
          <button
            type="button"
            onClick={requestClose}
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-orange-soft)] text-lg text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)]"
            aria-label="סגירה"
          >
            ×
          </button>
          <div className="min-w-0 flex-1">
            <input
              value={draft.title}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, title: e.target.value } : d))
              }
              placeholder={
                isNewUnsaved ? 'הזן כותרת — המשימה תישמר רק בלחיצה למטה' : undefined
              }
              className="w-full border-0 bg-transparent text-lg font-extrabold text-[var(--blue-dark)] outline-none ring-0 focus:ring-0"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${statusBadgeClass[draft.status]}`}
              >
                {boardStatusHe(draft.status)}
              </span>
              {isNewUnsaved ? (
                <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[10px] font-bold text-[#4338CA]">
                  טיוטה
                </span>
              ) : null}
              {dirty ? (
                <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold text-[#B45309]">
                  שינויים שלא נשמרו
                </span>
              ) : null}
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
                  value={draft.description}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, description: e.target.value } : d,
                    )
                  }
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
                    value={draft.status}
                    onChange={(e) =>
                      setDraft((d) =>
                        d
                          ? { ...d, status: e.target.value as TaskStatus }
                          : d,
                      )
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
                    value={draft.priority}
                    onChange={(e) =>
                      setDraft((d) =>
                        d
                          ? { ...d, priority: e.target.value as Priority }
                          : d,
                      )
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
                  value={draft.assigneeId}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, assigneeId: e.target.value } : d,
                    )
                  }
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
                  value={draft.clientId}
                  onChange={setClientIdInDraft}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                  ספק (אופציונלי)
                </label>
                <select
                  value={draft.supplierId}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, supplierId: e.target.value } : d,
                    )
                  }
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
                {draft.clientId?.trim() ? (
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
                    draft.projectId &&
                    projectsForTask.some((p) => p.id === draft.projectId)
                      ? draft.projectId
                      : ''
                  }
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, projectId: e.target.value } : d,
                    )
                  }
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2.5 text-sm"
                >
                  <option value="">—</option>
                  {projectsForTask.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {draft.clientId?.trim() && projectsForTask.length === 0 ? (
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
                  value={toDateInputYmd(draft.dueDate)}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, dueDate: e.target.value } : d))
                  }
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
                  {draft.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-2.5 py-1 text-xs font-semibold text-[var(--text-dark)]"
                    >
                      {tag}
                      <button
                        type="button"
                        className="text-[var(--text-light)] hover:text-[#EF4444]"
                        aria-label={`הסר ${tag}`}
                        onClick={() =>
                          setDraft((d) =>
                            d
                              ? { ...d, tags: d.tags.filter((g) => g !== tag) }
                              : d,
                          )
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-4">
                <button
                  type="button"
                  disabled={
                    saving ||
                    !userId ||
                    (isNewUnsaved ? !canSaveNew : !dirty)
                  }
                  onClick={() => void saveTask()}
                  className="w-full rounded-xl bg-[var(--blue-mid)] py-3 text-sm font-bold text-white shadow-sm hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {saving ? 'שומר…' : 'שמור משימה'}
                </button>
                {isNewUnsaved ? (
                  <p className="text-center text-[11px] text-[var(--text-light)]">
                    המשימה תיווצר במערכת רק אחרי לחיצה על «שמור משימה».
                  </p>
                ) : !dirty ? (
                  <p className="text-center text-[11px] text-[var(--text-light)]">
                    שינויים בפרטים נשמרים רק בלחיצה על «שמור משימה»
                  </p>
                ) : null}
              </div>

              <div className="w-full rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] p-3 text-[12px] text-[var(--text-mid)]">
                המשימה מוצגת רק לעובד המשויך. למעקב אחר משימות ששלחת לעובדים, השתמש בכפתור
                <strong className="mx-1 text-[var(--blue-dark)]">"משימות ששלחתי"</strong>
                בעמוד המשימות.
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
                  className="mb-2 w-full resize-y rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] p-3 text-sm text-[var(--text-dark)] placeholder:text-[var(--text-light)]"
                />
                <button
                  type="button"
                  disabled={!streamDraft.trim() || !userId || isNewUnsaved}
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
                    className="rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2.5 shadow-sm"
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
              <p className="text-[11px] text-[var(--text-mid)]">
                תזכורות יישמרו בשרת רק אחרי לחיצה על «שמור משימה» בלשונית פרטים.
              </p>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
                <p className="mb-2 text-xs font-bold text-[var(--text-mid)]">
                  הוסף תזכורת
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="date"
                    value={remDate}
                    onChange={(e) => setRemDate(e.target.value)}
                    className="min-w-[140px] flex-1 rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-2 py-2 text-sm"
                  />
                  <input
                    type="time"
                    value={remTime}
                    onChange={(e) => setRemTime(e.target.value)}
                    className="w-[120px] rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-2 py-2 text-sm"
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
                {draft.reminders.length === 0 ? (
                  <li className="text-sm text-[var(--text-mid)]">
                    אין תזכורות למשימה זו
                  </li>
                ) : null}
                {draft.reminders.map((r) => {
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
                      className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2.5"
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
