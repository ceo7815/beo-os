import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Badge } from '../components/shared/Badge'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { Modal } from '../components/shared/Modal'
import { formatDateIL } from '../lib/dates'
import { useClients } from '../hooks/useClients'
import { useProjects } from '../hooks/useProjects'
import { useUsers } from '../hooks/useUsers'
import { isAdminRole } from '../components/RequireAdmin'
import { useHubStore } from '../store/useStore'
import type { Client, ClientStatus } from '../types'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { ClientActivityModal } from '../components/ClientActivityModal'
import { ClientsSyncButton } from '../components/ClientsSyncButton'
import { exportClientsToExcel } from '../lib/clientsExcelExport'

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

interface ClientFormState {
  name: string
  contact: string
  addressLine: string
  city: string
  zipcode: string
  country: string
  phone: string
  phone2: string
  fax: string
  email: string
  idNumber: string
  taxId: string
  foreignId: string
  salesAgentUserId: string
  rivhitProjectRef: string
  payingCustomerName: string
  currency: string
  department: string
  status: ClientStatus
  assignedEmployeeUserIds: string[]
}

const emptyForm: ClientFormState = {
  name: '',
  contact: '',
  addressLine: '',
  city: '',
  zipcode: '',
  country: 'ישראל',
  phone: '',
  phone2: '',
  fax: '',
  email: '',
  idNumber: '',
  taxId: '',
  foreignId: '',
  salesAgentUserId: '',
  rivhitProjectRef: '',
  payingCustomerName: '',
  currency: 'ILS',
  department: '',
  status: 'active',
  assignedEmployeeUserIds: [],
}

const NEW_CLIENT_DAYS = 60

function ClientKpiCard(props: {
  seq: number
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className={`${hubSectionClass(props.seq)} rounded-2xl p-4`}>
      <div className="text-[22px] font-extrabold tabular-nums text-[var(--text-dark)]">
        {props.value}
      </div>
      <div className="mt-1 text-[12px] text-[var(--text-mid)]">{props.label}</div>
      {props.sub ? (
        <div className="mt-0.5 text-[10px] text-[var(--text-light)]">{props.sub}</div>
      ) : null}
    </div>
  )
}

export function Clients() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { clients, addClient, updateClient, deleteClient } = useClients()
  const { projects } = useProjects()
  const { users: teamMembers } = useUsers()
  const setSelectedClient = useHubStore((s) => s.setSelectedClient)
  const pushToast = useHubStore((s) => s.pushToast)

  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ClientFormState>(emptyForm)
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [activityClient, setActivityClient] = useState<Client | null>(null)

  const myMember = useMemo(
    () => teamMembers.find((m) => m.id === (user?.uid ?? '')),
    [teamMembers, user?.uid],
  )
  const isAdmin = Boolean(myMember && isAdminRole(myMember.role))

  const employeeAssignOptions = useMemo(
    () =>
      teamMembers
        .filter((u) => u.role === 'employee' && u.active !== false)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [teamMembers],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) => c.name.toLowerCase().includes(q))
  }, [clients, query])

  const clientKpis = useMemo(() => {
    const now = Date.now()
    const windowMs = NEW_CLIENT_DAYS * 24 * 60 * 60 * 1000
    let active = 0
    let inactive = 0
    let newInWindow = 0
    for (const c of clients) {
      if (c.status === 'active') active += 1
      else inactive += 1
      const t = new Date(c.createdAt).getTime()
      if (Number.isFinite(t) && now - t <= windowMs && now >= t) newInWindow += 1
    }
    return { active, inactive, newInWindow }
  }, [clients])

  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm)
    setErrors({})
    setModalOpen(true)
  }

  useEffect(() => {
    const st = location.state as { openAdd?: boolean } | undefined
    if (!st?.openAdd) return
    setEditingId(null)
    setForm(emptyForm)
    setErrors({})
    setModalOpen(true)
    navigate('.', { replace: true, state: null })
  }, [location.state, navigate])

  const openEdit = (c: Client) => {
    setEditingId(c.id)
    setForm({
      name: c.name,
      contact: c.contact,
      addressLine: c.addressLine ?? '',
      city: c.city ?? '',
      zipcode: c.zipcode ?? '',
      country: c.country ?? 'ישראל',
      phone: c.phone,
      phone2: c.phone2 ?? '',
      fax: c.fax ?? '',
      email: c.email,
      idNumber: c.idNumber ?? '',
      taxId: c.taxId ?? '',
      foreignId: c.foreignId ?? '',
      salesAgentUserId: c.salesAgentUserId ?? '',
      rivhitProjectRef: c.rivhitProjectRef ?? '',
      payingCustomerName: c.payingCustomerName ?? '',
      currency: c.currency ?? 'ILS',
      department: c.department ?? '',
      status: c.status,
      assignedEmployeeUserIds: c.assignedEmployeeUserIds?.length
        ? [...c.assignedEmployeeUserIds]
        : [],
    })
    setErrors({})
    setModalOpen(true)
  }

  const submit = async () => {
    const nextErrors: { name?: string; email?: string } = {}
    if (!form.name.trim()) nextErrors.name = 'שם משפחה/עסק חובה (כמו בריווחית)'
    if (form.email.trim() && !isValidEmail(form.email)) nextErrors.email = 'אימייל לא תקין'
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }
    const departmentTrim = form.department.trim()
    const payload = {
      name: form.name.trim(),
      contact: form.contact.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      addressLine: form.addressLine.trim() || undefined,
      city: form.city.trim() || undefined,
      zipcode: form.zipcode.trim() || undefined,
      country: form.country.trim() || undefined,
      phone2: form.phone2.trim() || undefined,
      fax: form.fax.trim() || undefined,
      idNumber: form.idNumber.trim() || undefined,
      taxId: form.taxId.trim() || undefined,
      foreignId: form.foreignId.trim() || undefined,
      salesAgentUserId: form.salesAgentUserId || undefined,
      rivhitProjectRef: form.rivhitProjectRef.trim() || undefined,
      payingCustomerName: form.payingCustomerName.trim() || undefined,
      currency: form.currency || 'ILS',
      ...(departmentTrim ? { department: departmentTrim } : { department: null as null }),
      status: form.status,
      assignedEmployeeUserIds: form.assignedEmployeeUserIds,
    }
    if (editingId) {
      await updateClient(editingId, payload)
    } else {
      const { department, ...rest } = payload
      await addClient({
        ...rest,
        ...(departmentTrim ? { department: departmentTrim } : {}),
        ...(form.assignedEmployeeUserIds.length
          ? { assignedEmployeeUserIds: form.assignedEmployeeUserIds }
          : {}),
      })
    }
    setModalOpen(false)
  }

  const projectCount = (clientId: string) =>
    projects.filter((p) => p.clientId === clientId).length

  const formatAssignedNames = (c: Client) => {
    const ids = c.assignedEmployeeUserIds
    if (!ids?.length) return '—'
    return ids
      .map((id) => teamMembers.find((m) => m.id === id)?.name ?? id)
      .join(' · ')
  }

  const projectCountByClientId = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of projects) {
      if (!p.clientId) continue
      map.set(p.clientId, (map.get(p.clientId) ?? 0) + 1)
    }
    return map
  }, [projects])

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of teamMembers) map.set(m.id, m.name)
    return map
  }, [teamMembers])

  const exportExcel = () => {
    if (clients.length === 0) {
      pushToast('אין לקוחות לייצוא', 'error')
      return
    }
    exportClientsToExcel({
      clients,
      projectCountByClientId,
      teamNameById,
    })
    pushToast(`יוצאו ${clients.length} לקוחות לאקסל`, 'success')
  }

  function ClientMobileCard({ c }: { c: Client }) {
    const statusLabel = c.status === 'active' ? 'פעיל' : 'לא פעיל'
    const statusColor = c.status === 'active' ? '#16A34A' : '#64748B'
    const count = projectCount(c.id)

    const mobField = (label: string, node: ReactNode) => (
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-[var(--text-light)]">{label}</p>
        <div className="mt-1 min-w-0 text-[13px] text-[var(--text-dark)]">{node}</div>
      </div>
    )

    return (
      <article className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border)] pb-3">
          <button
            type="button"
            onClick={() => setActivityClient(c)}
            className="min-w-0 flex-1 text-right text-base font-extrabold leading-snug text-[var(--orange)] underline-offset-2 hover:underline"
          >
            {c.name}
          </button>
          <Badge label={statusLabel} color={statusColor} />
        </div>

        <div className="mt-3 space-y-3">
          {mobField('איש קשר', c.contact || <span className="text-[var(--text-light)]">—</span>)}
          {mobField(
            'טלפון',
            c.phone ? (
              <a
                className="break-all font-mono font-medium text-[var(--blue-mid)] hover:underline"
                dir="ltr"
                href={`tel:${c.phone.replace(/\s/g, '')}`}
              >
                {c.phone}
              </a>
            ) : (
              <span className="text-[var(--text-light)]">—</span>
            ),
          )}
          {mobField(
            'אימייל',
            c.email ? (
              <a
                className="break-all font-medium text-[var(--blue-mid)] hover:underline"
                dir="ltr"
                href={`mailto:${c.email}`}
              >
                {c.email}
              </a>
            ) : (
              <span className="text-[var(--text-light)]">—</span>
            ),
          )}
          {mobField(
            'מחלקה',
            c.department ? (
              <span className="text-[var(--text-mid)]">{c.department}</span>
            ) : (
              <span className="text-[var(--text-light)]">—</span>
            ),
          )}
          {mobField('עובדים משויכים', formatAssignedNames(c))}
          {mobField('תאריך כניסה', formatDateIL(c.createdAt))}
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t border-[var(--border)] pt-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => {
              setSelectedClient(c.id)
              navigate('/projects')
            }}
            className="w-full rounded-[10px] border border-[#BFDBFE] bg-[var(--blue-light)] px-3 py-2 text-xs font-semibold text-[var(--blue-mid)] transition hover:bg-[#DBEAFE] sm:w-auto sm:flex-1"
          >
            {count} פרויקטים
          </button>
          <button
            type="button"
            onClick={() => openEdit(c)}
            className="w-full rounded-[10px] border border-[#BFDBFE] bg-[var(--blue-light)] px-3 py-2 text-xs font-semibold text-[var(--blue-mid)] transition hover:bg-[#DBEAFE] sm:w-auto sm:flex-1"
          >
            עריכה
          </button>
          <button
            type="button"
            onClick={() => setDeleteId(c.id)}
            className="hub-btn-danger w-full px-3 py-2 text-xs sm:w-auto"
          >
            מחיקה
          </button>
        </div>
      </article>
    )
  }

  return (
    <div className="beo-page space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">
            לקוחות
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-mid)]">
            ניהול לקוחות ופרטי קשר
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {isAdmin ? <ClientsSyncButton /> : null}
          <button
            type="button"
            onClick={exportExcel}
            className="rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-sm font-semibold text-[var(--orange)] transition hover:bg-[var(--orange-light)]"
          >
            ייצוא לאקסל
          </button>
          <button type="button" onClick={openNew} className="hub-btn-primary text-sm">
            + לקוח חדש
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <ClientKpiCard
          seq={0}
          label="לקוחות פעילים"
          value={String(clientKpis.active)}
          sub="סטטוס «פעיל» בכרטיס הלקוח"
        />
        <ClientKpiCard
          seq={1}
          label="לקוחות לא פעילים"
          value={String(clientKpis.inactive)}
          sub="סטטוס «לא פעיל»"
        />
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <ClientKpiCard
            seq={2}
            label="לקוחות חדשים"
            value={String(clientKpis.newInWindow)}
            sub={`נוספו למערכת ב־${NEW_CLIENT_DAYS} הימים האחרונים (תאריך כניסה)`}
          />
        </div>
      </section>

      <input
        type="search"
        placeholder="חיפוש לפי שם לקוח..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full max-w-full md:max-w-md"
      />

      <section className={`rounded-2xl ${hubSectionClass(3)} shadow-none`}>
        <div className="md:hidden">
          <div className="space-y-3 p-3 sm:p-5">
            {filtered.map((c) => (
              <ClientMobileCard key={c.id} c={c} />
            ))}
          </div>
        </div>

        <div className="hidden md:block">
          <div>
            <table className="w-full table-fixed text-sm">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-right text-[11px] font-bold text-[var(--text-light)]">
                <th className="px-3 py-3">חברה</th>
                <th className="px-3 py-3">איש קשר</th>
                <th className="px-3 py-3">טלפון</th>
                <th className="px-3 py-3">אימייל</th>
                <th className="px-3 py-3">מחלקה</th>
                <th className="px-3 py-3">סטטוס</th>
                <th className="px-3 py-3">תאריך כניסה</th>
                <th className="px-3 py-3">עובדים משויכים</th>
                <th className="px-3 py-3">פרויקטים</th>
                <th className="px-3 py-3">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const statusLabel = c.status === 'active' ? 'פעיל' : 'לא פעיל'
                const statusColor = c.status === 'active' ? '#16A34A' : '#64748B'
                const count = projectCount(c.id)
                return (
                  <tr key={c.id} className="border-t border-[var(--border)] align-top">
                    <td className="px-3 py-3 break-words">
                      <button
                        type="button"
                        onClick={() => setActivityClient(c)}
                        className="text-right font-semibold text-[var(--orange)] underline-offset-2 hover:underline"
                      >
                        {c.name}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-[var(--text-mid)] break-words">
                      {c.contact || '—'}
                    </td>
                    <td className="px-3 py-3 text-[var(--text-mid)] break-all" dir="ltr">
                      {c.phone ? (
                        <a
                          className="font-medium text-[var(--blue-mid)] hover:underline"
                          href={`tel:${c.phone.replace(/\s/g, '')}`}
                        >
                          {c.phone}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-3 text-[var(--text-mid)] break-all" dir="ltr">
                      {c.email ? (
                        <a
                          className="font-medium text-[var(--blue-mid)] hover:underline"
                          href={`mailto:${c.email}`}
                        >
                          {c.email}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-3 text-[var(--text-mid)] break-words">
                      {c.department || '—'}
                    </td>
                    <td className="px-3 py-3">
                      <Badge label={statusLabel} color={statusColor} />
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--text-mid)]">
                      {formatDateIL(c.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--text-mid)] break-words">
                      {formatAssignedNames(c)}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedClient(c.id)
                          navigate('/projects')
                        }}
                        className="rounded-[10px] border border-[#BFDBFE] bg-[var(--blue-light)] px-3 py-1.5 text-xs font-semibold text-[var(--blue-mid)] transition hover:bg-[#DBEAFE]"
                      >
                        {count} פרויקטים
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="rounded-[10px] border border-[#BFDBFE] bg-[var(--blue-light)] px-3 py-1.5 text-xs font-semibold text-[var(--blue-mid)] transition hover:bg-[#DBEAFE]"
                        >
                          עריכה
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(c.id)}
                          className="hub-btn-danger px-3 py-1.5 text-xs"
                        >
                          מחיקה
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-mid)]">לא נמצאו לקוחות</p>
      ) : null}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'עריכת לקוח' : 'הוספת לקוח חדש'}
      >
        <div className="max-h-[70vh] space-y-2.5 overflow-y-auto pe-1">
          <p className="text-[12px] text-[var(--text-mid)]">
            שדות תואמים לריווחית. חובה רק{' '}
            <strong>שם משפחה/עסק</strong>. מספר כרטיס בריווחית נוצר אוטומטית בסנכרון.
          </p>

          {editingId ? (
            <div>
              <label className="mb-1 block text-xs text-[var(--text-mid)]">מספר כרטיס (ריווחית)</label>
              <input
                value={
                  clients.find((c) => c.id === editingId)?.rivhitCustomerId?.toString() ||
                  'עדיין לא סונכרן'
                }
                readOnly
                className="bg-black/[0.03]"
              />
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">שם משפחה/עסק *</label>
            <input
              placeholder="שם משפחה/עסק"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            {errors.name ? (
              <p className="mt-1 text-xs text-[var(--danger)]">{errors.name}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">שם פרטי</label>
            <input
              placeholder="שם פרטי"
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">רחוב</label>
            <input
              placeholder="רחוב"
              value={form.addressLine}
              onChange={(e) => setForm((f) => ({ ...f, addressLine: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-[var(--text-mid)]">עיר</label>
              <input
                placeholder="עיר"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-mid)]">מיקוד</label>
              <input
                placeholder="מיקוד"
                value={form.zipcode}
                onChange={(e) => setForm((f) => ({ ...f, zipcode: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">מדינה</label>
            <input
              placeholder="מדינה"
              value={form.country}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">מספר טלפון</label>
            <input
              placeholder="מספר טלפון"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">מספר טלפון נוסף</label>
            <input
              placeholder="מספר טלפון נוסף"
              value={form.phone2}
              onChange={(e) => setForm((f) => ({ ...f, phone2: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">מספר פקס</label>
            <input
              placeholder="מספר פקס"
              value={form.fax}
              onChange={(e) => setForm((f) => ({ ...f, fax: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">כתובת דוא״ל</label>
            <input
              type="email"
              placeholder="כתובת דוא״ל"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            {errors.email ? (
              <p className="mt-1 text-xs text-[var(--danger)]">{errors.email}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">מספר ת״ז</label>
            <input
              placeholder="מספר ת״ז"
              value={form.idNumber}
              onChange={(e) => setForm((f) => ({ ...f, idNumber: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">עוסק מורשה</label>
            <input
              placeholder="עוסק מורשה / ח.פ"
              value={form.taxId}
              onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">מספר זר</label>
            <input
              placeholder="מספר זר"
              value={form.foreignId}
              onChange={(e) => setForm((f) => ({ ...f, foreignId: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">סוכן</label>
            <select
              value={form.salesAgentUserId}
              onChange={(e) => setForm((f) => ({ ...f, salesAgentUserId: e.target.value }))}
            >
              <option value="">—</option>
              {teamMembers
                .filter((u) => u.active !== false)
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name, 'he'))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">פרויקט (מס׳ בריווחית)</label>
            <input
              placeholder="פרויקט"
              value={form.rivhitProjectRef}
              onChange={(e) => setForm((f) => ({ ...f, rivhitProjectRef: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">לקוח משלם</label>
            <input
              placeholder="לקוח משלם"
              value={form.payingCustomerName}
              onChange={(e) => setForm((f) => ({ ...f, payingCustomerName: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">מטבע</label>
            <select
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
            >
              <option value="ILS">ש״ח</option>
              <option value="USD">USD</option>
              <option value="EUR">EURO</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">
              מחלקה (פנימי Beo · לדשבורד גבייה)
            </label>
            <input
              value={form.department}
              onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              placeholder="למשל: שיווק, הייטק…"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">סטטוס</label>
            <select
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  status: e.target.value as ClientStatus,
                }))
              }
            >
              <option value="active">פעיל</option>
              <option value="inactive">לא פעיל</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">
              עובדים משויכים ללקוח (פנימי Beo)
            </label>
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] p-2 text-sm">
              {employeeAssignOptions.length === 0 ? (
                <p className="text-xs text-[var(--text-mid)]">אין עובדים פעילים ברשימה.</p>
              ) : (
                employeeAssignOptions.map((u) => (
                  <label key={u.id} className="flex cursor-pointer items-center gap-2 py-0.5">
                    <input
                      type="checkbox"
                      checked={form.assignedEmployeeUserIds.includes(u.id)}
                      onChange={() => {
                        setForm((f) => {
                          const next = new Set(f.assignedEmployeeUserIds)
                          if (next.has(u.id)) next.delete(u.id)
                          else next.add(u.id)
                          return { ...f, assignedEmployeeUserIds: [...next] }
                        })
                      }}
                      className="rounded border-[var(--border)]"
                    />
                    <span>{u.name}</span>
                  </label>
                ))
              )}
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
            <button type="button" onClick={submit} className="hub-btn-primary text-sm">
              {editingId ? 'שמור' : 'הוסף'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) deleteClient(deleteId)
        }}
        message="למחוק לקוח זה? יימחקו גם עסקאות, תקבולים, פרויקטים, משימות ומסמכים הקשורים אליו."
      />

      <ClientActivityModal
        client={activityClient}
        open={activityClient !== null}
        onClose={() => setActivityClient(null)}
      />
    </div>
  )
}
