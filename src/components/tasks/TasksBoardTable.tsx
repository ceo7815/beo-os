import { useMemo, useState } from 'react'
import { supplierDisplayName } from '../../lib/supplierDisplay'
import type { Project, Task, TaskStatus } from '../../types'

type MemberOption = { id: string; name: string }

type TaskOpts = {
  memberNameById: (id: string) => string
  projectNameById: (id: string) => string
  supplierNameById: (id: string) => string
  clientNameById: (id: string) => string
}

type Props = {
  tasks: Task[]
  bucketLabelFor: (task: Task) => string
  clientById: Map<string, string>
  projectById: Map<string, string>
  projectRowById: Map<string, Project>
  memberById: Map<string, string>
  supplierById: Map<string, string>
  taskOpts: TaskOpts
  userUid: string
  canViewAsOthers: boolean
  transferMemberOptions: MemberOption[]
  onOpenDrawer: (taskId: string) => void
  onUpdateTask: (
    taskId: string,
    patch: Partial<Task> & Record<string, unknown>,
    opts: TaskOpts,
  ) => void | Promise<void>
  onDeleteTask: (taskId: string) => void | Promise<void>
  onAddNote: (taskId: string, text: string) => Promise<void>
}

function dueYmd(t: Task): string {
  return (t.dueDate || '').slice(0, 10)
}

function lastNotePreview(task: Task): string {
  const notes = task.manualNotes ?? []
  if (notes.length === 0) return ''
  const sorted = [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return sorted[0]?.text?.trim() ?? ''
}

function sortTasksForTable(a: Task, b: Task): number {
  const da = dueYmd(a)
  const db = dueYmd(b)
  const pa = da && /^\d{4}-\d{2}-\d{2}$/.test(da) ? da : '9999-99-99'
  const pb = db && /^\d{4}-\d{2}-\d{2}$/.test(db) ? db : '9999-99-99'
  if (pa !== pb) return pa.localeCompare(pb)
  const prA = a.priority === 'high' ? 0 : a.priority === 'medium' ? 1 : 2
  const prB = b.priority === 'high' ? 0 : b.priority === 'medium' ? 1 : 2
  if (prA !== prB) return prA - prB
  return a.title.localeCompare(b.title, 'he')
}

export function TasksBoardTable({
  tasks,
  bucketLabelFor,
  clientById,
  projectById,
  projectRowById,
  memberById,
  supplierById,
  taskOpts,
  userUid,
  canViewAsOthers,
  transferMemberOptions,
  onOpenDrawer,
  onUpdateTask,
  onDeleteTask,
  onAddNote,
}: Props) {
  const sorted = useMemo(() => [...tasks].sort(sortTasksForTable), [tasks])
  const [noteDraftById, setNoteDraftById] = useState<Record<string, string>>({})

  if (sorted.length === 0) {
    return (
      <div className="hub-empty-dashed rounded-[14px] p-8 text-center text-[13px] text-[var(--text-mid)]">
        אין משימות פתוחות להצגה בטבלה.
      </div>
    )
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.06)]`}
    >
      <div className="max-h-[min(72vh,900px)] overflow-auto">
        <table className="w-full min-w-[1200px] border-collapse text-sm" dir="rtl">
          <thead className="sticky top-0 z-10 bg-[var(--surface-muted)] shadow-[0_1px_0_var(--border)]">
            <tr className="text-right text-[11px] font-bold text-[var(--text-light)]">
              <th className="border-b border-[var(--border)] px-2 py-2.5">תאריך יעד</th>
              <th className="border-b border-[var(--border)] px-2 py-2.5">מועד בלוח</th>
              <th className="border-b border-[var(--border)] px-2 py-2.5">כותרת</th>
              <th className="border-b border-[var(--border)] px-2 py-2.5">לקוח / פרויקט</th>
              <th className="border-b border-[var(--border)] px-2 py-2.5">אחראי</th>
              <th className="border-b border-[var(--border)] px-2 py-2.5">סטטוס</th>
              <th className="border-b border-[var(--border)] px-2 py-2.5">עדיפות</th>
              <th className="border-b border-[var(--border)] px-2 py-2.5 min-w-[200px]">תיאור</th>
              <th className="border-b border-[var(--border)] px-2 py-2.5 min-w-[180px]">עדכון שוטף</th>
              <th className="border-b border-[var(--border)] px-2 py-2.5 w-[11rem]">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((task, rowIdx) => {
              const projectRow = task.projectId
                ? projectRowById.get(task.projectId)
                : undefined
              const clientName = task.clientId
                ? (clientById.get(task.clientId) ?? '—')
                : projectRow?.type === 'internal'
                  ? 'פנימי'
                  : projectRow?.clientId
                    ? (clientById.get(projectRow.clientId) ?? '—')
                    : '—'
              const projectName = task.projectId
                ? (projectById.get(task.projectId) ?? '')
                : ''
              const supplierName =
                supplierDisplayName(task.supplierId, supplierById) ?? ''
              const assigneeName = memberById.get(task.assigneeId) ?? '—'
              const notePreview = lastNotePreview(task)
              const canTransfer =
                Boolean(userUid) &&
                (userUid === task.assigneeId ||
                  userUid === task.createdBy ||
                  canViewAsOthers) &&
                transferMemberOptions.some((o) => o.id !== task.assigneeId)
              const rowBg =
                rowIdx % 2 === 0 ? 'bg-white' : 'bg-[#FFFBF7]/80'

              return (
                <tr
                  key={task.id}
                  className={`border-b border-[var(--border)]/80 ${rowBg} align-top hover:bg-[var(--orange-light)]/25`}
                >
                  <td className="px-2 py-2 whitespace-nowrap">
                    <input
                      type="date"
                      value={
                        /^\d{4}-\d{2}-\d{2}$/.test(dueYmd(task)) ? dueYmd(task) : ''
                      }
                      onChange={(e) => {
                        const ymd = e.target.value
                        if (!ymd || ymd === dueYmd(task)) return
                        void onUpdateTask(task.id, { dueDate: ymd }, taskOpts)
                      }}
                      className="w-[9.5rem] rounded-md border border-[var(--border-orange-soft)] bg-white px-1.5 py-1 text-[11px]"
                    />
                    {task.dueTime ? (
                      <div className="mt-0.5 text-[10px] text-[var(--text-mid)]" dir="ltr">
                        {task.dueTime}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-[11px] font-semibold text-[var(--text-mid)] whitespace-nowrap">
                    {bucketLabelFor(task)}
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => onOpenDrawer(task.id)}
                      className="text-right text-[13px] font-bold text-[var(--text-dark)] hover:text-[var(--orange)] hover:underline"
                    >
                      {task.title}
                    </button>
                    {task.createdBy && task.assigneeId !== task.createdBy ? (
                      <p className="mt-0.5 text-[10px] text-[#2563EB]">
                        הופנתה על ידי {memberById.get(task.createdBy) ?? 'עובד'}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-[11px] text-[var(--text-mid)]">
                    <div className="font-semibold text-[var(--text-dark)]">{clientName}</div>
                    {projectName ? <div>פרויקט · {projectName}</div> : null}
                    {supplierName ? <div>ספק · {supplierName}</div> : null}
                  </td>
                  <td className="px-2 py-2 text-[11px] text-[var(--text-mid)]">{assigneeName}</td>
                  <td className="px-2 py-2">
                    <select
                      value={task.status}
                      onChange={(e) => {
                        const s = e.target.value as TaskStatus
                        if (s === task.status) return
                        void onUpdateTask(task.id, { status: s }, taskOpts)
                      }}
                      className="w-full min-w-[6.5rem] rounded-md border border-[var(--border-orange-soft)] bg-white px-1.5 py-1 text-[11px]"
                    >
                      <option value="todo">לביצוע</option>
                      <option value="doing">בעבודה</option>
                      <option value="blocked">חסום</option>
                      <option value="done">הושלם</option>
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={task.priority}
                      onChange={(e) => {
                        const p = e.target.value as Task['priority']
                        if (p === task.priority) return
                        void onUpdateTask(task.id, { priority: p }, taskOpts)
                      }}
                      className="w-full min-w-[5.5rem] rounded-md border border-[var(--border-orange-soft)] bg-white px-1.5 py-1 text-[11px]"
                    >
                      <option value="high">גבוהה</option>
                      <option value="medium">בינונית</option>
                      <option value="low">נמוכה</option>
                    </select>
                  </td>
                  <td className="px-2 py-2 text-[11px] leading-relaxed text-[var(--text-dark)] max-w-[280px]">
                    {task.description?.trim() ? (
                      <p className="line-clamp-3 whitespace-pre-wrap">{task.description.trim()}</p>
                    ) : (
                      <span className="text-[var(--text-light)]">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 max-w-[220px]">
                    {notePreview ? (
                      <p className="mb-1 line-clamp-2 text-[10px] leading-snug text-[var(--text-mid)]">
                        {notePreview}
                      </p>
                    ) : (
                      <p className="mb-1 text-[10px] text-[var(--text-light)]">אין עדכון</p>
                    )}
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={noteDraftById[task.id] ?? ''}
                        onChange={(e) =>
                          setNoteDraftById((p) => ({ ...p, [task.id]: e.target.value }))
                        }
                        placeholder="עדכון מהיר…"
                        className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white px-1.5 py-1 text-[10px]"
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return
                          const text = (noteDraftById[task.id] ?? '').trim()
                          if (!text) return
                          void onAddNote(task.id, text).then(() => {
                            setNoteDraftById((p) => ({ ...p, [task.id]: '' }))
                          })
                        }}
                      />
                      <button
                        type="button"
                        disabled={!(noteDraftById[task.id] ?? '').trim()}
                        onClick={() => {
                          const text = (noteDraftById[task.id] ?? '').trim()
                          if (!text) return
                          void onAddNote(task.id, text).then(() => {
                            setNoteDraftById((p) => ({ ...p, [task.id]: '' }))
                          })
                        }}
                        className="shrink-0 rounded-md bg-[var(--orange)] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                      >
                        שלח
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          void onUpdateTask(task.id, { status: 'done' }, taskOpts)
                        }
                        className="rounded-md border border-[#BBF7D0] bg-[#ECFDF5] px-2 py-1 text-[10px] font-bold text-[#15803D] hover:bg-[#D1FAE5]"
                      >
                        סיים
                      </button>
                      {canTransfer ? (
                        <select
                          className="rounded-md border border-[#BFDBFE] bg-[#EFF6FF] px-1.5 py-1 text-[10px] font-bold text-[#1D4ED8]"
                          value=""
                          onChange={(e) => {
                            const id = e.target.value
                            if (!id || id === task.assigneeId) return
                            void onUpdateTask(task.id, { assigneeId: id }, taskOpts)
                            e.target.value = ''
                          }}
                        >
                          <option value="">העבר לעובד…</option>
                          {transferMemberOptions
                            .filter((o) => o.id !== task.assigneeId)
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                        </select>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            !window.confirm('למחוק את המשימה? הפעולה בלתי הפיכה.')
                          )
                            return
                          void onDeleteTask(task.id)
                        }}
                        className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-100"
                      >
                        מחק
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[11px] text-[var(--text-mid)]">
        {sorted.length} משימות פתוחות · ממוין לפי תאריך יעד ועדיפות
      </p>
    </div>
  )
}
