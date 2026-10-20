import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { isSupabaseConfigured } from '../lib/backend'
import { requireSupabase } from '../lib/supabase'
import {
  emptyToNull,
  isDeleteSentinel,
  subscribeTable,
  uuidOrNull,
} from '../lib/sbLive'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import { useHubStore } from '../store/useStore'
import { useTasks } from './useTasks'
import type { Priority, Project, ProjectBillingType, ProjectKind, ProjectStatus, Task } from '../types'

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    description: typeof row.description === 'string' ? row.description : undefined,
    type: (row.type as ProjectKind) || 'client',
    projectType: (row.project_type as ProjectBillingType) || undefined,
    retainerAmount:
      typeof row.retainer_amount === 'number'
        ? row.retainer_amount
        : row.retainer_amount != null
          ? Number(row.retainer_amount)
          : undefined,
    subContractor:
      typeof row.sub_contractor === 'string' ? row.sub_contractor : undefined,
    startDate: row.start_date ? String(row.start_date) : undefined,
    retainerLog: Array.isArray(row.retainer_log)
      ? (row.retainer_log as Project['retainerLog'])
      : [],
    clientId: row.client_id ? String(row.client_id) : undefined,
    dealId: row.deal_id ? String(row.deal_id) : undefined,
    leadId: row.lead_id ? String(row.lead_id) : undefined,
    supplierId: row.supplier_id ? String(row.supplier_id) : undefined,
    status: (row.status as ProjectStatus) || 'active',
    priority: (row.priority as Priority) || 'medium',
    dueDate: row.due_date ? String(row.due_date) : '',
    ownerId: row.owner_id ? String(row.owner_id) : '',
    color: typeof row.color === 'string' && row.color ? row.color : '#5828A0',
    taskCount: Number(row.task_count ?? 0),
    doneCount: Number(row.done_count ?? 0),
    manualProgressPercent:
      row.manual_progress_percent == null
        ? undefined
        : Number(row.manual_progress_percent),
    budgetTotal: row.budget_total == null ? undefined : Number(row.budget_total),
    budgetUsedPercent:
      row.budget_used_percent == null ? undefined : Number(row.budget_used_percent),
    createdAt: row.created_at
      ? new Date(String(row.created_at)).toISOString()
      : new Date().toISOString(),
  }
}

const PROJECT_KEYS: Record<string, string> = {
  name: 'name',
  description: 'description',
  type: 'type',
  projectKind: 'type',
  projectType: 'project_type',
  retainerAmount: 'retainer_amount',
  subContractor: 'sub_contractor',
  startDate: 'start_date',
  retainerLog: 'retainer_log',
  clientId: 'client_id',
  dealId: 'deal_id',
  leadId: 'lead_id',
  supplierId: 'supplier_id',
  status: 'status',
  priority: 'priority',
  dueDate: 'due_date',
  ownerId: 'owner_id',
  color: 'color',
  manualProgressPercent: 'manual_progress_percent',
  budgetTotal: 'budget_total',
  budgetUsedPercent: 'budget_used_percent',
}

function projectToRow(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    const col = PROJECT_KEYS[k]
    if (!col) continue
    if (v === undefined) continue
    if (isDeleteSentinel(v) || v === '') {
      out[col] = null
      continue
    }
    out[col] = v
  }
  if ('client_id' in out) out.client_id = uuidOrNull(String(out.client_id ?? ''))
  if ('deal_id' in out) out.deal_id = uuidOrNull(String(out.deal_id ?? ''))
  if ('lead_id' in out) out.lead_id = uuidOrNull(String(out.lead_id ?? ''))
  if ('supplier_id' in out) out.supplier_id = uuidOrNull(String(out.supplier_id ?? ''))
  if ('owner_id' in out) out.owner_id = uuidOrNull(String(out.owner_id ?? ''))
  if (typeof out.description === 'string') out.description = emptyToNull(out.description)
  return out
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
  ) => Promise<string | null>
  updateProject: (id: string, data: Partial<Project>) => Promise<boolean>
  deleteProject: (id: string) => Promise<void>
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null)

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const { tasks } = useTasks()
  const [rawProjects, setRawProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const projects = useMemo(
    () => recomputeProjects(rawProjects, tasks),
    [rawProjects, tasks],
  )

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false)
      return
    }
    setLoading(true)
    return subscribeTable(
      'projects',
      (rows) => {
        setRawProjects(rows.map(rowToProject))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('projects', err)
        toastFsError('שגיאה בטעינת פרויקטים', err, 'projects')
        setError(err)
        setLoading(false)
      },
    )
  }, [])

  const addProject = useCallback(
    async (data: Omit<Project, 'id' | 'createdAt' | 'taskCount' | 'doneCount'>) => {
      try {
        const sb = requireSupabase()
        const billing = data.projectType ?? 'one-time'
        const row = projectToRow({
          name: data.name,
          description: data.description,
          type: data.type,
          projectType: billing,
          retainerAmount: data.retainerAmount,
          subContractor: data.subContractor,
          startDate: billing === 'retainer' ? data.startDate?.slice(0, 10) : data.startDate,
          retainerLog: billing === 'retainer' ? (data.retainerLog ?? []) : [],
          clientId: data.clientId,
          dealId: data.dealId,
          leadId: data.leadId,
          supplierId: data.supplierId,
          status: data.status,
          priority: data.priority,
          dueDate: billing === 'retainer' ? (data.startDate?.slice(0, 10) || data.dueDate) : data.dueDate,
          ownerId: data.ownerId,
          color: data.color,
          manualProgressPercent: data.manualProgressPercent,
        })
        const { data: created, error: qErr } = await sb
          .from('projects')
          .insert(row)
          .select('*')
          .single()
        if (qErr) throw qErr
        const optimistic = rowToProject(created as Record<string, unknown>)
        setRawProjects((prev) =>
          prev.some((p) => p.id === optimistic.id) ? prev : [...prev, optimistic],
        )
        toastFsSuccess('הפרויקט נוסף בהצלחה')
        return optimistic.id
      } catch (e) {
        toastFsError('שגיאה בשמירת הפרויקט', e, 'addProject')
        return null
      }
    },
    [],
  )

  const updateProject = useCallback(async (id: string, data: Partial<Project>) => {
    try {
      const sb = requireSupabase()
      const row = projectToRow(data as Record<string, unknown>)
      if (Object.keys(row).length === 0) return true
      const { error: qErr } = await sb.from('projects').update(row).eq('id', id)
      if (qErr) throw qErr
      setRawProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...data } : p)),
      )
      toastFsSuccess('הפרויקט עודכן')
      return true
    } catch (e) {
      toastFsError('שגיאה בעדכון הפרויקט', e, 'updateProject')
      return false
    }
  }, [])

  const deleteProject = useCallback(async (id: string) => {
    try {
      const sb = requireSupabase()
      const { error: tasksErr } = await sb.from('tasks').delete().eq('project_id', id)
      if (tasksErr) throw tasksErr
      const { error: qErr } = await sb.from('projects').delete().eq('id', id)
      if (qErr) throw qErr
      setRawProjects((prev) => prev.filter((p) => p.id !== id))
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
