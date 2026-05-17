import { useEffect, useMemo, useState } from 'react'
import { ClientQuickSelect } from '../ClientQuickSelect'
import { Modal } from '../shared/Modal'
import { useClients } from '../../hooks/useClients'
import { useDeals } from '../../hooks/useDeals'
import { useInvoices } from '../../hooks/useInvoices'
import { useLeads } from '../../hooks/useLeads'
import { useUsers } from '../../hooks/useUsers'
import { AGENT_COMMISSION_PERCENT_FALLBACK, effectiveCommissionPercent } from '../../lib/agentRevenue'
import { earliestPaymentYmdFromSchedule } from '../../lib/dealSchedule'
import {
  DealPaymentScheduleEditor,
  rowsToScheduledPayments,
  validateScheduleRows,
  type ScheduleRow,
} from './DealPaymentScheduleEditor'
import { toastFsError } from '../../lib/fsToast'
import { memberIsSalesAgentFlag } from '../../lib/salesAgent'
import type { Client, DealKind } from '../../types'

const dealKindOptions: { value: DealKind; label: string }[] = [
  { value: 'retainer_monthly', label: 'ריטיינר חודשי' },
  { value: 'retainer_yearly', label: 'ריטיינר שנתי' },
  { value: 'one_time', label: 'חד־פעמי' },
]

type Mode = 'new_client' | 'existing_agent_client' | 'existing_system_client'

function clientAgentMeta(c: Client, agentNameById: Map<string, string>): string {
  const agentId = (c.salesAgentUserId ?? '').trim()
  if (!agentId) return 'ללא סוכן במערכת'
  return agentNameById.get(agentId) ? `סוכן: ${agentNameById.get(agentId)}` : 'משויך לסוכן אחר'
}

type Props = {
  isOpen: boolean
  onClose: () => void
  onCompleted?: () => void
  /** ברירת מחדל בפתיחה — ניתן לשנות בשלב הראשון */
  initialAgentUserId?: string
  onAgentAssigned?: (agentUserId: string) => void
}

export function AdminDealOnboardingWizard({
  isOpen,
  onClose,
  onCompleted,
  initialAgentUserId = '',
  onAgentAssigned,
}: Props) {
  const { clients, addClient, updateClient } = useClients()
  const { users } = useUsers()

  const salesAgents = useMemo(
    () => users.filter((m) => memberIsSalesAgentFlag(m) && m.active !== false),
    [users],
  )

  const [selectedAgentId, setSelectedAgentId] = useState('')
  const { leads, updateLead } = useLeads()
  const { addDeal } = useDeals()
  const { addInvoice } = useInvoices()

  const agentUserId = selectedAgentId.trim()
  const selectedAgent = salesAgents.find((a) => a.id === agentUserId) ?? null
  const agentName = selectedAgent?.name ?? '—'

  const agentClients = useMemo(
    () => clients.filter((c) => (c.salesAgentUserId ?? '').trim() === agentUserId),
    [clients, agentUserId],
  )

  const agentLeads = useMemo(
    () => leads.filter((l) => (l.salesAgentUserId ?? '').trim() === agentUserId),
    [leads, agentUserId],
  )

  const agentNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of salesAgents) m.set(a.id, a.name)
    return m
  }, [salesAgents])

  const systemClientsSorted = useMemo(
    () => [...clients].sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [clients],
  )

  useEffect(() => {
    if (!isOpen) return
    const preferred = initialAgentUserId.trim()
    if (preferred && salesAgents.some((a) => a.id === preferred)) {
      setSelectedAgentId(preferred)
    } else if (salesAgents.length === 1) {
      setSelectedAgentId(salesAgents[0].id)
    } else {
      setSelectedAgentId('')
    }
  }, [isOpen, initialAgentUserId, salesAgents])

  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<Mode>('new_client')
  const [saving, setSaving] = useState(false)

  const [existingClientId, setExistingClientId] = useState('')
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [legalName, setLegalName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [addressLine, setAddressLine] = useState('')
  const [city, setCity] = useState('')
  const [department, setDepartment] = useState('')
  const [businessNotes, setBusinessNotes] = useState('')

  const [dealKind, setDealKind] = useState<DealKind>('retainer_monthly')
  const [dealTitle, setDealTitle] = useState('')
  const [agreedAmount, setAgreedAmount] = useState('')
  const [commissionPercent, setCommissionPercent] = useState(String(AGENT_COMMISSION_PERCENT_FALLBACK))
  const [dealNotes, setDealNotes] = useState('')
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([])
  const [isHostingDeal, setIsHostingDeal] = useState(false)
  const [leadId, setLeadId] = useState('')

  const [addFirstPayment, setAddFirstPayment] = useState(false)
  const [payTaxInvoice, setPayTaxInvoice] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [payNote, setPayNote] = useState('')

  useEffect(() => {
    if (!isOpen || !agentUserId) return
    setCommissionPercent(
      String(effectiveCommissionPercent(selectedAgent?.agentCommissionPercent)),
    )
    setExistingClientId('')
    setLeadId('')
  }, [isOpen, agentUserId, selectedAgent?.agentCommissionPercent])

  useEffect(() => {
    if (mode === 'new_client' || !existingClientId) return
    const c = clients.find((x) => x.id === existingClientId)
    if (!c) return
    setName(c.name)
    setContact(c.contact)
    setPhone(c.phone)
    setEmail(c.email)
    setLegalName(c.legalName ?? '')
    setTaxId(c.taxId ?? '')
    setAddressLine(c.addressLine ?? '')
    setCity(c.city ?? '')
    setDepartment(c.department ?? '')
    setBusinessNotes(c.businessNotes ?? '')
  }, [mode, existingClientId, clients])

  const resetAll = () => {
    setStep(0)
    setSelectedAgentId('')
    setMode('new_client')
    setExistingClientId('')
    setName('')
    setContact('')
    setPhone('')
    setEmail('')
    setLegalName('')
    setTaxId('')
    setAddressLine('')
    setCity('')
    setDepartment('')
    setBusinessNotes('')
    setDealKind('retainer_monthly')
    setDealTitle('')
    setAgreedAmount('')
    setCommissionPercent(String(AGENT_COMMISSION_PERCENT_FALLBACK))
    setDealNotes('')
    setScheduleRows([])
    setIsHostingDeal(false)
    setLeadId('')
    setAddFirstPayment(false)
    setPayTaxInvoice('')
    setPayAmount('')
    setPayDate(new Date().toISOString().slice(0, 10))
    setPayNote('')
  }

  const handleClose = () => {
    resetAll()
    onClose()
  }

  const canNextFromStart = () => Boolean(agentUserId)

  const canNextFromClient = () => {
    if (!agentUserId) return false
    if (mode === 'existing_agent_client' || mode === 'existing_system_client') {
      return Boolean(existingClientId)
    }
    return name.trim().length > 0
  }

  const canSave = () => {
    if (dealTitle.trim().length === 0) return false
    return validateScheduleRows(scheduleRows).ok
  }

  useEffect(() => {
    const payments = rowsToScheduledPayments(scheduleRows)
    const first = earliestPaymentYmdFromSchedule(payments)
    if (first) setPayDate(first)
  }, [scheduleRows])

  const canSavePaymentStep = () => {
    if (!addFirstPayment) return true
    if (!payTaxInvoice.trim() || !payAmount.trim()) return false
    const amt = Number(payAmount.replace(',', '.'))
    return Number.isFinite(amt) && amt > 0
  }

  const submit = async () => {
    if (!agentUserId || !canSave() || saving) return
    if (addFirstPayment && !canSavePaymentStep()) {
      toastFsError(
        'תקבול ראשון מהלקוח: חובה מספר חשבונית מס וסכום כולל מע״מ',
        new Error('invalid payment'),
        'wizard submit',
      )
      return
    }
    setSaving(true)
    try {
      let clientId: string | undefined

      if (mode === 'new_client') {
        const payload: Omit<Client, 'id' | 'createdAt'> = {
          name: name.trim(),
          contact: contact.trim(),
          phone: phone.trim(),
          email: email.trim(),
          status: 'active',
          salesAgentUserId: agentUserId,
          ...(legalName.trim() ? { legalName: legalName.trim() } : {}),
          ...(taxId.trim() ? { taxId: taxId.trim() } : {}),
          ...(addressLine.trim() ? { addressLine: addressLine.trim() } : {}),
          ...(city.trim() ? { city: city.trim() } : {}),
          ...(department.trim() ? { department: department.trim() } : {}),
          ...(businessNotes.trim() ? { businessNotes: businessNotes.trim() } : {}),
        }
        clientId = await addClient(payload)
        if (!clientId) return
      } else {
        clientId = existingClientId
        await updateClient(clientId, {
          name: name.trim(),
          contact: contact.trim(),
          phone: phone.trim(),
          email: email.trim(),
          salesAgentUserId: agentUserId,
          ...(legalName.trim() ? { legalName: legalName.trim() } : {}),
          ...(taxId.trim() ? { taxId: taxId.trim() } : {}),
          ...(addressLine.trim() ? { addressLine: addressLine.trim() } : {}),
          ...(city.trim() ? { city: city.trim() } : {}),
          ...(department.trim() ? { department: department.trim() } : {}),
          ...(businessNotes.trim() ? { businessNotes: businessNotes.trim() } : {}),
        })
      }

      const comm = Math.min(100, Math.max(0, Math.round(Number(commissionPercent.replace(',', '.')) || 0)))
      const agreed =
        agreedAmount.trim() === '' ? undefined : Math.max(0, Number(agreedAmount.replace(',', '.')))

      const scheduledPayments = rowsToScheduledPayments(scheduleRows)
      const earliest = earliestPaymentYmdFromSchedule(scheduledPayments)

      const dealId = await addDeal({
        clientId: clientId!,
        leadId: leadId.trim() || undefined,
        salesAgentUserId: agentUserId,
        dealKind,
        title: dealTitle.trim(),
        agreedAmount: agreed != null && Number.isFinite(agreed) ? agreed : undefined,
        commissionPercent: comm,
        status: 'active',
        notes: dealNotes.trim() || undefined,
        scheduledPayments,
        ...(earliest ? { firstPaymentYmd: earliest } : {}),
        ...(dealKind === 'retainer_yearly' && earliest ? { annualBillingYmd: earliest } : {}),
        ...(dealKind === 'one_time' && scheduledPayments[0]
          ? { expectedPaymentYmd: scheduledPayments[0].expectedPaymentYmd }
          : {}),
        ...(isHostingDeal ? { isHostingDeal: true } : {}),
      })
      if (!dealId) return

      if (leadId.trim()) {
        try {
          await updateLead(leadId.trim(), { clientId: clientId!, salesAgentUserId: agentUserId })
        } catch {
          /* toast ב־updateLead */
        }
      }

      if (addFirstPayment) {
        const taxNo = payTaxInvoice.trim()
        const amt = Number(payAmount.replace(',', '.'))
        if (taxNo && Number.isFinite(amt) && amt > 0) {
          await addInvoice({
            clientId: clientId!,
            invoiceNumber: taxNo,
            amount: Math.round(amt * 100) / 100,
            dueDate: payDate.slice(0, 10),
            dealId,
            agentCommissionPercent: comm,
            initialStatus: 'paid',
            paidDate: payDate.slice(0, 10),
            note: payNote.trim() || undefined,
          })
        }
      }

      onAgentAssigned?.(agentUserId)
      onCompleted?.()
      handleClose()
    } finally {
      setSaving(false)
    }
  }

  const stepTitle =
    step === 0 ? 'סוכן וסוג רישום' : step === 1 ? 'פרטי עסק' : step === 2 ? 'העסקה' : 'תקבול מהלקוח'

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`עסק ועסקה · ${stepTitle}`}
      size="xl"
      bodyClassName="max-h-[min(78vh,720px)] overflow-y-auto"
    >
      <p className="mb-3 rounded-lg bg-[var(--orange-light)] px-3 py-2 text-[12px] text-[var(--text-mid)]">
        {agentUserId ? (
          <>
            כל מה שתשמר כאן יופיע אצל{' '}
            <strong className="text-[var(--text-dark)]">{agentName}</strong> בפורטל הסוכן (עסקים,
            כספים, לידים).
          </>
        ) : (
          <>בחרו סוכן מכירות — הנתונים יסתנכרנו לפורטל האישי שלו.</>
        )}
      </p>
      <div className="space-y-5 text-sm text-[var(--text-dark)]">
        <div className="flex flex-wrap gap-2 text-[11px] font-bold text-[var(--text-mid)]">
          {['התחלה', 'לקוח', 'עסקה', 'תקבול'].map((t, i) => (
            <span
              key={t}
              className={`rounded-full px-3 py-1 ${
                i === step ? 'bg-[var(--orange-light)] text-[var(--orange)]' : 'bg-[var(--surface-muted)]'
              }`}
            >
              {i + 1}. {t}
            </span>
          ))}
        </div>

        {step === 0 ? (
          <div className="space-y-4">
            <label className="block space-y-1">
              <span className="text-xs font-bold text-[var(--text-mid)]">סוכן מכירות *</span>
              {salesAgents.length === 0 ? (
                <p className="text-sm text-[var(--danger)]">
                  אין סוכנים פעילים. סמנו «סוכן מכירות» במסך משתמשים.
                </p>
              ) : (
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2.5 text-sm font-semibold"
                >
                  <option value="">— בחרו סוכן —</option>
                  {salesAgents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => {
                  setMode('new_client')
                  setExistingClientId('')
                }}
                disabled={!agentUserId}
                className={`rounded-2xl border p-4 text-right transition disabled:opacity-40 ${
                  mode === 'new_client'
                    ? 'border-[var(--orange)] bg-[var(--orange-light)] shadow-sm'
                    : 'border-[var(--border)] hover:bg-[var(--surface-muted)]'
                }`}
              >
                <p className="text-base font-extrabold">עסק חדש</p>
                <p className="mt-1 text-[12px] text-[var(--text-mid)]">לקוח חדש משויך לסוכן + עסקה.</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('existing_system_client')
                  setExistingClientId('')
                }}
                disabled={!agentUserId}
                className={`rounded-2xl border p-4 text-right transition disabled:opacity-40 ${
                  mode === 'existing_system_client'
                    ? 'border-[var(--orange)] bg-[var(--orange-light)] shadow-sm'
                    : 'border-[var(--border)] hover:bg-[var(--surface-muted)]'
                }`}
              >
                <p className="text-base font-extrabold">עסק קיים במערכת</p>
                <p className="mt-1 text-[12px] text-[var(--text-mid)]">
                  בוחרים לקוח מהמאגר — ישויך לסוכן שנבחר.
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('existing_agent_client')
                  setExistingClientId('')
                }}
                disabled={!agentUserId}
                className={`rounded-2xl border p-4 text-right transition disabled:opacity-40 ${
                  mode === 'existing_agent_client'
                    ? 'border-[var(--orange)] bg-[var(--orange-light)] shadow-sm'
                    : 'border-[var(--border)] hover:bg-[var(--surface-muted)]'
                }`}
              >
                <p className="text-base font-extrabold">עסק קיים של הסוכן</p>
                <p className="mt-1 text-[12px] text-[var(--text-mid)]">רק לקוחות שכבר משויכים לסוכן.</p>
              </button>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            {mode === 'existing_system_client' || mode === 'existing_agent_client' ? (
              <div className="space-y-3 rounded-xl border border-[var(--border-orange-soft)] bg-[var(--orange-light)]/20 p-3">
                <label className="block space-y-2">
                  <span className="text-xs font-bold text-[var(--text-mid)]">
                    {mode === 'existing_system_client'
                      ? 'חיפוש עסק במערכת *'
                      : 'חיפוש לקוח של הסוכן *'}
                  </span>
                  <div className="rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2">
                    <ClientQuickSelect
                      id="wizard-client-pick"
                      hubPanel
                      clients={
                        mode === 'existing_system_client' ? systemClientsSorted : agentClients
                      }
                      value={existingClientId}
                      onChange={setExistingClientId}
                      placeholder={
                        mode === 'existing_system_client'
                          ? 'הקלד שם, אימייל, טלפון או איש קשר…'
                          : 'חיפוש בלקוחות הסוכן…'
                      }
                      extraMeta={
                        mode === 'existing_system_client'
                          ? (c) => clientAgentMeta(c, agentNameById)
                          : undefined
                      }
                    />
                  </div>
                </label>
                {mode === 'existing_system_client' && existingClientId ? (
                  <p className="text-[11px] text-[var(--text-mid)]">
                    בשמירה העסק ישויך ל־<strong className="text-[var(--text-dark)]">{agentName}</strong>{' '}
                    ויופיע בפורטל שלו.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-bold text-[var(--text-mid)]">שם / כינוי *</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-[var(--text-mid)]">איש קשר</span>
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-[var(--text-mid)]">טלפון</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                  className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-[var(--text-mid)]">אימייל</span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                  className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-[var(--text-mid)]">שם חברה (רשמי)</span>
                <input
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-[var(--text-mid)]">ח.פ / עוסק</span>
                <input
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  dir="ltr"
                  className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2"
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-bold text-[var(--text-mid)]">כתובת</span>
                <input
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-[var(--text-mid)]">עיר</span>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-[var(--text-mid)]">מחלקה</span>
                <input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2"
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-bold text-[var(--text-mid)]">הערות</span>
                <textarea
                  value={businessNotes}
                  onChange={(e) => setBusinessNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2"
                />
              </label>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-bold text-[var(--text-mid)]">סוג עסקה</span>
              <select
                value={dealKind}
                onChange={(e) => setDealKind(e.target.value as DealKind)}
                className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2"
              >
                {dealKindOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-2 md:col-span-2">
              <input
                type="checkbox"
                checked={isHostingDeal}
                onChange={(e) => {
                  const on = e.target.checked
                  setIsHostingDeal(on)
                  if (on && !dealTitle.trim()) setDealTitle('אחסון אתר')
                  if (on && dealKind === 'one_time') setDealKind('retainer_monthly')
                }}
                className="h-4 w-4 rounded border-[var(--border-orange-soft)]"
              />
              <span className="text-sm font-bold text-[var(--text-dark)]">עסקת אחסון (אתר / שרת)</span>
            </label>
            <div className="md:col-span-2">
              <DealPaymentScheduleEditor
                dealKind={dealKind}
                isHostingDeal={isHostingDeal}
                agreedAmountHint={agreedAmount}
                rows={scheduleRows.length > 0 ? scheduleRows : undefined}
                onRowsChange={setScheduleRows}
              />
            </div>
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-bold text-[var(--text-mid)]">כותרת העסקה *</span>
              <input
                value={dealTitle}
                onChange={(e) => setDealTitle(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-[var(--text-mid)]">סכום מוסכם (₪)</span>
              <input
                value={agreedAmount}
                onChange={(e) => setAgreedAmount(e.target.value)}
                dir="ltr"
                className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-[var(--text-mid)]">אחוז עמלה *</span>
              <input
                type="number"
                min={0}
                max={100}
                value={commissionPercent}
                onChange={(e) => setCommissionPercent(e.target.value)}
                dir="ltr"
                className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2"
              />
              <span className="text-[10px] text-[var(--text-mid)]">מסתנכרן ל«כספים» אצל הסוכן.</span>
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-bold text-[var(--text-mid)]">שיוך ליד</span>
              <select
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2"
              >
                <option value="">ללא</option>
                {agentLeads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} {l.company ? `(${l.company})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-bold text-[var(--text-mid)]">הערות לעסקה</span>
              <textarea
                value={dealNotes}
                onChange={(e) => setDealNotes(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2"
              />
            </label>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4 rounded-2xl border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] p-4">
            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                checked={addFirstPayment}
                onChange={(e) => setAddFirstPayment(e.target.checked)}
              />
              רישום תקבול ראשון מהלקוח (מעביר ל«כסף זמין» ב«כספים» אצל הסוכן — לא תשלום לסוכן)
            </label>
            {addFirstPayment ? (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-bold text-[var(--text-mid)]">מספר חשבונית מס *</span>
                  <input
                    value={payTaxInvoice}
                    onChange={(e) => setPayTaxInvoice(e.target.value)}
                    dir="ltr"
                    className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-[var(--text-mid)]">סכום כולל מע״מ (₪) *</span>
                  <input
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    dir="ltr"
                    className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-[var(--text-mid)]">תאריך התקבול</span>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    dir="ltr"
                    className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2"
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-bold text-[var(--text-mid)]">הערות</span>
                  <textarea
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2"
                  />
                </label>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-between gap-2 border-t border-[var(--border)] pt-4">
          <button
            type="button"
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]"
            onClick={() => {
              if (step === 0) handleClose()
              else setStep((s) => s - 1)
            }}
          >
            {step === 0 ? 'ביטול' : 'חזור'}
          </button>
          <div className="flex gap-2">
            {step < 3 ? (
              <button
                type="button"
                disabled={
                  (step === 0 && !canNextFromStart()) ||
                  (step === 1 && !canNextFromClient()) ||
                  (step === 2 && !canSave())
                }
                className="rounded-xl bg-[var(--orange)] px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
                onClick={() => {
                  if (step === 0 && !canNextFromStart()) return
                  if (step === 1 && !canNextFromClient()) return
                  if (step === 2 && !canSave()) return
                  setStep((s) => s + 1)
                }}
              >
                המשך
              </button>
            ) : (
              <button
                type="button"
                disabled={saving || !canSave() || !canSavePaymentStep()}
                className="rounded-xl bg-[var(--blue-mid)] px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
                onClick={() => void submit()}
              >
                {saving ? 'שומר…' : 'שמירה וסיום'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
