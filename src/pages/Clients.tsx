import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Badge } from '../components/shared/Badge'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { Modal } from '../components/shared/Modal'
import { formatDateIL } from '../lib/dates'
import { useClients } from '../hooks/useClients'
import { useProjects } from '../hooks/useProjects'
import { useHubStore } from '../store/useStore'
import type { Client, ClientStatus } from '../types'
import { hubSectionClass } from '../lib/hubSectionBorder'

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

interface ClientFormState {
  name: string
  contact: string
  phone: string
  email: string
  department: string
  status: ClientStatus
}

const emptyForm: ClientFormState = {
  name: '',
  contact: '',
  phone: '',
  email: '',
  department: '',
  status: 'active',
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
  const { clients, addClient, updateClient, deleteClient } = useClients()
  const { projects } = useProjects()
  const setSelectedClient = useHubStore((s) => s.setSelectedClient)
  const pushToast = useHubStore((s) => s.pushToast)

  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ClientFormState>(emptyForm)
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)

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
      phone: c.phone,
      email: c.email,
      department: c.department ?? '',
      status: c.status,
    })
    setErrors({})
    setModalOpen(true)
  }

  const submit = () => {
    const nextErrors: { name?: string; email?: string } = {}
    if (!form.name.trim()) nextErrors.name = 'שם החברה חובה'
    if (!isValidEmail(form.email)) nextErrors.email = 'אימייל לא תקין'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      pushToast('נא לתקן שגיאות בטופס', 'error')
      return
    }
    const departmentTrim = form.department.trim()
    if (editingId) {
      updateClient(editingId, {
        name: form.name.trim(),
        contact: form.contact.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        department: departmentTrim ? departmentTrim : null,
        status: form.status,
      })
    } else {
      addClient({
        name: form.name.trim(),
        contact: form.contact.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        ...(departmentTrim ? { department: departmentTrim } : {}),
        status: form.status,
      })
    }
    setModalOpen(false)
  }

  const projectCount = (clientId: string) =>
    projects.filter((p) => p.clientId === clientId).length

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-8 py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">
            לקוחות
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-mid)]">
            ניהול לקוחות ופרטי קשר
          </p>
        </div>
        <button type="button" onClick={openNew} className="hub-btn-primary text-sm">
          + לקוח חדש
        </button>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
        <ClientKpiCard
          seq={2}
          label="לקוחות חדשים"
          value={String(clientKpis.newInWindow)}
          sub={`נוספו למערכת ב־${NEW_CLIENT_DAYS} הימים האחרונים (תאריך כניסה)`}
        />
      </section>

      <input
        type="search"
        placeholder="חיפוש לפי שם לקוח..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-md"
      />

      <section className={`rounded-2xl ${hubSectionClass(3)} shadow-none`}>
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
                    <td className="px-3 py-3 font-semibold text-[var(--text-dark)] break-words">
                      {c.name}
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
      </section>

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-mid)]">לא נמצאו לקוחות</p>
      ) : null}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'עריכת לקוח' : 'לקוח חדש'}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">
              שם חברה *
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            {errors.name ? (
              <p className="mt-1 text-xs text-[var(--danger)]">{errors.name}</p>
            ) : null}
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">
              איש קשר
            </label>
            <input
              value={form.contact}
              onChange={(e) =>
                setForm((f) => ({ ...f, contact: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">טלפון</label>
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">
              מחלקה (לדשבורד גבייה)
            </label>
            <input
              value={form.department}
              onChange={(e) =>
                setForm((f) => ({ ...f, department: e.target.value }))
              }
              placeholder="למשל: שיווק, הייטק, חשבונאות…"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">
              אימייל *
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            {errors.email ? (
              <p className="mt-1 text-xs text-[var(--danger)]">{errors.email}</p>
            ) : null}
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
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="hub-btn-secondary text-sm"
            >
              ביטול
            </button>
            <button type="button" onClick={submit} className="hub-btn-primary text-sm">
              שמור
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
        message="למחוק לקוח זה? יימחקו גם כל הפרויקטים, המשימות והמסמכים הקשורים אליו."
      />
    </div>
  )
}
