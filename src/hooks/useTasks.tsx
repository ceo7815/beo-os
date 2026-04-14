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
  getDocsFromServer,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { formatDateIL } from '../lib/dates'
import { useAuth } from '../contexts/AuthContext'
import { docToTask, taskNoteDocToTaskNote } from '../lib/firestoreMappers'
import {
  deleteActivitySubcollection,
  deleteTaskNotesSubcollection,
} from '../lib/firestoreCascades'
import { db } from '../lib/firebase'
import { stripUndefined } from '../lib/stripUndefined'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import { boardStatusHe, priorityHe } from '../lib/boardTaskLabels'
import { logActivity } from '../utils/activityLogger'
import type { Task, TaskActivity, TaskNote, TaskStatus } from '../types'

type TasksContextValue = {
  tasks: Task[]
  loading: boolean
  error: Error | null
  drawerTaskId: string | null
  setDrawerTaskId: (id: string | null) => void
  quickSliderOpen: boolean
  setQuickSliderOpen: (open: boolean) => void
  addTask: (
    data: Omit<Task, 'id' | 'createdAt' | 'activity' | 'createdBy' | 'manualNotes'>,
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
  if (merged.dueDate !== prev.dueDate) {
    const ymd =
      typeof merged.dueDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(merged.dueDate.trim().slice(0, 10))
        ? merged.dueDate.trim().slice(0, 10)
        : ''
    out.push(
      logActivity(
        taskId,
        userId,
        userName,
        'due_changed',
        ymd ? formatDateIL(ymd) : 'לא צוין',
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

export function TasksProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [rawTasks, setRawTasks] = useState<Task[]>([])
  const [activityByTaskId, setActivityByTaskId] = useState<
    Record<string, TaskActivity[]>
  >({})
  const [notesByTaskId, setNotesByTaskId] = useState<
    Record<string, TaskNote[]>
  >({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null)
  const [quickSliderOpen, setQuickSliderOpen] = useState(false)
  const tasksRef = useRef<Task[]>([])

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
    const q = query(collection(db, 'tasks'))

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
      try {
        const snap = await getDocsFromServer(q)
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

    void load(true)
    const tasksPollMs = 18_000
    const notesPollMs = 50_000
    const timerTasks = window.setInterval(() => {
      void load(false)
    }, tasksPollMs)
    const timerNotes = window.setInterval(() => {
      void load(true)
    }, notesPollMs)

    return () => {
      cancelled = true
      window.clearInterval(timerTasks)
      window.clearInterval(timerNotes)
    }
  }, [])

  const displayName = useCallback(() => {
    const u = user
    if (!u) return 'משתמש'
    return u.displayName?.trim() || u.email?.split('@')[0] || 'משתמש'
  }, [user])

  const addTask = useCallback(
    async (
      data: Omit<Task, 'id' | 'createdAt' | 'activity' | 'createdBy' | 'manualNotes'>,
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
          reminderDate: data.reminderDate ?? null,
          tags: data.tags ?? [],
          reminders: data.reminders ?? [],
          sharedWithUserIds: data.sharedWithUserIds ?? [],
          shared: false,
          createdBy: uid,
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
        toastFsSuccess('המשימה נוספה')
        return ref.id
      } catch (e) {
        toastFsError('שגיאה בשמירת המשימה', e, 'addTask')
        return null
      }
    },
    [user, displayName],
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
      }
      const uid = user.uid
      const uname = displayName()
      const strings = collectActivityStrings(prev, merged, id, uid, uname, opts)
      const fsPatch = taskToFirestoreUpdate(patch)
      if (Object.keys(fsPatch).length === 0 && strings.length === 0) return

      try {
        const batch = writeBatch(db)
        const tref = doc(db, 'tasks', id)
        if (Object.keys(fsPatch).length > 0) {
          batch.update(tref, fsPatch)
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
        toastFsSuccess('המשימה עודכנה')
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
      setDrawerTaskId,
      quickSliderOpen,
      setQuickSliderOpen,
      addTask,
      addTaskNote,
      updateTask,
      deleteTask,
      cycleStatus,
      toggleQuickDone,
    }),
    [
      tasks,
      loading,
      error,
      drawerTaskId,
      quickSliderOpen,
      addTask,
      addTaskNote,
      updateTask,
      deleteTask,
      cycleStatus,
      toggleQuickDone,
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
