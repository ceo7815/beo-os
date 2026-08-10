import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { taskVisibleToUser } from '../lib/taskVisibility'
import { boardStatusHe, priorityHe } from '../lib/boardTaskLabels'
import { addDaysYmd, formatDateIL, formatDateTimeIL, formatTaskDueDisplay, todayYmd } from '../lib/dates'
import {
  supplierDisplayName,
  supplierNameMap,
} from '../lib/supplierDisplay'
import { RecurringTaskModal } from '../components/RecurringTaskModal'
import { TasksBoardTable } from '../components/tasks/TasksBoardTable'
import {
  loadTasksBoardViewMode,
  saveTasksBoardViewMode,
  type TasksBoardViewMode,
} from '../lib/tasksBoardView'
import { Modal } from '../components/shared/Modal'
import { useClients } from '../hooks/useClients'
import { useProjects } from '../hooks/useProjects'
import { useSuppliers } from '../hooks/useSuppliers'
import { useTasks } from '../hooks/useTasks'
import { useUsers } from '../hooks/useUsers'
import type { Project, Task, TaskActivity, TaskStatus } from '../types'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { ExportExcelButton } from '../components/shared/ExportExcelButton'
import { exportTasksToExcel } from '../lib/excelTableExports'

/** תצוגת לוח למנהל מערכת: משימות שלי / כל הצוות / עובד ספציפי */
type AdminTeamScope = 'mine' | 'all' | string

const statusBadgeClass: Record<TaskStatus, string> = {
  todo: 'bg-[#64748B]/15 text-[#64748B]',
  doing: 'bg-[#2563EB]/15 text-[#2563EB]',
  blocked: 'bg-[#EF4444]/15 text-[#EF4444]',
  done: 'bg-[#10B981]/15 text-[#10B981]',
}

type TimeBucket =
  | 'overdue'
  | 'today'
  | 'tomorrow'
  | 'dayAfterTomorrow'
  | 'weekRest'

const TIME_COLUMNS: {
  key: TimeBucket
  label: string
  badgeColor: string
}[] = [
  { key: 'overdue', label: 'באיחור', badgeColor: '#EF4444' },
  { key: 'today', label: 'היום', badgeColor: '#F97316' },
  { key: 'tomorrow', label: 'מחר', badgeColor: '#2563EB' },
  { key: 'dayAfterTomorrow', label: 'מחרתיים', badgeColor: '#0EA5E9' },
  { key: 'weekRest', label: 'המשך השבוע', badgeColor: '#64748B' },
]

function dueYmd(t: Task): string | null {
  const d = (t.dueDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  return d
}

function bucketFor(
  t: Task,
  today: string,
  tomorrow: string,
  dayAfterTomorrow: string,
): TimeBucket {
  const d = dueYmd(t)
  if (!d) return 'weekRest'
  if (d < today) return 'overdue'
  if (d === today) return 'today'
  if (d === tomorrow) return 'tomorrow'
  if (d === dayAfterTomorrow) return 'dayAfterTomorrow'
  return 'weekRest'
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

/** לפי לוג פעילות: «שייך את המשימה ל־…» — המופע האחרון הוא מי ביצע את העברת האחראי האחרונה */
function lastAssigneeTransferActorName(activity: TaskActivity[]): string | null {
  const marker = 'שייך את המשימה'
  const rows = activity.filter((a) => a.action.includes(marker))
  if (rows.length === 0) return null
  rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const name = rows[rows.length - 1]?.userName?.trim()
  return name || null
}

function TaskCard({
  task,
  clientName,
  supplierName,
  projectName,
  assigneeLabel,
  delegatorLabel,
  onOpenDrawer,
  onMarkComplete,
  onReopen,
  onDelete,
  onDueDateChange,
  onPublishNote,
  canPublishNote,
  canTransferAssignee,
  assigneeOptions,
  onTransferAssignee,
  onDragStart,
  onDragEnd,
}: {
  task: Task
  clientName: string | null
  supplierName: string | null
  projectName: string | null
  assigneeLabel: string | null
  /** אם היוצר שונה מהאחראי — שורה «הופנתה על ידי» בכותרת הכחולה */
  delegatorLabel: string | null
  onOpenDrawer: () => void
  onMarkComplete: () => void
  onReopen: () => void
  onDelete: () => void
  onDueDateChange: (ymd: string) => void
  onPublishNote: (text: string) => Promise<void>
  canPublishNote: boolean
  canTransferAssignee: boolean
  assigneeOptions: { id: string; name: string }[]
  onTransferAssignee: (newAssigneeId: string) => void
  onDragStart: (taskId: string) => void
  onDragEnd: () => void
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
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferPick, setTransferPick] = useState('')

  const hasOtherAssignees = useMemo(
    () => assigneeOptions.some((o) => o.id !== task.assigneeId),
    [assigneeOptions, task.assigneeId],
  )

  const desc = (task.description || '').trim()
  const streamNewestFirst = useMemo(
    () => [...task.manualNotes].reverse(),
    [task.manualNotes],
  )

  const transferredByLabel = useMemo(
    () => lastAssigneeTransferActorName(task.activity),
    [task.activity],
  )
  const showDelegationBanner = Boolean(delegatorLabel || transferredByLabel)

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
          <p>
            <span className="text-[var(--text-mid)]">תאריך יעד: </span>
            <span className="font-medium">{formatTaskDueDisplay(task.dueDate, task.dueTime)}</span>
          </p>
          {assigneeLabel ? (
            <p>
              <span className="text-[var(--text-mid)]">אחראי: </span>
              <span className="font-medium">{assigneeLabel}</span>
            </p>
          ) : null}
          {delegatorLabel ? (
            <p className="rounded-md bg-[#EEF2FF] px-2 py-1.5 text-[12px] font-semibold text-[var(--blue-dark)]">
              הופנתה על ידי: {delegatorLabel}
            </p>
          ) : null}
          {transferredByLabel ? (
            <p className="rounded-md bg-[#EFF6FF] px-2 py-1.5 text-[12px] font-semibold text-[var(--text-mid)]">
              הועברה על ידי: {transferredByLabel}
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

      <Modal
        isOpen={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="העברת משימה לעובד אחר"
        size="md"
      >
        <p className="mb-3 text-[13px] leading-relaxed text-[var(--text-mid)]">
          האחראי הנוכחי:{' '}
          <span className="font-bold text-[var(--text-dark)]">
            {assigneeLabel ?? 'לא צוין'}
          </span>
          . נבחר עובד אחר מהארגון — הפעולה תירשם בפעילות המשימה.
        </p>
        {hasOtherAssignees ? (
          <>
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              העבר אל
            </label>
            <select
              value={transferPick}
              onChange={(e) => setTransferPick(e.target.value)}
              className="w-full rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2 text-[13px] text-[var(--text-dark)]"
            >
              {assigneeOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.id === task.assigneeId ? ' (אחראי כיום)' : ''}
                </option>
              ))}
            </select>
            <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
              <button
                type="button"
                onClick={() => setTransferOpen(false)}
                className="rounded-[10px] border border-[var(--border)] bg-[var(--dash-panel-bg)] px-4 py-2 text-sm font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]"
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={!transferPick || transferPick === task.assigneeId}
                onClick={() => {
                  if (!transferPick || transferPick === task.assigneeId) return
                  onTransferAssignee(transferPick)
                  setTransferOpen(false)
                }}
                className="rounded-[10px] bg-[var(--blue-mid)] px-4 py-2 text-sm font-bold text-white shadow-sm hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
              >
                אשר העברה
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--text-mid)]">
            אין עובד אחר זמין להעברה (או שאין עובדים פעילים ברשימה).
          </p>
        )}
      </Modal>

      <div
        className={`text-start shadow-[0_2px_8px_rgba(15,23,42,0.05)] transition hover:brightness-[1.02] ${
          showDelegationBanner
            ? 'overflow-hidden rounded-2xl border-2 border-[#2563EB] ring-1 ring-[#BFDBFE]'
            : 'rounded-2xl border border-black'
        }`}
        role="button"
        tabIndex={0}
        draggable
        onDragStart={() => onDragStart(task.id)}
        onDragEnd={onDragEnd}
        onClick={() => setPreviewOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setPreviewOpen(true)
          }
        }}
        aria-label={`פתח תצוגה מלאה: ${task.title}`}
      >
        {showDelegationBanner ? (
          <div className="space-y-1 bg-[#2563EB] px-2 py-2 text-center text-[10px] font-bold leading-snug sm:text-[11px]">
            {delegatorLabel ? (
              <div className="text-white">הופנתה על ידי {delegatorLabel}</div>
            ) : null}
            {transferredByLabel ? (
              <div className="text-[#BFDBFE]">הועברה על ידי {transferredByLabel}</div>
            ) : null}
          </div>
        ) : null}
        <div
          className={`bg-[var(--dash-panel-bg)] p-3 ${showDelegationBanner ? 'rounded-b-[14px]' : 'rounded-2xl'}`}
          style={{ borderRight: `3px solid ${priorityColor}` }}
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
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass[task.status]}`}
          >
            {boardStatusHe(task.status)}
          </span>
          {task.recurringFrequency === 'daily' ? (
            <span className="rounded-full bg-[#EDE9FE] px-2 py-0.5 text-[10px] font-bold text-[#5B21B6]">
              קבועה יומית
            </span>
          ) : task.recurringFrequency === 'weekly' ? (
            <span className="rounded-full bg-[#EDE9FE] px-2 py-0.5 text-[10px] font-bold text-[#5B21B6]">
              קבועה שבועית
            </span>
          ) : null}
        </div>
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
              className="w-full resize-y rounded-md border border-[var(--border-orange-soft)] bg-[var(--bg-input)] p-2 text-[12px] text-[var(--text-dark)] placeholder:text-[var(--text-light)]"
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
            className="max-w-full rounded-md border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-1.5 py-1 text-[12px] text-[var(--text-dark)]"
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
            className="rounded-md border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-2 py-1 text-[11px] font-semibold text-[var(--text-dark)] hover:bg-[var(--surface-muted)]"
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
        {canTransferAssignee && hasOtherAssignees && !isDone ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              const next =
                assigneeOptions.find((o) => o.id !== task.assigneeId)?.id ?? ''
              setTransferPick(next)
              setTransferOpen(true)
            }}
            className="rounded-md border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-1 text-[11px] font-bold text-[#1D4ED8] hover:bg-[#DBEAFE]"
          >
            העבר לעובד
          </button>
        ) : null}
      </div>
    </div>
    </div>
    </>
  )
}

function KanbanColumn({
  title,
  count,
  badgeColor,
  sectionSeq,
  children,
  canDrop,
  onDropTask,
  onDragEnterColumn,
  columnDomId,
}: {
  title: string
  count: number
  badgeColor: string
  sectionSeq: number
  children: React.ReactNode
  canDrop: boolean
  onDropTask: () => void
  onDragEnterColumn: () => void
  /** לעוגן מדף חיצוני (למשל דשבורד → באיחור) */
  columnDomId?: string
}) {
  return (
    <div
      id={columnDomId}
      className={`flex min-w-[240px] flex-1 flex-col rounded-2xl ${hubSectionClass(sectionSeq)} transition ${
        canDrop
          ? 'ring-2 ring-[var(--orange-light)] ring-offset-2 ring-offset-[var(--bg-main)]'
          : ''
      }`}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={() => onDragEnterColumn()}
      onDrop={(e) => {
        e.preventDefault()
        onDropTask()
      }}
    >
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
  const [searchParams, setSearchParams] = useSearchParams()
  const { users: teamMembers } = useUsers()
  const { clients } = useClients()
  const { suppliers } = useSuppliers()
  const { projects } = useProjects()
  const {
    tasks,
    loading,
    error,
    setDrawerTaskId,
    openNewTaskDraft,
    addTaskNote,
    updateTask,
    deleteTask,
    addRecurringTemplateWithFirstTask,
  } = useTasks()

  const [q, setQ] = useState('')
  const [recurringModalOpen, setRecurringModalOpen] = useState(false)
  const [sentTasksOpen, setSentTasksOpen] = useState(false)
  const [completedByMeOpen, setCompletedByMeOpen] = useState(false)
  const [myOpenTasksOpen, setMyOpenTasksOpen] = useState(false)
  const [dragTaskId, setDragTaskId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<TimeBucket | null>(null)
  /** מנהל מערכת: mine = המשימות שלי (ברירת מחדל); all = כל הצוות; אחרת uid של עובד */
  const [adminTeamScope, setAdminTeamScope] = useState<AdminTeamScope>('mine')
  /** תאריך ייחוס לעמודות היום / מחר / באיחור / אחר כך (ברירת מחדל: היום האמיתי) */
  const [boardAnchor, setBoardAnchor] = useState(() => todayYmd())
  const [boardViewMode, setBoardViewMode] = useState<TasksBoardViewMode>(() =>
    loadTasksBoardViewMode(),
  )

  useEffect(() => {
    const focus = searchParams.get('focus')?.trim().toLowerCase()
    if (focus !== 'overdue') return
    setBoardAnchor(todayYmd())
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.delete('focus')
        return n
      },
      { replace: true },
    )
    const t = window.setTimeout(() => {
      document
        .getElementById('tasks-kanban-overdue')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' })
    }, 80)
    return () => window.clearTimeout(t)
  }, [searchParams, setSearchParams])

  const defaultAssigneeId = user?.uid ?? teamMembers[0]?.id ?? ''
  const myRole =
    teamMembers.find((m) => m.id === user?.uid)?.role ?? 'employee'
  const canViewAsOthers = myRole === 'admin' || myRole === 'superadmin'

  const assigneeForNewTask = useMemo(() => {
    if (!canViewAsOthers) return defaultAssigneeId
    if (adminTeamScope === 'all' || adminTeamScope === 'mine') {
      return user?.uid ?? defaultAssigneeId
    }
    return adminTeamScope
  }, [canViewAsOthers, adminTeamScope, user?.uid, defaultAssigneeId])

  const supplierById = useMemo(() => supplierNameMap(suppliers), [suppliers])

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
      supplierNameById: (id: string) =>
        supplierDisplayName(id, supplierById) ?? id,
      clientNameById: (id: string) => clientById.get(id) ?? id,
    }),
    [memberById, projectById, supplierById, clientById],
  )

  const realToday = todayYmd()
  const anchorTomorrow = addDaysYmd(boardAnchor, 1)
  const anchorDayAfterTomorrow = addDaysYmd(boardAnchor, 2)

  const visibleTasks = useMemo(
    () =>
      user?.uid
        ? tasks.filter((t) => taskVisibleToUser(t, user.uid, myRole))
        : [],
    [tasks, user?.uid, myRole],
  )

  const perspectiveFiltered = useMemo(() => {
    if (!canViewAsOthers) return visibleTasks
    if (adminTeamScope === 'all') return visibleTasks
    const filterUid =
      adminTeamScope === 'mine' ? user?.uid ?? '' : adminTeamScope
    if (!filterUid) return visibleTasks
    return visibleTasks.filter((t) => t.assigneeId === filterUid)
  }, [visibleTasks, canViewAsOthers, adminTeamScope, user?.uid])

  /**
   * משימות שיצרת לאחרים — בלוח «שלי» / עובד רגיל: לא בקנבן (רק ב«משימות ששלחתי»).
   * כשמנהל בוחר עובד ספציפי — חייבים להציג גם משימות שהמנהל הקצה לו, אחרת הלוח נראה ריק.
   */
  const kanbanTaskSource = useMemo(() => {
    const uid = user?.uid
    if (!uid) return perspectiveFiltered
    const viewingOneTeammate =
      canViewAsOthers && adminTeamScope !== 'mine' && adminTeamScope !== 'all'
    if (viewingOneTeammate) return perspectiveFiltered
    return perspectiveFiltered.filter(
      (t) => !(t.createdBy === uid && t.assigneeId !== uid),
    )
  }, [perspectiveFiltered, user?.uid, canViewAsOthers, adminTeamScope])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return kanbanTaskSource
    return kanbanTaskSource.filter((t) => {
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
  }, [kanbanTaskSource, q, clientById, projectById, projectRowById])

  const openOnlyFiltered = useMemo(
    () => filtered.filter((t) => t.status !== 'done'),
    [filtered],
  )

  const byBucket = useMemo(() => {
    const map: Record<TimeBucket, Task[]> = {
      overdue: [],
      today: [],
      tomorrow: [],
      dayAfterTomorrow: [],
      weekRest: [],
    }
    for (const t of openOnlyFiltered) {
      const b = bucketFor(t, boardAnchor, anchorTomorrow, anchorDayAfterTomorrow)
      map[b].push(t)
    }
    for (const k of Object.keys(map) as TimeBucket[]) {
      map[k].sort(sortInBucket)
    }
    return map
  }, [openOnlyFiltered, boardAnchor, anchorTomorrow, anchorDayAfterTomorrow])

  const openCount = useMemo(
    () => filtered.filter((t) => t.status !== 'done').length,
    [filtered],
  )

  const onNewTask = useCallback(() => {
    if (!assigneeForNewTask) return
    openNewTaskDraft({
      assigneeId: assigneeForNewTask,
      dueDate: boardAnchor,
    })
  }, [assigneeForNewTask, boardAnchor, openNewTaskDraft])

  const errMsg = error?.message ?? null

  const adminBoardLabel = useMemo(() => {
    if (!canViewAsOthers) return ''
    if (adminTeamScope === 'all') return 'כל הצוות'
    const uid =
      adminTeamScope === 'mine' ? user?.uid ?? '' : adminTeamScope
    if (!uid) return ''
    return memberById.get(uid) ?? uid
  }, [canViewAsOthers, adminTeamScope, user?.uid, memberById])

  const sortedMembers = useMemo(
    () => [...teamMembers].sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [teamMembers],
  )

  const transferMemberOptions = useMemo(
    () =>
      sortedMembers
        .filter((m) => m.active !== false)
        .map((m) => ({ id: m.id, name: m.name })),
    [sortedMembers],
  )

  const bucketLabelForTask = useCallback(
    (t: Task) => {
      const key = bucketFor(t, boardAnchor, anchorTomorrow, anchorDayAfterTomorrow)
      return TIME_COLUMNS.find((c) => c.key === key)?.label ?? '—'
    },
    [boardAnchor, anchorTomorrow, anchorDayAfterTomorrow],
  )

  const setBoardView = useCallback((mode: TasksBoardViewMode) => {
    setBoardViewMode(mode)
    saveTasksBoardViewMode(mode)
  }, [])

  const boardSubtitle = canViewAsOthers
    ? adminTeamScope === 'all'
      ? `${openCount} פתוחות · תצוגת מנהל: כל הצוות · ${
          boardViewMode === 'table' ? 'טבלה מסודרת' : 'לוח לפי תאריך יעד'
        }`
      : `${openCount} פתוחות · תצוגת עובד: ${adminBoardLabel} · ${
          boardViewMode === 'table' ? 'טבלה מסודרת' : 'לוח לפי תאריך יעד'
        }`
    : `${openCount} פתוחות · התצוגה הפרטית שלך · ${
        boardViewMode === 'table' ? 'טבלה מסודרת' : 'לוח לפי תאריך יעד'
      }`

  const sentTasks = useMemo(
    () =>
      user?.uid
        ? tasks
            .filter((t) => t.createdBy === user.uid && t.assigneeId !== user.uid)
            .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
        : [],
    [tasks, user?.uid],
  )
  const completedByMe = useMemo(
    () =>
      user?.uid
        ? tasks
            .filter((t) => t.assigneeId === user.uid && t.status === 'done')
            .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
        : [],
    [tasks, user?.uid],
  )
  const myOpenTasks = useMemo(
    () =>
      user?.uid
        ? tasks
            .filter((t) => t.assigneeId === user.uid && t.status !== 'done')
            .sort(sortInBucket)
        : [],
    [tasks, user?.uid],
  )

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
          <ExportExcelButton
            onClick={() =>
              exportTasksToExcel({
                tasks: filtered,
                clientNameById: clientById,
                projectNameById: projectById,
                assigneeNameById: memberById,
                supplierNameById: supplierById,
              })
            }
            disabled={filtered.length === 0}
          />
          <div
            className="inline-flex rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--surface-muted)] p-0.5 shadow-sm"
            role="group"
            aria-label="מצב תצוגת לוח משימות"
          >
            <button
              type="button"
              onClick={() => setBoardView('kanban')}
              className={`rounded-[8px] px-3 py-2 text-[12px] font-bold transition ${
                boardViewMode === 'kanban'
                  ? 'bg-white text-[var(--orange)] shadow-sm'
                  : 'text-[var(--text-mid)] hover:text-[var(--text-dark)]'
              }`}
            >
              לוח לפי תאריך
            </button>
            <button
              type="button"
              onClick={() => setBoardView('table')}
              className={`rounded-[8px] px-3 py-2 text-[12px] font-bold transition ${
                boardViewMode === 'table'
                  ? 'bg-white text-[var(--orange)] shadow-sm'
                  : 'text-[var(--text-mid)] hover:text-[var(--text-dark)]'
              }`}
            >
              טבלה (אקסל)
            </button>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש…"
            className="w-full min-w-[180px] flex-1 rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2 text-[13px] text-[var(--text-dark)] placeholder:text-[var(--text-mid)] lg:w-64 lg:flex-none"
          />
          <button
            type="button"
            onClick={() => setMyOpenTasksOpen(true)}
            className="rounded-[10px] border border-[#FDE68A] bg-[#FFFBEB] px-4 py-2 text-[13px] font-bold text-[#B45309] shadow-sm transition hover:bg-[#FEF3C7]"
          >
            כל המשימות הפתוחות שלי ({myOpenTasks.length})
          </button>
          <button
            type="button"
            onClick={() => setSentTasksOpen(true)}
            className="rounded-[10px] border border-[#BFDBFE] bg-[var(--blue-light)] px-4 py-2 text-[13px] font-bold text-[var(--blue-dark)] shadow-sm transition hover:bg-[#DBEAFE]"
          >
            משימות ששלחתי ({sentTasks.length})
          </button>
          <button
            type="button"
            onClick={() => setCompletedByMeOpen(true)}
            className="rounded-[10px] border border-[#BBF7D0] bg-[#ECFDF5] px-4 py-2 text-[13px] font-bold text-[#15803D] shadow-sm transition hover:bg-[#D1FAE5]"
          >
            משימות שהושלמו על ידי ({completedByMe.length})
          </button>
          <button
            type="button"
            onClick={onNewTask}
            disabled={!assigneeForNewTask}
            className="rounded-[10px] bg-[var(--orange)] px-4 py-2 text-[13px] font-bold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + משימה חדשה
          </button>
          {canViewAsOthers ? (
            <button
              type="button"
              onClick={() => setRecurringModalOpen(true)}
              className="rounded-[10px] border border-[#C4B5FD] bg-[#F5F3FF] px-4 py-2 text-[13px] font-bold text-[#5B21B6] shadow-sm transition hover:bg-[#EDE9FE]"
            >
              משימה קבועה…
            </button>
          ) : null}
        </div>
      </div>

      {canViewAsOthers ? (
        <RecurringTaskModal
          isOpen={recurringModalOpen}
          onClose={() => setRecurringModalOpen(false)}
          teamMembers={teamMembers}
          defaultAssigneeId={assigneeForNewTask || defaultAssigneeId}
          onSave={async (values) =>
            addRecurringTemplateWithFirstTask({
              title: values.title,
              description: values.description,
              assigneeId: values.assigneeId,
              frequency: values.frequency,
              weeklyDayOfWeek: values.weeklyDayOfWeek,
              firstDueYmd: values.firstDueYmd,
              priority: values.priority,
            })
          }
        />
      ) : null}

      <div className={`grid gap-4 rounded-2xl ${hubSectionClass(0)} p-4 md:grid-cols-2`}>
        {canViewAsOthers ? (
          <div>
            <label
              htmlFor="tasks-view-as"
              className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]"
            >
              תצוגת משימות לפי עובד (מנהל מערכת)
            </label>
            <select
              id="tasks-view-as"
              value={
                adminTeamScope === 'mine'
                  ? '__mine__'
                  : adminTeamScope === 'all'
                    ? '__all__'
                    : adminTeamScope
              }
              onChange={(e) => {
                const v = e.target.value
                if (v === '__mine__') setAdminTeamScope('mine')
                else if (v === '__all__') setAdminTeamScope('all')
                else setAdminTeamScope(v)
              }}
              className="w-full max-w-md rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2 text-[13px] text-[var(--text-dark)]"
            >
              <option value="__mine__">המשימות שלי</option>
              <option value="__all__">כל הצוות</option>
              {sortedMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-[var(--text-light)]">
              ברירת מחדל: המשימות שהוקצו אליך. בחר «כל הצוות» כדי לראות את כל המשימות — לאחר מכן ניתן לבחור עובד ספציפי מהרשימה.
            </p>
          </div>
        ) : (
          <div className="text-[12px] text-[var(--text-mid)]">
            <span className="font-semibold text-[var(--text-dark)]">
              תצוגה פרטית לעובד.
            </span>{' '}
            בלוח מוצגות רק משימות שהוקצו אליך. משימות שפתחת לאחרים נמצאות ב«משימות ששלחתי». לא ניתן לצפות במשימות של שאר הצוות.
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
                className="rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-2 py-1.5 text-[13px] text-[var(--text-dark)]"
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
                className="rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-2 py-1.5 text-[13px] text-[var(--text-dark)]"
              />
            </label>
            <button
              type="button"
              onClick={() => setBoardAnchor(realToday)}
              className="rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--orange-light)] px-3 py-2 text-[12px] font-bold text-[var(--orange)] transition hover:bg-[var(--dash-panel-bg)]"
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
      ) : boardViewMode === 'table' ? (
        <TasksBoardTable
          tasks={openOnlyFiltered}
          bucketLabelFor={bucketLabelForTask}
          clientById={clientById}
          projectById={projectById}
          projectRowById={projectRowById}
          memberById={memberById}
          supplierById={supplierById}
          taskOpts={taskOpts}
          userUid={user?.uid ?? ''}
          canViewAsOthers={canViewAsOthers}
          transferMemberOptions={transferMemberOptions}
          onOpenDrawer={setDrawerTaskId}
          onUpdateTask={updateTask}
          onDeleteTask={deleteTask}
          onAddNote={addTaskNote}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {TIME_COLUMNS.map((col, colIdx) => {
            const list = byBucket[col.key]
            const targetDueDate =
              col.key === 'overdue'
                ? addDaysYmd(boardAnchor, -1)
                : col.key === 'today'
                  ? boardAnchor
                  : col.key === 'tomorrow'
                    ? anchorTomorrow
                    : col.key === 'dayAfterTomorrow'
                      ? anchorDayAfterTomorrow
                      : addDaysYmd(boardAnchor, 3)
            const columnTitle =
              col.key === 'today'
                ? `${col.label} (${formatDateIL(boardAnchor)})`
                : col.key === 'tomorrow'
                  ? `${col.label} (${formatDateIL(anchorTomorrow)})`
                : col.key === 'dayAfterTomorrow'
                  ? `${col.label} (${formatDateIL(anchorDayAfterTomorrow)})`
                  : col.key === 'overdue'
                    ? `${col.label} (לפני ${formatDateIL(boardAnchor)})`
                    : col.label
            return (
              <KanbanColumn
                key={col.key}
                columnDomId={col.key === 'overdue' ? 'tasks-kanban-overdue' : undefined}
                title={columnTitle}
                count={list.length}
                badgeColor={col.badgeColor}
                sectionSeq={colIdx + 1}
                canDrop={Boolean(dragTaskId) && dragOverCol === col.key}
                onDragEnterColumn={() => {
                  if (!dragTaskId) return
                  setDragOverCol(col.key)
                }}
                onDropTask={() => {
                  if (!dragTaskId) return
                  const task = tasks.find((t) => t.id === dragTaskId)
                  if (!task || task.status === 'done') return
                  const currentDue = dueYmd(task)
                  if (currentDue === targetDueDate) {
                    setDragTaskId(null)
                    setDragOverCol(null)
                    return
                  }
                  void updateTask(
                    dragTaskId,
                    { dueDate: targetDueDate },
                    taskOpts,
                  )
                  setDragTaskId(null)
                  setDragOverCol(null)
                }}
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
                  const supplierName =
                    supplierDisplayName(task.supplierId, supplierById) ?? null
                  const projectName = task.projectId
                    ? projectById.get(task.projectId) ?? null
                    : null
                  const assigneeLabel = task.assigneeId
                    ? memberById.get(task.assigneeId) ?? null
                    : null
                  const delegatorLabel =
                    task.assigneeId &&
                    task.createdBy &&
                    task.assigneeId !== task.createdBy
                      ? memberById.get(task.createdBy) ?? 'עובד'
                      : null
                  const uid = user?.uid ?? ''
                  const canTransferThis =
                    Boolean(uid) &&
                    task.status !== 'done' &&
                    (uid === task.assigneeId ||
                      uid === task.createdBy ||
                      canViewAsOthers)
                  return (
                    <div key={task.id} className="w-full">
                      <TaskCard
                        task={task}
                        clientName={clientName}
                        supplierName={supplierName}
                        projectName={projectName}
                        assigneeLabel={assigneeLabel}
                        delegatorLabel={delegatorLabel}
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
                        canTransferAssignee={canTransferThis}
                        assigneeOptions={transferMemberOptions}
                        onTransferAssignee={(newAssigneeId) => {
                          if (newAssigneeId === task.assigneeId) return
                          void updateTask(
                            task.id,
                            { assigneeId: newAssigneeId },
                            taskOpts,
                          )
                        }}
                        onDragStart={(taskId) => {
                          setDragTaskId(taskId)
                          setDragOverCol(col.key)
                        }}
                        onDragEnd={() => {
                          setDragTaskId(null)
                          setDragOverCol(null)
                        }}
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
        <div className="hub-empty-dashed rounded-[14px] p-8 text-center text-[13px] text-[var(--text-mid)]">
          אין משימות להצגה.
        </div>
      ) : null}

      <Modal
        isOpen={myOpenTasksOpen}
        onClose={() => setMyOpenTasksOpen(false)}
        title="כל המשימות הפתוחות שלי"
        size="lg"
      >
        <div className="space-y-3">
          {myOpenTasks.length === 0 ? (
            <p className="text-sm text-[var(--text-mid)]">אין לך כרגע משימות פתוחות.</p>
          ) : (
            <SentTasksSection
              title="פתוחות"
              tasks={myOpenTasks}
              memberById={memberById}
              projectById={projectById}
              clientById={clientById}
              onOpenTask={(taskId) => {
                setMyOpenTasksOpen(false)
                setDrawerTaskId(taskId)
              }}
            />
          )}
        </div>
      </Modal>

      <Modal
        isOpen={sentTasksOpen}
        onClose={() => setSentTasksOpen(false)}
        title="משימות ששלחתי לעובדים"
        size="lg"
      >
        <div className="space-y-3">
          {sentTasks.length === 0 ? (
            <p className="text-sm text-[var(--text-mid)]">עדיין לא שלחת משימות לעובדים אחרים.</p>
          ) : (
            <div className="space-y-4">
              <SentTasksSection
                title="משימות ששלחתי"
                tasks={sentTasks}
                memberById={memberById}
                projectById={projectById}
                clientById={clientById}
                onOpenTask={(taskId) => {
                  setSentTasksOpen(false)
                  setDrawerTaskId(taskId)
                }}
              />
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={completedByMeOpen}
        onClose={() => setCompletedByMeOpen(false)}
        title="משימות שהושלמו על ידי"
        size="lg"
      >
        <div className="space-y-3">
          {completedByMe.length === 0 ? (
            <p className="text-sm text-[var(--text-mid)]">אין משימות שהשלמת עדיין.</p>
          ) : (
            <SentTasksSection
              title="הושלמו"
              tasks={completedByMe}
              memberById={memberById}
              projectById={projectById}
              clientById={clientById}
              onOpenTask={(taskId) => {
                setCompletedByMeOpen(false)
                setDrawerTaskId(taskId)
              }}
            />
          )}
        </div>
      </Modal>
    </div>
  )
}

function SentTasksSection({
  title,
  tasks,
  memberById,
  projectById,
  clientById,
  onOpenTask,
}: {
  title: string
  tasks: Task[]
  memberById: Map<string, string>
  projectById: Map<string, string>
  clientById: Map<string, string>
  onOpenTask: (taskId: string) => void
}) {
  return (
    <section className={`overflow-hidden rounded-2xl ${hubSectionClass(0)} shadow-none`}>
      <div className="flex items-center justify-between border-b border-[rgba(249,115,22,0.2)] bg-[var(--surface-muted)] px-3 py-2">
        <h3 className="text-[12px] font-bold text-[var(--text-dark)]">{title}</h3>
        <span className="rounded-full bg-[var(--dash-panel-bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-mid)]">
          {tasks.length}
        </span>
      </div>
      {tasks.length === 0 ? (
        <p className="px-3 py-3 text-xs text-[var(--text-light)]">אין משימות בקטגוריה זו.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-[11px] font-bold text-[var(--text-light)]">
                <th className="px-3 py-2">משימה</th>
                <th className="px-3 py-2">לקוח</th>
                <th className="px-3 py-2">פרויקט</th>
                <th className="px-3 py-2">נשלחה ל</th>
                <th className="px-3 py-2">סטטוס</th>
                <th className="px-3 py-2">תאריך יעד</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr
                  key={t.id}
                  className="cursor-pointer border-t border-[rgba(249,115,22,0.15)] transition hover:bg-[var(--surface-muted)]"
                  onClick={() => onOpenTask(t.id)}
                >
                  <td className="px-3 py-2 font-semibold text-[var(--text-dark)]">{t.title}</td>
                  <td className="px-3 py-2 text-[var(--text-mid)]">
                    {t.clientId ? clientById.get(t.clientId) ?? '—' : '—'}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-mid)]">
                    {t.projectId ? projectById.get(t.projectId) ?? '—' : '—'}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-mid)]">
                    {memberById.get(t.assigneeId) ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusBadgeClass[t.status]}`}>
                      {boardStatusHe(t.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[var(--text-mid)]">{formatTaskDueDisplay(t.dueDate, t.dueTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
