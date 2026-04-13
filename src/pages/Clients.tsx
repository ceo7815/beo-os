import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '../components/shared/Badge'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { Modal } from '../components/shared/Modal'
import { formatDateIL } from '../lib/dates'
import { useClients } from '../hooks/useClients'
import { useProjects } from '../hooks/useProjects'
import { useHubStore } from '../store/useStore'
import type { Client, ClientStatus } from '../types'

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

interface ClientFormState {
  name: string
  contact: string
  phone: string
  email: string
  status: ClientStatus
}

const emptyForm: ClientFormState = {
  name: '',
  contact: '',
  phone: '',
  email: '',
  status: 'active',
}

export function Clients() {
  const navigate = useNavigate()
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

  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm)
    setErrors({})
    setModalOpen(true)
  }

  const openEdit = (c: Client) => {
    setEditingId(c.id)
    setForm({
      name: c.name,
      contact: c.contact,
      phone: c.phone,
      email: c.email,
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
    if (editingId) {
      updateClient(editingId, {
        name: form.name.trim(),
        contact: form.contact.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        status: form.status,
      })
    } else {
      addClient({
        name: form.name.trim(),
        contact: form.contact.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
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

      <input
        type="search"
        placeholder="חיפוש לפי שם לקוח..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-md"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {filtered.map((c) => {
          const initial = c.name.trim().charAt(0) || '?'
          const statusLabel = c.status === 'active' ? 'פעיל' : 'לא פעיל'
          const statusColor = c.status === 'active' ? '#16A34A' : '#64748B'
          const count = projectCount(c.id)
          return (
            <article
              key={c.id}
              className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition hover:border-[var(--blue-mid)] hover:shadow-[0_4px_20px_rgba(37,99,235,0.12)]"
            >
              <div className="flex gap-4">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--blue-light)] text-2xl font-extrabold text-[var(--blue-mid)]"
                >
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-[var(--text-dark)]">
                      {c.name}
                    </h2>
                    <Badge label={statusLabel} color={statusColor} />
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-mid)]">{c.contact}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm">
                    <a
                      className="font-medium text-[var(--blue-mid)] hover:underline"
                      href={`tel:${c.phone.replace(/\s/g, '')}`}
                    >
                      {c.phone}
                    </a>
                    <a
                      className="font-medium text-[var(--blue-mid)] hover:underline"
                      href={`mailto:${c.email}`}
                    >
                      {c.email}
                    </a>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-light)]">
                    נוצר: {formatDateIL(c.createdAt)}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
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
            </article>
          )
        })}
      </div>

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
