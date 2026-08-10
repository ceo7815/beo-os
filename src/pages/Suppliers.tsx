import { useMemo, useState, type ReactNode } from 'react'
import { Badge } from '../components/shared/Badge'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { Modal } from '../components/shared/Modal'
import { SupplierDetailModal } from '../components/SupplierDetailModal'
import { formatDateIL } from '../lib/dates'
import { HUB_SUPPLIER_ID } from '../lib/hubSupplier'
import { SupplierTypesMultiSelect } from '../components/SupplierTypesMultiSelect'
import { SUPPLIER_TYPE_OPTIONS } from '../lib/supplierTypes'
import { useCampaigns } from '../hooks/useCampaigns'
import { useClients } from '../hooks/useClients'
import { useProjects } from '../hooks/useProjects'
import { useSuppliers } from '../hooks/useSuppliers'
import { useTasks } from '../hooks/useTasks'
import { useHubStore } from '../store/useStore'
import type { Supplier } from '../types'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { exportSuppliersToExcel } from '../lib/suppliersExcelExport'

function isValidEmailOptional(email: string): boolean {
  const t = email.trim()
  if (!t) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)
}

function isSupplierListedActive(s: Supplier): boolean {
  return s.active !== false
}

function SupplierTypesBlock({ s }: { s: Supplier }) {
  const isHub = s.id === HUB_SUPPLIER_ID
  if (isHub) {
    return (
      <div className="space-y-1.5">
        <Badge label="ספק ברירת מחדל" color="#F97316" />
        {(s.supplierTypes?.length ?? 0) > 0 ? (
          <div className="flex flex-wrap gap-1">
            {(s.supplierTypes ?? []).map((t) => (
              <span
                key={t}
                className="inline-block rounded-md bg-[var(--orange-light)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--orange)]"
              >
                {t}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    )
  }
  if ((s.supplierTypes?.length ?? 0) > 0) {
    return (
      <div className="flex flex-wrap gap-1">
        {(s.supplierTypes ?? []).map((t) => (
          <span
            key={t}
            className="inline-block rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-dark)]"
          >
            {t}
          </span>
        ))}
      </div>
    )
  }
  return <span className="text-[var(--text-light)]">—</span>
}

const uiButtonBase =
  'inline-flex h-9 min-w-[104px] items-center justify-center rounded-[10px] px-3 text-xs font-semibold transition'
const uiFilterInactive = `${uiButtonBase} border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] text-[var(--text-mid)] hover:bg-[var(--surface-muted)]`
const uiFilterActive = `${uiButtonBase} border border-[var(--orange)] bg-[var(--orange)] text-white shadow-sm hover:bg-[#ea6c0a]`
const uiButtonBrand = `${uiButtonBase} border border-transparent bg-[var(--orange)] text-white shadow-sm hover:bg-[#ea6c0a]`
const uiButtonGhost = uiFilterInactive
const uiBtnSmOutline = `${uiButtonBase} border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--orange)] hover:bg-[var(--orange-light)]`

interface SupplierFormState {
  name: string
  phone: string
  email: string
  supplierTypes: string[]
  active: boolean
}

const emptyForm: SupplierFormState = {
  name: '',
  phone: '',
  email: '',
  supplierTypes: [],
  active: true,
}

type SupplierFilter = 'all' | 'active' | 'inactive'

export function Suppliers() {
  const { suppliers, loading, addSupplier, updateSupplier, deleteSupplier } =
    useSuppliers()
  const { projects } = useProjects()
  const { campaigns } = useCampaigns()
  const { tasks } = useTasks()
  const { clients } = useClients()
  const pushToast = useHubStore((s) => s.pushToast)

  const [query, setQuery] = useState('')
  const [supplierFilter, setSupplierFilter] = useState<SupplierFilter>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<SupplierFormState>(emptyForm)
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [detailSupplier, setDetailSupplier] = useState<Supplier | null>(null)

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>()
    clients.forEach((c) => m.set(c.id, c.name))
    return m
  }, [clients])

  const supplierKpis = useMemo(() => {
    let active = 0
    let inactive = 0
    for (const s of suppliers) {
      if (isSupplierListedActive(s)) active += 1
      else inactive += 1
    }
    return { active, inactive }
  }, [suppliers])

  const sorted = useMemo(() => {
    return [...suppliers].sort((a, b) => a.name.localeCompare(b.name, 'he'))
  }, [suppliers])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sorted.filter((s) => {
      if (supplierFilter === 'active' && !isSupplierListedActive(s)) return false
      if (supplierFilter === 'inactive' && isSupplierListedActive(s)) return false
      if (!q) return true
      const hay =
        `${s.name} ${s.phone} ${s.email} ${(s.supplierTypes ?? []).join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }, [sorted, query, supplierFilter])

  const projectCountBySupplierId = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of projects) {
      const sid = (p.supplierId ?? '').trim()
      if (!sid) continue
      map.set(sid, (map.get(sid) ?? 0) + 1)
    }
    return map
  }, [projects])

  const campaignCountBySupplierId = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of campaigns) {
      const sid = (c.supplierId ?? '').trim()
      if (!sid) continue
      map.set(sid, (map.get(sid) ?? 0) + 1)
    }
    return map
  }, [campaigns])

  const taskCountBySupplierId = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks) {
      const sid = (t.supplierId ?? '').trim()
      if (!sid) continue
      map.set(sid, (map.get(sid) ?? 0) + 1)
    }
    return map
  }, [tasks])

  const exportExcel = () => {
    if (suppliers.length === 0) {
      pushToast('אין ספקים לייצוא', 'error')
      return
    }
    exportSuppliersToExcel({
      suppliers,
      projectCountBySupplierId,
      campaignCountBySupplierId,
      taskCountBySupplierId,
    })
    pushToast(`יוצאו ${suppliers.length} ספקים לאקסל`, 'success')
  }

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
      active: isSupplierListedActive(s),
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
      active: form.active,
    }
    if (editingId) {
      await updateSupplier(editingId, payload)
    } else {
      const id = await addSupplier(payload)
      if (!id) return
    }
    setModalOpen(false)
  }

  function SupplierMobileCard({ s }: { s: Supplier }) {
    const isHub = s.id === HUB_SUPPLIER_ID
    const listedActive = isSupplierListedActive(s)

    const mobField = (label: string, node: ReactNode) => (
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-[var(--text-light)]">{label}</p>
        <div className="mt-1 min-w-0 text-[13px]">{node}</div>
      </div>
    )

    return (
      <article className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border)] pb-3">
          <button
            type="button"
            onClick={() => setDetailSupplier(s)}
            className="min-w-0 flex-1 text-right text-base font-extrabold leading-snug text-[var(--orange)] underline-offset-2 hover:underline"
          >
            {s.name}
          </button>
          <Badge
            label={listedActive ? 'פעיל' : 'לא פעיל'}
            color={listedActive ? '#16A34A' : '#64748B'}
          />
        </div>

        <div className="mt-3 space-y-3 text-[var(--text-mid)]">
          {mobField(
            'טלפון',
            s.phone ? (
              <a
                className="break-all font-mono font-medium text-[var(--orange)] hover:underline"
                dir="ltr"
                href={`tel:${s.phone.replace(/\s/g, '')}`}
              >
                {s.phone}
              </a>
            ) : (
              <span className="text-[var(--text-light)]">—</span>
            ),
          )}
          {mobField(
            'אימייל',
            s.email ? (
              <a
                className="break-all font-medium text-[var(--orange)] hover:underline"
                dir="ltr"
                href={`mailto:${s.email}`}
              >
                {s.email}
              </a>
            ) : (
              <span className="text-[var(--text-light)]">—</span>
            ),
          )}
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-[var(--text-light)]">סוגי ספק</p>
            <div className="mt-1 min-w-0 text-[13px] text-[var(--text-mid)]">
              <SupplierTypesBlock s={s} />
            </div>
          </div>
          {mobField('תאריך יצירה', formatDateIL(s.createdAt))}
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t border-[var(--border)] pt-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => openEdit(s)}
            className={`${uiBtnSmOutline} w-full justify-center sm:w-auto sm:min-w-[7rem]`}
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
            className="hub-btn-danger w-full justify-center px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            מחיקה
          </button>
        </div>
      </article>
    )
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-5 md:px-8 md:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold leading-tight text-[var(--text-dark)] md:text-[26px]">
            ספקים
          </h1>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-mid)] md:text-[13px]">
            רשימת ספקי ביצוע — הוספה ועריכה במקום אחד
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={exportExcel}
            className={`${uiButtonGhost} w-full justify-center sm:w-auto`}
          >
            ייצוא לאקסל
          </button>
          <button
            type="button"
            onClick={openNew}
            className={`${uiButtonBrand} w-full justify-center sm:w-auto`}
          >
            + הוסף ספק
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() =>
            setSupplierFilter((f) => (f === 'active' ? 'all' : 'active'))
          }
          className={`text-right transition ${hubSectionClass(0)} rounded-2xl p-4 ${
            supplierFilter === 'active' ? 'ring-2 ring-[var(--orange)] ring-offset-2' : ''
          }`}
        >
          <div className="text-[22px] font-extrabold tabular-nums text-[var(--text-dark)]">
            {supplierKpis.active}
          </div>
          <div className="mt-1 text-[12px] text-[var(--text-mid)]">ספקים פעילים</div>
          <div className="mt-0.5 text-[10px] text-[var(--text-light)]">
            מופיעים ברשימה כ«פעיל» · לחיצה מסננת טבלה
          </div>
        </button>
        <button
          type="button"
          onClick={() =>
            setSupplierFilter((f) => (f === 'inactive' ? 'all' : 'inactive'))
          }
          className={`text-right transition ${hubSectionClass(1)} rounded-2xl p-4 ${
            supplierFilter === 'inactive' ? 'ring-2 ring-[var(--orange)] ring-offset-2' : ''
          }`}
        >
          <div className="text-[22px] font-extrabold tabular-nums text-[var(--text-dark)]">
            {supplierKpis.inactive}
          </div>
          <div className="mt-1 text-[12px] text-[var(--text-mid)]">ספקים לא פעילים</div>
          <div className="mt-0.5 text-[10px] text-[var(--text-light)]">
            סומנו כלא פעילים · לחיצה מסננת טבלה
          </div>
        </button>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <input
          type="search"
          placeholder="חיפוש לפי שם, טלפון או אימייל…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-full md:max-w-md"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={supplierFilter === 'all' ? uiFilterActive : uiFilterInactive}
            onClick={() => setSupplierFilter('all')}
          >
            הכל
          </button>
          {loading ? (
            <span className="text-sm text-[var(--text-mid)]">טוען…</span>
          ) : (
            <span className="text-sm text-[var(--text-mid)]">
              {filtered.length} ספקים
            </span>
          )}
        </div>
      </div>

      <section className={`rounded-2xl ${hubSectionClass(2)} shadow-none`}>
        <div className="md:hidden">
          <div className="space-y-3 p-3 sm:p-5">
            {filtered.map((s) => (
              <SupplierMobileCard key={s.id} s={s} />
            ))}
          </div>
        </div>

        <div className="hidden min-w-0 overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[var(--surface-muted)]">
              <tr className="text-right text-[11px] font-bold text-[var(--text-light)]">
                <th className="w-[22%] px-3 py-3">שם ספק</th>
                <th className="w-[12%] px-3 py-3">סטטוס</th>
                <th className="w-[16%] px-3 py-3">טלפון</th>
                <th className="w-[18%] px-3 py-3">אימייל</th>
                <th className="w-[14%] px-3 py-3">סוגי ספק</th>
                <th className="w-[10%] px-3 py-3">תאריך יצירה</th>
                <th className="w-[10%] px-3 py-3">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const isHub = s.id === HUB_SUPPLIER_ID
                const listedActive = isSupplierListedActive(s)
                return (
                  <tr key={s.id} className="border-t border-[var(--border)] align-top">
                    <td className="px-3 py-3 break-words">
                      <button
                        type="button"
                        onClick={() => setDetailSupplier(s)}
                        className="text-right font-semibold text-[var(--orange)] underline-offset-2 hover:underline"
                      >
                        {s.name}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        label={listedActive ? 'פעיל' : 'לא פעיל'}
                        color={listedActive ? '#16A34A' : '#64748B'}
                      />
                    </td>
                    <td className="px-3 py-3 text-right text-[var(--text-mid)]" dir="ltr">
                      {s.phone ? (
                        <a
                          className="inline-block w-full text-right font-medium text-[var(--orange)] hover:underline"
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
                          className="inline-block w-full text-right font-medium text-[var(--orange)] hover:underline"
                          href={`mailto:${s.email}`}
                        >
                          {s.email}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-3 text-[13px] text-[var(--text-mid)]">
                      <SupplierTypesBlock s={s} />
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--text-mid)]">
                      {formatDateIL(s.createdAt)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          className={uiBtnSmOutline}
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
            <label className="mb-1 block text-xs text-[var(--text-mid)]">
              סטטוס ברשימה
            </label>
            <select
              value={form.active ? 'active' : 'inactive'}
              onChange={(e) =>
                setForm((f) => ({ ...f, active: e.target.value === 'active' }))
              }
            >
              <option value="active">פעיל</option>
              <option value="inactive">לא פעיל</option>
            </select>
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
              className={uiButtonGhost}
            >
              ביטול
            </button>
            <button type="button" onClick={() => void submit()} className={uiButtonBrand}>
              שמור
            </button>
          </div>
        </div>
      </Modal>

      <SupplierDetailModal
        supplier={detailSupplier}
        open={detailSupplier !== null}
        onClose={() => setDetailSupplier(null)}
        projects={projects}
        campaigns={campaigns}
        tasks={tasks}
        clientNameById={clientNameById}
      />

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
