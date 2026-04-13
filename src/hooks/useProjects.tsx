import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { docToProject } from '../lib/firestoreMappers'
import { deleteTasksAndDocsForProject } from '../lib/firestoreCascades'
import { ensureFirestoreReady, getDb } from '../lib/firebase'
import { stripUndefined } from '../lib/stripUndefined'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import { useHubStore } from '../store/useStore'
import { useTasks } from './useTasks'
import type { Project, Task } from '../types'

/** ב-Firestore נשמר `projectKind` (לא `type`) — מתאים לממשק Project.type */
function mapProjectUpdateForFirestore(
  data: Partial<Project>,
): Record<string, unknown> {
  const { type, ...rest } = data
  const cleaned = stripUndefined(rest as Record<string, unknown>)
  if (type !== undefined) {
    cleaned.projectKind = type
  }
  return cleaned
}

/** מסמך create בלבד — ללא spread של אובייקט טופס (מונע ערכים לא נתמכים ב-Firestore) */
function buildProjectCreateDoc(
  data: Omit<Project, 'id' | 'createdAt' | 'taskCount' | 'doneCount'>,
): Record<string, unknown> {
  const docData: Record<string, unknown> = {
    name: data.name,
    projectKind: data.type,
    status: data.status,
    priority: data.priority,
    ownerId: data.ownerId,
    color: data.color,
    taskCount: 0,
    doneCount: 0,
    createdAt: serverTimestamp(),
  }
  const billing = data.projectType ?? 'one-time'
  docData.projectType = billing
  if (billing === 'retainer') {
    const sd = data.startDate?.slice(0, 10) ?? ''
    docData.startDate = sd
    docData.dueDate = sd || data.dueDate
    docData.retainerLog = Array.isArray(data.retainerLog) ? data.retainerLog : []
  } else {
    docData.dueDate = data.dueDate
  }
  const trimmedClient = data.clientId?.trim()
  if (trimmedClient) {
    docData.clientId = trimmedClient
  }
  const trimmedSupplier = data.supplierId?.trim()
  if (trimmedSupplier) {
    docData.supplierId = trimmedSupplier
  }
  if (
    data.manualProgressPercent != null &&
    typeof data.manualProgressPercent === 'number' &&
    !Number.isNaN(data.manualProgressPercent)
  ) {
    docData.manualProgressPercent = Math.min(
      100,
      Math.max(0, Math.round(data.manualProgressPercent)),
    )
  }
  const desc = data.description?.trim()
  if (desc) docData.description = desc
  return docData
}

function recomputeProjects(projects: Project[], tasks: Task[]): Project[] {
  return projects.map((p) => {
    const ts = tasks.filter((t) => t.projectId === p.id)
    return {
      ...p,
      taskCount: ts.length,
      doneCount: ts.filter((t) => t.status === 'done').length,
    }
  })
}

type ProjectsContextValue = {
  projects: Project[]
  loading: boolean
  error: Error | null
  addProject: (
    data: Omit<Project, 'id' | 'createdAt' | 'taskCount' | 'doneCount'>,
  ) => Promise<boolean>
  updateProject: (id: string, data: Partial<Project>) => Promise<boolean>
  deleteProject: (id: string) => Promise<void>
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null)

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { tasks } = useTasks()
  const [rawProjects, setRawProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const projects = useMemo(
    () => recomputeProjects(rawProjects, tasks),
    [rawProjects, tasks],
  )

  useEffect(() => {
    if (!user) {
      setRawProjects([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    const db = getDb()
    const unsub = onSnapshot(
      collection(db, 'projects'),
      (snap) => {
        setRawProjects(snap.docs.map((d) => docToProject(d)))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('projects snapshot', err)
        toastFsError('שגיאה בטעינת פרויקטים', err, 'projects snapshot')
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      },
    )
    return () => unsub()
  }, [user])

  const addProject = useCallback(
    async (data: Omit<Project, 'id' | 'createdAt' | 'taskCount' | 'doneCount'>) => {
      try {
        await ensureFirestoreReady()
        const db = getDb()
        await addDoc(collection(db, 'projects'), buildProjectCreateDoc(data))
        toastFsSuccess('הפרויקט נוסף בהצלחה')
        return true
      } catch (e) {
        toastFsError('שגיאה בשמירת הפרויקט', e, 'addProject')
        return false
      }
    },
    [],
  )

  const updateProject = useCallback(async (id: string, data: Partial<Project>) => {
    try {
      const db = getDb()
      await updateDoc(doc(db, 'projects', id), mapProjectUpdateForFirestore(data))
      toastFsSuccess('הפרויקט עודכן')
      return true
    } catch (e) {
      toastFsError('שגיאה בעדכון הפרויקט', e, 'updateProject')
      return false
    }
  }, [])

  const deleteProject = useCallback(async (id: string) => {
    try {
      await ensureFirestoreReady()
      await deleteTasksAndDocsForProject(id)
      const db = getDb()
      await deleteDoc(doc(db, 'projects', id))
      const sel = useHubStore.getState().selectedProjectId
      if (sel === id) useHubStore.getState().setSelectedProject(null)
      toastFsSuccess('הפרויקט נמחק')
    } catch (e) {
      toastFsError('שגיאה במחיקת הפרויקט', e, 'deleteProject')
    }
  }, [])

  const value = useMemo(
    () => ({
      projects,
      loading,
      error,
      addProject,
      updateProject,
      deleteProject,
    }),
    [projects, loading, error, addProject, updateProject, deleteProject],
  )

  return (
    <ProjectsContext.Provider value={value}>
      {children}
    </ProjectsContext.Provider>
  )
}

export function useProjects(): ProjectsContextValue {
  const ctx = useContext(ProjectsContext)
  if (!ctx) throw new Error('useProjects חייב להיות בתוך ProjectsProvider')
  return ctx
}
