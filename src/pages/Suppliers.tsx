import { useMemo, useState } from 'react'
import { Badge } from '../components/shared/Badge'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { Modal } from '../components/shared/Modal'
import { formatDateIL } from '../lib/dates'
import { HUB_SUPPLIER_ID } from '../lib/hubSupplier'
import { useSuppliers } from '../hooks/useSuppliers'
import { useHubStore } from '../store/useStore'
import type { Supplier } from '../types'

function isValidEmailOptional(email: string): boolean {
  const t = email.trim()
  if (!t) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)
}

interface SupplierFormState {
  name: string
  phone: string
  email: string
}

const emptyForm: SupplierFormState = {
  name: '',
  phone: '',
  email: '',
}

export function Suppliers() {
  const { suppliers, loading, addSupplier, updateSupplier, deleteSupplier } =
    useSuppliers()
  const pushToast = useHubStore((s) => s.pushToast)

  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<SupplierFormState>(emptyForm)
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const sorted = useMemo(() => {
    return [...suppliers].sort((a, b) => a.name.localeCompare(b.name, 'he'))
  }, [suppliers])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((s) => {
      const hay = `${s.name} ${s.phone} ${s.email}`.toLowerCase()
      return hay.includes(q)
    })
  }, [sorted, query])

  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm)
    setErrors({})
    setModalOpen(true)
  }

  const openEdit = (s: Supplier) => {
    setEditingId(s.id)
    setForm({
      name: s.name,
      phone: s.phone,
      email: s.email,
    })
    setErrors({})
    setModalOpen(true)
  }

  const submit = async () => {
    const nextErrors: { name?: string; email?: string } = {}
    if (!form.name.trim()) nextErrors.name = 'שם הספק חובה'
    if (!isValidEmailOptional(form.email))
      nextErrors.email = 'אימייל לא תקין'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      pushToast('נא לתקן שגיאות בטופס', 'error')
      return
    }
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
    }
    if (editingId) {
      await updateSupplier(editingId, payload)
    } else {
      const id = await addSupplier(payload)
      if (!id) return
    }
    setModalOpen(false)
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-8 py-8">
      <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">
            ספקים
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-mid)]">
            רשימת ספקי ביצוע — הוספה ועריכה במקום אחד
          </p>
        </div>
        <button type="button" onClick={openNew} className="hub-btn-primary text-sm">
          + הוסף ספק
        </button>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          placeholder="חיפוש לפי שם, טלפון או אימייל…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-md"
        />
        {loading ? (
          <span className="text-sm text-[var(--text-mid)]">טוען…</span>
        ) : (
          <span className="text-sm text-[var(--text-mid)]">
            {filtered.length} ספקים
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {filtered.map((s) => {
          const initial = s.name.trim().charAt(0) || '?'
          const isHub = s.id === HUB_SUPPLIER_ID
          return (
            <article
              key={s.id}
              className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition hover:border-[var(--blue-mid)] hover:shadow-[0_4px_20px_rgba(37,99,235,0.12)]"
            >
              <div className="flex gap-4">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--orange-light)] text-2xl font-extrabold text-[var(--orange)]"
                >
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-[var(--text-dark)]">
                      {s.name}
                    </h2>
                    {isHub ? (
                      <Badge label="ספק ברירת מחדל" color="#2563EB" />
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm">
                    {s.phone ? (
                      <a
                        className="font-medium text-[var(--blue-mid)] hover:underline"
                        href={`tel:${s.phone.replace(/\s/g, '')}`}
                      >
                        {s.phone}
                      </a>
                    ) : (
                      <span className="text-[var(--text-light)]">—</span>
                    )}
                    {s.email ? (
                      <a
                        className="font-medium text-[var(--blue-mid)] hover:underline"
                        href={`mailto:${s.email}`}
                      >
                        {s.email}
                      </a>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-light)]">
                    נוצר: {formatDateIL(s.createdAt)}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(s)}
                  className="rounded-[10px] border border-[#BFDBFE] bg-[var(--blue-light)] px-3 py-1.5 text-xs font-semibold text-[var(--blue-mid)] transition hover:bg-[#DBEAFE]"
                >
                  עריכה
                </button>
                <button
                  type="button"
                  disabled={isHub}
                  title={
                    isHub ? 'לא ניתן למחוק את ספק ברירת המחדל של המערכת' : undefined
                  }
                  onClick={() => {
                    if (isHub) {
                      pushToast('לא ניתן למחוק את ספק ברירת המחדל', 'error')
                      return
                    }
                    setDeleteId(s.id)
                  }}
                  className="hub-btn-danger px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                >
                  מחיקה
                </button>
              </div>
            </article>
          )
        })}
      </div>

      {!loading && filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-mid)]">לא נמצאו ספקים</p>
      ) : null}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'עריכת ספק' : 'ספק חדש'}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">
              שם ספק *
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
            <label className="mb-1 block text-xs text-[var(--text-mid)]">טלפון</label>
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-mid)]">אימייל</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            {errors.email ? (
              <p className="mt-1 text-xs text-[var(--danger)]">{errors.email}</p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="hub-btn-secondary text-sm"
            >
              ביטול
            </button>
            <button type="button" onClick={() => void submit()} className="hub-btn-primary text-sm">
              שמור
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId && deleteId !== HUB_SUPPLIER_ID) deleteSupplier(deleteId)
        }}
        message="למחוק ספק זה? משימות ופרויקטים שמצביעים עליו יישארו עם מזהה ישן עד שיעודכנו ידנית."
      />
    </div>
  )
}
