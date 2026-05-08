import { useMemo, useState } from 'react'
import { deleteField } from 'firebase/firestore'
import { useClients } from '../hooks/useClients'
import { useProjects } from '../hooks/useProjects'
import { useSuppliers } from '../hooks/useSuppliers'
import { useCampaigns } from '../hooks/useCampaigns'
import { useUsers } from '../hooks/useUsers'
import { useAuth } from '../contexts/AuthContext'
import type { Campaign, CampaignKind, CampaignPlatform, CampaignStatus } from '../types'
import { ClientQuickSelect } from '../components/ClientQuickSelect'
import { Badge } from '../components/shared/Badge'
import { HubDropdownSelect, type HubDropdownOption } from '../components/shared/HubDropdownSelect'
import { Modal } from '../components/shared/Modal'

const platformLabels: Record<CampaignPlatform, string> = {
  instagram: 'אינסטגרם',
  google_ads: 'Google Ads',
  facebook: 'פייסבוק',
  tiktok: 'טיקטוק',
  linkedin: 'לינקדאין',
  other: 'אחר',
}

const statusLabels: Record<CampaignStatus, string> = {
  planning: 'בתכנון',
  active: 'פעיל',
  paused: 'מושהה',
  completed: 'הושלם',
}

const statusColors: Record<CampaignStatus, string> = {
  planning: '#2563EB',
  active: '#16A34A',
  paused: '#64748B',
  completed: '#0F766E',
}

const kindDropdownOptions: HubDropdownOption[] = [
  { value: 'client', label: 'קמפיין ללקוח' },
  { value: 'internal', label: 'קמפיין פנימי' },
]

const campaignPlatformOptions: HubDropdownOption[] = (
  Object.keys(platformLabels) as CampaignPlatform[]
).map((p) => ({ value: p, label: platformLabels[p] }))

const campaignStatusOptions: HubDropdownOption[] = (
  Object.keys(statusLabels) as CampaignStatus[]
).map((s) => ({ value: s, label: statusLabels[s] }))

type StatusFilter = 'all' | CampaignStatus

export function Campaigns() {
  const { campaigns, addCampaign, updateCampaign, updateCampaignStatus, deleteCampaign } = useCampaigns()
  const { user } = useAuth()
  const { clients } = useClients()
  const { projects } = useProjects()
  const { suppliers } = useSuppliers()
  const { users } = useUsers()

  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<CampaignKind>('client')
  const [platform, setPlatform] = useState<CampaignPlatform>('google_ads')
  const [status, setStatus] = useState<CampaignStatus>('planning')
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [performerUserId, setPerformerUserId] = useState('')
  const [budget, setBudget] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [resultsUpdate, setResultsUpdate] = useState('')
  const [resultsDraftById, setResultsDraftById] = useState<Record<string, string>>({})
  const [resultsModalCampaignId, setResultsModalCampaignId] = useState<string | null>(null)
  const [resultsModalText, setResultsModalText] = useState('')

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editKind, setEditKind] = useState<CampaignKind>('client')
  const [editPlatform, setEditPlatform] = useState<CampaignPlatform>('google_ads')
  const [editStatus, setEditStatus] = useState<CampaignStatus>('planning')
  const [editClientId, setEditClientId] = useState('')
  const [editProjectId, setEditProjectId] = useState('')
  const [editSupplierId, setEditSupplierId] = useState('')
  const [editPerformerUserId, setEditPerformerUserId] = useState('')
  const [editBudget, setEditBudget] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>()
    clients.forEach((c) => m.set(c.id, c.name))
    return m
  }, [clients])
  const projectNameById = useMemo(() => {
    const m = new Map<string, string>()
    projects.forEach((p) => m.set(p.id, p.name))
    return m
  }, [projects])
  const supplierNameById = useMemo(() => {
    const m = new Map<string, string>()
    suppliers.forEach((s) => m.set(s.id, s.name))
    return m
  }, [suppliers])
  const projectsForSelectedClient = useMemo(
    () => projects.filter((p) => p.clientId === clientId),
    [projects, clientId],
  )
  const projectsForEditClient = useMemo(
    () => projects.filter((p) => p.clientId === editClientId),
    [projects, editClientId],
  )
  const selectedSupplierName = supplierNameById.get(supplierId) ?? ''
  const shouldPickPerformerFromUsers =
    selectedSupplierName.trim().includes('האב מערכות')
  const selectedEditSupplierName = supplierNameById.get(editSupplierId) ?? ''
  const shouldPickPerformerForEdit =
    selectedEditSupplierName.trim().includes('האב מערכות')
  const performerNameById = useMemo(() => {
    const m = new Map<string, string>()
    users.forEach((u) => m.set(u.id, u.name))
    return m
  }, [users])

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase()
    return campaigns
      .filter((c) => (statusFilter === 'all' ? true : c.status === statusFilter))
      .filter((c) => {
        if (!text) return true
        return (
          c.name.toLowerCase().includes(text) ||
          platformLabels[c.platform].toLowerCase().includes(text) ||
          (clientNameById.get(c.clientId ?? '') ?? '').toLowerCase().includes(text)
        )
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [campaigns, statusFilter, q, clientNameById])
  const actorName =
    user?.displayName?.trim() || user?.email?.split('@')[0] || 'משתמש'
  const resultsModalCampaign = useMemo(
    () => campaigns.find((c) => c.id === resultsModalCampaignId) ?? null,
    [campaigns, resultsModalCampaignId],
  )

  const submit = async () => {
    if (!name.trim()) return
    await addCampaign({
      name: name.trim(),
      kind,
      platform,
      status,
      clientId: clientId || undefined,
      projectId: projectId || undefined,
      supplierId: supplierId || undefined,
      performerUserId: shouldPickPerformerFromUsers
        ? performerUserId || undefined
        : undefined,
      budget: budget.trim() ? Number(budget) : undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      resultsUpdate: resultsUpdate.trim() || undefined,
    })
    setName('')
    setKind('client')
    setPlatform('google_ads')
    setStatus('planning')
    setClientId('')
    setProjectId('')
    setSupplierId('')
    setPerformerUserId('')
    setBudget('')
    setStartDate('')
    setEndDate('')
    setResultsUpdate('')
    setFormOpen(false)
  }

  const openEdit = (c: Campaign) => {
    setEditingId(c.id)
    setEditName(c.name)
    setEditKind(c.kind)
    setEditPlatform(c.platform)
    setEditStatus(c.status)
    setEditClientId(c.clientId ?? '')
    setEditProjectId(c.projectId ?? '')
    setEditSupplierId(c.supplierId ?? '')
    setEditPerformerUserId(c.performerUserId ?? '')
    setEditBudget(typeof c.budget === 'number' ? String(c.budget) : '')
    setEditStartDate(c.startDate?.slice(0, 10) ?? '')
    setEditEndDate(c.endDate?.slice(0, 10) ?? '')
    setEditModalOpen(true)
  }

  const closeEdit = () => {
    setEditModalOpen(false)
    setEditingId(null)
  }

  const submitEdit = async () => {
    if (!editingId || !editName.trim()) return
    const budgetNum = editBudget.trim() ? Number(editBudget.replace(',', '.')) : NaN
    if (editBudget.trim() && (!Number.isFinite(budgetNum) || budgetNum < 0)) return

    const patch: Record<string, unknown> = {
      name: editName.trim(),
      kind: editKind,
      platform: editPlatform,
      status: editStatus,
      budget: editBudget.trim() ? budgetNum : deleteField(),
      startDate: editStartDate.trim() ? editStartDate.trim() : deleteField(),
      endDate: editEndDate.trim() ? editEndDate.trim() : deleteField(),
      clientId: editClientId.trim() ? editClientId.trim() : deleteField(),
      projectId: editProjectId.trim() ? editProjectId.trim() : deleteField(),
      supplierId: editSupplierId.trim() ? editSupplierId.trim() : deleteField(),
      performerUserId: shouldPickPerformerForEdit
        ? editPerformerUserId.trim()
          ? editPerformerUserId.trim()
          : deleteField()
        : deleteField(),
    }
    await updateCampaign(editingId, patch as Partial<Campaign>)
    closeEdit()
  }

  const updateCampaignResults = async (campaignId: string, textInput?: string) => {
    const campaign = campaigns.find((item) => item.id === campaignId)
    if (!campaign) return
    const text = (textInput ?? resultsDraftById[campaignId] ?? '').trim()
    if (!text) return
    const nowIso = new Date().toISOString()
    const nextLog = [
      ...(campaign.resultsLog ?? []),
      {
        id: crypto.randomUUID(),
        text,
        at: nowIso,
        actorName,
      },
    ]
    await updateCampaign(campaignId, {
      resultsUpdate: text,
      resultsLog: nextLog,
    })
    setResultsDraftById((prev) => ({ ...prev, [campaignId]: '' }))
    setResultsModalCampaignId(null)
    setResultsModalText('')
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-8 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">קמפיינים במעקב</h1>
          <p className="mt-1 text-[13px] text-[var(--text-mid)]">
            ניהול קמפיינים עם שיוך ללקוח, פרויקט וספק
          </p>
        </div>
        <button type="button" className="hub-btn-primary text-sm" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? 'סגירה' : '+ קמפיין חדש'}
        </button>
      </header>

      {formOpen ? (
        <section className="grid grid-cols-1 gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] md:grid-cols-3">
          <input placeholder="שם קמפיין *" value={name} onChange={(e) => setName(e.target.value)} className="md:col-span-2" />
          <HubDropdownSelect
            id="campaign-new-kind"
            value={kind}
            onChange={(v) => setKind(v as CampaignKind)}
            options={kindDropdownOptions}
          />
          <HubDropdownSelect
            id="campaign-new-platform"
            value={platform}
            onChange={(v) => setPlatform(v as CampaignPlatform)}
            options={campaignPlatformOptions}
          />
          <HubDropdownSelect
            id="campaign-new-status"
            value={status}
            onChange={(v) => setStatus(v as CampaignStatus)}
            options={campaignStatusOptions}
          />
          <input type="number" placeholder="תקציב" value={budget} onChange={(e) => setBudget(e.target.value)} />
          <div className="rounded-xl border-2 border-[#BFDBFE] bg-[var(--bg-main)] px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <ClientQuickSelect
              id="campaign-new-client"
              clients={clients}
              value={clientId}
              hubPanel
              onChange={(id) => {
                setClientId(id)
                setProjectId('')
              }}
            />
          </div>
          <select
            className="hub-select w-full min-w-0"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={!clientId}
          >
            <option value="">
              {clientId ? 'ללא פרויקט' : 'בחר לקוח קודם'}
            </option>
            {projectsForSelectedClient.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            className="hub-select w-full min-w-0"
            value={supplierId}
            onChange={(e) => {
              const nextSupplierId = e.target.value
              setSupplierId(nextSupplierId)
              const nextSupplierName = supplierNameById.get(nextSupplierId) ?? ''
              if (!nextSupplierName.trim().includes('האב מערכות')) {
                setPerformerUserId('')
              }
            }}
          >
            <option value="">ללא ספק</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {shouldPickPerformerFromUsers ? (
            <select
              className="hub-select w-full min-w-0"
              value={performerUserId}
              onChange={(e) => setPerformerUserId(e.target.value)}
            >
              <option value="">מבצע קמפיין (עובד מהמערכת)</option>
              {users
                .filter((u) => u.active !== false)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          ) : null}
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <input
            placeholder="עדכון תוצאות (CTR/לידים/עלות...)"
            value={resultsUpdate}
            onChange={(e) => setResultsUpdate(e.target.value)}
            className="md:col-span-3"
          />
          <div className="md:col-span-3 flex justify-end gap-2">
            <button type="button" className="hub-btn-secondary text-sm" onClick={() => setFormOpen(false)}>
              ביטול
            </button>
            <button type="button" className="hub-btn-primary text-sm" onClick={() => void submit()}>
              שמירת קמפיין
            </button>
          </div>
        </section>
      ) : null}

      <section className="flex flex-wrap items-center gap-2">
        <input
          className="w-full max-w-[320px]"
          placeholder="חיפוש קמפיין..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" onClick={() => setStatusFilter('all')} className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold ${statusFilter === 'all' ? 'hub-btn-primary' : 'border border-[var(--border)] bg-white text-[var(--text-mid)]'}`}>
          הכל
        </button>
        {(Object.keys(statusLabels) as CampaignStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold ${statusFilter === s ? 'text-white' : 'border border-[var(--border)] bg-white text-[var(--text-mid)]'}`}
            style={statusFilter === s ? { backgroundColor: statusColors[s] } : undefined}
          >
            {statusLabels[s]}
          </button>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {filtered.map((c) => (
          <article key={c.id} className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-[var(--text-dark)]">{c.name}</h3>
                <p className="text-xs text-[var(--text-mid)]">
                  {c.kind === 'internal' ? 'קמפיין פנימי' : 'קמפיין ללקוח'} · {platformLabels[c.platform]}
                </p>
              </div>
              <Badge label={statusLabels[c.status]} color={statusColors[c.status]} />
            </div>
            <div className="mt-3 space-y-1 text-xs text-[var(--text-mid)]">
              <p>לקוח: {clientNameById.get(c.clientId ?? '') ?? '—'}</p>
              <p>פרויקט: {projectNameById.get(c.projectId ?? '') ?? '—'}</p>
              <p>ספק: {supplierNameById.get(c.supplierId ?? '') ?? '—'}</p>
              {c.performerUserId ? (
                <p>מבצע קמפיין: {performerNameById.get(c.performerUserId) ?? '—'}</p>
              ) : null}
              <p>תקציב: {typeof c.budget === 'number' ? `₪${c.budget.toLocaleString('he-IL')}` : '—'}</p>
              <p>זמן קמפיין: {c.startDate ?? '—'} עד {c.endDate ?? '—'}</p>
              <p>עדכון תוצאות: {c.resultsUpdate ?? '—'}</p>
              <p>
                עודכן לאחרונה:{' '}
                {c.resultsLog?.length
                  ? new Date(
                      [...c.resultsLog].sort((a, b) => b.at.localeCompare(a.at))[0]!.at,
                    ).toLocaleString('he-IL')
                  : '—'}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.keys(statusLabels) as CampaignStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void updateCampaignStatus(c.id, s)}
                  className="rounded-[8px] border px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    borderColor: statusColors[s],
                    color: c.status === s ? '#fff' : statusColors[s],
                    backgroundColor: c.status === s ? statusColors[s] : '#fff',
                  }}
                >
                  {statusLabels[s]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => openEdit(c)}
                className="rounded-[8px] border border-[#E2E8F0] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--text-dark)] hover:bg-[#F8FAFC]"
              >
                עריכה
              </button>
              <button
                type="button"
                onClick={() => {
                  const defaultText = resultsDraftById[c.id] ?? c.resultsUpdate ?? ''
                  setResultsModalCampaignId(c.id)
                  setResultsModalText(defaultText)
                }}
                className="rounded-[8px] border border-[#BFDBFE] bg-[#EFF6FF] px-2.5 py-1 text-[11px] font-semibold text-[var(--blue-mid)]"
              >
                עדכון תוצאות
              </button>
              <button
                type="button"
                onClick={() => void deleteCampaign(c.id)}
                className="rounded-[8px] border border-[#FECACA] bg-[#FEF2F2] px-2.5 py-1 text-[11px] font-semibold text-[#B91C1C]"
              >
                מחיקה
              </button>
            </div>
            {c.resultsLog?.length ? (
              <div className="mt-3 rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] p-2">
                <p className="mb-1 text-[10px] font-bold text-[var(--text-light)]">היסטוריית עדכונים</p>
                <div className="max-h-28 space-y-1 overflow-auto">
                  {[...c.resultsLog]
                    .sort((a, b) => b.at.localeCompare(a.at))
                    .slice(0, 5)
                    .map((entry) => (
                      <p key={entry.id} className="text-[11px] text-[var(--text-mid)]">
                        {new Date(entry.at).toLocaleString('he-IL')}
                        {entry.actorName ? ` · ${entry.actorName}` : ''} · {entry.text}
                      </p>
                    ))}
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </section>

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-mid)]">אין קמפיינים להצגה</p>
      ) : null}

      <Modal
        isOpen={editModalOpen}
        onClose={closeEdit}
        title={`עריכת קמפיין${editName ? ` · ${editName}` : ''}`}
        bodyClassName="overflow-visible max-h-none"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input
            placeholder="שם קמפיין *"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="md:col-span-2"
          />
          <HubDropdownSelect
            id="campaign-edit-kind"
            value={editKind}
            onChange={(v) => setEditKind(v as CampaignKind)}
            options={kindDropdownOptions}
          />
          <HubDropdownSelect
            id="campaign-edit-platform"
            value={editPlatform}
            onChange={(v) => setEditPlatform(v as CampaignPlatform)}
            options={campaignPlatformOptions}
          />
          <HubDropdownSelect
            id="campaign-edit-status"
            value={editStatus}
            onChange={(v) => setEditStatus(v as CampaignStatus)}
            options={campaignStatusOptions}
          />
          <input
            type="number"
            placeholder="תקציב"
            value={editBudget}
            onChange={(e) => setEditBudget(e.target.value)}
          />
          <div className="rounded-xl border-2 border-[#BFDBFE] bg-[var(--bg-main)] px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <ClientQuickSelect
              id="campaign-edit-client"
              clients={clients}
              value={editClientId}
              hubPanel
              onChange={(id) => {
                setEditClientId(id)
                setEditProjectId('')
              }}
            />
          </div>
          <HubDropdownSelect
            id="campaign-edit-project"
            value={editProjectId}
            onChange={setEditProjectId}
            options={projectsForEditClient.map((p) => ({ value: p.id, label: p.name }))}
            emptyOption={{
              label: editClientId ? 'ללא פרויקט' : 'בחר לקוח קודם',
            }}
            disabled={!editClientId}
          />
          <HubDropdownSelect
            id="campaign-edit-supplier"
            value={editSupplierId}
            onChange={(v) => {
              setEditSupplierId(v)
              const nm = supplierNameById.get(v) ?? ''
              if (!nm.trim().includes('האב מערכות')) {
                setEditPerformerUserId('')
              }
            }}
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            emptyOption={{ label: 'ללא ספק' }}
          />
          {shouldPickPerformerForEdit ? (
            <HubDropdownSelect
              id="campaign-edit-performer"
              value={editPerformerUserId}
              onChange={setEditPerformerUserId}
              options={users
                .filter((u) => u.active !== false)
                .map((u) => ({ value: u.id, label: u.name }))}
              emptyOption={{ label: 'מבצע קמפיין (עובד מהמערכת)' }}
            />
          ) : null}
          <input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} />
          <input type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} />
        </div>
        <p className="mt-2 text-[11px] text-[var(--text-light)]">
          «עדכון תוצאות» והיסטוריה נשארים כפי שהם — מעדכנים בנפרד בכפתור «עדכון תוצאות».
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="hub-btn-secondary text-sm" onClick={closeEdit}>
            ביטול
          </button>
          <button
            type="button"
            className="hub-btn-primary text-sm"
            onClick={() => void submitEdit()}
          >
            שמירת שינויים
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(resultsModalCampaign)}
        onClose={() => {
          setResultsModalCampaignId(null)
          setResultsModalText('')
        }}
        title={`עדכון תוצאות${resultsModalCampaign ? ` · ${resultsModalCampaign.name}` : ''}`}
      >
        <div className="space-y-3">
          <textarea
            rows={5}
            className="w-full"
            placeholder="רשום כאן תוצאות עדכניות (CTR / לידים / עלות / תובנות...)"
            value={resultsModalText}
            onChange={(e) => setResultsModalText(e.target.value)}
          />
          <p className="text-[11px] text-[var(--text-light)]">
            בשמירה המערכת מעדכנת אוטומטית יום ושעה.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="hub-btn-secondary text-sm"
              onClick={() => {
                setResultsModalCampaignId(null)
                setResultsModalText('')
              }}
            >
              ביטול
            </button>
            <button
              type="button"
              className="hub-btn-primary text-sm"
              onClick={() => {
                if (!resultsModalCampaign) return
                void updateCampaignResults(resultsModalCampaign.id, resultsModalText)
              }}
            >
              שמירת עדכון
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
