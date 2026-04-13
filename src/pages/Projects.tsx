import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deleteField } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { formatDateIL, todayYmd } from '../lib/dates'
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
  planning: 'תכנון',
  active: 'פעיל',
  review: 'בבדיקה',
  done: 'הושלם',
}

const projectStatusBadgeColor: Record<ProjectStatus, string> = {
  planning: '#2563EB',
  active: '#2563EB',
  review: '#F97316',
  done: '#16A34A',
}

const priorityLabels: Record<Priority, string> = {
  high: 'גבוהה',
  medium: 'בינונית',
  low: 'נמוכה',
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
      status: 'planning',
      priority: 'medium',
      dueDate: '',
      startDate: todayYmd(),
      ownerId: defaultOwnerId,
      color: PROJECT_COLORS[0],
    }),
    [defaultOwnerId],
  )

  const { projects, addProject, updateProject, deleteProject } = useProjects()
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
    suppliers.forEach((s) => m.set(s.id, s))
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

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (selectedClientId && p.clientId !== selectedClientId) return false
      if (kindFilter === 'client' && isInternalProject(p)) return false
      if (kindFilter === 'internal' && !isInternalProject(p)) return false
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      return true
    })
  }, [projects, selectedClientId, kindFilter, statusFilter])

  const openNew = () => {
    setEditingId(null)
    supplierHubDefaultedRef.current = false
    setForm(emptyForm())
    setModalOpen(true)
  }

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
    { key: 'planning', label: 'תכנון' },
    { key: 'review', label: 'בבדיקה' },
    { key: 'done', label: 'הושלם' },
  ]

  const selectedClient = selectedClientId
    ? clientMap.get(selectedClientId)
    : undefined

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-8 py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">
            פרויקטים
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-mid)]">
            מעקב אחר סטטוס והתקדמות
          </p>
        </div>
        <button type="button" onClick={openNew} className="hub-btn-primary text-sm">
          + פרויקט חדש
        </button>
      </header>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-light)]">
              סוג
            </span>
            {kindFilterButtons.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => setKindFilter(b.key)}
                className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold transition ${
                  kindFilter === b.key
                    ? b.key === 'internal'
                      ? 'text-white shadow-sm'
                      : 'hub-btn-primary'
                    : 'border border-[#BFDBFE] bg-[var(--blue-light)] text-[var(--blue-mid)] hover:bg-[#DBEAFE]'
                }`}
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-light)]">
              סטטוס
            </span>
            {filterButtons.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => setStatusFilter(b.key)}
                className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold transition ${
                  statusFilter === b.key
                    ? 'hub-btn-primary'
                    : 'border border-[#BFDBFE] bg-[var(--blue-light)] text-[var(--blue-mid)] hover:bg-[#DBEAFE]'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
        {selectedClient ? (
          <div className="flex items-center gap-2 rounded-[10px] border border-[#FED7AA] bg-[var(--orange-light)] px-3 py-2 text-xs text-[var(--text-dark)]">
            <span>
              סינון לקוח: <strong>{selectedClient.name}</strong>
            </span>
            <button
              type="button"
              className="text-[var(--text-mid)] hover:text-[var(--text-dark)]"
              onClick={() => setSelectedClient(null)}
            >
              ✕
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {filtered.map((p) => {
          const client = p.clientId ? clientMap.get(p.clientId) : undefined
          const supplier = p.supplierId ? supplierMap.get(p.supplierId) : undefined
          const owner = memberMap.get(p.ownerId)
          return (
            <article
              key={p.id}
              className="relative rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition hover:border-[var(--blue-mid)] hover:shadow-[0_4px_20px_rgba(37,99,235,0.12)]"
              style={{ borderTopWidth: 4, borderTopColor: p.color }}
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
                  {supplier ? (
                    <p className="mt-0.5 text-xs text-[var(--text-light)]">
                      ספק ביצוע: {supplier.name}
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
                  </div>
                </button>
                <div className="relative shrink-0" ref={menuId === p.id ? menuRef : null}>
                  <button
                    type="button"
                    aria-label="תפריט"
                    className="rounded-[10px] px-2 py-1 text-[var(--text-mid)] hover:bg-[var(--blue-light)] hover:text-[var(--text-dark)]"
                    onClick={() => setMenuId((id) => (id === p.id ? null : p.id))}
                  >
                    ···
                  </button>
                  {menuId === p.id ? (
                    <div className="absolute left-0 z-30 mt-1 min-w-[140px] overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-right text-xs text-[var(--text-dark)] hover:bg-[var(--blue-light)]"
                        onClick={() => openEdit(p)}
                      >
                        עריכה
                      </button>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-right text-xs text-[var(--danger)] hover:bg-[#FEF2F2]"
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
            </article>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-mid)]">אין פרויקטים להצגה</p>
      ) : null}

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
                    ? 'bg-white text-[var(--blue-mid)] shadow-sm'
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
                    ? 'bg-white shadow-sm'
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
                    ? 'bg-white text-[var(--blue-mid)] shadow-sm'
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
                    ? 'bg-white shadow-sm'
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
                      form.color === c ? 'var(--blue-mid)' : 'transparent',
                    boxShadow:
                      form.color === c
                        ? '0 0 0 2px rgba(37,99,235,0.25)'
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
              className="hub-btn-secondary text-sm"
            >
              ביטול
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit()}
              className="hub-btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-60"
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
