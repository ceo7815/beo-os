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
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocsFromServer,
  or,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import {
  addDaysYmd,
  formatTaskDueDisplay,
  nextWeeklyYmdAfter,
  todayYmd,
} from '../lib/dates'
import { useAuth } from '../contexts/AuthContext'
import { docToTask, taskNoteDocToTaskNote } from '../lib/firestoreMappers'
import {
  deleteActivitySubcollection,
  deleteTaskNotesSubcollection,
} from '../lib/firestoreCascades'
import { db } from '../lib/firebase'
import { useHubStore } from '../store/useStore'
import { stripUndefined } from '../lib/stripUndefined'
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
  /** Seed למגירת משימה חדשה — רלוונטי כש־drawerTaskId === NEW_TASK_DRAWER_ID */
  newTaskDraftSeed: NewTaskDraftSeed | null
  setDrawerTaskId: (id: string | null) => void
  /** פותח את מגירת המשימה במצב טיוטה (ללא שמירה ב-Firestore עד «שמור משימה») */
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
  /** מנהל: תבנית משימה קבועה + משימה ראשונה */
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

function taskToFirestoreUpdate(patch: Partial<Task>): Record<string, unknown> {
  const {
    activity: _a,
    manualNotes: _n,
    id: _i,
    createdAt: _c,
    teamWideShared: _tw,
    ...rest
  } = patch
  const o: Record<string, unknown> = { ...rest }
  if ('clientId' in o && (o.clientId === '' || o.clientId === undefined)) {
    o.clientId = null
  }
  if ('projectId' in o && (o.projectId === '' || o.projectId === undefined)) {
    o.projectId = null
  }
  if ('supplierId' in o && (o.supplierId === '' || o.supplierId === undefined)) {
    o.supplierId = null
  }
  if ('dueTime' in o && (o.dueTime === '' || o.dueTime === undefined)) {
    o.dueTime = null
  }
  if ('sharedWithUserIds' in patch) {
    o.sharedWithUserIds = patch.sharedWithUserIds ?? []
    o.shared = false
  }
  delete o.teamWideShared
  return stripUndefined(o)
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
    out.push(
      logActivity(taskId, userId, userName, 'shared_targets_updated').action,
    )
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
  const prevDueLabel =
    formatTaskDueDisplay(prev.dueDate, prev.dueTime) || 'לא צוין'
  const mergedDueLabel =
    formatTaskDueDisplay(merged.dueDate, merged.dueTime) || 'לא צוין'
  if (mergedDueLabel !== prevDueLabel) {
    out.push(
      logActivity(
        taskId,
        userId,
        userName,
        'due_changed',
        mergedDueLabel,
      ).action,
    )
  }
  const prevS = prev.supplierId || undefined
  const nextS = merged.supplierId || undefined
  if (nextS !== prevS) {
    if (nextS && !prevS) {
      out.push(
        logActivity(
          taskId,
          userId,
          userName,
          'supplier_added',
          supplierName(nextS),
        ).action,
      )
    } else if (!nextS && prevS) {
      out.push(
        logActivity(
          taskId,
          userId,
          userName,
          'supplier_removed',
          supplierName(prevS),
        ).action,
      )
    } else if (nextS && prevS) {
      out.push(
        logActivity(
          taskId,
          userId,
          userName,
          'supplier_removed',
          supplierName(prevS),
        ).action,
      )
      out.push(
        logActivity(
          taskId,
          userId,
          userName,
          'supplier_added',
          supplierName(nextS),
        ).action,
      )
    }
  }
  const prevP = prev.projectId?.trim() || undefined
  const nextP = merged.projectId?.trim() || undefined
  if (nextP !== prevP) {
    if (nextP) {
      out.push(
        logActivity(
          taskId,
          userId,
          userName,
          'project_set',
          projectName(nextP) || nextP,
        ).action,
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
    if (!prevTags.has(t)) {
      out.push(logActivity(taskId, userId, userName, 'tag_added', t).action)
    }
  }
  for (const t of prev.tags) {
    if (!nextTags.has(t)) {
      out.push(logActivity(taskId, userId, userName, 'tag_removed', t).action)
    }
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
    const tsnap = await getDoc(doc(db, 'recurringTaskTemplates', tid))
    if (!tsnap.exists()) return
    const x = tsnap.data()
    if (x.active === false) return

    const freq: TaskRecurrence =
      x.frequency === 'weekly' ? 'weekly' : 'daily'
    let nextDue: string
    if (freq === 'daily') {
      nextDue = addDaysYmd(todayYmd(), 1)
    } else {
      const dow =
        typeof x.weeklyDayOfWeek === 'number' &&
        x.weeklyDayOfWeek >= 0 &&
        x.weeklyDayOfWeek <= 6
          ? x.weeklyDayOfWeek
          : 0
      nextDue = nextWeeklyYmdAfter(todayYmd(), dow)
    }

    const payload = {
      title: String(x.title ?? ''),
      description: String(x.description ?? ''),
      status: 'todo' as TaskStatus,
      priority: (x.priority ?? 'medium') as Priority,
      assigneeId: String(x.assigneeId ?? ''),
      clientId: x.clientId ?? null,
      projectId: x.projectId ?? null,
      supplierId: x.supplierId ?? null,
      dueDate: nextDue,
      reminderDate: null,
      tags: Array.isArray(x.tags) ? x.tags.map((t: unknown) => String(t)) : [],
      reminders: [],
      sharedWithUserIds: [],
      shared: false,
      recurringTemplateId: tid,
      recurringFrequency: freq,
      createdBy: uid,
      lastEventByUserId: uid,
      lastEventByUserName: uname,
      createdAt: serverTimestamp(),
    }

    const ref = await addDoc(collection(db, 'tasks'), payload)
    const entry = logActivity(ref.id, uid, uname, 'created')
    await addDoc(collection(db, 'tasks', ref.id, 'activity'), {
      userId: uid,
      userName: uname,
      action: `${entry.action} · משימה קבועה`,
      createdAt: serverTimestamp(),
    })

    const optimisticTask: Task = {
      id: ref.id,
      title: payload.title,
      description: payload.description,
      status: 'todo',
      priority: payload.priority,
      assigneeId: payload.assigneeId,
      clientId: (payload.clientId as string | null) ?? undefined,
      projectId: (payload.projectId as string | null) ?? undefined,
      supplierId: (payload.supplierId as string | null) ?? undefined,
      dueDate: payload.dueDate,
      reminderDate: undefined,
      tags: payload.tags,
      reminders: [],
      createdAt: new Date().toISOString(),
      createdBy: uid,
      sharedWithUserIds: [],
      teamWideShared: false,
      activity: [],
      manualNotes: [],
      recurringTemplateId: tid,
      recurringFrequency: freq,
    }
    setRawTasks((prev) =>
      prev.some((t) => t.id === ref.id) ? prev : [...prev, optimisticTask],
    )
    if (payload.assigneeId !== uid) {
      requestAssigneeTaskEmail(ref.id)
    }
    toastFsSuccess(
      freq === 'daily'
        ? 'נוצרה משימת המשך למחר'
        : 'נוצרה משימת המשך לשבוע הבא',
    )
  } catch (e) {
    toastFsError('שגיאה ביצירת משימת המשך הקבועה', e, 'spawnRecurring')
  }
}

export function TasksProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const currentUser = useHubStore((s) => s.currentUser)
  const [rawTasks, setRawTasks] = useState<Task[]>([])
  const [activityByTaskId, setActivityByTaskId] = useState<
    Record<string, TaskActivity[]>
  >({})
  const [notesByTaskId, setNotesByTaskId] = useState<
    Record<string, TaskNote[]>
  >({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [drawerTaskId, setDrawerTaskIdInner] = useState<string | null>(null)
  const [newTaskDraftSeed, setNewTaskDraftSeed] =
    useState<NewTaskDraftSeed | null>(null)
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
    setLoading(true)
    let cancelled = false

    const uid = user?.uid ?? ''
    const role =
      currentUser?.uid === uid && typeof currentUser.role === 'string'
        ? currentUser.role
        : currentUser?.uid === uid
          ? 'employee'
          : ''
    const profileReady =
      Boolean(uid) &&
      currentUser?.uid === uid &&
      (role === 'admin' ||
        role === 'superadmin' ||
        role === 'employee' ||
        role === 'office')

    const tasksQuery =
      !profileReady || !uid
        ? null
        : role === 'admin' || role === 'superadmin'
          ? query(collection(db, 'tasks'))
          : query(
              collection(db, 'tasks'),
              or(
                where('assigneeId', '==', uid),
                where('createdBy', '==', uid),
              ),
            )

    async function fetchNotesMap(
      taskIds: Set<string>,
    ): Promise<Record<string, TaskNote[]>> {
      const notesMap: Record<string, TaskNote[]> = {}
      try {
        const notesSnap = await getDocsFromServer(
          query(collectionGroup(db, 'taskNotes')),
        )
        for (const d of notesSnap.docs) {
          const taskRef = d.ref.parent.parent
          if (!taskRef) continue
          const taskId = taskRef.id
          if (!taskIds.has(taskId)) continue
          const note = taskNoteDocToTaskNote(d, taskId)
          if (!notesMap[taskId]) notesMap[taskId] = []
          notesMap[taskId].push(note)
        }
        for (const tid of Object.keys(notesMap)) {
          notesMap[tid].sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt),
          )
        }
      } catch (noteErr) {
        console.error('taskNotes collectionGroup', noteErr)
      }
      return notesMap
    }

    const load = async (includeNotes: boolean) => {
      if (!uid) {
        if (cancelled) return
        setRawTasks([])
        setNotesByTaskId({})
        setActivityByTaskId({})
        setLoading(false)
        setError(null)
        return
      }
      if (!tasksQuery) {
        /* ממתינים לפרופיל מ-Firestore (תפקיד) כדי לבנות שאילתה תואמת חוקים */
        return
      }
      try {
        const snap = await getDocsFromServer(tasksQuery)
        const taskList = snap.docs.map((d) => docToTask(d))
        const taskIds = new Set(taskList.map((t) => t.id))

        if (includeNotes) {
          const notesMap = await fetchNotesMap(taskIds)
          if (cancelled) return
          setNotesByTaskId(notesMap)
        }

        if (cancelled) return
        setActivityByTaskId({})
        setRawTasks(taskList)
        setLoading(false)
        setError(null)
      } catch (err) {
        if (cancelled) return
        console.error('tasks snapshot', err)
        toastFsError('שגיאה בטעינת משימות', err, 'tasks snapshot')
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      }
    }

    if (!uid) {
      void load(true)
    } else if (tasksQuery) {
      void load(true)
    }

    const tasksPollMs = 18_000
    const notesPollMs = 50_000
    const timerTasks = window.setInterval(() => {
      if (tasksQuery) void load(false)
    }, tasksPollMs)
    const timerNotes = window.setInterval(() => {
      if (tasksQuery) void load(true)
    }, notesPollMs)

    return () => {
      cancelled = true
      window.clearInterval(timerTasks)
      window.clearInterval(timerNotes)
    }
  }, [user?.uid, currentUser?.uid, currentUser?.role])

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
        const payload = {
          title: data.title,
          description: data.description ?? '',
          status: data.status ?? 'todo',
          priority: data.priority ?? 'medium',
          assigneeId: data.assigneeId,
          clientId: data.clientId ?? null,
          projectId: data.projectId ?? null,
          supplierId: data.supplierId ?? null,
          dueDate: data.dueDate,
          ...(data.dueTime?.trim() ? { dueTime: data.dueTime.trim() } : {}),
          reminderDate: data.reminderDate ?? null,
          tags: data.tags ?? [],
          reminders: data.reminders ?? [],
          sharedWithUserIds: data.sharedWithUserIds ?? [],
          shared: false,
          ...(data.recurringTemplateId
            ? { recurringTemplateId: data.recurringTemplateId }
            : {}),
          ...(data.recurringFrequency
            ? { recurringFrequency: data.recurringFrequency }
            : {}),
          createdBy: uid,
          lastEventByUserId: uid,
          lastEventByUserName: uname,
          createdAt: serverTimestamp(),
        }
        const ref = await addDoc(collection(db, 'tasks'), payload)
        const entry = logActivity(ref.id, uid, uname, 'created')
        await addDoc(collection(db, 'tasks', ref.id, 'activity'), {
          userId: uid,
          userName: uname,
          action: entry.action,
          createdAt: serverTimestamp(),
        })
        setRawTasks((prev) => {
          if (prev.some((t) => t.id === ref.id)) return prev
          const optimisticTask: Task = {
            id: ref.id,
            title: payload.title,
            description: payload.description,
            status: payload.status as TaskStatus,
            priority: payload.priority as Task['priority'],
            assigneeId: payload.assigneeId,
            clientId: (payload.clientId as string | null) ?? undefined,
            projectId: (payload.projectId as string | null) ?? undefined,
            supplierId: (payload.supplierId as string | null) ?? undefined,
            dueDate: payload.dueDate,
            dueTime:
              payload.dueTime != null && String(payload.dueTime).trim()
                ? String(payload.dueTime).trim()
                : undefined,
            reminderDate: (payload.reminderDate as string | null) ?? undefined,
            tags: payload.tags as string[],
            reminders: payload.reminders as Task['reminders'],
            createdAt: new Date().toISOString(),
            createdBy: uid,
            sharedWithUserIds: payload.sharedWithUserIds as string[],
            teamWideShared: false,
            activity: [],
            manualNotes: [],
            ...(data.recurringTemplateId
              ? { recurringTemplateId: data.recurringTemplateId }
              : {}),
            ...(data.recurringFrequency
              ? { recurringFrequency: data.recurringFrequency }
              : {}),
          }
          return [...prev, optimisticTask]
        })
        if (!options?.quiet) toastFsSuccess('המשימה נוספה')
        if (payload.assigneeId !== uid) {
          requestAssigneeTaskEmail(ref.id)
        }
        return ref.id
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
      let templateRefId: string | null = null
      try {
        const tref = await addDoc(collection(db, 'recurringTaskTemplates'), {
          title: args.title.trim(),
          description: args.description.trim(),
          assigneeId: args.assigneeId,
          frequency: args.frequency,
          ...(args.frequency === 'weekly' && args.weeklyDayOfWeek != null
            ? { weeklyDayOfWeek: args.weeklyDayOfWeek }
            : {}),
          priority: args.priority,
          clientId: args.clientId ?? null,
          projectId: args.projectId ?? null,
          supplierId: args.supplierId ?? null,
          tags: [],
          active: true,
          createdBy: uid,
          createdAt: serverTimestamp(),
        })
        templateRefId = tref.id
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
            recurringTemplateId: tref.id,
            recurringFrequency: args.frequency,
          },
          { quiet: true },
        )
        if (!taskId) {
          await deleteDoc(doc(db, 'recurringTaskTemplates', tref.id))
          return false
        }
        toastFsSuccess('הוגדרה משימה קבועה והמשימה הראשונה נוספה ללוח')
        return true
      } catch (e) {
        if (templateRefId) {
          try {
            await deleteDoc(doc(db, 'recurringTaskTemplates', templateRefId))
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
      const uid = user.uid
      const uname = displayName()
      try {
        const ref = await addDoc(collection(db, 'tasks', taskId, 'taskNotes'), {
          userId: uid,
          userName: uname,
          text: trimmed,
          createdAt: serverTimestamp(),
        })
        const newNote: TaskNote = {
          id: ref.id,
          taskId,
          userId: uid,
          userName: uname,
          text: trimmed,
          createdAt: new Date().toISOString(),
        }
        setNotesByTaskId((prev) => {
          const list = [...(prev[taskId] ?? []), newNote].sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt),
          )
          return { ...prev, [taskId]: list }
        })
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
          patch.sharedWithUserIds !== undefined
            ? false
            : prev.teamWideShared,
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
      const fsPatch = taskToFirestoreUpdate(patch)
      if (Object.keys(fsPatch).length === 0 && strings.length === 0) return

      try {
        const batch = writeBatch(db)
        const tref = doc(db, 'tasks', id)
        const meta = {
          lastEventByUserId: uid,
          lastEventByUserName: uname,
          lastEventAt: serverTimestamp(),
        }
        if (Object.keys(fsPatch).length > 0) {
          batch.update(tref, { ...fsPatch, ...meta })
        } else if (strings.length > 0) {
          batch.update(tref, meta)
        }
        for (const action of strings) {
          const aref = doc(collection(db, 'tasks', id, 'activity'))
          batch.set(aref, {
            userId: uid,
            userName: uname,
            action,
            createdAt: serverTimestamp(),
          })
        }
        await batch.commit()
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
                    patch.sharedWithUserIds !== undefined
                      ? false
                      : t.teamWideShared,
                  clientId:
                    patch.clientId !== undefined
                      ? patch.clientId || undefined
                      : t.clientId,
                  projectId:
                    patch.projectId !== undefined
                      ? patch.projectId || undefined
                      : t.projectId,
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
        if (
          assigneeChanged &&
          nextAssigneeId &&
          nextAssigneeId !== uid
        ) {
          const isTransfer = Boolean(prevAssigneeId)
          requestAssigneeTaskEmail(
            id,
            isTransfer ? { kind: 'transfer' } : undefined,
          )
        }

        const mergedStatus = patch.status ?? prev.status
        if (
          mergedStatus === 'done' &&
          prev.status !== 'done' &&
          prev.recurringTemplateId
        ) {
          void spawnNextRecurringAfterCompletion(
            prev,
            uid,
            uname,
            setRawTasks,
          )
        }
      } catch (e) {
        toastFsError('שגיאה בעדכון המשימה', e, 'updateTask')
      }
    },
    [user, displayName],
  )

  const deleteTask = useCallback(async (id: string) => {
    try {
      await deleteActivitySubcollection(id)
      await deleteTaskNotesSubcollection(id)
      await deleteDoc(doc(db, 'tasks', id))
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

  const cycleStatus = useCallback(async (id: string) => {
    if (!user) return
    const prev = tasksRef.current.find((t) => t.id === id)
    if (!prev) return
    const order: TaskStatus[] = ['todo', 'doing', 'blocked', 'done']
    const idx = order.indexOf(prev.status)
    const next = order[(idx + 1) % order.length]
    await updateTask(id, { status: next })
  }, [user, updateTask])

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

  return (
    <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
  )
}

export function useTasks(): TasksContextValue {
  const ctx = useContext(TasksContext)
  if (!ctx) throw new Error('useTasks חייב להיות בתוך TasksProvider')
  return ctx
}
