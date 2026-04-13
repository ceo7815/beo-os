import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { taskVisibleToUser } from '../lib/taskVisibility'
import { boardStatusHe, priorityHe } from '../lib/boardTaskLabels'
import { addDaysYmd, formatDateIL, formatDateTimeIL, todayYmd } from '../lib/dates'
import { Modal } from '../components/shared/Modal'
import { useClients } from '../hooks/useClients'
import { useProjects } from '../hooks/useProjects'
import { useSuppliers } from '../hooks/useSuppliers'
import { useTasks } from '../hooks/useTasks'
import { useUsers } from '../hooks/useUsers'
import type { Project, Task, TaskStatus } from '../types'

const statusBadgeClass: Record<TaskStatus, string> = {
  todo: 'bg-[#64748B]/15 text-[#64748B]',
  doing: 'bg-[#2563EB]/15 text-[#2563EB]',
  blocked: 'bg-[#EF4444]/15 text-[#EF4444]',
  done: 'bg-[#10B981]/15 text-[#10B981]',
}

type TimeBucket =
  | 'sharedForMe'
  | 'overdue'
  | 'today'
  | 'tomorrow'
  | 'later'
  | 'done'

const TIME_COLUMNS: {
  key: TimeBucket
  label: string
  badgeColor: string
}[] = [
  {
    key: 'sharedForMe',
    label: 'משותפות לביצוע',
    badgeColor: '#7C3AED',
  },
  { key: 'overdue', label: 'באיחור', badgeColor: '#EF4444' },
  { key: 'today', label: 'היום', badgeColor: '#F97316' },
  { key: 'tomorrow', label: 'מחר', badgeColor: '#2563EB' },
  { key: 'later', label: 'אחר כך', badgeColor: '#64748B' },
  { key: 'done', label: 'הושלמו', badgeColor: '#10B981' },
]

/**
 * עמודת «משותפות לביצוע»: מופיע כאן אם
 * - שיתוף לכל הצוות (ישן), או
 * - המשתמש ברשימת השיתוף, או
 * - המשתמש יצר את המשימה והגדיר שיתוף עם מישהו (גם כשהוא האחראי)
 * משימה לא מוכפלת בעמודות תאריך.
 */
function inSharedForMeColumn(t: Task, uid: string): boolean {
  if (!uid || t.status === 'done') return false
  if (t.teamWideShared) return true
  if (t.sharedWithUserIds.includes(uid)) return true
  if (t.createdBy === uid && t.sharedWithUserIds.length > 0) return true
  return false
}

function dueYmd(t: Task): string | null {
  const d = (t.dueDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  return d
}

function bucketFor(t: Task, today: string, tomorrow: string): TimeBucket {
  if (t.status === 'done') return 'done'
  const d = dueYmd(t)
  if (!d) return 'later'
  if (d < today) return 'overdue'
  if (d === today) return 'today'
  if (d === tomorrow) return 'tomorrow'
  return 'later'
}

function sortInBucket(a: Task, b: Task): number {
  const pa = a.priority === 'high' ? 0 : a.priority === 'medium' ? 1 : 2
  const pb = b.priority === 'high' ? 0 : b.priority === 'medium' ? 1 : 2
  if (pa !== pb) return pa - pb
  const da = dueYmd(a) ?? '9999-99-99'
  const db = dueYmd(b) ?? '9999-99-99'
  if (da !== db) return da.localeCompare(db)
  return a.title.localeCompare(b.title, 'he')
}

function sharedTaskBadge(
  task: Task,
  memberById: Map<string, string>,
): string | null {
  if (task.teamWideShared) return 'שיתוף: כל הצוות'
  if (task.sharedWithUserIds.length === 0) return null
  const names = task.sharedWithUserIds
    .map((id) => memberById.get(id) ?? id)
    .slice(0, 4)
  const more =
    task.sharedWithUserIds.length > 4
      ? ` +${task.sharedWithUserIds.length - 4}`
      : ''
  return `שותפים: ${names.join(', ')}${more}`
}

function TaskCard({
  task,
  clientName,
  supplierName,
  projectName,
  assigneeLabel,
  sharedBadge,
  onOpenDrawer,
  onMarkComplete,
  onReopen,
  onDelete,
  onDueDateChange,
  onPublishNote,
  canPublishNote,
}: {
  task: Task
  clientName: string | null
  supplierName: string | null
  projectName: string | null
  assigneeLabel: string | null
  sharedBadge: string | null
  onOpenDrawer: () => void
  onMarkComplete: () => void
  onReopen: () => void
  onDelete: () => void
  onDueDateChange: (ymd: string) => void
  onPublishNote: (text: string) => Promise<void>
  canPublishNote: boolean
}) {
  const priorityColor =
    task.priority === 'high'
      ? '#EF4444'
      : task.priority === 'medium'
        ? '#F97316'
        : '#94A3B8'

  const due = dueYmd(task)
  const isDone = task.status === 'done'
  const [previewOpen, setPreviewOpen] = useState(false)
  const [streamFormOpen, setStreamFormOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [noteSending, setNoteSending] = useState(false)

  const desc = (task.description || '').trim()
  const streamNewestFirst = useMemo(
    () => [...task.manualNotes].reverse(),
    [task.manualNotes],
  )

  const submitNote = async (e?: FormEvent) => {
    e?.preventDefault()
    const t = noteDraft.trim()
    if (!t || !canPublishNote || noteSending) return
    setNoteSending(true)
    try {
      await onPublishNote(t)
      setNoteDraft('')
      setStreamFormOpen(false)
    } finally {
      setNoteSending(false)
    }
  }

  return (
    <>
      <Modal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={task.title}
        size="lg"
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setPreviewOpen(false)
              onOpenDrawer()
            }}
            className="hub-btn-primary text-sm"
          >
            עריכה מלאה
          </button>
          <button
            type="button"
            onClick={() => setPreviewOpen(false)}
            className="hub-btn-secondary text-sm"
          >
            סגור
          </button>
        </div>
        <div className="space-y-3 text-start text-[13px]">
          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${statusBadgeClass[task.status]}`}
            >
              {boardStatusHe(task.status)}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--text-mid)]">
              עדיפות: {priorityHe(task.priority)}
            </span>
          </div>
          {clientName ? (
            <p>
              <span className="text-[var(--text-mid)]">לקוח: </span>
              <span className="font-semibold text-[var(--blue-dark)]">{clientName}</span>
            </p>
          ) : null}
          {projectName ? (
            <p>
              <span className="text-[var(--text-mid)]">פרויקט: </span>
              <span className="font-semibold">{projectName}</span>
            </p>
          ) : null}
          {supplierName ? (
            <p>
              <span className="text-[var(--text-mid)]">ספק: </span>
              <span className="font-semibold">{supplierName}</span>
            </p>
          ) : null}
          {sharedBadge ? (
            <p className="text-[12px] text-[var(--blue-mid)]">{sharedBadge}</p>
          ) : null}
          <p>
            <span className="text-[var(--text-mid)]">תאריך יעד: </span>
            <span className="font-medium">{formatDateIL(task.dueDate)}</span>
          </p>
          {assigneeLabel ? (
            <p>
              <span className="text-[var(--text-mid)]">אחראי: </span>
              <span className="font-medium">{assigneeLabel}</span>
            </p>
          ) : null}
          <div className="border-t border-[var(--border)] pt-3">
            <p className="mb-1 text-[11px] font-bold text-[var(--text-mid)]">תיאור</p>
            {desc ? (
              <p className="whitespace-pre-wrap break-words leading-relaxed text-[var(--text-dark)]">
                {task.description}
              </p>
            ) : (
              <p className="text-[var(--text-light)]">אין תיאור</p>
            )}
          </div>
          <div className="border-t border-[var(--border)] pt-3">
            <p className="mb-2 text-[11px] font-bold text-[var(--text-mid)]">
              עדכון שוטף
            </p>
            {streamNewestFirst.length > 0 ? (
              <ul className="max-h-48 space-y-3 overflow-y-auto">
                {streamNewestFirst.map((n) => (
                  <li key={n.id} className="border-b border-[var(--border)] pb-2 last:border-0">
                    <p className="text-[10px] font-bold text-[var(--text-mid)]">
                      {n.userName} · {formatDateTimeIL(n.createdAt)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-[12px] leading-snug">
                      {n.text}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-[var(--text-light)]">אין עדיין עדכונים</p>
            )}
          </div>
        </div>
      </Modal>

      <div
        className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] p-3 text-start shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition hover:brightness-[1.02]"
        style={{ borderRight: `3px solid ${priorityColor}` }}
        role="button"
        tabIndex={0}
        onClick={() => setPreviewOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setPreviewOpen(true)
          }
        }}
        aria-label={`פתח תצוגה מלאה: ${task.title}`}
      >
        <div className="w-full min-w-0 space-y-1.5 text-start">
          <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
            <span className="min-w-0 text-[14px] font-bold leading-snug text-[var(--text-dark)]">
              {task.title}
            </span>
            {clientName ? (
              <span className="max-w-full shrink-0 text-[16px] font-extrabold leading-tight tracking-tight text-[var(--blue-dark)] sm:text-[17px]">
                {clientName}
              </span>
            ) : null}
            {sharedBadge ? (
              <span
                title={sharedBadge}
                className="max-w-[min(100%,14rem)] truncate rounded-full bg-[var(--blue-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--blue-mid)]"
              >
                {sharedBadge}
              </span>
            ) : null}
          </div>
          {projectName ? (
            <p className="text-start text-[12px] font-semibold leading-snug text-[var(--text-dark)]">
              <span className="text-[var(--text-mid)]">פרויקט · </span>
              {projectName}
            </p>
          ) : null}
          {!clientName && supplierName ? (
            <p className="text-start text-[12px] font-semibold text-[var(--text-mid)]">
              ספק · {supplierName}
            </p>
          ) : null}
        </div>
        <span
          className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass[task.status]}`}
        >
          {boardStatusHe(task.status)}
        </span>
        {desc ? (
          <div className="mt-2">
            <p className="text-[10px] font-bold text-[var(--text-mid)]">תיאור</p>
            <p className="mt-0.5 line-clamp-4 text-[12px] leading-snug text-[var(--text-dark)]">
              {task.description}
            </p>
            <p className="mt-1 text-[10px] text-[var(--text-mid)]">לחיצה לתצוגה מלאה…</p>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-[var(--text-light)]">אין תיאור</p>
        )}
      <div
        className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-2.5 py-2"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold text-[var(--text-mid)]">
            עדכון שוטף
          </span>
          <button
            type="button"
            disabled={!canPublishNote}
            onClick={(e) => {
              e.stopPropagation()
              setStreamFormOpen((o) => !o)
            }}
            className="rounded-md bg-[var(--orange)] px-2 py-1 text-[10px] font-bold text-white hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {streamFormOpen ? 'סגור טופס' : 'מה קרה?'}
          </button>
        </div>
        {streamFormOpen ? (
          <form
            className="mb-2 space-y-1.5 border-b border-[var(--border)] pb-2"
            onSubmit={submitNote}
            onClick={(e) => e.stopPropagation()}
          >
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={3}
              placeholder="מה קרה במשימה? בעיה, התקדמות, בקשה מהלקוח…"
              className="w-full resize-y rounded-md border border-[var(--border)] bg-white p-2 text-[12px] text-[var(--text-dark)] placeholder:text-[var(--text-light)]"
            />
            <button
              type="submit"
              disabled={!noteDraft.trim() || !canPublishNote || noteSending}
              className="rounded-md bg-[var(--blue-mid)] px-3 py-1 text-[11px] font-bold text-white hover:brightness-105 disabled:opacity-40"
            >
              {noteSending ? 'שולח…' : 'פרסם עדכון'}
            </button>
          </form>
        ) : null}
        {streamNewestFirst.length > 0 ? (
          <ul className="max-h-40 space-y-2 overflow-y-auto pe-0.5">
            {streamNewestFirst.map((n) => (
              <li key={n.id} className="border-b border-[var(--border)] pb-2 last:border-0 last:pb-0">
                <p className="text-[10px] font-bold text-[var(--text-mid)]">
                  {n.userName} · {formatDateTimeIL(n.createdAt)}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-snug text-[var(--text-dark)]">
                  {n.text}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-[var(--text-light)]">
            אין עדיין עדכונים — לחצו על הכפתור למעלה לרישום
          </p>
        )}
      </div>
      <div
        className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-2"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[10px] font-semibold text-[var(--text-mid)]">
          תאריך יעד
          <input
            type="date"
            value={due ?? ''}
            onChange={(e) => {
              const v = e.target.value
              if (v) onDueDateChange(v)
            }}
            className="max-w-full rounded-md border border-[var(--border)] bg-white px-1.5 py-1 text-[12px] text-[var(--text-dark)]"
            onClick={(e) => e.stopPropagation()}
          />
        </label>
        {assigneeLabel ? (
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center self-end rounded-full bg-slate-200 text-[10px] font-bold text-slate-700"
            title={assigneeLabel}
          >
            {assigneeLabel.slice(0, 1)}
          </span>
        ) : null}
      </div>
      <div
        className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-2"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {isDone ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onReopen()
            }}
            className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-[11px] font-semibold text-[var(--text-dark)] hover:bg-slate-50"
          >
            פתח מחדש
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onMarkComplete()
            }}
            className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
          >
            הושלם
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100"
        >
          מחק
        </button>
      </div>
    </div>
    </>
  )
}

function KanbanColumn({
  title,
  count,
  badgeColor,
  children,
}: {
  title: string
  count: number
  badgeColor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-[240px] flex-1 flex-col rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5">
        <div className="text-[13px] font-bold text-[var(--blue-dark)]">{title}</div>
        <span
          className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white"
          style={{ backgroundColor: badgeColor }}
        >
          {count}
        </span>
      </div>
      <div className="flex flex-col gap-2 p-2">{children}</div>
    </div>
  )
}

export function Tasks() {
  const { user } = useAuth()
  const { users: teamMembers } = useUsers()
  const { clients } = useClients()
  const { suppliers } = useSuppliers()
  const { projects } = useProjects()
  const {
    tasks,
    loading,
    error,
    setDrawerTaskId,
    addTask,
    addTaskNote,
    updateTask,
    deleteTask,
  } = useTasks()

  const [q, setQ] = useState('')
  /** מנהל על: null = כל הצוות; אחרת — תצוגת משימות אישית לאותו עובד */
  const [viewAsUid, setViewAsUid] = useState<string | null>(null)
  /** תאריך ייחוס לעמודות היום / מחר / באיחור / אחר כך (ברירת מחדל: היום האמיתי) */
  const [boardAnchor, setBoardAnchor] = useState(() => todayYmd())

  const defaultAssigneeId = user?.uid ?? teamMembers[0]?.id ?? ''
  const myRole =
    teamMembers.find((m) => m.id === user?.uid)?.role ?? 'employee'
  const canViewAsOthers = myRole === 'superadmin'

  const assigneeForNewTask =
    canViewAsOthers && viewAsUid ? viewAsUid : defaultAssigneeId

  const supplierById = useMemo(() => {
    const m = new Map<string, string>()
    suppliers.forEach((s) => m.set(s.id, s.name))
    return m
  }, [suppliers])

  const clientById = useMemo(() => {
    const m = new Map<string, string>()
    clients.forEach((c) => m.set(c.id, c.name))
    return m
  }, [clients])

  const projectById = useMemo(() => {
    const m = new Map<string, string>()
    projects.forEach((p) => m.set(p.id, p.name))
    return m
  }, [projects])

  const projectRowById = useMemo(() => {
    const m = new Map<string, Project>()
    projects.forEach((p) => m.set(p.id, p))
    return m
  }, [projects])

  const memberById = useMemo(() => {
    const m = new Map<string, string>()
    teamMembers.forEach((u) => m.set(u.id, u.name))
    return m
  }, [teamMembers])

  const taskOpts = useMemo(
    () => ({
      memberNameById: (id: string) => memberById.get(id) ?? id,
      projectNameById: (id: string) => projectById.get(id) ?? id,
      supplierNameById: (id: string) => supplierById.get(id) ?? id,
      clientNameById: (id: string) => clientById.get(id) ?? id,
    }),
    [memberById, projectById, supplierById, clientById],
  )

  const realToday = todayYmd()
  const anchorTomorrow = addDaysYmd(boardAnchor, 1)

  const visibleTasks = useMemo(
    () =>
      user?.uid
        ? tasks.filter((t) => taskVisibleToUser(t, user.uid, ''))
        : [],
    [tasks, user?.uid],
  )

  const perspectiveFiltered = useMemo(() => {
    if (!viewAsUid) return visibleTasks
    return visibleTasks.filter(
      (t) =>
        t.assigneeId === viewAsUid || inSharedForMeColumn(t, viewAsUid),
    )
  }, [visibleTasks, viewAsUid])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return perspectiveFiltered
    return perspectiveFiltered.filter((t) => {
      const proj = t.projectId ? projectRowById.get(t.projectId) : undefined
      const clientN = t.clientId
        ? (clientById.get(t.clientId) ?? '')
        : proj?.type === 'internal'
          ? 'פנימי'
          : proj?.clientId
            ? (clientById.get(proj.clientId) ?? '')
            : ''
      const projN = t.projectId ? projectById.get(t.projectId) ?? '' : ''
      const hay =
        `${t.title} ${t.description || ''} ${clientN} ${projN}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [perspectiveFiltered, q, clientById, projectById, projectRowById])

  const byBucket = useMemo(() => {
    const map: Record<TimeBucket, Task[]> = {
      sharedForMe: [],
      overdue: [],
      today: [],
      tomorrow: [],
      later: [],
      done: [],
    }
    const uidForShared = viewAsUid ?? user?.uid ?? ''
    for (const t of filtered) {
      if (uidForShared && inSharedForMeColumn(t, uidForShared)) {
        map.sharedForMe.push(t)
        continue
      }
      const b = bucketFor(t, boardAnchor, anchorTomorrow)
      map[b].push(t)
    }
    for (const k of Object.keys(map) as TimeBucket[]) {
      map[k].sort(sortInBucket)
    }
    return map
  }, [filtered, boardAnchor, anchorTomorrow, viewAsUid, user?.uid])

  const openCount = useMemo(
    () => filtered.filter((t) => t.status !== 'done').length,
    [filtered],
  )

  const onNewTask = useCallback(() => {
    if (!assigneeForNewTask) return
    void (async () => {
      const id = await addTask({
        title: 'משימה חדשה',
        description: '',
        status: 'todo',
        priority: 'medium',
        assigneeId: assigneeForNewTask,
        dueDate: boardAnchor,
        tags: [],
        reminders: [],
        sharedWithUserIds: [],
        clientId: undefined,
        supplierId: undefined,
        projectId: undefined,
        reminderDate: undefined,
      })
      if (id) setDrawerTaskId(id)
    })()
  }, [addTask, assigneeForNewTask, boardAnchor, setDrawerTaskId])

  const errMsg = error?.message ?? null

  const viewAsName = viewAsUid
    ? (memberById.get(viewAsUid) ?? viewAsUid)
    : null

  const sortedMembers = useMemo(
    () => [...teamMembers].sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [teamMembers],
  )

  const boardSubtitle = viewAsUid
    ? `${openCount} פתוחות · משימות של ${viewAsName} (אחראי או משותפות) · לפי תאריך יעד ביחס לתאריך הייחוס`
    : `${openCount} פתוחות · כל הצוות · לפי תאריך יעד ביחס לתאריך הייחוס`

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-6 py-8 md:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">
            משימות
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-mid)]">
            {boardSubtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש…"
            className="w-full min-w-[180px] flex-1 rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text-dark)] placeholder:text-[var(--text-mid)] lg:w-64 lg:flex-none"
          />
          <button
            type="button"
            onClick={onNewTask}
            disabled={!assigneeForNewTask}
            className="rounded-[10px] bg-[var(--orange)] px-4 py-2 text-[13px] font-bold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + משימה חדשה
          </button>
        </div>
      </div>

      <div className="grid gap-4 rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] md:grid-cols-2">
        {canViewAsOthers ? (
          <div>
            <label
              htmlFor="tasks-view-as"
              className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]"
            >
              תצוגת משימות לפי עובד (מנהל על)
            </label>
            <select
              id="tasks-view-as"
              value={viewAsUid ?? ''}
              onChange={(e) =>
                setViewAsUid(e.target.value ? e.target.value : null)
              }
              className="w-full max-w-md rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text-dark)]"
            >
              <option value="">כל הצוות</option>
              {sortedMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-[var(--text-light)]">
              בוחרים עובד — רואים רק משימות שהוא אחראי עליהן או ששותפו איתו.
            </p>
          </div>
        ) : (
          <div className="text-[12px] text-[var(--text-mid)]">
            <span className="font-semibold text-[var(--text-dark)]">
              תצוגת צוות מלאה.
            </span>{' '}
            מנהל על יכול לסנן כאן לפי עובד.
          </div>
        )}
        <div>
          <p className="mb-2 text-[11px] font-bold text-[var(--text-mid)]">
            תאריך ייחוס ללוח
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text-mid)]">
              יום ספציפי
              <input
                type="date"
                value={boardAnchor}
                onChange={(e) =>
                  setBoardAnchor(
                    e.target.value && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)
                      ? e.target.value
                      : realToday,
                  )
                }
                className="rounded-[10px] border border-[var(--border)] bg-white px-2 py-1.5 text-[13px] text-[var(--text-dark)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text-mid)]">
              קפיצה לחודש (יום 1 בחודש)
              <input
                type="month"
                value={boardAnchor.slice(0, 7)}
                onChange={(e) => {
                  const v = e.target.value
                  if (v && /^\d{4}-\d{2}$/.test(v)) setBoardAnchor(`${v}-01`)
                }}
                className="rounded-[10px] border border-[var(--border)] bg-white px-2 py-1.5 text-[13px] text-[var(--text-dark)]"
              />
            </label>
            <button
              type="button"
              onClick={() => setBoardAnchor(realToday)}
              className="rounded-[10px] border border-[var(--border)] bg-[var(--blue-light)] px-3 py-2 text-[12px] font-bold text-[var(--blue-dark)] transition hover:bg-[#BFDBFE]"
            >
              חזרה להיום ({formatDateIL(realToday)})
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-[var(--text-light)]">
            «היום» ו«מחר» בעמודות נקבעים לפי תאריך הייחוס — לא לפי לוח השנה
            האמיתי. כך אפשר לתכנן משימות לחודש הבא (למשל לבחור חודש ולתזמן
            יעדים בעמודה «אחר כך»).
          </p>
        </div>
      </div>

      {errMsg ? (
        <div className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {errMsg}
        </div>
      ) : null}

      {loading ? (
        <div className="text-[13px] text-[var(--text-mid)]">טוען משימות…</div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TIME_COLUMNS.map((col) => {
            const list = byBucket[col.key]
            const columnTitle =
              col.key === 'today'
                ? `${col.label} (${formatDateIL(boardAnchor)})`
                : col.key === 'tomorrow'
                  ? `${col.label} (${formatDateIL(anchorTomorrow)})`
                  : col.key === 'overdue'
                    ? `${col.label} (לפני ${formatDateIL(boardAnchor)})`
                    : col.label
            return (
              <KanbanColumn
                key={col.key}
                title={columnTitle}
                count={list.length}
                badgeColor={col.badgeColor}
              >
                {list.map((task) => {
                  const projectRow = task.projectId
                    ? projectRowById.get(task.projectId)
                    : undefined
                  const clientName = task.clientId
                    ? (clientById.get(task.clientId) ?? null)
                    : projectRow?.type === 'internal'
                      ? 'פנימי'
                      : projectRow?.clientId
                        ? (clientById.get(projectRow.clientId) ?? null)
                        : null
                  const supplierName = task.supplierId
                    ? supplierById.get(task.supplierId) ?? null
                    : null
                  const projectName = task.projectId
                    ? projectById.get(task.projectId) ?? null
                    : null
                  const assigneeLabel = task.assigneeId
                    ? memberById.get(task.assigneeId) ?? null
                    : null
                  const sharedBadge = sharedTaskBadge(task, memberById)
                  return (
                    <div key={task.id} className="w-full">
                      <TaskCard
                        task={task}
                        clientName={clientName}
                        supplierName={supplierName}
                        projectName={projectName}
                        assigneeLabel={assigneeLabel}
                        sharedBadge={sharedBadge}
                        onOpenDrawer={() => setDrawerTaskId(task.id)}
                        onMarkComplete={() =>
                          void updateTask(
                            task.id,
                            { status: 'done' },
                            taskOpts,
                          )
                        }
                        onReopen={() =>
                          void updateTask(
                            task.id,
                            { status: 'todo' },
                            taskOpts,
                          )
                        }
                        onDelete={() => {
                          if (
                            !window.confirm(
                              'למחוק את המשימה? הפעולה בלתי הפיכה.',
                            )
                          )
                            return
                          void deleteTask(task.id)
                        }}
                        onDueDateChange={(ymd) => {
                          const cur = dueYmd(task)
                          if (ymd === cur) return
                          void updateTask(
                            task.id,
                            { dueDate: ymd },
                            taskOpts,
                          )
                        }}
                        canPublishNote={Boolean(user?.uid)}
                        onPublishNote={(text) => addTaskNote(task.id, text)}
                      />
                    </div>
                  )
                })}
              </KanbanColumn>
            )
          })}
        </div>
      )}

      {!loading && !errMsg && filtered.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--bg-card)] p-8 text-center text-[13px] text-[var(--text-mid)]">
          אין משימות להצגה.
        </div>
      ) : null}
    </div>
  )
}
