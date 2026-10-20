import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useClients } from '../../hooks/useClients'
import { useDealPayments } from '../../hooks/useDealPayments'
import { useDeals } from '../../hooks/useDeals'
import { useLeads } from '../../hooks/useLeads'
import { useProjects } from '../../hooks/useProjects'
import { useQuotes } from '../../hooks/useQuotes'
import { useHubStore } from '../../store/useStore'
import type { DealKind, DealStage, Lead, QuotePeriod } from '../../types'
import { Modal } from '../shared/Modal'
import { BEO_AI_LEAD_SOURCE } from '../../lib/leadStatusUi'

function plusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function kindFromPeriod(period: QuotePeriod | undefined): DealKind {
  if (period === 'monthly') return 'retainer_monthly'
  if (period === 'yearly') return 'retainer_yearly'
  return 'one_time'
}

/** המרת ליד שנסגר → לקוח + עסקה (+ פרויקט אופציונלי) */
export function LeadConvertWizard({
  lead,
  open,
  onClose,
  initialStage = 'signed',
}: {
  lead: Lead | null
  open: boolean
  onClose: () => void
  initialStage?: Extract<DealStage, 'signed' | 'deposit_paid'>
}) {
  const { user } = useAuth()
  const { addClient } = useClients()
  const { updateLead } = useLeads()
  const { addProject } = useProjects()
  const { addDeal, updateDeal } = useDeals()
  const { quotes, updateQuote } = useQuotes()
  const { addPayment } = useDealPayments()
  const pushToast = useHubStore((s) => s.pushToast)
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [createProject, setCreateProject] = useState(true)
  const [projectName, setProjectName] = useState('')
  const [dealTitle, setDealTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [deposit, setDeposit] = useState('')
  const [quoteId, setQuoteId] = useState('')
  const [dealKind, setDealKind] = useState<DealKind>('one_time')
  const [busy, setBusy] = useState(false)

  const leadQuotes = useMemo(
    () =>
      quotes
        .filter((q) => lead && q.leadId === lead.id && q.status !== 'rejected' && q.status !== 'expired')
        .sort((a, b) => (b.sentAt || b.createdAt).localeCompare(a.sentAt || a.createdAt)),
    [quotes, lead],
  )

  useEffect(() => {
    if (!open || !lead) return
    const preferred = leadQuotes[0]
    setName(lead.company || lead.name)
    setContact(lead.name)
    setPhone(lead.phone || '')
    setEmail(lead.email || '')
    setProjectName(`פרויקט · ${lead.company || lead.name}`)
    setDealTitle(preferred?.title || `עסקה · ${lead.company || lead.name}`)
    setCreateProject(true)
    setQuoteId(preferred?.id ?? '')
    const face = preferred?.amountPreVat ?? lead.estimatedValue
    setAmount(face != null ? String(face) : '')
    setDeposit('')
    setDealKind(kindFromPeriod(preferred?.period))
  }, [open, lead, leadQuotes])

  const submit = async () => {
    if (!lead || !user) return
    if (!name.trim()) {
      pushToast('שם לקוח חובה', 'error')
      return
    }
    const agreed = amount.trim() === '' ? undefined : Number(amount)
    if (agreed != null && (!Number.isFinite(agreed) || agreed < 0)) {
      pushToast('סכום העסקה לא תקין', 'error')
      return
    }
    const depositAmount = deposit.trim() === '' ? undefined : Number(deposit)
    if (depositAmount != null && (!Number.isFinite(depositAmount) || depositAmount < 0)) {
      pushToast('סכום המקדמה לא תקין', 'error')
      return
    }
    setBusy(true)
    try {
      let clientId = lead.clientId
      if (!clientId) {
        clientId = await addClient({
          name: name.trim(),
          contact: contact.trim() || name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          status: 'active',
          businessNotes:
            lead.clientNeeds ||
            (lead.source === BEO_AI_LEAD_SOURCE ? 'נוצר מליד Beo AI Lead Agent' : undefined),
        })
      }
      if (!clientId) throw new Error('יצירת לקוח נכשלה')

      const selected = leadQuotes.find((q) => q.id === quoteId)
      const stage: DealStage = initialStage
      const dealId = await addDeal({
        clientId,
        leadId: lead.id,
        salesAgentUserId: lead.salesAgentUserId,
        dealKind,
        title: dealTitle.trim() || `עסקה · ${name.trim()}`,
        agreedAmount: agreed,
        amountTotal: agreed,
        commissionPercent: 0,
        stage,
        quoteId: selected?.id,
        depositAmount,
        notes: selected?.number ? `מהצעה ${selected.number}` : undefined,
      })
      if (!dealId) throw new Error('יצירת עסקה נכשלה')

      if (depositAmount && depositAmount > 0) {
        await addPayment({
          dealId,
          leadId: lead.id,
          clientId,
          amount: depositAmount,
          kind: 'deposit',
          status: stage === 'deposit_paid' ? 'paid' : 'scheduled',
          dueDate: plusDays(0),
          paidAt: stage === 'deposit_paid' ? new Date().toISOString() : undefined,
        })
      }

      let projectId: string | null = null
      if (createProject) {
        const monthly = dealKind !== 'one_time'
        projectId = await addProject({
          name: projectName.trim() || `פרויקט · ${name.trim()}`,
          type: 'client',
          projectType: monthly ? 'retainer' : 'one-time',
          retainerAmount: monthly ? agreed : undefined,
          clientId,
          dealId,
          leadId: lead.id,
          status: 'active',
          priority: 'medium',
          dueDate: plusDays(30),
          startDate: plusDays(0),
          ownerId: user.uid,
          color: '#5828A0',
        })
        if (projectId) await updateDeal(dealId, { projectId })
      }

      if (selected) {
        await updateQuote(selected.id, {
          status: 'accepted',
          dealId,
          clientId,
          decidedAt: new Date().toISOString(),
        })
      }

      await updateLead(lead.id, {
        clientId,
        status: 'closed',
        lastActivityText: 'הומר ללקוח ולעסקה · ליד נסגר',
        lastActivityAt: new Date().toISOString(),
      })

      pushToast(
        projectId ? 'נוצרו לקוח, עסקה ופרויקט · הליד נסגר' : 'נוצרו לקוח ועסקה · הליד נסגר',
        'success',
      )
      onClose()
      if (projectId) navigate(`/projects/${projectId}`)
      else navigate('/pipeline')
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'ההמרה נכשלה', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isOpen={open && Boolean(lead)} onClose={onClose} title="סגירת ליד · לקוח ועסקה" size="lg">
      {!lead ? null : (
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-[var(--text-mid)]">
            נוצרים כרטיס לקוח ועסקה בשלב «{initialStage === 'deposit_paid' ? 'מקדמה שולמה' : 'נחתם'}».
            אפשר לפתוח פרויקט באותה פעולה, וההצעה שנבחרה מסומנת כמאושרת.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="שם לקוח *">
              <input className="mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="איש קשר">
              <input className="mt-1 w-full" value={contact} onChange={(e) => setContact(e.target.value)} />
            </Field>
            <Field label="טלפון">
              <input className="mt-1 w-full" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="אימייל">
              <input className="mt-1 w-full" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="כותרת עסקה">
              <input className="mt-1 w-full" value={dealTitle} onChange={(e) => setDealTitle(e.target.value)} />
            </Field>
            <Field label="סכום לפני מע״מ (₪)">
              <input className="mt-1 w-full" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="מקדמה (₪)">
              <input className="mt-1 w-full" dir="ltr" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
            </Field>
            <Field label="סוג עסקה">
              <select className="mt-1 w-full" value={dealKind} onChange={(e) => setDealKind(e.target.value as DealKind)}>
                <option value="one_time">חד־פעמי</option>
                <option value="retainer_monthly">ריטיינר חודשי</option>
                <option value="retainer_yearly">ריטיינר שנתי</option>
              </select>
            </Field>
          </div>
          {leadQuotes.length > 0 ? (
            <Field label="הצעה לאישור">
              <select className="mt-1 w-full" value={quoteId} onChange={(e) => setQuoteId(e.target.value)}>
                <option value="">בלי לקשר הצעה</option>
                {leadQuotes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {(q.number || q.slug || 'הצעה') + (q.amountPreVat != null ? ` · ₪${q.amountPreVat}` : '')}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <label className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-dark)]">
            <input type="checkbox" checked={createProject} onChange={(e) => setCreateProject(e.target.checked)} />
            פתח גם פרויקט חדש
          </label>
          {createProject ? (
            <Field label="שם פרויקט">
              <input className="mt-1 w-full" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            </Field>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-3">
            <button type="button" onClick={onClose} className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-semibold">
              ביטול
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="rounded-xl bg-[var(--brand)] px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-60"
            >
              {busy ? 'שומר…' : 'סגור ליד ופתח עסקה'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-[11px] font-bold text-[var(--text-light)]">
      {label}
      {children}
    </label>
  )
}
