import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { formatDateIL, formatTaskDueDisplay } from '../lib/dates'
import { priorityColor } from '../lib/priorityColor'
import { INTERNAL_PROJECT_BADGE_COLOR } from '../lib/projectKind'
import {
  isRetainerProject,
  retainerMonthLabelHe,
  retainerMonthOptions,
  RETAINER_ACCENT,
} from '../lib/projectRetainer'
import { useClients } from '../hooks/useClients'
import { useProjects } from '../hooks/useProjects'
import { useSuppliers } from '../hooks/useSuppliers'
import { useTasks } from '../hooks/useTasks'
import { useUsers } from '../hooks/useUsers'
import { useHubStore } from '../store/useStore'
import type {
  Doc,
  DocType,
  Priority,
  ProjectStatus,
  Task,
  TaskStatus,
} from '../types'
import { Avatar } from '../components/shared/Avatar'
import { Badge } from '../components/shared/Badge'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { EmptyState } from '../components/shared/EmptyState'
import { Modal } from '../components/shared/Modal'
import { ProjectFinanceSection } from '../components/finance/ProjectFinanceSection'
import { userIsAdmin } from '../components/RequireAdmin'
import { hubSectionClass } from '../lib/hubSectionBorder'

const taskStatusLabels: Record<TaskStatus, string> = {
  todo: 'לביצוע',
  doing: 'בעבודה',
  blocked: 'חסום',
  done: 'הושלם',
}

const projectStatusLabels = {
  active: 'פעיל',
  paused: 'מושהה',
  done: 'הושלם',
} as const

const priorityLabels: Record<Priority, string> = {
  high: 'גבוהה',
  medium: 'בינונית',
  low: 'נמוכה',
}

const docTypeLabels: Record<DocType, string> = {
  spec: 'אפיון',
  meeting: 'פגישה',
  brief: 'בריף',
  note: 'הערה',
}

const projectStatusBadgeColor: Record<ProjectStatus, string> = {
  active: '#2563EB',
  paused: '#64748B',
  done: '#16A34A',
}

const taskStatusAccent: Record<TaskStatus, string> = {
  todo: '#2563EB',
  doing: '#5828A0',
  blocked: '#EF4444',
  done: '#10B981',
}

const taskStatusBadgeColor: Record<TaskStatus, string> = {
  todo: '#2563EB',
  doing: '#5828A0',
  blocked: '#EF4444',
  done: '#16A34A',
}

type TaskFilter = 'all' | TaskStatus

interface DocViewerProps {
  doc: Doc
  onClose: () => void
}

function DocViewer({ doc, onClose }: DocViewerProps) {
  const patchDocContent = useHubStore((s) => s.patchDocContent)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [text, setText] = useState(() => doc.content)

  useEffect(() => {
    if (mode !== 'edit') return
    const t = window.setTimeout(() => {
      patchDocContent(doc.id, text)
    }, 800)
    return () => window.clearTimeout(t)
  }, [text, doc.id, mode, patchDocContent])

  return (
    <div className={`mt-4 rounded-2xl ${hubSectionClass(0)} shadow-none`}>
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-dark)]">
          {doc.title}
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="rounded-[10px] px-2 py-1 text-[11px] font-semibold text-[var(--text-mid)] hover:bg-[var(--blue-light)] hover:text-[var(--text-dark)]"
            onClick={() => setMode((m) => (m === 'view' ? 'edit' : 'view'))}
          >
            {mode === 'view' ? 'עריכה' : 'תצוגה'}
          </button>
          <button
            type="button"
            aria-label="סגור מסמך"
            className="rounded-[10px] px-2 py-1 text-[var(--text-light)] hover:bg-[var(--blue-light)] hover:text-[var(--text-dark)]"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </div>
      <div className="max-h-[320px] overflow-auto p-4">
        {mode === 'view' ? (
          <div className="whitespace-pre-wrap text-sm text-[var(--text-dark)]">
            {text}
          </div>
        ) : (
          <textarea
            className="min-h-[220px] resize-y"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
      </div>
    </div>
  )
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { users: teamMembers, loading: usersLoading } = useUsers()
  const defaultAssigneeId = user?.uid ?? teamMembers[0]?.id ?? ''

  const { projects, updateProject } = useProjects()
  const { clients } = useClients()
  const { suppliers } = useSuppliers()
  const { tasks, cycleStatus, deleteTask, addTask } = useTasks()
  const docs = useHubStore((s) => s.docs)
  const addDoc = useHubStore((s) => s.addDoc)
  const hubUser = useHubStore((s) => s.currentUser)
  const isAdmin =
    Boolean(user) && !usersLoading && userIsAdmin(user?.uid, teamMembers, hubUser)

  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all')
  const [taskModal, setTaskModal] = useState(false)
  const [docModal, setDocModal] = useState(false)
  const [activeDocId, setActiveDocId] = useState<string | null>(null)
  const [taskDeleteId, setTaskDeleteId] = useState<string | null>(null)
  const [retainerModal, setRetainerModal] = useState(false)
  const [retainerMonth, setRetainerMonth] = useState('')
  const [retainerNote, setRetainerNote] = useState('')

  const [taskForm, setTaskForm] = useState({
    title: '',
    priority: 'medium' as Priority,
    assigneeId: '',
    dueDate: '',
  })

  useEffect(() => {
    if (!defaultAssigneeId) return
    setTaskForm((f) =>
      f.assigneeId ? f : { ...f, assigneeId: defaultAssigneeId },
    )
  }, [defaultAssigneeId])

  const [docForm, setDocForm] = useState({
    title: '',
    type: 'note' as DocType,
  })

  const project = useMemo(
    () => projects.find((p) => p.id === id),
    [projects, id],
  )

  const client = useMemo(
    () => clients.find((c) => c.id === project?.clientId),
    [clients, project?.clientId],
  )

  const projectSupplier = useMemo(() => {
    const sid = project?.supplierId?.trim()
    if (!sid) return undefined
    return suppliers.find((s) => s.id.trim() === sid)
  }, [suppliers, project?.supplierId])

  const projectTasks = useMemo(() => {
    if (!id) return []
    return tasks
      .filter((t) => t.projectId === id)
      .filter((t) => taskFilter === 'all' || t.status === taskFilter)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }, [tasks, id, taskFilter])

  const retainerLogSorted = useMemo(() => {
    const log = project?.retainerLog ?? []
    return [...log].sort((a, b) => {
      const c = b.month.localeCompare(a.month)
      if (c !== 0) return c
      return b.createdAt.localeCompare(a.createdAt)
    })
  }, [project?.retainerLog])

  const retainerMonthChoices = useMemo(() => retainerMonthOptions(), [])

  useEffect(() => {
    if (!retainerModal || retainerMonthChoices.length === 0) return
    setRetainerMonth((m) => m || retainerMonthChoices[0]!)
  }, [retainerModal, retainerMonthChoices])

  const projectDocs = useMemo(() => {
    if (!id) return []
    return docs
      .filter((d) => d.projectId === id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [docs, id])

  const memberById = useCallback(
    (memberId: string) => teamMembers.find((m) => m.id === memberId),
    [teamMembers],
  )

  const activeDoc = useMemo(
    () => projectDocs.find((d) => d.id === activeDocId) ?? null,
    [projectDocs, activeDocId],
  )

  if (!project || !id) {
    return (
      <div className="beo-page space-y-4">
        <p className="text-[var(--text-mid)]">הפרויקט לא נמצא</p>
        <Link
          to="/projects"
          className="font-semibold text-[var(--blue-mid)] hover:underline"
        >
          חזרה לפרויקטים
        </Link>
      </div>
    )
  }

  const submitTask = () => {
    if (!taskForm.title.trim()) return
    void addTask({
      projectId: id,
      clientId: project?.clientId,
      title: taskForm.title.trim(),
      description: '',
      status: 'todo',
      priority: taskForm.priority,
      assigneeId: taskForm.assigneeId || defaultAssigneeId,
      dueDate: taskForm.dueDate || new Date().toISOString().slice(0, 10),
      tags: [],
      reminders: [],
      sharedWithUserIds: [],
      supplierId: project.supplierId,
      reminderDate: undefined,
    })
    setTaskModal(false)
    setTaskForm({
      title: '',
      priority: 'medium',
      assigneeId: defaultAssigneeId,
      dueDate: '',
    })
  }

  const submitDoc = () => {
    if (!docForm.title.trim()) return
    addDoc({
      projectId: id,
      title: docForm.title.trim(),
      type: docForm.type,
      content: '',
      authorId: user?.uid ?? defaultAssigneeId,
    })
    setDocModal(false)
    setDocForm({ title: '', type: 'note' })
  }

  const submitRetainerEntry = async () => {
    if (!id) return
    const cur = projects.find((p) => p.id === id)
    if (!cur) return
    const note = retainerNote.trim()
    if (!retainerMonth || !note) return
    const entry = {
      id: crypto.randomUUID(),
      month: retainerMonth.slice(0, 7),
      note,
      createdAt: new Date().toISOString(),
    }
    const ok = await updateProject(id, {
      retainerLog: [...(cur.retainerLog ?? []), entry],
    })
    if (ok) {
      setRetainerModal(false)
      setRetainerNote('')
    }
  }

  const taskFilterBtns: { key: TaskFilter; label: string }[] = [
    { key: 'all', label: 'הכל' },
    { key: 'todo', label: 'לביצוע' },
    { key: 'doing', label: 'בעבודה' },
    { key: 'blocked', label: 'חסום' },
    { key: 'done', label: 'הושלם' },
  ]

  return (
    <div className="beo-page space-y-6">
      <header className="space-y-3 border-b border-[var(--border)] pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/projects')}
              className="text-sm font-medium text-[var(--text-mid)] hover:text-[var(--text-dark)]"
            >
              ← חזור
            </button>
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">
              {project.name}
            </h1>
            {project.type === 'internal' ? (
              <Badge label="פנימי" color={INTERNAL_PROJECT_BADGE_COLOR} />
            ) : (
              <span className="text-sm text-[var(--text-mid)]">
                {client?.name ?? 'לקוח לא ידוע'}
              </span>
            )}
            {isRetainerProject(project) ? (
              <Badge label="שוטף 🔄" color={RETAINER_ACCENT} />
            ) : null}
            {isRetainerProject(project) && project.startDate ? (
              <span className="text-sm text-[var(--text-mid)]">
                · פעיל מאז {formatDateIL(project.startDate)}
              </span>
            ) : null}
            {project.supplierId?.trim() ? (
              <span className="text-sm text-[var(--text-light)]">
                · ספק ביצוע: {projectSupplier?.name ?? 'לא ברשימה'}
              </span>
            ) : null}
            <Badge
              label={projectStatusLabels[project.status]}
              color={projectStatusBadgeColor[project.status]}
            />
            <Badge
              label={priorityLabels[project.priority]}
              color={priorityColor(project.priority)}
            />
          </div>
        </div>
        {project.description?.trim() ? (
          <div>
            <p className="mb-1 text-[11px] font-bold text-[var(--text-light)]">
              תיאור הפרויקט
            </p>
            <p className="max-w-4xl whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--text-mid)]">
              {project.description.trim()}
            </p>
          </div>
        ) : null}
      </header>

      {isAdmin ? (
        <section>
          <h2 className="mb-3 text-[18px] font-extrabold text-[var(--text-dark)]">
            סקירה פיננסית
          </h2>
          <ProjectFinanceSection project={project} client={client} />
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          {isRetainerProject(project) ? (
            <section>
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2
                  className="text-[15px] font-bold"
                  style={{ color: RETAINER_ACCENT }}
                >
                  עדכונים וביקורות חודשיות
                </h2>
                <button
                  type="button"
                  onClick={() => setRetainerModal(true)}
                  className="rounded-[10px] px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110"
                  style={{ backgroundColor: RETAINER_ACCENT }}
                >
                  + עדכון חודשי
                </button>
              </div>
              <div className="space-y-2">
                {retainerLogSorted.length === 0 ? (
                  <p className="text-sm text-[var(--text-mid)]">
                    עדיין אין עדכונים — הוסיפו ראשון עם הכפתור למעלה.
                  </p>
                ) : (
                  retainerLogSorted.map((e) => (
                    <div
                      key={e.id}
                      className="rounded-[10px] border border-[var(--border)] bg-[#FAF5FF] px-3 py-2.5 shadow-[0_1px_6px_rgba(0,0,0,0.04)]"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
                          style={{ backgroundColor: RETAINER_ACCENT }}
                        >
                          {retainerMonthLabelHe(e.month)}
                        </span>
                        <span className="text-[11px] text-[var(--text-light)] tabular-nums">
                          {formatDateIL(e.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-[13px] text-[var(--text-dark)]">
                        {e.note}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>
          ) : null}

          <section>
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[15px] font-bold text-[var(--blue-dark)]">משימות</h2>
            <button
              type="button"
              onClick={() => setTaskModal(true)}
              className="hub-btn-primary text-xs"
            >
              + משימה
            </button>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {taskFilterBtns.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => setTaskFilter(b.key)}
                className={`rounded-[10px] px-3 py-1 text-[11px] font-semibold ${
                  taskFilter === b.key
                    ? 'hub-btn-primary'
                    : 'border border-[#BFDBFE] bg-[var(--blue-light)] text-[var(--blue-mid)] hover:bg-[#DBEAFE]'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {projectTasks.map((t: Task) => {
              const assignee = memberById(t.assigneeId)
              const pc = priorityColor(t.priority)
              const done = t.status === 'done'
              const statusLine = taskStatusAccent[t.status]
              return (
                <div
                  key={t.id}
                  className="relative flex items-stretch gap-3 rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] py-3 pl-12 pr-4 transition hover:border-[var(--orange)]"
                  style={{ borderRightWidth: 3, borderRightColor: pc }}
                >
                  <button
                    type="button"
                    aria-label="סמן התקדמות משימה"
                    onClick={() => cycleStatus(t.id)}
                    className="mt-0.5 flex shrink-0 items-center justify-center text-[11px] font-bold text-[var(--text-dark)]"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      border: `2px solid ${statusLine}`,
                      backgroundColor:
                        t.status === 'done' ? `${statusLine}33` : 'transparent',
                    }}
                  >
                    {t.status === 'done' ? '✓' : ''}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`font-semibold text-[var(--text-dark)] ${
                        done ? 'text-[var(--text-light)] line-through' : ''
                      }`}
                    >
                      {t.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-mid)]">
                      <span>יעד: {formatTaskDueDisplay(t.dueDate, t.dueTime)}</span>
                      {assignee ? <Avatar member={assignee} size={22} /> : null}
                      <Badge
                        label={taskStatusLabels[t.status]}
                        color={taskStatusBadgeColor[t.status]}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="מחק משימה"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-light)] hover:text-[var(--danger)]"
                    onClick={() => setTaskDeleteId(t.id)}
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>

          {projectTasks.length === 0 ? (
            <EmptyState
              title="אין משימות"
              description="הוסיפו משימה חדשה כדי להתחיל לעקוב אחר העבודה."
            />
          ) : null}
          </section>
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold text-[var(--blue-dark)]">תיעוד</h2>
            <button
              type="button"
              onClick={() => setDocModal(true)}
              className="hub-btn-primary text-xs"
            >
              + מסמך
            </button>
          </div>

          <div className="space-y-2">
            {projectDocs.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setActiveDocId(d.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-[10px] border px-3 py-2 text-right shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition ${
                  activeDocId === d.id
                    ? 'border-[var(--blue-mid)] bg-[var(--blue-light)]'
                    : 'border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] hover:border-[var(--orange)]'
                }`}
              >
                <div className="min-w-0">
                  <Badge label={docTypeLabels[d.type]} color="#2563EB" />
                  <div className="mt-1 truncate text-sm font-semibold text-[var(--text-dark)]">
                    {d.title}
                  </div>
                  <div className="text-[11px] text-[var(--text-light)]">
                    עודכן: {formatDateIL(d.updatedAt)}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {projectDocs.length === 0 ? (
            <EmptyState title="אין מסמכים" description="צרו מסמך חדש מתוך הכפתור למעלה." />
          ) : null}

          {activeDoc ? (
            <DocViewer
              key={activeDoc.id}
              doc={activeDoc}
              onClose={() => setActiveDocId(null)}
            />
          ) : null}
        </section>
      </div>

      <Modal
        isOpen={retainerModal}
        onClose={() => setRetainerModal(false)}
        title="עדכון חודשי — Retainer"
        bodyClassName="overflow-visible max-h-none"
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">חודש</label>
            <select
              value={retainerMonth}
              onChange={(e) => setRetainerMonth(e.target.value)}
            >
              {retainerMonthChoices.map((ym) => (
                <option key={ym} value={ym}>
                  {retainerMonthLabelHe(ym)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">
              תיאור — מה בוצע
            </label>
            <textarea
              rows={4}
              placeholder="סיכום עבודה, אבני דרך, הערות…"
              value={retainerNote}
              onChange={(e) => setRetainerNote(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="hub-btn-secondary text-sm"
              onClick={() => setRetainerModal(false)}
            >
              ביטול
            </button>
            <button
              type="button"
              className="rounded-[10px] px-4 py-2 text-sm font-bold text-white transition hover:brightness-110"
              style={{ backgroundColor: RETAINER_ACCENT }}
              onClick={() => void submitRetainerEntry()}
            >
              שמור
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={taskModal}
        onClose={() => setTaskModal(false)}
        title="משימה חדשה"
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">כותרת</label>
            <input
              value={taskForm.title}
              onChange={(e) =>
                setTaskForm((f) => ({ ...f, title: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">עדיפות</label>
            <select
              value={taskForm.priority}
              onChange={(e) =>
                setTaskForm((f) => ({
                  ...f,
                  priority: e.target.value as Priority,
                }))
              }
            >
              <option value="high">גבוהה</option>
              <option value="medium">בינונית</option>
              <option value="low">נמוכה</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">שיוך</label>
            <select
              value={taskForm.assigneeId}
              onChange={(e) =>
                setTaskForm((f) => ({ ...f, assigneeId: e.target.value }))
              }
            >
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">
              תאריך יעד
            </label>
            <input
              type="date"
              value={taskForm.dueDate}
              onChange={(e) =>
                setTaskForm((f) => ({ ...f, dueDate: e.target.value }))
              }
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="hub-btn-secondary text-sm"
              onClick={() => setTaskModal(false)}
            >
              ביטול
            </button>
            <button
              type="button"
              className="hub-btn-primary text-sm"
              onClick={submitTask}
            >
              שמור
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={docModal}
        onClose={() => setDocModal(false)}
        title="מסמך חדש"
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">כותרת</label>
            <input
              value={docForm.title}
              onChange={(e) =>
                setDocForm((f) => ({ ...f, title: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">סוג</label>
            <select
              value={docForm.type}
              onChange={(e) =>
                setDocForm((f) => ({
                  ...f,
                  type: e.target.value as DocType,
                }))
              }
            >
              <option value="spec">אפיון</option>
              <option value="meeting">פגישה</option>
              <option value="brief">בריף</option>
              <option value="note">הערה</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="hub-btn-secondary text-sm"
              onClick={() => setDocModal(false)}
            >
              ביטול
            </button>
            <button
              type="button"
              className="hub-btn-primary text-sm"
              onClick={submitDoc}
            >
              שמור
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={taskDeleteId !== null}
        onClose={() => setTaskDeleteId(null)}
        onConfirm={() => {
          if (taskDeleteId) deleteTask(taskDeleteId)
        }}
        message="למחוק משימה זו?"
      />
    </div>
  )
}
