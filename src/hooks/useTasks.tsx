import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  addDaysYmd,
  formatTaskDueDisplay,
  nextWeeklyYmdAfter,
  todayYmd,
} from '../lib/dates'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseConfigured } from '../lib/backend'
import { requireSupabase } from '../lib/supabase'
import { subscribeTable, uuidList, uuidOrNull } from '../lib/sbLive'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import { requestAssigneeTaskEmail } from '../lib/taskAssignmentEmail'
import { boardStatusHe, priorityHe } from '../lib/boardTaskLabels'
import { logActivity } from '../utils/activityLogger'
import type {
  Priority,
  Task,
  TaskActivity,
  TaskNote,
  TaskRecurrence,
  TaskStatus,
} from '../types'
import {
  NEW_TASK_DRAWER_ID,
  type NewTaskDraftSeed,
} from '../lib/taskDrawerIds'

type TasksContextValue = {
  tasks: Task[]
  loading: boolean
  error: Error | null
  drawerTaskId: string | null
  newTaskDraftSeed: NewTaskDraftSeed | null
  setDrawerTaskId: (id: string | null) => void
  openNewTaskDraft: (seed: NewTaskDraftSeed) => void
  quickSliderOpen: boolean
  setQuickSliderOpen: (open: boolean) => void
  addTask: (
    data: Omit<Task, 'id' | 'createdAt' | 'activity' | 'createdBy' | 'manualNotes'>,
    options?: { quiet?: boolean },
  ) => Promise<string | null>
  addTaskNote: (taskId: string, text: string) => Promise<void>
  updateTask: (
    id: string,
    patch: Partial<Task>,
    opts?: {
      memberNameById?: (id: string) => string
      projectNameById?: (id: string) => string
      supplierNameById?: (id: string) => string
      clientNameById?: (id: string) => string
    },
  ) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  cycleStatus: (id: string) => Promise<void>
  toggleQuickDone: (taskId: string, checked: boolean) => Promise<void>
  addRecurringTemplateWithFirstTask: (args: {
    title: string
    description: string
    assigneeId: string
    frequency: TaskRecurrence
    weeklyDayOfWeek?: number
    firstDueYmd: string
    priority: Priority
    clientId?: string
    projectId?: string
    supplierId?: string
  }) => Promise<boolean>
}

const TasksContext = createContext<TasksContextValue | null>(null)

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    status: (row.status as TaskStatus) || 'todo',
    priority: (row.priority as Priority) || 'medium',
    assigneeId: row.assignee_id ? String(row.assignee_id) : '',
    clientId: row.client_id ? String(row.client_id) : undefined,
    projectId: row.project_id ? String(row.project_id) : undefined,
    supplierId: row.supplier_id ? String(row.supplier_id) : undefined,
    dueDate: row.due_date ? String(row.due_date) : '',
    dueTime: typeof row.due_time === 'string' && row.due_time.trim() ? row.due_time : undefined,
    reminderDate: row.reminder_date ? String(row.reminder_date) : undefined,
    tags: Array.isArray(row.tags) ? row.tags.map((t) => String(t)) : [],
    reminders: Array.isArray(row.reminders)
      ? (row.reminders as Task['reminders'])
      : [],
    createdAt: row.created_at
      ? new Date(String(row.created_at)).toISOString()
      : new Date().toISOString(),
    createdBy: row.created_by ? String(row.created_by) : '',
    sharedWithUserIds: Array.isArray(row.shared_with_user_ids)
      ? row.shared_with_user_ids.map((id) => String(id))
      : [],
    teamWideShared: Boolean(row.team_wide_shared),
    activity: [],
    manualNotes: [],
    recurringTemplateId: row.recurring_template_id
      ? String(row.recurring_template_id)
      : undefined,
    recurringFrequency: (row.recurring_frequency as TaskRecurrence) || undefined,
  }
}

function taskPatchToRow(patch: Partial<Task>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.title !== undefined) out.title = patch.title
  if (patch.description !== undefined) out.description = patch.description ?? ''
  if (patch.status !== undefined) out.status = patch.status
  if (patch.priority !== undefined) out.priority = patch.priority
  if ('assigneeId' in patch) out.assignee_id = uuidOrNull(patch.assigneeId)
  if ('clientId' in patch) out.client_id = uuidOrNull(patch.clientId)
  if ('projectId' in patch) out.project_id = uuidOrNull(patch.projectId)
  if ('supplierId' in patch) out.supplier_id = uuidOrNull(patch.supplierId)
  if (patch.dueDate !== undefined) out.due_date = patch.dueDate || null
  if ('dueTime' in patch) out.due_time = patch.dueTime?.trim() || null
  if ('reminderDate' in patch) out.reminder_date = patch.reminderDate || null
  if (patch.tags !== undefined) out.tags = patch.tags ?? []
  if (patch.reminders !== undefined) out.reminders = patch.reminders ?? []
  if (patch.sharedWithUserIds !== undefined) {
    out.shared_with_user_ids = uuidList(patch.sharedWithUserIds)
    out.team_wide_shared = false
  }
  if (patch.teamWideShared !== undefined) out.team_wide_shared = patch.teamWideShared
  if ('recurringTemplateId' in patch) {
    out.recurring_template_id = uuidOrNull(patch.recurringTemplateId)
  }
  if ('recurringFrequency' in patch) {
    out.recurring_frequency = patch.recurringFrequency || null
  }
  return out
}

function shareTargetsSignature(t: Task): string {
  const tw = t.teamWideShared ? '1' : '0'
  const ids = [...t.sharedWithUserIds].sort().join('|')
  return `${tw}:${ids}`
}

function collectActivityStrings(
  prev: Task,
  merged: Task,
  taskId: string,
  userId: string,
  userName: string,
  opts?: {
    memberNameById?: (id: string) => string
    projectNameById?: (id: string) => string
    supplierNameById?: (id: string) => string
    clientNameById?: (id: string) => string
  },
): string[] {
  const out: string[] = []
  const memberName = opts?.memberNameById ?? (() => '')
  const projectName = opts?.projectNameById ?? (() => '')
  const supplierName = opts?.supplierNameById ?? ((id: string) => id)
  const resolveClientName = opts?.clientNameById ?? ((id: string) => id)

  if (merged.title !== prev.title) {
    out.push(logActivity(taskId, userId, userName, 'title_updated').action)
  }
  if (merged.description !== prev.description) {
    out.push(logActivity(taskId, userId, userName, 'description_updated').action)
  }
  if (merged.status !== prev.status) {
    out.push(
      logActivity(
        taskId,
        userId,
        userName,
        'status_changed',
        boardStatusHe(prev.status),
        boardStatusHe(merged.status),
      ).action,
    )
  }
  if (shareTargetsSignature(merged) !== shareTargetsSignature(prev)) {
    out.push(logActivity(taskId, userId, userName, 'shared_targets_updated').action)
  }
  if (merged.priority !== prev.priority) {
    out.push(
      logActivity(
        taskId,
        userId,
        userName,
        'priority_changed',
        priorityHe(merged.priority),
      ).action,
    )
  }
  if (merged.assigneeId !== prev.assigneeId) {
    out.push(
      logActivity(
        taskId,
        userId,
        userName,
        'assigned',
        memberName(merged.assigneeId) || merged.assigneeId,
      ).action,
    )
  }
  const prevDueLabel = formatTaskDueDisplay(prev.dueDate, prev.dueTime) || 'לא צוין'
  const mergedDueLabel = formatTaskDueDisplay(merged.dueDate, merged.dueTime) || 'לא צוין'
  if (mergedDueLabel !== prevDueLabel) {
    out.push(logActivity(taskId, userId, userName, 'due_changed', mergedDueLabel).action)
  }
  const prevS = prev.supplierId || undefined
  const nextS = merged.supplierId || undefined
  if (nextS !== prevS) {
    if (nextS && !prevS) {
      out.push(logActivity(taskId, userId, userName, 'supplier_added', supplierName(nextS)).action)
    } else if (!nextS && prevS) {
      out.push(logActivity(taskId, userId, userName, 'supplier_removed', supplierName(prevS)).action)
    } else if (nextS && prevS) {
      out.push(logActivity(taskId, userId, userName, 'supplier_removed', supplierName(prevS)).action)
      out.push(logActivity(taskId, userId, userName, 'supplier_added', supplierName(nextS)).action)
    }
  }
  const prevP = prev.projectId?.trim() || undefined
  const nextP = merged.projectId?.trim() || undefined
  if (nextP !== prevP) {
    if (nextP) {
      out.push(
        logActivity(taskId, userId, userName, 'project_set', projectName(nextP) || nextP).action,
      )
    } else {
      out.push(logActivity(taskId, userId, userName, 'project_cleared').action)
    }
  }
  const prevCid = prev.clientId?.trim() || undefined
  const nextCid = merged.clientId?.trim() || undefined
  if (nextCid !== prevCid) {
    if (nextCid) {
      out.push(
        logActivity(
          taskId,
          userId,
          userName,
          'client_set',
          resolveClientName(nextCid) || nextCid,
        ).action,
      )
    } else {
      out.push(logActivity(taskId, userId, userName, 'client_cleared').action)
    }
  }
  const prevTags = new Set(prev.tags)
  const nextTags = new Set(merged.tags)
  for (const t of merged.tags) {
    if (!prevTags.has(t)) out.push(logActivity(taskId, userId, userName, 'tag_added', t).action)
  }
  for (const t of prev.tags) {
    if (!nextTags.has(t)) out.push(logActivity(taskId, userId, userName, 'tag_removed', t).action)
  }
  return out
}

async function spawnNextRecurringAfterCompletion(
  completed: Task,
  uid: string,
  uname: string,
  setRawTasks: (fn: (prev: Task[]) => Task[]) => void,
): Promise<void> {
  const tid = completed.recurringTemplateId
  if (!tid) return
  try {
    const sb = requireSupabase()
    const { data: tmpl, error: tErr } = await sb
      .from('recurring_task_templates')
      .select('*')
      .eq('id', tid)
      .maybeSingle()
    if (tErr) throw tErr
    if (!tmpl || tmpl.active === false) return

    const freq: TaskRecurrence = tmpl.frequency === 'weekly' ? 'weekly' : 'daily'
    const nextDue =
      freq === 'daily'
        ? addDaysYmd(todayYmd(), 1)
        : nextWeeklyYmdAfter(
            todayYmd(),
            typeof tmpl.weekly_day_of_week === 'number' &&
              tmpl.weekly_day_of_week >= 0 &&
              tmpl.weekly_day_of_week <= 6
              ? tmpl.weekly_day_of_week
              : 0,
          )

    const { data: created, error: qErr } = await sb
      .from('tasks')
      .insert({
        title: String(tmpl.title ?? ''),
        description: String(tmpl.description ?? ''),
        status: 'todo',
        priority: tmpl.priority ?? 'medium',
        assignee_id: uuidOrNull(String(tmpl.assignee_id ?? '')),
        client_id: uuidOrNull(tmpl.client_id ? String(tmpl.client_id) : undefined),
        project_id: uuidOrNull(tmpl.project_id ? String(tmpl.project_id) : undefined),
        supplier_id: uuidOrNull(tmpl.supplier_id ? String(tmpl.supplier_id) : undefined),
        due_date: nextDue,
        tags: Array.isArray(tmpl.tags) ? tmpl.tags : [],
        reminders: [],
        shared_with_user_ids: [],
        team_wide_shared: false,
        recurring_template_id: tid,
        recurring_frequency: freq,
        created_by: uid,
      })
      .select('*')
      .single()
    if (qErr) throw qErr
    const optimistic = rowToTask(created as Record<string, unknown>)
    await sb.from('task_activity').insert({
      task_id: optimistic.id,
      user_id: uid,
      user_name: uname,
      action: `${logActivity(optimistic.id, uid, uname, 'created').action} · משימה קבועה`,
    })
    setRawTasks((prev) => (prev.some((t) => t.id === optimistic.id) ? prev : [...prev, optimistic]))
    if (optimistic.assigneeId && optimistic.assigneeId !== uid) {
      requestAssigneeTaskEmail(optimistic.id)
    }
    toastFsSuccess(freq === 'daily' ? 'נוצרה משימת המשך למחר' : 'נוצרה משימת המשך לשבוע הבא')
  } catch (e) {
    toastFsError('שגיאה ביצירת משימת המשך הקבועה', e, 'spawnRecurring')
  }
}

export function TasksProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [rawTasks, setRawTasks] = useState<Task[]>([])
  const [activityByTaskId, setActivityByTaskId] = useState<Record<string, TaskActivity[]>>({})
  const [notesByTaskId, setNotesByTaskId] = useState<Record<string, TaskNote[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [drawerTaskId, setDrawerTaskIdInner] = useState<string | null>(null)
  const [newTaskDraftSeed, setNewTaskDraftSeed] = useState<NewTaskDraftSeed | null>(null)
  const [quickSliderOpen, setQuickSliderOpen] = useState(false)
  const tasksRef = useRef<Task[]>([])

  const setDrawerTaskId = useCallback((id: string | null) => {
    setDrawerTaskIdInner(id)
    if (id === null || id !== NEW_TASK_DRAWER_ID) {
      setNewTaskDraftSeed(null)
    }
  }, [])

  const openNewTaskDraft = useCallback((seed: NewTaskDraftSeed) => {
    setNewTaskDraftSeed(seed)
    setDrawerTaskIdInner(NEW_TASK_DRAWER_ID)
  }, [])

  const tasks = useMemo(() => {
    return rawTasks.map((t) => ({
      ...t,
      activity: activityByTaskId[t.id] ?? t.activity ?? [],
      manualNotes: notesByTaskId[t.id] ?? t.manualNotes ?? [],
    }))
  }, [rawTasks, activityByTaskId, notesByTaskId])

  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  useEffect(() => {
    if (!user) {
      setRawTasks([])
      setActivityByTaskId({})
      setNotesByTaskId({})
      setLoading(false)
      setError(null)
      return
    }
    if (!isSupabaseConfigured()) {
      setLoading(false)
      return
    }
    setLoading(true)
    const unsubTasks = subscribeTable(
      'tasks',
      (rows) => {
        setRawTasks(rows.map(rowToTask))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('tasks', err)
        toastFsError('שגיאה בטעינת משימות', err, 'tasks')
        setError(err)
        setLoading(false)
      },
    )
    const unsubActivity = subscribeTable(
      'task_activity',
      (rows) => {
        const map: Record<string, TaskActivity[]> = {}
        for (const row of rows) {
          const taskId = String(row.task_id ?? '')
          if (!taskId) continue
          const item: TaskActivity = {
            id: String(row.id),
            taskId,
            userId: row.user_id ? String(row.user_id) : '',
            userName: String(row.user_name ?? ''),
            action: String(row.action ?? ''),
            timestamp: row.created_at
              ? new Date(String(row.created_at)).toISOString()
              : new Date().toISOString(),
          }
          if (!map[taskId]) map[taskId] = []
          map[taskId].push(item)
        }
        for (const list of Object.values(map)) {
          list.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        }
        setActivityByTaskId(map)
      },
      (err) => console.error('task_activity', err),
    )
    const unsubNotes = subscribeTable(
      'task_notes',
      (rows) => {
        const map: Record<string, TaskNote[]> = {}
        for (const row of rows) {
          const taskId = String(row.task_id ?? '')
          if (!taskId) continue
          const item: TaskNote = {
            id: String(row.id),
            taskId,
            userId: row.user_id ? String(row.user_id) : '',
            userName: String(row.user_name ?? ''),
            text: String(row.text ?? ''),
            createdAt: row.created_at
              ? new Date(String(row.created_at)).toISOString()
              : new Date().toISOString(),
          }
          if (!map[taskId]) map[taskId] = []
          map[taskId].push(item)
        }
        for (const list of Object.values(map)) {
          list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        }
        setNotesByTaskId(map)
      },
      (err) => console.error('task_notes', err),
    )
    return () => {
      unsubTasks()
      unsubActivity()
      unsubNotes()
    }
  }, [user])

  const displayName = useCallback(() => {
    const u = user
    if (!u) return 'משתמש'
    return u.displayName?.trim() || u.email?.split('@')[0] || 'משתמש'
  }, [user])

  const addTask = useCallback(
    async (
      data: Omit<Task, 'id' | 'createdAt' | 'activity' | 'createdBy' | 'manualNotes'>,
      options?: { quiet?: boolean },
    ) => {
      if (!user) {
        toastFsError('יש להתחבר כדי ליצור משימה', new Error('no user'), 'addTask')
        return null
      }
      const uid = user.uid
      const uname = displayName()
      try {
        const sb = requireSupabase()
        const { data: created, error: qErr } = await sb
          .from('tasks')
          .insert({
            title: data.title,
            description: data.description ?? '',
            status: data.status ?? 'todo',
            priority: data.priority ?? 'medium',
            assignee_id: uuidOrNull(data.assigneeId),
            client_id: uuidOrNull(data.clientId),
            project_id: uuidOrNull(data.projectId),
            supplier_id: uuidOrNull(data.supplierId),
            due_date: data.dueDate || null,
            due_time: data.dueTime?.trim() || null,
            reminder_date: data.reminderDate || null,
            tags: data.tags ?? [],
            reminders: data.reminders ?? [],
            shared_with_user_ids: uuidList(data.sharedWithUserIds),
            team_wide_shared: false,
            recurring_template_id: uuidOrNull(data.recurringTemplateId),
            recurring_frequency: data.recurringFrequency || null,
            created_by: uid,
          })
          .select('*')
          .single()
        if (qErr) throw qErr
        const optimistic = rowToTask(created as Record<string, unknown>)
        const entry = logActivity(optimistic.id, uid, uname, 'created')
        await sb.from('task_activity').insert({
          task_id: optimistic.id,
          user_id: uid,
          user_name: uname,
          action: entry.action,
        })
        setRawTasks((prev) =>
          prev.some((t) => t.id === optimistic.id) ? prev : [...prev, optimistic],
        )
        if (!options?.quiet) toastFsSuccess('המשימה נוספה')
        if (optimistic.assigneeId && optimistic.assigneeId !== uid) {
          requestAssigneeTaskEmail(optimistic.id)
        }
        return optimistic.id
      } catch (e) {
        toastFsError('שגיאה בשמירת המשימה', e, 'addTask')
        return null
      }
    },
    [user, displayName],
  )

  const addRecurringTemplateWithFirstTask = useCallback(
    async (args: {
      title: string
      description: string
      assigneeId: string
      frequency: TaskRecurrence
      weeklyDayOfWeek?: number
      firstDueYmd: string
      priority: Priority
      clientId?: string
      projectId?: string
      supplierId?: string
    }) => {
      if (!user) {
        toastFsError('יש להתחבר', new Error('no user'), 'addRecurringTemplate')
        return false
      }
      const uid = user.uid
      const sb = requireSupabase()
      let templateId: string | null = null
      try {
        const { data: tmpl, error: tErr } = await sb
          .from('recurring_task_templates')
          .insert({
            title: args.title.trim(),
            description: args.description.trim(),
            assignee_id: uuidOrNull(args.assigneeId),
            frequency: args.frequency,
            weekly_day_of_week:
              args.frequency === 'weekly' ? args.weeklyDayOfWeek ?? null : null,
            priority: args.priority,
            client_id: uuidOrNull(args.clientId),
            project_id: uuidOrNull(args.projectId),
            supplier_id: uuidOrNull(args.supplierId),
            tags: [],
            active: true,
            created_by: uid,
          })
          .select('id')
          .single()
        if (tErr) throw tErr
        templateId = String(tmpl.id)
        const taskId = await addTask(
          {
            title: args.title.trim(),
            description: args.description.trim(),
            status: 'todo',
            priority: args.priority,
            assigneeId: args.assigneeId,
            clientId: args.clientId,
            projectId: args.projectId,
            supplierId: args.supplierId,
            dueDate: args.firstDueYmd,
            tags: [],
            reminders: [],
            sharedWithUserIds: [],
            recurringTemplateId: templateId,
            recurringFrequency: args.frequency,
          },
          { quiet: true },
        )
        if (!taskId) {
          await sb.from('recurring_task_templates').delete().eq('id', templateId)
          return false
        }
        toastFsSuccess('הוגדרה משימה קבועה והמשימה הראשונה נוספה ללוח')
        return true
      } catch (e) {
        if (templateId) {
          try {
            await sb.from('recurring_task_templates').delete().eq('id', templateId)
          } catch {
            /* ניקוי עזר */
          }
        }
        toastFsError('שגיאה בהגדרת משימה קבועה', e, 'addRecurringTemplate')
        return false
      }
    },
    [user, addTask],
  )

  const addTaskNote = useCallback(
    async (taskId: string, text: string) => {
      if (!user) {
        toastFsError('יש להתחבר', new Error('no user'), 'addTaskNote')
        return
      }
      const trimmed = text.trim()
      if (!trimmed) return
      try {
        const sb = requireSupabase()
        const { error: qErr } = await sb.from('task_notes').insert({
          task_id: taskId,
          user_id: user.uid,
          user_name: displayName(),
          text: trimmed,
        })
        if (qErr) throw qErr
        toastFsSuccess('ההערה פורסמה')
      } catch (e) {
        toastFsError('שגיאה בשמירת הערה', e, 'addTaskNote')
      }
    },
    [user, displayName],
  )

  const updateTask = useCallback(
    async (
      id: string,
      patch: Partial<Task>,
      opts?: {
        memberNameById?: (id: string) => string
        projectNameById?: (id: string) => string
        supplierNameById?: (id: string) => string
        clientNameById?: (id: string) => string
      },
    ) => {
      if (!user) {
        toastFsError('יש להתחבר לעדכון', new Error('no user'), 'updateTask')
        return
      }
      const prev = tasksRef.current.find((t) => t.id === id)
      if (!prev) return
      const merged: Task = {
        ...prev,
        ...patch,
        tags: patch.tags ?? prev.tags,
        reminders: patch.reminders ?? prev.reminders,
        sharedWithUserIds:
          patch.sharedWithUserIds !== undefined
            ? patch.sharedWithUserIds
            : prev.sharedWithUserIds,
        teamWideShared:
          patch.sharedWithUserIds !== undefined ? false : prev.teamWideShared,
        manualNotes: prev.manualNotes,
        clientId:
          'clientId' in patch
            ? patch.clientId && String(patch.clientId).trim()
              ? String(patch.clientId).trim()
              : undefined
            : prev.clientId,
        dueTime:
          'dueTime' in patch
            ? patch.dueTime && String(patch.dueTime).trim()
              ? String(patch.dueTime).trim()
              : undefined
            : prev.dueTime,
      }
      const uid = user.uid
      const uname = displayName()
      const strings = collectActivityStrings(prev, merged, id, uid, uname, opts)
      const row = taskPatchToRow(patch)
      if (Object.keys(row).length === 0 && strings.length === 0) return

      try {
        const sb = requireSupabase()
        if (Object.keys(row).length > 0) {
          const { error: qErr } = await sb.from('tasks').update(row).eq('id', id)
          if (qErr) throw qErr
        }
        if (strings.length > 0) {
          const { error: aErr } = await sb.from('task_activity').insert(
            strings.map((action) => ({
              task_id: id,
              user_id: uid,
              user_name: uname,
              action,
            })),
          )
          if (aErr) throw aErr
        }
        setRawTasks((prevList) =>
          prevList.map((t) =>
            t.id === id
              ? {
                  ...t,
                  ...patch,
                  tags: patch.tags ?? t.tags,
                  reminders: patch.reminders ?? t.reminders,
                  sharedWithUserIds:
                    patch.sharedWithUserIds !== undefined
                      ? patch.sharedWithUserIds
                      : t.sharedWithUserIds,
                  teamWideShared:
                    patch.sharedWithUserIds !== undefined ? false : t.teamWideShared,
                  clientId:
                    patch.clientId !== undefined ? patch.clientId || undefined : t.clientId,
                  projectId:
                    patch.projectId !== undefined ? patch.projectId || undefined : t.projectId,
                  supplierId:
                    patch.supplierId !== undefined
                      ? patch.supplierId || undefined
                      : t.supplierId,
                  dueTime:
                    'dueTime' in patch
                      ? patch.dueTime && String(patch.dueTime).trim()
                        ? String(patch.dueTime).trim()
                        : undefined
                      : t.dueTime,
                }
              : t,
          ),
        )
        toastFsSuccess('המשימה עודכנה')

        const nextAssigneeId = String(merged.assigneeId ?? '').trim()
        const prevAssigneeId = String(prev.assigneeId ?? '').trim()
        const assigneeChanged =
          patch.assigneeId !== undefined && nextAssigneeId !== prevAssigneeId
        if (assigneeChanged && nextAssigneeId && nextAssigneeId !== uid) {
          const isTransfer = Boolean(prevAssigneeId)
          requestAssigneeTaskEmail(id, isTransfer ? { kind: 'transfer' } : undefined)
        }

        if (
          (patch.status ?? prev.status) === 'done' &&
          prev.status !== 'done' &&
          prev.recurringTemplateId
        ) {
          void spawnNextRecurringAfterCompletion(prev, uid, uname, setRawTasks)
        }
      } catch (e) {
        toastFsError('שגיאה בעדכון המשימה', e, 'updateTask')
      }
    },
    [user, displayName],
  )

  const deleteTask = useCallback(async (id: string) => {
    try {
      const sb = requireSupabase()
      const { error: qErr } = await sb.from('tasks').delete().eq('id', id)
      if (qErr) throw qErr
      setRawTasks((prev) => prev.filter((t) => t.id !== id))
      setActivityByTaskId((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setNotesByTaskId((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      toastFsSuccess('המשימה נמחקה')
    } catch (e) {
      toastFsError('שגיאה במחיקת המשימה', e, 'deleteTask')
    }
  }, [])

  const cycleStatus = useCallback(
    async (id: string) => {
      if (!user) return
      const prev = tasksRef.current.find((t) => t.id === id)
      if (!prev) return
      const order: TaskStatus[] = ['todo', 'doing', 'blocked', 'done']
      const idx = order.indexOf(prev.status)
      const next = order[(idx + 1) % order.length]
      await updateTask(id, { status: next })
    },
    [user, updateTask],
  )

  const toggleQuickDone = useCallback(
    async (taskId: string, checked: boolean) => {
      if (!user) return
      const t = tasksRef.current.find((x) => x.id === taskId)
      if (!t) return
      if (checked) {
        if (t.status === 'done') return
        await updateTask(taskId, { status: 'done' })
      } else {
        if (t.status !== 'done') return
        await updateTask(taskId, { status: 'todo' })
      }
    },
    [user, updateTask],
  )

  const value = useMemo(
    () => ({
      tasks,
      loading,
      error,
      drawerTaskId,
      newTaskDraftSeed,
      setDrawerTaskId,
      openNewTaskDraft,
      quickSliderOpen,
      setQuickSliderOpen,
      addTask,
      addTaskNote,
      updateTask,
      deleteTask,
      cycleStatus,
      toggleQuickDone,
      addRecurringTemplateWithFirstTask,
    }),
    [
      tasks,
      loading,
      error,
      drawerTaskId,
      newTaskDraftSeed,
      quickSliderOpen,
      setDrawerTaskId,
      openNewTaskDraft,
      addTask,
      addTaskNote,
      updateTask,
      deleteTask,
      cycleStatus,
      toggleQuickDone,
      addRecurringTemplateWithFirstTask,
    ],
  )

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
}

export function useTasks(): TasksContextValue {
  const ctx = useContext(TasksContext)
  if (!ctx) throw new Error('useTasks חייב להיות בתוך TasksProvider')
  return ctx
}
