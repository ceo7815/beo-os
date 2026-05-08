import { useMemo, useState } from 'react'
import { Badge } from '../components/shared/Badge'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { Modal } from '../components/shared/Modal'
import { formatDateIL } from '../lib/dates'
import { HUB_SUPPLIER_ID } from '../lib/hubSupplier'
import { SupplierTypesMultiSelect } from '../components/SupplierTypesMultiSelect'
import { SUPPLIER_TYPE_OPTIONS } from '../lib/supplierTypes'
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
  supplierTypes: string[]
}

const emptyForm: SupplierFormState = {
  name: '',
  phone: '',
  email: '',
  supplierTypes: [],
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
      const hay =
        `${s.name} ${s.phone} ${s.email} ${(s.supplierTypes ?? []).join(' ')}`.toLowerCase()
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
      supplierTypes: [...(s.supplierTypes ?? [])],
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
      supplierTypes: form.supplierTypes,
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

      <section className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <div>
          <table className="w-full text-sm">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-right text-[11px] font-bold text-[var(--text-light)]">
                <th className="w-[26%] px-3 py-3">שם ספק</th>
                <th className="w-[18%] px-3 py-3">טלפון</th>
                <th className="w-[22%] px-3 py-3">אימייל</th>
                <th className="w-[14%] px-3 py-3">סוגי ספק</th>
                <th className="w-[12%] px-3 py-3">תאריך יצירה</th>
                <th className="w-[10%] px-3 py-3">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const isHub = s.id === HUB_SUPPLIER_ID
                return (
                  <tr key={s.id} className="border-t border-[var(--border)] align-top">
                    <td className="px-3 py-3 font-semibold text-[var(--text-dark)] break-words">
                      {s.name}
                    </td>
                    <td className="px-3 py-3 text-right text-[var(--text-mid)]" dir="ltr">
                      {s.phone ? (
                        <a
                          className="inline-block w-full text-right font-medium text-[var(--blue-mid)] hover:underline"
                          href={`tel:${s.phone.replace(/\s/g, '')}`}
                        >
                          {s.phone}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-3 text-right text-[var(--text-mid)]" dir="ltr">
                      {s.email ? (
                        <a
                          className="inline-block w-full text-right font-medium text-[var(--blue-mid)] hover:underline"
                          href={`mailto:${s.email}`}
                        >
                          {s.email}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-3 text-[13px] text-[var(--text-mid)]">
                      {isHub ? (
                        <div className="space-y-1.5">
                          <Badge label="ספק ברירת מחדל" color="#2563EB" />
                          {(s.supplierTypes?.length ?? 0) > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {(s.supplierTypes ?? []).map((t) => (
                                <span
                                  key={t}
                                  className="inline-block rounded-md bg-[#EFF6FF] px-1.5 py-0.5 text-[11px] font-medium text-[#1D4ED8]"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : (s.supplierTypes?.length ?? 0) > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {(s.supplierTypes ?? []).map((t) => (
                            <span
                              key={t}
                              className="inline-block rounded-md bg-[#F1F5F9] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-dark)]"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--text-mid)]">
                      {formatDateIL(s.createdAt)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
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
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {!loading && filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-mid)]">לא נמצאו ספקים</p>
      ) : null}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'עריכת ספק' : 'ספק חדש'}
        bodyClassName="overflow-visible max-h-none"
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
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-dark)]">
              סוגי ספק
            </label>
            <p className="mb-2 text-[11px] text-[var(--text-mid)]">
              בחירה מרובה — הרשימה נפתחת למטה. לחצו שוב על סוג כדי לבטל בחירה.
            </p>
            <SupplierTypesMultiSelect
              value={form.supplierTypes}
              onChange={(supplierTypes) =>
                setForm((f) => ({ ...f, supplierTypes }))
              }
              options={SUPPLIER_TYPE_OPTIONS}
            />
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
