import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deleteField } from 'firebase/firestore'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { addDaysYmd, formatDateIL, todayYmd } from '../lib/dates'
import { isRetainerProject, RETAINER_ACCENT } from '../lib/projectRetainer'
import { HUB_SUPPLIER_ID } from '../lib/hubSupplier'
import {
  INTERNAL_PROJECT_BADGE_COLOR,
  isInternalProject,
} from '../lib/projectKind'
import { priorityColor } from '../lib/priorityColor'
import { useClients } from '../hooks/useClients'
import { useProjects } from '../hooks/useProjects'
import { useSuppliers } from '../hooks/useSuppliers'
import { useTasks } from '../hooks/useTasks'
import { useUsers } from '../hooks/useUsers'
import { useHubStore } from '../store/useStore'
import type {
  Client,
  Priority,
  Project,
  ProjectBillingType,
  ProjectKind,
  ProjectStatus,
  Supplier,
  TeamMember,
} from '../types'
import { Avatar } from '../components/shared/Avatar'
import { Badge } from '../components/shared/Badge'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { ClientQuickSelect } from '../components/ClientQuickSelect'
import { SupplierQuickSelect } from '../components/SupplierQuickSelect'
import { Modal } from '../components/shared/Modal'
import { ProgressBar } from '../components/shared/ProgressBar'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { ExportExcelButton } from '../components/shared/ExportExcelButton'
import { exportProjectsToExcel } from '../lib/excelTableExports'

const PROJECT_COLORS = [
  '#6366F1',
  '#10B981',
  '#F59E0B',
  '#EC4899',
  '#8B5CF6',
  '#3B82F6',
] as const

type FilterKey = 'all' | ProjectStatus

const statusLabels: Record<ProjectStatus, string> = {
  active: 'פעיל',
  paused: 'מושהה',
  done: 'הושלם',
}

const projectStatusBadgeColor: Record<ProjectStatus, string> = {
  active: '#F97316',
  paused: '#64748B',
  done: '#16A34A',
}

const priorityLabels: Record<Priority, string> = {
  high: 'גבוהה',
  medium: 'בינונית',
  low: 'נמוכה',
}

const uiButtonBase =
  'inline-flex h-9 min-w-[104px] items-center justify-center rounded-[10px] px-3 text-xs font-semibold transition'
/** פילטר / משנה — מסגרת כתומה רכה */
const uiFilterInactive = `${uiButtonBase} border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] text-[var(--text-mid)] hover:bg-[var(--surface-muted)]`
/** פילטר נבחר */
const uiFilterActive = `${uiButtonBase} border border-[var(--orange)] bg-[var(--orange)] text-white shadow-sm hover:bg-[#ea6c0a]`
/** כפתור ראשי מותג */
const uiButtonBrand = `${uiButtonBase} border border-transparent bg-[var(--orange)] text-white shadow-sm hover:bg-[#ea6c0a]`
/** כפתור משנה — כתום על אפור */
const uiButtonBrandOutline = `${uiButtonBase} border border-[var(--orange)] bg-[var(--surface-muted)] text-[var(--orange)] hover:bg-[var(--orange-light)]`
const uiButtonGhost = uiFilterInactive

function projectProgressPercent(p: Project): number {
  if (typeof p.manualProgressPercent === 'number' && !Number.isNaN(p.manualProgressPercent)) {
    return Math.max(0, Math.min(100, Math.round(p.manualProgressPercent)))
  }
  if (!p.taskCount) return 0
  return Math.round((p.doneCount / p.taskCount) * 100)
}

function projectHealthScore(p: Project, today: string): number {
  if (p.status === 'done') return 100
  const progress = projectProgressPercent(p)
  let score = 55 + Math.round(progress * 0.45)
  const due = p.dueDate?.slice(0, 10) ?? ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    if (due < today) score -= 32
    else if (due <= addDaysYmd(today, 2)) score -= 18
    else if (due <= addDaysYmd(today, 7)) score -= 8
  }
  const openTasks = Math.max(0, p.taskCount - p.doneCount)
  if (openTasks >= 8) score -= 10
  if (p.status === 'active' && progress < 20) score -= 6
  return Math.max(0, Math.min(100, score))
}

function healthTone(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'בריא', color: '#16A34A' }
  if (score >= 55) return { label: 'דורש תשומת לב', color: '#D97706' }
  return { label: 'בסיכון', color: '#DC2626' }
}

function requiresAttentionToday(p: Project, today: string): boolean {
  if (p.status === 'done') return false
  const due = p.dueDate?.slice(0, 10) ?? ''
  const openTasks = Math.max(0, p.taskCount - p.doneCount)
  if (/^\d{4}-\d{2}-\d{2}$/.test(due) && due <= today) return true
  if (/^\d{4}-\d{2}-\d{2}$/.test(due) && due <= addDaysYmd(today, 2) && openTasks > 0) {
    return true
  }
  return false
}

interface ProjectFormState {
  name: string
  description: string
  type: ProjectKind
  projectBillingType: ProjectBillingType
  clientId: string
  supplierId: string
  status: ProjectStatus
  priority: Priority
  dueDate: string
  startDate: string
  ownerId: string
  color: string
}

export function Projects() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const { users: teamMembers } = useUsers()
  const defaultOwnerId = user?.uid ?? teamMembers[0]?.id ?? ''

  const emptyForm = useCallback(
    (): ProjectFormState => ({
      name: '',
      description: '',
      type: 'client',
      projectBillingType: 'one-time',
      clientId: '',
      supplierId: '',
      status: 'active',
      priority: 'medium',
      dueDate: '',
      startDate: todayYmd(),
      ownerId: defaultOwnerId,
      color: PROJECT_COLORS[0],
    }),
    [defaultOwnerId],
  )

  const { projects, addProject, updateProject, deleteProject } = useProjects()
  const { openNewTaskDraft } = useTasks()
  const { clients } = useClients()
  const { suppliers, addSupplier } = useSuppliers()
  const selectedClientId = useHubStore((s) => s.selectedClientId)
  const setSelectedClient = useHubStore((s) => s.setSelectedClient)
  const pushToast = useHubStore((s) => s.pushToast)

  const [kindFilter, setKindFilter] = useState<'all' | 'client' | 'internal'>(
    'all',
  )
  const [statusFilter, setStatusFilter] = useState<FilterKey>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProjectFormState>(emptyForm)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [attentionOnly, setAttentionOnly] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const supplierHubDefaultedRef = useRef(false)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target as Node)) setMenuId(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const clientMap = useMemo(() => {
    const m = new Map<string, Client>()
    clients.forEach((c) => m.set(c.id, c))
    return m
  }, [clients])

  const memberMap = useMemo(() => {
    const m = new Map<string, TeamMember>()
    teamMembers.forEach((tm) => m.set(tm.id, tm))
    return m
  }, [teamMembers])

  const supplierMap = useMemo(() => {
    const m = new Map<string, Supplier>()
    suppliers.forEach((s) => {
      const k = s.id.trim()
      if (k) m.set(k, s)
    })
    return m
  }, [suppliers])

  useEffect(() => {
    if (!modalOpen) {
      supplierHubDefaultedRef.current = false
      return
    }
    if (editingId != null || supplierHubDefaultedRef.current) return
    const hasHub = suppliers.some((s) => s.id === HUB_SUPPLIER_ID)
    if (!hasHub) return
    setForm((f) => (f.supplierId ? f : { ...f, supplierId: HUB_SUPPLIER_ID }))
    supplierHubDefaultedRef.current = true
  }, [modalOpen, editingId, suppliers])

  const today = todayYmd()

  const scopedProjects = useMemo(() => {
    return projects.filter((p) => {
      if (selectedClientId && p.clientId !== selectedClientId) return false
      if (kindFilter === 'client' && isInternalProject(p)) return false
      if (kindFilter === 'internal' && !isInternalProject(p)) return false
      return true
    })
  }, [projects, selectedClientId, kindFilter])

  const filtered = useMemo(() => {
    return scopedProjects.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (attentionOnly && !requiresAttentionToday(p, today)) return false
      return true
    })
  }, [scopedProjects, statusFilter, attentionOnly, today])

  const activeFiltered = useMemo(
    () => filtered.filter((p) => p.status === 'active'),
    [filtered],
  )
  const pausedFiltered = useMemo(
    () => filtered.filter((p) => p.status === 'paused'),
    [filtered],
  )
  const completedFiltered = useMemo(
    () => filtered.filter((p) => p.status === 'done'),
    [filtered],
  )

  const openNew = () => {
    setEditingId(null)
    supplierHubDefaultedRef.current = false
    setForm(emptyForm())
    setModalOpen(true)
  }

  useEffect(() => {
    const st = location.state as { openAdd?: boolean } | undefined
    if (!st?.openAdd) return
    setEditingId(null)
    supplierHubDefaultedRef.current = false
    setForm(emptyForm())
    setModalOpen(true)
    navigate('.', { replace: true, state: null })
  }, [location.state, navigate, emptyForm])

  useEffect(() => {
    const raw = searchParams.get('status')?.trim().toLowerCase()
    if (raw !== 'active' && raw !== 'paused' && raw !== 'done') return
    setStatusFilter(raw as ProjectStatus)
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.delete('status')
        return n
      },
      { replace: true },
    )
  }, [searchParams, setSearchParams])

  const openEdit = (p: Project) => {
    setEditingId(p.id)
    const billing: ProjectBillingType =
      p.projectType === 'retainer' ? 'retainer' : 'one-time'
    setForm({
      name: p.name,
      description: p.description ?? '',
      type: p.type ?? 'client',
      projectBillingType: billing,
      clientId: p.clientId ?? '',
      supplierId: p.supplierId ?? '',
      status: p.status,
      priority: p.priority,
      dueDate: p.dueDate?.slice(0, 10) ?? '',
      startDate: p.startDate?.slice(0, 10) ?? todayYmd(),
      ownerId: p.ownerId,
      color: p.color,
    })
    setModalOpen(true)
    setMenuId(null)
  }

  const submit = async () => {
    if (!form.name.trim()) {
      pushToast('שם פרויקט הוא שדה חובה', 'error')
      return
    }
    if (form.type === 'client' && !form.clientId.trim()) {
      pushToast('לפרויקט לקוח יש לבחור לקוח', 'error')
      return
    }
    if (form.projectBillingType === 'one-time' && !form.dueDate.trim()) {
      pushToast('נא לבחור תאריך יעד לפרויקט חד־פעמי', 'error')
      return
    }
    if (form.projectBillingType === 'retainer') {
      if (!form.startDate.trim()) {
        pushToast('נא לבחור תאריך התחלה לפרויקט שוטף', 'error')
        return
      }
    }
    const supplierPatch = form.supplierId
      ? { supplierId: form.supplierId }
      : { supplierId: deleteField() as unknown as string }
    /** deleteField() מותר רק ב-updateDoc — לא ב-addDoc */
    const clientPatchUpdate: Record<string, unknown> =
      form.type === 'internal'
        ? form.clientId.trim()
          ? { clientId: form.clientId.trim() }
          : { clientId: deleteField() }
        : { clientId: form.clientId.trim() }

    const editingProject = editingId
      ? projects.find((x) => x.id === editingId)
      : undefined

    const descPatch = form.description.trim()
      ? { description: form.description.trim() }
      : { description: deleteField() as unknown as string }

    setSaving(true)
    try {
      if (editingId) {
        let ok: boolean
        if (form.projectBillingType === 'retainer') {
          const start = form.startDate.slice(0, 10)
          ok = await updateProject(editingId, {
            name: form.name.trim(),
            ...descPatch,
            type: form.type,
            ...clientPatchUpdate,
            ...supplierPatch,
            status: form.status,
            priority: form.priority,
            ownerId: form.ownerId,
            color: form.color,
            projectType: 'retainer',
            retainerAmount: deleteField() as unknown as number,
            subContractor: deleteField() as unknown as string,
            startDate: start,
            dueDate: start,
            ...(editingProject?.projectType !== 'retainer'
              ? { retainerLog: [] }
              : {}),
          } as Partial<Project>)
        } else {
          ok = await updateProject(editingId, {
            name: form.name.trim(),
            ...descPatch,
            type: form.type,
            ...clientPatchUpdate,
            ...supplierPatch,
            status: form.status,
            priority: form.priority,
            ownerId: form.ownerId,
            color: form.color,
            projectType: 'one-time',
            dueDate: form.dueDate.slice(0, 10),
            retainerAmount: deleteField() as unknown as number,
            subContractor: deleteField() as unknown as string,
            startDate: deleteField() as unknown as string,
            retainerLog: deleteField() as unknown as [],
          } as Partial<Project>)
        }
        if (ok) setModalOpen(false)
      } else {
        const base: Omit<Project, 'id' | 'createdAt' | 'taskCount' | 'doneCount'> =
          {
            name: form.name.trim(),
            ...(form.description.trim()
              ? { description: form.description.trim() }
              : {}),
            type: form.type,
            status: form.status,
            priority: form.priority,
            ownerId: form.ownerId,
            color: form.color,
            dueDate: form.dueDate.slice(0, 10),
            projectType: form.projectBillingType,
            ...(form.type === 'client'
              ? { clientId: form.clientId.trim() }
              : form.clientId.trim()
                ? { clientId: form.clientId.trim() }
                : {}),
            ...(form.supplierId ? { supplierId: form.supplierId } : {}),
          }
        if (form.projectBillingType === 'retainer') {
          const start = form.startDate.slice(0, 10)
          base.projectType = 'retainer'
          base.startDate = start
          base.dueDate = start
          base.retainerLog = []
        } else {
          base.projectType = 'one-time'
        }
        const ok = await addProject(base)
        if (ok) setModalOpen(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const kindFilterButtons: {
    key: 'all' | 'client' | 'internal'
    label: string
  }[] = [
    { key: 'all', label: 'הכל' },
    { key: 'client', label: 'לקוחות' },
    { key: 'internal', label: 'פנימי' },
  ]

  const filterButtons: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'הכל' },
    { key: 'active', label: 'פעיל' },
    { key: 'paused', label: 'מושהה' },
    { key: 'done', label: 'הושלם' },
  ]

  const selectedClient = selectedClientId
    ? clientMap.get(selectedClientId)
    : undefined

  const projectKpis = useMemo(() => {
    const active = scopedProjects.filter((p) => p.status === 'active').length
    const paused = scopedProjects.filter((p) => p.status === 'paused').length
    const completed = scopedProjects.filter((p) => p.status === 'done').length
    return { active, paused, completed }
  }, [scopedProjects])

  const markProjectDone = async (id: string) => {
    await updateProject(id, { status: 'done' })
    setMenuId(null)
  }

  const toggleProjectPause = async (p: Project) => {
    const nextStatus: ProjectStatus = p.status === 'paused' ? 'active' : 'paused'
    await updateProject(p.id, { status: nextStatus })
    setMenuId(null)
  }

  const reactivateCompletedProject = async (id: string) => {
    await updateProject(id, { status: 'active' })
  }

  const openTaskDrawerForProject = (p: Project) => {
    const cid = p.clientId?.trim()
    const sid = p.supplierId?.trim()
    openNewTaskDraft({
      assigneeId: p.ownerId || defaultOwnerId,
      dueDate: todayYmd(),
      projectId: p.id,
      ...(cid ? { clientId: cid } : {}),
      ...(sid ? { supplierId: sid } : {}),
    })
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-8 py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">
            פרויקטים
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-mid)]">
            מעקב לפי סטטוס פרויקט
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportExcelButton
            onClick={() =>
              exportProjectsToExcel({
                projects: filtered,
                clientNameById: new Map(
                  clients.map((c) => [c.id, c.name] as const),
                ),
                supplierNameById: new Map(
                  suppliers.map((s) => [s.id, s.name] as const),
                ),
                ownerNameById: new Map(
                  teamMembers.map((u) => [u.id, u.name] as const),
                ),
              })
            }
            disabled={filtered.length === 0}
          />
          <button type="button" onClick={openNew} className={uiButtonBrand}>
            + פרויקט חדש
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className={`${hubSectionClass(0)} rounded-2xl p-4`}>
              <div className="text-[22px] font-extrabold tabular-nums text-[var(--text-dark)]">
                {projectKpis.active}
              </div>
              <div className="mt-1 text-[12px] text-[var(--text-mid)]">פעיל</div>
              <div className="mt-0.5 text-[10px] text-[var(--text-light)]">
                סטטוס «פעיל» בפרויקט
              </div>
            </div>
            <div className={`${hubSectionClass(1)} rounded-2xl p-4`}>
              <div className="text-[22px] font-extrabold tabular-nums text-[var(--text-dark)]">
                {projectKpis.paused}
              </div>
              <div className="mt-1 text-[12px] text-[var(--text-mid)]">מושהה</div>
              <div className="mt-0.5 text-[10px] text-[var(--text-light)]">
                סטטוס «מושהה»
              </div>
            </div>
            <div className={`${hubSectionClass(2)} rounded-2xl p-4`}>
              <div className="text-[22px] font-extrabold tabular-nums text-[var(--text-dark)]">
                {projectKpis.completed}
              </div>
              <div className="mt-1 text-[12px] text-[var(--text-mid)]">הושלם</div>
              <div className="mt-0.5 text-[10px] text-[var(--text-light)]">
                סטטוס «הושלם»
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-light)]">
              סוג
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {kindFilterButtons.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setKindFilter(b.key)}
                  className={
                    kindFilter === b.key
                      ? b.key === 'internal'
                        ? `${uiButtonBase} border-transparent text-white shadow-sm`
                        : uiFilterActive
                      : uiFilterInactive
                  }
                  style={
                    kindFilter === b.key && b.key === 'internal'
                      ? { backgroundColor: INTERNAL_PROJECT_BADGE_COLOR }
                      : undefined
                  }
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-light)]">
              סטטוס
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {filterButtons.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setStatusFilter(b.key)}
                  className={
                    statusFilter === b.key ? uiFilterActive : uiFilterInactive
                  }
                >
                  {b.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAttentionOnly((v) => !v)}
                className={`${uiButtonBase} ${
                  attentionOnly
                    ? 'border border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]'
                    : 'border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                }`}
              >
                צריך טיפול היום
              </button>
            </div>
          </div>
        </div>
        {selectedClient ? (
          <div className="flex items-center gap-2 rounded-[10px] border border-[#FED7AA] bg-[var(--orange-light)] px-3 py-2 text-xs text-[var(--text-dark)]">
            <span>
              סינון לקוח: <strong>{selectedClient.name}</strong>
            </span>
            <button
              type="button"
                className="inline-flex h-8 min-w-[32px] items-center justify-center rounded-md px-2 text-[var(--text-mid)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-dark)]"
              onClick={() => setSelectedClient(null)}
            >
              ✕
            </button>
          </div>
        ) : null}
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[var(--text-dark)]">
            פרויקטים בתהליך
          </h2>
          <span className="text-xs text-[var(--text-light)]">
            {activeFiltered.length} פרויקטים
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {activeFiltered.map((p, idx) => {
          const client = p.clientId ? clientMap.get(p.clientId) : undefined
          const supplier = p.supplierId?.trim()
            ? supplierMap.get(p.supplierId.trim())
            : undefined
          const owner = memberMap.get(p.ownerId)
          return (
            <article
              key={p.id}
              className={`relative rounded-2xl ${hubSectionClass(idx)} p-5 transition hover:brightness-[1.02]`}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/projects/${p.id}`)}
                  className="min-w-0 flex-1 text-right"
                >
                  <h2 className="text-lg font-bold text-[var(--text-dark)]">
                    {p.name}
                  </h2>
                  {p.description?.trim() ? (
                    <p
                      className="mt-1 line-clamp-3 text-[12px] leading-snug text-[var(--text-mid)]"
                      title={p.description.trim()}
                    >
                      {p.description.trim()}
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm text-[var(--text-mid)]">
                    {isInternalProject(p)
                      ? 'פנימי'
                      : client?.name ?? 'לקוח לא ידוע'}
                  </p>
                  {p.supplierId?.trim() ? (
                    <p className="mt-0.5 text-xs text-[var(--text-light)]">
                      ספק ביצוע: {supplier?.name ?? 'לא ברשימה'}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {isInternalProject(p) ? (
                      <Badge
                        label="פנימי"
                        color={INTERNAL_PROJECT_BADGE_COLOR}
                      />
                    ) : null}
                    {isRetainerProject(p) ? (
                      <Badge label="שוטף 🔄" color={RETAINER_ACCENT} />
                    ) : null}
                    <Badge
                      label={statusLabels[p.status]}
                      color={projectStatusBadgeColor[p.status]}
                    />
                    {(() => {
                      const score = projectHealthScore(p, today)
                      const tone = healthTone(score)
                      return (
                        <Badge
                          label={`בריאות: ${tone.label} ${score}%`}
                          color={tone.color}
                        />
                      )
                    })()}
                  </div>
                </button>
                <div className="relative shrink-0" ref={menuId === p.id ? menuRef : null}>
                  <button
                    type="button"
                    aria-label="תפריט"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-[var(--text-mid)] hover:bg-[var(--orange-light)] hover:text-[var(--text-dark)]"
                    onClick={() => setMenuId((id) => (id === p.id ? null : p.id))}
                  >
                    ···
                  </button>
                  {menuId === p.id ? (
                    <div className="absolute left-0 z-30 mt-1 min-w-[140px] overflow-hidden rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
                      <button
                        type="button"
                        className="block h-9 w-full px-3 text-right text-xs font-semibold text-[var(--text-dark)] hover:bg-[var(--orange-light)]"
                        onClick={() => openEdit(p)}
                      >
                        עריכה
                      </button>
                      {p.status !== 'done' ? (
                        <button
                          type="button"
                          className="block h-9 w-full px-3 text-right text-xs font-semibold text-[#166534] hover:bg-[#ECFDF5]"
                          onClick={() => {
                            void markProjectDone(p.id)
                          }}
                        >
                          סמן כהושלם
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="block h-9 w-full px-3 text-right text-xs font-semibold text-[var(--danger)] hover:bg-[#FEF2F2]"
                        onClick={() => {
                          setDeleteId(p.id)
                          setMenuId(null)
                        }}
                      >
                        מחיקה
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate(`/projects/${p.id}`)}
                className="mt-4 block w-full text-right"
              >
                <ProgressBar
                  done={p.doneCount}
                  total={p.taskCount}
                  color={p.color}
                  manualPercent={p.manualProgressPercent}
                  onManualPercentCommit={(v) => {
                    void updateProject(
                      p.id,
                      v === null
                        ? {
                            manualProgressPercent:
                              deleteField() as unknown as number,
                          }
                        : { manualProgressPercent: v },
                    )
                  }}
                />
                <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-light)]">
                  <span>
                    {p.doneCount}/{p.taskCount} משימות
                  </span>
                  <span>
                    {isRetainerProject(p) && p.startDate ? (
                      <>
                        פעיל מאז {formatDateIL(p.startDate)}
                      </>
                    ) : (
                      <>יעד: {formatDateIL(p.dueDate)}</>
                    )}
                  </span>
                  <Badge
                    label={priorityLabels[p.priority]}
                    color={priorityColor(p.priority)}
                  />
                  {owner ? <Avatar member={owner} size={26} /> : null}
                </div>
              </button>
              {p.status !== 'done' ? (
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void toggleProjectPause(p)
                    }}
                    className={`${uiButtonBase} min-w-[124px] border ${
                      p.status === 'paused'
                        ? 'border-[var(--orange)] bg-[var(--orange-light)] text-[var(--orange)] hover:bg-[#ffe8d4]'
                        : 'border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                    }`}
                  >
                    {p.status === 'paused' ? '▶ החזר לפעיל' : '⏸ השהה'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openTaskDrawerForProject(p)}
                    className={`${uiButtonBrandOutline} min-w-[124px]`}
                  >
                    + הוסף משימה
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void markProjectDone(p.id)
                    }}
                    className={`${uiButtonBase} min-w-[124px] border border-[#86EFAC] bg-[#ECFDF5] text-[#166534] hover:bg-[#DCFCE7]`}
                  >
                    ✓ סמן כהושלם
                  </button>
                </div>
              ) : null}
            </article>
          )
          })}
        </div>
        {activeFiltered.length === 0 ? (
          <p className="text-sm text-[var(--text-mid)]">אין פרויקטים בתהליך להצגה</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[#475569]">פרויקטים מושהים</h2>
          <span className="text-xs text-[var(--text-light)]">
            {pausedFiltered.length} פרויקטים
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {pausedFiltered.map((p, idx) => {
            const client = p.clientId ? clientMap.get(p.clientId) : undefined
            const owner = memberMap.get(p.ownerId)
            return (
              <article
                key={p.id}
                className={`rounded-2xl ${hubSectionClass(activeFiltered.length + idx)} p-5 shadow-none`}
              >
                <button
                  type="button"
                  onClick={() => navigate(`/projects/${p.id}`)}
                  className="w-full text-right"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-[#0F172A]">{p.name}</h3>
                    <Badge label="מושהה" color="#64748B" />
                  </div>
                  <p className="mt-1 text-sm text-[#475569]">
                    {isInternalProject(p) ? 'פנימי' : client?.name ?? 'לקוח לא ידוע'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[#64748B]">
                    <span>
                      {p.doneCount}/{p.taskCount} משימות
                    </span>
                    <span>יעד: {formatDateIL(p.dueDate)}</span>
                    {owner ? <Avatar member={owner} size={24} /> : null}
                  </div>
                </button>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      void toggleProjectPause(p)
                    }}
                    className={`${uiButtonBrandOutline} min-w-[124px]`}
                  >
                    ▶ החזר לפעיל
                  </button>
                </div>
              </article>
            )
          })}
        </div>
        {pausedFiltered.length === 0 ? (
          <p className="text-sm text-[var(--text-mid)]">אין פרויקטים מושהים</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[#166534]">פרויקטים שהושלמו</h2>
          <span className="text-xs text-[var(--text-light)]">
            {completedFiltered.length} פרויקטים
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {completedFiltered.map((p) => {
            const client = p.clientId ? clientMap.get(p.clientId) : undefined
            const owner = memberMap.get(p.ownerId)
            return (
              <article
                key={p.id}
                className="rounded-[14px] border border-[#BBF7D0] bg-[#F0FDF4] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/projects/${p.id}`)}
                  className="w-full text-right"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-[#14532D]">{p.name}</h3>
                    <Badge label="הושלם" color="#16A34A" />
                  </div>
                  <p className="mt-1 text-sm text-[#166534]">
                    {isInternalProject(p) ? 'פנימי' : client?.name ?? 'לקוח לא ידוע'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[#166534]">
                    <span>
                      {p.doneCount}/{p.taskCount} משימות
                    </span>
                    <span>יעד: {formatDateIL(p.dueDate)}</span>
                    {owner ? <Avatar member={owner} size={24} /> : null}
                  </div>
                </button>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void reactivateCompletedProject(p.id)}
                    className={`${uiButtonBrandOutline} min-w-[124px]`}
                  >
                    ▶ החזר לפעיל
                  </button>
                </div>
              </article>
            )
          })}
        </div>
        {completedFiltered.length === 0 ? (
          <p className="text-sm text-[var(--text-mid)]">אין פרויקטים שהושלמו</p>
        ) : null}
      </section>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'עריכת פרויקט' : 'פרויקט חדש'}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">שם *</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">
              תיאור (אופציונלי)
            </label>
            <textarea
              rows={3}
              placeholder="מה הפרויקט כולל — יוצג בכרטיס הפרויקט"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
          <div>
            <span className="mb-1 block text-xs text-[var(--text-mid)]">
              סוג פרויקט
            </span>
            <div className="flex rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] p-0.5">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: 'client' }))}
                className={`flex-1 rounded-[8px] py-2.5 text-xs font-bold transition ${
                  form.type === 'client'
                    ? 'bg-[var(--dash-panel-bg)] text-[var(--orange)] shadow-sm'
                    : 'text-[var(--text-mid)]'
                }`}
              >
                פרויקט לקוח
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, type: 'internal', clientId: '' }))
                }
                className={`flex-1 rounded-[8px] py-2.5 text-xs font-bold transition ${
                  form.type === 'internal'
                    ? 'bg-[var(--dash-panel-bg)] shadow-sm'
                    : 'text-[var(--text-mid)]'
                }`}
                style={
                  form.type === 'internal'
                    ? { color: INTERNAL_PROJECT_BADGE_COLOR }
                    : undefined
                }
              >
                פרויקט פנימי
              </button>
            </div>
          </div>
          <div>
            <span className="mb-1 block text-xs text-[var(--text-mid)]">
              סוג התקשרות
            </span>
            <div className="flex rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] p-0.5">
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, projectBillingType: 'one-time' }))
                }
                className={`flex-1 rounded-[8px] py-2.5 text-xs font-bold transition ${
                  form.projectBillingType === 'one-time'
                    ? 'bg-[var(--dash-panel-bg)] text-[var(--orange)] shadow-sm'
                    : 'text-[var(--text-mid)]'
                }`}
              >
                חד־פעמי
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    projectBillingType: 'retainer',
                    startDate: f.startDate || todayYmd(),
                  }))
                }
                className={`flex-1 rounded-[8px] py-2.5 text-xs font-bold transition ${
                  form.projectBillingType === 'retainer'
                    ? 'bg-[var(--dash-panel-bg)] shadow-sm'
                    : 'text-[var(--text-mid)]'
                }`}
                style={
                  form.projectBillingType === 'retainer'
                    ? { color: RETAINER_ACCENT }
                    : undefined
                }
              >
                שוטף 🔄
              </button>
            </div>
          </div>
          {form.projectBillingType === 'retainer' ? (
            <div className="space-y-3 rounded-[10px] border border-[var(--border)] bg-[#FAF5FF] p-3">
              <p className="text-[11px] font-bold" style={{ color: RETAINER_ACCENT }}>
                פרויקט שוטף
              </p>
              <p className="text-[11px] leading-snug text-[var(--text-mid)]">
                לניהול עדכונים וביקורות חודשיות. ספק משויך נבחר בשדה ״ספק ביצוע״ למטה
                (פעם אחת בלבד).
              </p>
              <div>
                <label className="mb-1 block text-xs text-[var(--text-mid)]">
                  תאריך התחלה
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, startDate: e.target.value }))
                  }
                />
              </div>
            </div>
          ) : null}
          <div>
            <label
              htmlFor="project-client-quick"
              className="mb-1 block text-xs text-[var(--text-mid)]"
            >
              {form.type === 'client'
                ? 'לקוח * — זיהוי מהיר'
                : 'לקוח משויך (אופציונלי) — זיהוי מהיר'}
            </label>
            <ClientQuickSelect
              id="project-client-quick"
              clients={clients}
              value={form.clientId}
              onChange={(clientId) =>
                setForm((f) => ({ ...f, clientId }))
              }
            />
          </div>
          <div>
            <label
              htmlFor="project-supplier-quick"
              className="mb-1 block text-xs text-[var(--text-mid)]"
            >
              ספק ביצוע — זיהוי מהיר
            </label>
            <SupplierQuickSelect
              id="project-supplier-quick"
              suppliers={suppliers}
              value={form.supplierId}
              onChange={(supplierId) =>
                setForm((f) => ({ ...f, supplierId }))
              }
              quickAdd
              onQuickAdd={async (name) =>
                addSupplier({ name: name.trim(), phone: '', email: '' })
              }
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-[var(--text-mid)]">
                סטטוס
              </label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as ProjectStatus,
                  }))
                }
              >
                {(Object.keys(statusLabels) as ProjectStatus[]).map((k) => (
                  <option key={k} value={k}>
                    {statusLabels[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-mid)]">
                עדיפות
              </label>
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm((f) => ({
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
          </div>
          {form.projectBillingType === 'one-time' ? (
            <div>
              <label className="mb-1 block text-xs text-[var(--text-mid)]">
                תאריך יעד
              </label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dueDate: e.target.value }))
                }
              />
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">אחראי</label>
            <select
              value={form.ownerId}
              onChange={(e) =>
                setForm((f) => ({ ...f, ownerId: e.target.value }))
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
              צבע פרויקט
            </label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className="h-8 w-8 rounded-full border-2 transition"
                  style={{
                    backgroundColor: c,
                    borderColor:
                      form.color === c ? 'var(--orange)' : 'transparent',
                    boxShadow:
                      form.color === c
                        ? '0 0 0 2px rgba(249,115,22,0.35)'
                        : undefined,
                  }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className={uiButtonGhost}
            >
              ביטול
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit()}
              className={`${uiButtonBrand} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {saving ? 'שומר…' : 'שמור'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) deleteProject(deleteId)
        }}
        message="למחוק פרויקט זה? יימחקו גם כל המשימות והמסמכים שלו."
      />
    </div>
  )
}
