import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { deleteField } from 'firebase/firestore'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { formatDateIL, todayYmd } from '../lib/dates'
import { toastFsError } from '../lib/fsToast'
import { uploadLeadQuotePdf } from '../lib/leadQuoteStorage'
import { useLeads } from '../hooks/useLeads'
import { useCampaigns } from '../hooks/useCampaigns'
import { useClients } from '../hooks/useClients'
import { useUsers } from '../hooks/useUsers'
import type { LeadQuoteChannel, LeadStatus } from '../types'
import { Badge } from '../components/shared/Badge'
import { Modal } from '../components/shared/Modal'

function isValidHttpUrl(s: string): boolean {
  try {
    const u = new URL(s.trim())
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

const statusLabels: Record<LeadStatus, string> = {
  new: 'חדש',
  handling: 'לטיפול',
  specification: 'בתהליך אפיון',
  quote_sent: 'נשלחה הצעת מחיר',
  follow_up: 'יש לבצע פולואפ',
  closed: 'נסגרה',
}

const statusColors: Record<LeadStatus, string> = {
  new: '#2563EB',
  handling: '#0284C7',
  specification: '#7C3AED',
  quote_sent: '#D97706',
  follow_up: '#EA580C',
  closed: '#16A34A',
}

type StatusFilter = 'all' | LeadStatus

const quoteChannelLabels: Record<LeadQuoteChannel, string> = {
  green_invoice: 'חשבונית ירוקה',
  pdf_file: 'קובץ PDF',
  visual_link: 'קישור ויזואלי',
}

function LeadDetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-[var(--border)] py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,9.5rem)_1fr] sm:gap-4">
      <div className="text-[11px] font-bold text-[var(--text-light)]">{label}</div>
      <div className="min-w-0 break-words text-[13px] text-[var(--text-dark)]">{children}</div>
    </div>
  )
}

export function Leads() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { users } = useUsers()
  const { campaigns } = useCampaigns()
  const { clients } = useClients()
  const { leads, addLead, updateLead, deleteLead } = useLeads()
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState('')
  const [sourceMode, setSourceMode] = useState<'campaign' | 'active_client' | 'manual'>('campaign')
  const [sourceCampaignId, setSourceCampaignId] = useState('')
  const [sourceClientId, setSourceClientId] = useState('')
  const [clientNeeds, setClientNeeds] = useState('')
  /** שיוך לכרטיס לקוח קיים — אופציונלי; ריק = לא נשמר בליד */
  const [linkedClientId, setLinkedClientId] = useState('')
  const [linkedClientText, setLinkedClientText] = useState('')
  const [linkSuggestOpen, setLinkSuggestOpen] = useState(false)
  const linkClientWrapRef = useRef<HTMLDivElement | null>(null)
  const [openActionLeadId, setOpenActionLeadId] = useState<string | null>(null)
  const actionMenuRef = useRef<HTMLDivElement | null>(null)
  const [activityDraftById, setActivityDraftById] = useState<Record<string, string>>({})
  const [followUpDraftById, setFollowUpDraftById] = useState<Record<string, string>>({})
  const [clientNeedsViewerLeadId, setClientNeedsViewerLeadId] = useState<string | null>(null)
  const [activityHistoryLeadId, setActivityHistoryLeadId] = useState<string | null>(null)
  const [sourcePickerLeadId, setSourcePickerLeadId] = useState<string | null>(null)
  const [sourcePickerMode, setSourcePickerMode] = useState<'campaign' | 'active_client' | 'manual'>('campaign')
  const [sourcePickerCampaignId, setSourcePickerCampaignId] = useState('')
  const [sourcePickerClientId, setSourcePickerClientId] = useState('')
  const [sourcePickerManual, setSourcePickerManual] = useState('')
  const [leadDetailsLeadId, setLeadDetailsLeadId] = useState<string | null>(null)
  const [quoteModalLeadId, setQuoteModalLeadId] = useState<string | null>(null)
  const [quoteChannelDraft, setQuoteChannelDraft] = useState<LeadQuoteChannel | ''>('')
  const [quoteVisualUrlDraft, setQuoteVisualUrlDraft] = useState('')
  const [quotePdfFile, setQuotePdfFile] = useState<File | null>(null)
  const [quoteModalError, setQuoteModalError] = useState('')
  const [quoteSubmitting, setQuoteSubmitting] = useState(false)

  useEffect(() => {
    const st = location.state as { openAdd?: boolean } | undefined
    if (!st?.openAdd) return
    setFormOpen(true)
    navigate('.', { replace: true, state: null })
  }, [location.state, navigate])

  useEffect(() => {
    if (!quoteModalLeadId) return
    setQuoteChannelDraft('')
    setQuoteVisualUrlDraft('')
    setQuotePdfFile(null)
    setQuoteModalError('')
    setQuoteSubmitting(false)
  }, [quoteModalLeadId])

  const quoteModalLead = useMemo(
    () => leads.find((x) => x.id === quoteModalLeadId) ?? null,
    [leads, quoteModalLeadId],
  )
  const leadDetailsLead = useMemo(
    () => leads.find((x) => x.id === leadDetailsLeadId) ?? null,
    [leads, leadDetailsLeadId],
  )

  const ownerId = user?.uid ?? users[0]?.id ?? ''
  const actorName =
    user
      ? user.displayName?.trim() || user.email?.split('@')[0] || 'משתמש'
      : 'משתמש'
  const ownerNameById = useMemo(() => {
    const m = new Map<string, string>()
    users.forEach((u) => m.set(u.id, u.name))
    return m
  }, [users])
  const campaignNameById = useMemo(() => {
    const m = new Map<string, string>()
    campaigns.forEach((c) => m.set(c.id, c.name))
    return m
  }, [campaigns])
  const clientNameById = useMemo(() => {
    const m = new Map<string, string>()
    clients.forEach((c) => m.set(c.id, c.name))
    return m
  }, [clients])
  const activeCampaigns = useMemo(
    () => campaigns.filter((c) => c.status === 'active'),
    [campaigns],
  )
  const activeClients = useMemo(
    () => clients.filter((c) => c.status === 'active'),
    [clients],
  )
  const clientsSorted = useMemo(
    () => [...clients].sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [clients],
  )

  const clientLinkMatches = useMemo(() => {
    const q = linkedClientText.trim().toLowerCase()
    if (!q) return []
    return clientsSorted
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.contact ?? '').toLowerCase().includes(q),
      )
      .slice(0, 15)
  }, [clientsSorted, linkedClientText])

  useEffect(() => {
    if (sourceMode === 'campaign' && sourceCampaignId) {
      setSource(sourceCampaignId)
    }
    if (sourceMode === 'active_client' && sourceClientId) {
      setSource(sourceClientId)
    }
  }, [sourceMode, sourceCampaignId, sourceClientId])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!actionMenuRef.current) return
      if (!actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionLeadId(null)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!linkClientWrapRef.current) return
      if (!linkClientWrapRef.current.contains(e.target as Node)) {
        setLinkSuggestOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const onLinkedClientTextChange = (v: string) => {
    setLinkedClientText(v)
    setLinkedClientId((prev) => {
      if (!prev) return ''
      const n = clientNameById.get(prev)
      if (n != null && v.trim() === n.trim()) return prev
      return ''
    })
  }

  const pickLinkedClient = (id: string) => {
    const n = clientNameById.get(id)
    setLinkedClientId(id)
    setLinkedClientText(n ?? '')
    setLinkSuggestOpen(false)
  }

  const resolveSubmitClientId = (): string | undefined => {
    const id = linkedClientId.trim()
    if (id) return id
    const t = linkedClientText.trim()
    if (!t) return undefined
    const lower = t.toLowerCase()
    const exact = clientsSorted.filter((c) => c.name.trim().toLowerCase() === lower)
    if (exact.length === 1) return exact[0].id
    return undefined
  }

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase()
    return leads
      .filter((l) => (statusFilter === 'all' ? true : l.status === statusFilter))
      .filter((l) => {
        if (!text) return true
        return (
          l.name.toLowerCase().includes(text) ||
          (l.company ?? '').toLowerCase().includes(text) ||
          (l.email ?? '').toLowerCase().includes(text) ||
          (l.phone ?? '').toLowerCase().includes(text) ||
          (l.clientId
            ? (clientNameById.get(l.clientId) ?? '').toLowerCase().includes(text)
            : false)
        )
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [leads, statusFilter, q, clientNameById])
  const clientNeedsViewerLead = useMemo(
    () => leads.find((l) => l.id === clientNeedsViewerLeadId) ?? null,
    [leads, clientNeedsViewerLeadId],
  )
  const activityHistoryLead = useMemo(
    () => leads.find((l) => l.id === activityHistoryLeadId) ?? null,
    [leads, activityHistoryLeadId],
  )

  const submitLead = async () => {
    if (!name.trim() || !ownerId) return
    await addLead({
      name: name.trim(),
      company: company.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      clientId: resolveSubmitClientId(),
      source: source.trim() || undefined,
      status: 'new',
      ownerId,
      clientNeeds: clientNeeds.trim() || undefined,
    })
    setName('')
    setCompany('')
    setPhone('')
    setEmail('')
    setSource('')
    setSourceCampaignId('')
    setSourceClientId('')
    setSourceMode('campaign')
    setClientNeeds('')
    setLinkedClientId('')
    setLinkedClientText('')
    setLinkSuggestOpen(false)
    setFormOpen(false)
  }

  const urgencyForLead = (followUpDate?: string): { label: string; color: string } | null => {
    if (!followUpDate) return null
    const today = todayYmd()
    const next = followUpDate.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return null
    if (next < today) return { label: 'דחוף מאוד', color: '#DC2626' }
    if (next === today) return { label: 'דחוף היום', color: '#EA580C' }
    if (next <= new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)) {
      return { label: 'לטיפול בקרוב', color: '#D97706' }
    }
    return { label: 'מתוכנן', color: '#2563EB' }
  }

  const buildFullActivityLog = (lead: (typeof leads)[number]) => {
    const log = [...(lead.activityLog ?? [])]
    if (log.length === 0 && lead.lastActivityText && lead.lastActivityAt) {
      log.push({
        id: crypto.randomUUID(),
        text: lead.lastActivityText,
        at: lead.lastActivityAt,
        actorName: ownerNameById.get(lead.ownerId) ?? actorName,
        ...(lead.nextFollowUpDate ? { nextFollowUpDate: lead.nextFollowUpDate } : {}),
      })
    }
    return log
  }

  const saveFollowUp = async (leadId: string) => {
    const lead = leads.find((x) => x.id === leadId)
    if (!lead) return
    const text = (activityDraftById[leadId] ?? '').trim()
    const followUpDate = (followUpDraftById[leadId] ?? '').trim()
    if (!text && !followUpDate) return
    const nowIso = new Date().toISOString()
    const nextFollowUp = followUpDate ? followUpDate.slice(0, 10) : undefined
    const nextLog = [
      ...buildFullActivityLog(lead),
      ...(text
        ? [
            {
              id: crypto.randomUUID(),
              text,
              at: nowIso,
              actorName,
              ...(nextFollowUp ? { nextFollowUpDate: nextFollowUp } : {}),
            },
          ]
        : []),
    ]
    await updateLead(leadId, {
      ...(text ? { lastActivityText: text } : {}),
      ...(followUpDate ? { nextFollowUpDate: nextFollowUp } : { nextFollowUpDate: undefined }),
      lastActivityAt: nowIso,
      activityLog: nextLog,
      status: 'follow_up',
    })
    setActivityDraftById((prev) => ({ ...prev, [leadId]: '' }))
    setOpenActionLeadId(null)
  }

  const setLeadStatusWithLog = async (leadId: string, status: LeadStatus) => {
    const lead = leads.find((x) => x.id === leadId)
    if (!lead) return
    if (lead.status === status) return
    const nowIso = new Date().toISOString()
    const nextLog = [
      ...buildFullActivityLog(lead),
      {
        id: crypto.randomUUID(),
        text: `סטטוס שונה ל: ${statusLabels[status]}`,
        at: nowIso,
        actorName,
        ...(lead.nextFollowUpDate ? { nextFollowUpDate: lead.nextFollowUpDate } : {}),
      },
    ]
    await updateLead(leadId, {
      status,
      activityLog: nextLog,
      lastActivityText: `סטטוס שונה ל: ${statusLabels[status]}`,
      lastActivityAt: nowIso,
    })
    setOpenActionLeadId(null)
  }

  const applyQuoteSentWithLog = async (
    leadId: string,
    channel: LeadQuoteChannel,
    opts: { pdfUrl?: string; pdfName?: string; visualUrl?: string },
  ) => {
    const lead = leads.find((x) => x.id === leadId)
    if (!lead) return
    const nowIso = new Date().toISOString()
    let detail = ''
    if (channel === 'green_invoice') detail = ' · דרך חשבונית ירוקה'
    else if (channel === 'pdf_file')
      detail = ` · קובץ PDF: ${opts.pdfName?.trim() || 'מצורף'}`
    else detail = ` · קישור ויזואלי`
    const statusText = `סטטוס שונה ל: ${statusLabels.quote_sent}${detail}`
    const nextLog = [
      ...buildFullActivityLog(lead),
      {
        id: crypto.randomUUID(),
        text: statusText,
        at: nowIso,
        actorName,
        ...(lead.nextFollowUpDate ? { nextFollowUpDate: lead.nextFollowUpDate } : {}),
      },
    ]
    const base: Record<string, unknown> = {
      status: 'quote_sent',
      quoteChannel: channel,
      activityLog: nextLog,
      lastActivityText: statusText,
      lastActivityAt: nowIso,
    }
    if (channel === 'green_invoice') {
      base.quotePdfUrl = deleteField()
      base.quotePdfFileName = deleteField()
      base.quoteVisualUrl = deleteField()
    } else if (channel === 'pdf_file') {
      base.quotePdfUrl = opts.pdfUrl
      base.quotePdfFileName = opts.pdfName
      base.quoteVisualUrl = deleteField()
    } else {
      base.quoteVisualUrl = opts.visualUrl
      base.quotePdfUrl = deleteField()
      base.quotePdfFileName = deleteField()
    }
    await updateLead(leadId, base)
    setQuoteModalLeadId(null)
    setOpenActionLeadId(null)
  }

  const confirmQuoteSent = async () => {
    setQuoteModalError('')
    if (!quoteModalLeadId) return
    if (!quoteChannelDraft) {
      setQuoteModalError('נא לבחור אופן שליחת ההצעה')
      return
    }
    if (quoteChannelDraft === 'pdf_file') {
      if (!quotePdfFile) {
        setQuoteModalError('נא להעלות קובץ PDF')
        return
      }
      setQuoteSubmitting(true)
      try {
        const { url, fileName } = await uploadLeadQuotePdf(quoteModalLeadId, quotePdfFile)
        await applyQuoteSentWithLog(quoteModalLeadId, 'pdf_file', {
          pdfUrl: url,
          pdfName: fileName,
        })
      } catch (e) {
        toastFsError('שגיאה בהעלאת PDF', e, 'uploadLeadQuotePdf')
        setQuoteModalError(e instanceof Error ? e.message : 'שגיאה בהעלאה')
      } finally {
        setQuoteSubmitting(false)
      }
      return
    }
    if (quoteChannelDraft === 'visual_link') {
      const u = quoteVisualUrlDraft.trim()
      if (!u || !isValidHttpUrl(u)) {
        setQuoteModalError('נא למלא קישור תקין (כולל https:// או http://)')
        return
      }
      setQuoteSubmitting(true)
      try {
        await applyQuoteSentWithLog(quoteModalLeadId, 'visual_link', { visualUrl: u })
      } finally {
        setQuoteSubmitting(false)
      }
      return
    }
    setQuoteSubmitting(true)
    try {
      await applyQuoteSentWithLog(quoteModalLeadId, 'green_invoice', {})
    } finally {
      setQuoteSubmitting(false)
    }
  }

  const promptAndUpdateField = async (
    leadId: string,
    field: 'company' | 'phone' | 'email' | 'source' | 'clientNeeds',
    label: string,
    current?: string,
  ) => {
    const next = window.prompt(`${label}:`, current ?? '')
    if (next === null) return
    const trimmed = next.trim()
    await updateLead(leadId, {
      [field]: trimmed || undefined,
    })
  }

  const sourceLabel = (raw?: string) =>
    raw ? campaignNameById.get(raw) ?? clientNameById.get(raw) ?? raw : ''

  const openSourcePicker = (leadId: string, current?: string) => {
    setSourcePickerLeadId(leadId)
    if (current && campaignNameById.has(current)) {
      setSourcePickerMode('campaign')
      setSourcePickerCampaignId(current)
      setSourcePickerClientId('')
      setSourcePickerManual('')
      return
    }
    if (current && clientNameById.has(current)) {
      setSourcePickerMode('active_client')
      setSourcePickerClientId(current)
      setSourcePickerCampaignId('')
      setSourcePickerManual('')
      return
    }
    setSourcePickerMode('manual')
    setSourcePickerManual(current ?? '')
    setSourcePickerCampaignId('')
    setSourcePickerClientId('')
  }

  const saveSourcePicker = async () => {
    if (!sourcePickerLeadId) return
    const next =
      sourcePickerMode === 'campaign'
        ? sourcePickerCampaignId
        : sourcePickerMode === 'active_client'
          ? sourcePickerClientId
          : sourcePickerManual.trim()
    await updateLead(sourcePickerLeadId, { source: next || undefined })
    setSourcePickerLeadId(null)
    setSourcePickerCampaignId('')
    setSourcePickerClientId('')
    setSourcePickerManual('')
    setSourcePickerMode('campaign')
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-8 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">לידים</h1>
          <p className="mt-1 text-[13px] text-[var(--text-mid)]">ניהול ומעקב לידים לצוות</p>
        </div>
        <button type="button" className="hub-btn-primary text-sm" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? 'סגירה' : '+ ליד חדש'}
        </button>
      </header>

      {formOpen ? (
        <section className="grid grid-cols-1 gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] md:grid-cols-2">
          <input placeholder="שם ליד *" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="חברה" value={company} onChange={(e) => setCompany(e.target.value)} />
          <input placeholder="טלפון" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input placeholder="אימייל" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
          <div className="md:col-span-2">
            <label className="mb-1 block text-[11px] font-semibold text-[var(--text-mid)]">
              שיוך ללקוח קיים במערכת (אופציונלי)
            </label>
            <div ref={linkClientWrapRef} className="relative">
              <input
                className="w-full"
                placeholder="הקלד שם חברה / לקוח — רשימה מסוננת תופיע מיד"
                value={linkedClientText}
                onChange={(e) => onLinkedClientTextChange(e.target.value)}
                onFocus={() => setLinkSuggestOpen(true)}
                autoComplete="off"
              />
              {linkSuggestOpen &&
              linkedClientText.trim() &&
              clientLinkMatches.length > 0 ? (
                <ul
                  className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-[10px] border border-[var(--border)] bg-white py-1 shadow-[0_10px_24px_rgba(0,0,0,0.12)]"
                  role="listbox"
                >
                  {clientLinkMatches.map((c) => (
                    <li key={c.id} role="option">
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-right text-[13px] text-[var(--text-dark)] hover:bg-[#EFF6FF]"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickLinkedClient(c.id)}
                      >
                        <span className="font-semibold">{c.name}</span>
                        {c.contact ? (
                          <span className="ms-2 text-[11px] text-[var(--text-mid)]">
                            · {c.contact}
                          </span>
                        ) : null}
                        {c.status === 'inactive' ? (
                          <span className="ms-2 text-[10px] text-[var(--text-light)]">
                            (לא פעיל)
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {linkedClientId ? (
              <p className="mt-1 text-[10px] font-medium text-[var(--blue-mid)]">
                משויך לכרטיס: {clientNameById.get(linkedClientId) ?? linkedClientId}
              </p>
            ) : linkedClientText.trim() ? (
              <p className="mt-1 text-[10px] text-[var(--text-light)]">
                לחצו על התאמה מהרשימה, או השאירו טקסט חופשי — לא יישמר שיוך אלא אם השם זהה
                ללקוח יחיד במערכת.
              </p>
            ) : (
              <p className="mt-1 text-[10px] text-[var(--text-light)]">
                ריק = ללא שיוך. נפרד מ־«מקור הליד» למטה.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                className={`rounded-[8px] px-2 py-1 text-[11px] font-semibold ${
                  sourceMode === 'campaign'
                    ? 'bg-[#EFF6FF] text-[var(--blue-mid)]'
                    : 'border border-[var(--border)] text-[var(--text-mid)]'
                }`}
                onClick={() => {
                  setSourceMode('campaign')
                  if (!sourceCampaignId) setSource('')
                }}
              >
                מקור מקמפיין
              </button>
              <button
                type="button"
                className={`rounded-[8px] px-2 py-1 text-[11px] font-semibold ${
                  sourceMode === 'active_client'
                    ? 'bg-[#EFF6FF] text-[var(--blue-mid)]'
                    : 'border border-[var(--border)] text-[var(--text-mid)]'
                }`}
                onClick={() => {
                  setSourceMode('active_client')
                  if (!sourceClientId) {
                    setSource('')
                  } else {
                    const c = activeClients.find((x) => x.id === sourceClientId)
                    if (c?.name) {
                      setCompany(c.name)
                      setLinkedClientId(sourceClientId)
                      setLinkedClientText(c.name)
                      setLinkSuggestOpen(false)
                    }
                  }
                }}
              >
                לקוח פעיל
              </button>
              <button
                type="button"
                className={`rounded-[8px] px-2 py-1 text-[11px] font-semibold ${
                  sourceMode === 'manual'
                    ? 'bg-[#EFF6FF] text-[var(--blue-mid)]'
                    : 'border border-[var(--border)] text-[var(--text-mid)]'
                }`}
                onClick={() => {
                  setSourceMode('manual')
                  setSource('')
                }}
              >
                מקור חופשי
              </button>
            </div>
            {sourceMode === 'campaign' ? (
              <select
                value={sourceCampaignId}
                onChange={(e) => setSourceCampaignId(e.target.value)}
              >
                <option value="">בחירת קמפיין פעיל (אופציונלי)</option>
                {activeCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : sourceMode === 'active_client' ? (
              <select
                value={sourceClientId}
                onChange={(e) => {
                  const id = e.target.value
                  setSourceClientId(id)
                  if (id) {
                    const c = activeClients.find((x) => x.id === id)
                    if (c?.name) {
                      setCompany(c.name)
                      setLinkedClientId(id)
                      setLinkedClientText(c.name)
                      setLinkSuggestOpen(false)
                    }
                  }
                }}
              >
                <option value="">בחירת לקוח פעיל (אופציונלי)</option>
                {activeClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                placeholder="מקור ליד חופשי (פייסבוק/המלצה/וואטסאפ...)"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            )}
          </div>
          <input placeholder="צרכי לקוח" value={clientNeeds} onChange={(e) => setClientNeeds(e.target.value)} />
          <div className="md:col-span-2 flex justify-end gap-2">
            <button type="button" className="hub-btn-secondary text-sm" onClick={() => setFormOpen(false)}>
              ביטול
            </button>
            <button type="button" className="hub-btn-primary text-sm" onClick={() => void submitLead()}>
              שמירת ליד
            </button>
          </div>
        </section>
      ) : null}

      <section className="flex flex-wrap items-center gap-2">
        <input
          className="w-full max-w-[320px]"
          placeholder="חיפוש ליד..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold ${statusFilter === 'all' ? 'hub-btn-primary' : 'border border-[var(--border)] bg-white text-[var(--text-mid)]'}`} onClick={() => setStatusFilter('all')}>
          הכל
        </button>
        {(Object.keys(statusLabels) as LeadStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold ${
              statusFilter === s
                ? 'text-white'
                : 'border border-[var(--border)] bg-white text-[var(--text-mid)]'
            }`}
            style={statusFilter === s ? { backgroundColor: statusColors[s] } : undefined}
          >
            {statusLabels[s]}
          </button>
        ))}
      </section>

      <section className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[1024px] table-fixed text-sm">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-right text-[11px] font-bold text-[var(--text-light)]">
                <th className="px-3 py-3">שם ליד</th>
                <th className="px-3 py-3">חברה</th>
                <th className="px-3 py-3">לקוח במערכת</th>
                <th className="px-3 py-3">טלפון</th>
                <th className="px-3 py-3">אימייל</th>
                <th className="px-3 py-3">מקור</th>
                <th className="px-3 py-3">מנהל תיק לקוח</th>
                <th className="px-3 py-3">סטטוס</th>
                <th className="px-3 py-3">צרכי לקוח</th>
                <th className="px-3 py-3">דחיפות</th>
                <th className="px-3 py-3">תאריך כניסה</th>
                <th className="w-[9.5rem] min-w-[9.5rem] max-w-[9.5rem] px-2 py-3">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-t border-[var(--border)] align-top">
                  <td className="px-3 py-3 font-semibold text-[var(--text-dark)]">{l.name}</td>
                  <td className="px-3 py-3 text-[var(--text-mid)]">
                    {l.company ? (
                      l.company
                    ) : (
                      <button
                        type="button"
                        className="rounded-[8px] border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-1 text-[10px] font-semibold text-[var(--blue-mid)]"
                        onClick={() =>
                          void promptAndUpdateField(l.id, 'company', 'חברה', l.company)
                        }
                      >
                        + הוסף
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[var(--text-mid)]">
                    {l.clientId ? (
                      <span className="font-medium text-[var(--text-dark)]">
                        {clientNameById.get(l.clientId) ?? l.clientId}
                      </span>
                    ) : (
                      <span className="text-[var(--text-light)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[var(--text-mid)] break-all" dir="ltr">
                    {l.phone ? (
                      l.phone
                    ) : (
                      <button
                        type="button"
                        className="rounded-[8px] border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-1 text-[10px] font-semibold text-[var(--blue-mid)]"
                        onClick={() =>
                          void promptAndUpdateField(l.id, 'phone', 'טלפון', l.phone)
                        }
                      >
                        + הוסף
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[var(--text-mid)] break-all" dir="ltr">
                    {l.email ? (
                      l.email
                    ) : (
                      <button
                        type="button"
                        className="rounded-[8px] border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-1 text-[10px] font-semibold text-[var(--blue-mid)]"
                        onClick={() =>
                          void promptAndUpdateField(l.id, 'email', 'אימייל', l.email)
                        }
                      >
                        + הוסף
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[var(--text-mid)] break-words">
                    {l.source ? (
                      <button
                        type="button"
                        className="text-right hover:underline"
                        onClick={() => openSourcePicker(l.id, l.source)}
                      >
                        {sourceLabel(l.source)}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded-[8px] border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-1 text-[10px] font-semibold text-[var(--blue-mid)]"
                        onClick={() => openSourcePicker(l.id, l.source)}
                      >
                        + הוסף
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[var(--text-mid)]">
                    {ownerNameById.get(l.ownerId) ?? 'לא משויך'}
                  </td>
                  <td className="px-3 py-3">
                    <Badge label={statusLabels[l.status]} color={statusColors[l.status]} />
                    {l.status === 'quote_sent' &&
                    (l.quoteChannel ||
                      l.quotePdfUrl ||
                      l.quoteVisualUrl) ? (
                      <div className="mt-1.5 space-y-1 text-[10px] text-[var(--text-mid)]">
                        {l.quoteChannel === 'green_invoice' ? (
                          <span className="block text-[var(--text-dark)]">
                            חשבונית ירוקה
                          </span>
                        ) : null}
                        {l.quotePdfUrl ? (
                          <a
                            href={l.quotePdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block font-medium text-[var(--blue-mid)] hover:underline"
                            dir="ltr"
                          >
                            {l.quotePdfFileName || 'פתיחת PDF'}
                          </a>
                        ) : null}
                        {l.quoteVisualUrl ? (
                          <a
                            href={l.quoteVisualUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate font-medium text-[var(--blue-mid)] hover:underline"
                            dir="ltr"
                          >
                            קישור להצעה
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-[var(--text-mid)] max-w-[220px]">
                    {l.clientNeeds ? (
                      <button
                        type="button"
                        className="line-clamp-2 text-right hover:underline"
                        onClick={() => setClientNeedsViewerLeadId(l.id)}
                        title="פתח צרכי לקוח"
                      >
                        {l.clientNeeds}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded-[8px] border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-1 text-[10px] font-semibold text-[var(--blue-mid)]"
                        onClick={() =>
                          void promptAndUpdateField(
                            l.id,
                            'clientNeeds',
                            'צרכי לקוח',
                            l.clientNeeds,
                          )
                        }
                      >
                        + הוסף
                      </button>
                    )}
                    {l.lastActivityText ? (
                      <button
                        type="button"
                        onClick={() => setActivityHistoryLeadId(l.id)}
                        className="mt-1 text-right text-[10px] text-[var(--text-light)] hover:underline"
                      >
                        עדכון אחרון: {l.lastActivityText}
                        {l.lastActivityAt ? ` · ${new Date(l.lastActivityAt).toLocaleString('he-IL')}` : ''}
                      </button>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    {urgencyForLead(l.nextFollowUpDate) ? (
                      <div className="space-y-1">
                        <Badge
                          label={urgencyForLead(l.nextFollowUpDate)!.label}
                          color={urgencyForLead(l.nextFollowUpDate)!.color}
                        />
                        <p className="text-[10px] text-[var(--text-light)]">
                          חזרה: {formatDateIL(l.nextFollowUpDate ?? '')}
                        </p>
                      </div>
                    ) : (
                      <span className="text-[11px] text-[var(--text-light)]">ללא תזמון</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[var(--text-mid)] text-xs">
                    {formatDateIL(l.createdAt)}
                  </td>
                  <td className="w-[9.5rem] min-w-[9.5rem] max-w-[9.5rem] overflow-visible px-2 py-3 align-top">
                    <div className="flex w-full min-w-0 max-w-full flex-col gap-1.5">
                      <div
                        className="relative block w-full min-w-0"
                        ref={openActionLeadId === l.id ? actionMenuRef : null}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setOpenActionLeadId((prev) => (prev === l.id ? null : l.id))
                          }
                          className="w-full rounded-[8px] border border-[var(--border)] bg-white px-3 py-1.5 text-[11px] font-semibold text-[var(--text-mid)]"
                        >
                          פעולות ▾
                        </button>
                      {openActionLeadId === l.id ? (
                        <div className="absolute start-0 z-50 mt-1 w-[min(320px,calc(100vw-1.5rem))] max-w-[86vw] rounded-[10px] border border-[var(--border)] bg-white p-2 shadow-[0_10px_24px_rgba(0,0,0,0.14)]">
                          <p className="mb-1 text-[10px] font-bold text-[var(--text-light)]">
                            סטטוס ליד
                          </p>
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {(Object.keys(statusLabels) as LeadStatus[]).map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => {
                                  if (s === 'quote_sent') {
                                    setOpenActionLeadId(null)
                                    setQuoteModalLeadId(l.id)
                                    return
                                  }
                                  void setLeadStatusWithLog(l.id, s)
                                }}
                                className="rounded-[8px] border px-2 py-1 text-[10px] font-semibold"
                                style={{
                                  borderColor: statusColors[s],
                                  color: l.status === s ? '#fff' : statusColors[s],
                                  backgroundColor: l.status === s ? statusColors[s] : '#fff',
                                }}
                              >
                                {statusLabels[s]}
                              </button>
                            ))}
                          </div>
                          <p className="mb-1 text-[10px] font-bold text-[var(--text-light)]">
                            מנהל לקוח (עובד מהמערכת)
                          </p>
                          <select
                            className="mb-2 w-full"
                            value={l.ownerId}
                            onChange={(e) => {
                              void updateLead(l.id, { ownerId: e.target.value })
                              setOpenActionLeadId(null)
                            }}
                          >
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                          <p className="mb-1 text-[10px] font-bold text-[var(--text-light)]">
                            מעקב אוטומטי (שעה מתעדכנת אוטומטית)
                          </p>
                          <textarea
                            rows={2}
                            placeholder="לדוגמה: שלחתי הודעה, הלקוח ביקש לחזור בתאריך..."
                            value={activityDraftById[l.id] ?? ''}
                            onChange={(e) =>
                              setActivityDraftById((prev) => ({
                                ...prev,
                                [l.id]: e.target.value,
                              }))
                            }
                          />
                          <input
                            type="date"
                            value={followUpDraftById[l.id] ?? l.nextFollowUpDate ?? ''}
                            onChange={(e) =>
                              setFollowUpDraftById((prev) => ({
                                ...prev,
                                [l.id]: e.target.value,
                              }))
                            }
                          />
                          <button
                            type="button"
                            onClick={() => void saveFollowUp(l.id)}
                            className="mb-2 w-full rounded-[8px] border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-1.5 text-[10px] font-semibold text-[var(--blue-mid)]"
                          >
                            שמירת מעקב
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void deleteLead(l.id)
                              setOpenActionLeadId(null)
                            }}
                            className="w-full rounded-[8px] border border-[#FECACA] bg-[#FEF2F2] px-2 py-1.5 text-[10px] font-semibold text-[#B91C1C]"
                          >
                            מחיקת ליד
                          </button>
                        </div>
                      ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenActionLeadId(null)
                          setLeadDetailsLeadId(l.id)
                        }}
                        className="w-full rounded-[8px] border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1.5 text-[11px] font-semibold text-[var(--blue-mid)]"
                      >
                        פרטים
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-mid)]">אין לידים להצגה</p>
      ) : null}

      <Modal
        isOpen={Boolean(quoteModalLeadId)}
        onClose={() => {
          if (quoteSubmitting) return
          setQuoteModalLeadId(null)
        }}
        title={`נשלחה הצעת מחיר${quoteModalLead ? ` · ${quoteModalLead.name}` : ''}`}
        size="lg"
        bodyClassName="min-h-0 max-h-[min(72vh,720px)] overflow-y-auto overflow-x-hidden"
      >
        <div className="min-w-0 space-y-4">
          <p className="break-words text-[13px] leading-relaxed text-[var(--text-mid)]">
            חובה לבחור אופן שליחה. חשבונית ירוקה — בלי קובץ או קישור. PDF — העלאת קובץ בלבד. קישור
            ויזואלי — כתובת מלאה (https).
          </p>
          <div className="space-y-3">
            <label className="flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-[10px] border border-[var(--border)] p-3 has-[:checked]:border-[#2563EB] has-[:checked]:bg-[#EFF6FF]">
              <input
                type="radio"
                name="quoteChannel"
                className="mt-1.5 size-4 shrink-0"
                checked={quoteChannelDraft === 'green_invoice'}
                onChange={() => {
                  setQuoteChannelDraft('green_invoice')
                  setQuoteModalError('')
                }}
              />
              <span className="min-w-0 flex-1 text-start">
                <span className="block break-words text-[15px] font-semibold leading-snug text-[var(--text-dark)]">
                  נשלחה דרך חשבונית ירוקה
                </span>
                <span className="mt-1 block break-words text-[12px] leading-snug text-[var(--text-mid)]">
                  ללא קובץ וללא קישור
                </span>
              </span>
            </label>
            <label className="flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-[10px] border border-[var(--border)] p-3 has-[:checked]:border-[#2563EB] has-[:checked]:bg-[#EFF6FF]">
              <input
                type="radio"
                name="quoteChannel"
                className="mt-1.5 size-4 shrink-0"
                checked={quoteChannelDraft === 'pdf_file'}
                onChange={() => {
                  setQuoteChannelDraft('pdf_file')
                  setQuoteModalError('')
                }}
              />
              <span className="min-w-0 flex-1 text-start">
                <span className="block break-words text-[15px] font-semibold leading-snug text-[var(--text-dark)]">
                  נשלחה כקובץ PDF
                </span>
                <span className="mt-1 block text-[12px] text-[var(--text-mid)]">
                  {quotePdfFile ? `נבחר: ${quotePdfFile.name}` : 'לאחר הבחירה — יש לצרף קובץ PDF'}
                </span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="mt-2 box-border block w-full max-w-full min-w-0 text-[12px] text-[var(--text-mid)] file:me-2 file:max-w-[12rem] file:truncate file:rounded-[6px] file:border-0 file:bg-[#EFF6FF] file:px-2 file:py-1.5 file:text-[11px] file:font-semibold file:text-[var(--blue-mid)] disabled:opacity-45"
                  disabled={quoteChannelDraft !== 'pdf_file' || quoteSubmitting}
                  onChange={(e) => {
                    setQuotePdfFile(e.target.files?.[0] ?? null)
                    setQuoteModalError('')
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </span>
            </label>
            <label className="flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-[10px] border border-[var(--border)] p-3 has-[:checked]:border-[#2563EB] has-[:checked]:bg-[#EFF6FF]">
              <input
                type="radio"
                name="quoteChannel"
                className="mt-1.5 size-4 shrink-0"
                checked={quoteChannelDraft === 'visual_link'}
                onChange={() => {
                  setQuoteChannelDraft('visual_link')
                  setQuoteModalError('')
                }}
              />
              <span className="min-w-0 flex-1 text-start">
                <span className="block break-words text-[15px] font-semibold leading-snug text-[var(--text-dark)]">
                  נשלחה דרך קישור ויזואלי
                </span>
                <span className="mt-1 block text-[12px] text-[var(--text-mid)]">
                  הדביקו קישור מלא (לדוגמה Google Drive, Canva, אתר)
                </span>
                <input
                  type="url"
                  className="mt-2 box-border w-full min-w-0 max-w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[13px] disabled:opacity-45"
                  placeholder="https://..."
                  dir="ltr"
                  disabled={quoteChannelDraft !== 'visual_link' || quoteSubmitting}
                  value={quoteVisualUrlDraft}
                  onChange={(e) => {
                    setQuoteVisualUrlDraft(e.target.value)
                    setQuoteModalError('')
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </span>
            </label>
          </div>
          {quoteModalError ? (
            <p className="rounded-[8px] bg-[#FEF2F2] px-3 py-2 text-[12px] text-[#B91C1C]">
              {quoteModalError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className="hub-btn-secondary text-sm"
              disabled={quoteSubmitting}
              onClick={() => setQuoteModalLeadId(null)}
            >
              ביטול
            </button>
            <button
              type="button"
              className="hub-btn-primary text-sm"
              disabled={quoteSubmitting}
              onClick={() => void confirmQuoteSent()}
            >
              {quoteSubmitting ? 'שומר…' : 'אישור ועדכון סטטוס'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(sourcePickerLeadId)}
        onClose={() => setSourcePickerLeadId(null)}
        title="בחירת מקור ליד"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded-[8px] px-2 py-1 text-[11px] font-semibold ${
                sourcePickerMode === 'campaign'
                  ? 'bg-[#EFF6FF] text-[var(--blue-mid)]'
                  : 'border border-[var(--border)] text-[var(--text-mid)]'
              }`}
              onClick={() => setSourcePickerMode('campaign')}
            >
              קמפיין פעיל
            </button>
            <button
              type="button"
              className={`rounded-[8px] px-2 py-1 text-[11px] font-semibold ${
                sourcePickerMode === 'active_client'
                  ? 'bg-[#EFF6FF] text-[var(--blue-mid)]'
                  : 'border border-[var(--border)] text-[var(--text-mid)]'
              }`}
              onClick={() => setSourcePickerMode('active_client')}
            >
              לקוח פעיל
            </button>
            <button
              type="button"
              className={`rounded-[8px] px-2 py-1 text-[11px] font-semibold ${
                sourcePickerMode === 'manual'
                  ? 'bg-[#EFF6FF] text-[var(--blue-mid)]'
                  : 'border border-[var(--border)] text-[var(--text-mid)]'
              }`}
              onClick={() => setSourcePickerMode('manual')}
            >
              שדה חופשי
            </button>
          </div>
          {sourcePickerMode === 'campaign' ? (
            <select
              value={sourcePickerCampaignId}
              onChange={(e) => setSourcePickerCampaignId(e.target.value)}
            >
              <option value="">בחירת קמפיין פעיל</option>
              {activeCampaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : sourcePickerMode === 'active_client' ? (
            <select
              value={sourcePickerClientId}
              onChange={(e) => setSourcePickerClientId(e.target.value)}
            >
              <option value="">בחירת לקוח פעיל</option>
              {activeClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              placeholder="מקור ליד חופשי"
              value={sourcePickerManual}
              onChange={(e) => setSourcePickerManual(e.target.value)}
            />
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="hub-btn-secondary text-sm"
              onClick={() => setSourcePickerLeadId(null)}
            >
              ביטול
            </button>
            <button type="button" className="hub-btn-primary text-sm" onClick={() => void saveSourcePicker()}>
              שמירה
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(clientNeedsViewerLead)}
        onClose={() => setClientNeedsViewerLeadId(null)}
        title={`צרכי לקוח${clientNeedsViewerLead ? ` · ${clientNeedsViewerLead.name}` : ''}`}
      >
        <div className="space-y-3">
          <p className="whitespace-pre-wrap rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] p-3 text-sm leading-relaxed text-[var(--text-dark)]">
            {clientNeedsViewerLead?.clientNeeds ?? 'אין תוכן להצגה'}
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              className="hub-btn-primary text-sm"
              onClick={() => setClientNeedsViewerLeadId(null)}
            >
              סגירה
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(leadDetailsLeadId)}
        onClose={() => setLeadDetailsLeadId(null)}
        title={`פרטי ליד${leadDetailsLead ? ` · ${leadDetailsLead.name}` : ''}`}
        size="xl"
        bodyClassName="min-h-0 max-h-[min(82vh,840px)] overflow-y-auto overflow-x-hidden"
      >
        {leadDetailsLead ? (
          <div className="min-w-0 space-y-4">
            <section className="rounded-[12px] border border-[var(--border)] bg-[#F8FAFC] p-4">
              <h3 className="mb-1 text-[12px] font-bold text-[var(--text-light)]">פרטים כלליים</h3>
              <div className="mt-2">
                <LeadDetailRow label="שם ליד">{leadDetailsLead.name}</LeadDetailRow>
                <LeadDetailRow label="חברה">
                  {leadDetailsLead.company ?? '—'}
                </LeadDetailRow>
                <LeadDetailRow label="לקוח במערכת">
                  {leadDetailsLead.clientId ? (
                    <span className="font-medium">
                      {clientNameById.get(leadDetailsLead.clientId) ?? leadDetailsLead.clientId}
                    </span>
                  ) : (
                    '—'
                  )}
                </LeadDetailRow>
                <LeadDetailRow label="טלפון">
                  {leadDetailsLead.phone ? (
                    <span dir="ltr" className="inline-block">
                      {leadDetailsLead.phone}
                    </span>
                  ) : (
                    '—'
                  )}
                </LeadDetailRow>
                <LeadDetailRow label="אימייל">
                  {leadDetailsLead.email ? (
                    <span dir="ltr" className="inline-block break-all">
                      {leadDetailsLead.email}
                    </span>
                  ) : (
                    '—'
                  )}
                </LeadDetailRow>
                <LeadDetailRow label="מקור">
                  {leadDetailsLead.source ? sourceLabel(leadDetailsLead.source) : '—'}
                </LeadDetailRow>
                <LeadDetailRow label="מנהל תיק לקוח">
                  {ownerNameById.get(leadDetailsLead.ownerId) ?? 'לא משויך'}
                </LeadDetailRow>
                <LeadDetailRow label="סטטוס">
                  <Badge
                    label={statusLabels[leadDetailsLead.status]}
                    color={statusColors[leadDetailsLead.status]}
                  />
                </LeadDetailRow>
                <LeadDetailRow label="תאריך כניסה">
                  {formatDateIL(leadDetailsLead.createdAt)}
                </LeadDetailRow>
                <LeadDetailRow label="מזהה מערכת">
                  <code className="rounded bg-white px-1.5 py-0.5 text-[11px]" dir="ltr">
                    {leadDetailsLead.id}
                  </code>
                </LeadDetailRow>
              </div>
            </section>

            {leadDetailsLead.status === 'quote_sent' ||
            leadDetailsLead.quoteChannel ||
            leadDetailsLead.quotePdfUrl ||
            leadDetailsLead.quoteVisualUrl ? (
              <section className="rounded-[12px] border border-[var(--border)] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <h3 className="mb-1 text-[12px] font-bold text-[var(--text-light)]">הצעת מחיר</h3>
                <p className="mb-3 text-[12px] text-[var(--text-mid)]">
                  אופן השליחה והקבצים / הקישורים השמורים על הליד.
                </p>
                <div>
                  <LeadDetailRow label="אופן שליחה">
                    {leadDetailsLead.quoteChannel
                      ? quoteChannelLabels[leadDetailsLead.quoteChannel]
                      : '—'}
                  </LeadDetailRow>
                  {leadDetailsLead.quoteChannel === 'green_invoice' ? (
                    <LeadDetailRow label="הערה">נשלח דרך מערכת חשבונית ירוקה (ללא קובץ מצורף כאן)</LeadDetailRow>
                  ) : null}
                  {leadDetailsLead.quotePdfUrl ? (
                    <LeadDetailRow label="קובץ PDF">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="break-all text-[12px] text-[var(--text-mid)]" dir="ltr">
                          {leadDetailsLead.quotePdfFileName || 'הצעת מחיר'}
                        </span>
                        <a
                          href={leadDetailsLead.quotePdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex rounded-[8px] bg-[#EFF6FF] px-2.5 py-1 text-[11px] font-semibold text-[var(--blue-mid)] hover:underline"
                        >
                          פתיחה בדפדפן
                        </a>
                        <a
                          href={leadDetailsLead.quotePdfUrl}
                          download={leadDetailsLead.quotePdfFileName || 'quote.pdf'}
                          className="inline-flex rounded-[8px] border border-[#BFDBFE] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--blue-mid)] hover:bg-[#EFF6FF]"
                        >
                          הורדה
                        </a>
                      </div>
                    </LeadDetailRow>
                  ) : null}
                  {leadDetailsLead.quoteVisualUrl ? (
                    <LeadDetailRow label="קישור ויזואלי">
                      <a
                        href={leadDetailsLead.quoteVisualUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-[13px] font-semibold text-[var(--blue-mid)] hover:underline"
                        dir="ltr"
                      >
                        {leadDetailsLead.quoteVisualUrl}
                      </a>
                    </LeadDetailRow>
                  ) : null}
                </div>
              </section>
            ) : null}

            <section className="rounded-[12px] border border-[var(--border)] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              <h3 className="mb-1 text-[12px] font-bold text-[var(--text-light)]">צרכי לקוח</h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--text-dark)]">
                {leadDetailsLead.clientNeeds?.trim() ? leadDetailsLead.clientNeeds : '—'}
              </p>
            </section>

            <section className="rounded-[12px] border border-[var(--border)] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              <h3 className="mb-1 text-[12px] font-bold text-[var(--text-light)]">תזמון מעקב</h3>
              <div className="mt-2">
                <LeadDetailRow label="תאריך חזרה מתוכננת">
                  {leadDetailsLead.nextFollowUpDate
                    ? formatDateIL(leadDetailsLead.nextFollowUpDate)
                    : '—'}
                </LeadDetailRow>
                <LeadDetailRow label="דחיפות">
                  {urgencyForLead(leadDetailsLead.nextFollowUpDate) ? (
                    <Badge
                      label={urgencyForLead(leadDetailsLead.nextFollowUpDate)!.label}
                      color={urgencyForLead(leadDetailsLead.nextFollowUpDate)!.color}
                    />
                  ) : (
                    'ללא תזמון'
                  )}
                </LeadDetailRow>
                <LeadDetailRow label="עדכון אחרון (טקסט)">
                  {leadDetailsLead.lastActivityText ? (
                    <span className="whitespace-pre-wrap">{leadDetailsLead.lastActivityText}</span>
                  ) : (
                    '—'
                  )}
                </LeadDetailRow>
                <LeadDetailRow label="מועד עדכון אחרון">
                  {leadDetailsLead.lastActivityAt
                    ? new Date(leadDetailsLead.lastActivityAt).toLocaleString('he-IL')
                    : '—'}
                </LeadDetailRow>
              </div>
            </section>

            <section className="rounded-[12px] border border-[var(--border)] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              <h3 className="mb-2 text-[12px] font-bold text-[var(--text-light)]">שושלת עדכונים מלאה</h3>
              {(leadDetailsLead.activityLog ?? []).length === 0 ? (
                leadDetailsLead.lastActivityText && leadDetailsLead.lastActivityAt ? (
                  <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] p-3">
                    <p className="whitespace-pre-wrap text-sm text-[var(--text-dark)]">
                      {leadDetailsLead.lastActivityText}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--text-light)]">
                      {new Date(leadDetailsLead.lastActivityAt).toLocaleString('he-IL')}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-mid)]">אין עדכונים שמורים עדיין.</p>
                )
              ) : (
                <div className="space-y-2">
                  {[...(leadDetailsLead.activityLog ?? [])]
                    .sort((a, b) => b.at.localeCompare(a.at))
                    .map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] p-3"
                      >
                        <p className="whitespace-pre-wrap text-sm text-[var(--text-dark)]">{entry.text}</p>
                        <p className="mt-1 text-[11px] text-[var(--text-light)]">
                          {new Date(entry.at).toLocaleString('he-IL')}
                          {entry.actorName ? ` · על ידי: ${entry.actorName}` : ''}
                          {entry.nextFollowUpDate
                            ? ` · חזרה: ${formatDateIL(entry.nextFollowUpDate)}`
                            : ''}
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </section>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-mid)]">טוען…</p>
        )}
        <div className="mt-6 flex justify-end border-t border-[var(--border)] pt-4">
          <button
            type="button"
            className="hub-btn-primary text-sm"
            onClick={() => setLeadDetailsLeadId(null)}
          >
            סגירה
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(activityHistoryLead)}
        onClose={() => setActivityHistoryLeadId(null)}
        title={`שושלת עדכונים${activityHistoryLead ? ` · ${activityHistoryLead.name}` : ''}`}
      >
        <div className="space-y-2">
          {(activityHistoryLead?.activityLog ?? []).length === 0 ? (
            activityHistoryLead?.lastActivityText && activityHistoryLead?.lastActivityAt ? (
              <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] p-3">
                <p className="whitespace-pre-wrap text-sm text-[var(--text-dark)]">
                  {activityHistoryLead.lastActivityText}
                </p>
                <p className="mt-1 text-[11px] text-[var(--text-light)]">
                  {new Date(activityHistoryLead.lastActivityAt).toLocaleString('he-IL')}
                </p>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-mid)]">אין עדכונים שמורים עדיין.</p>
            )
          ) : (
            [...(activityHistoryLead?.activityLog ?? [])]
              .sort((a, b) => b.at.localeCompare(a.at))
              .map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] p-3"
                >
                  <p className="whitespace-pre-wrap text-sm text-[var(--text-dark)]">{entry.text}</p>
                  <p className="mt-1 text-[11px] text-[var(--text-light)]">
                    {new Date(entry.at).toLocaleString('he-IL')}
                    {entry.actorName ? ` · על ידי: ${entry.actorName}` : ''}
                    {entry.nextFollowUpDate ? ` · חזרה: ${formatDateIL(entry.nextFollowUpDate)}` : ''}
                  </p>
                </div>
              ))
          )}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              className="hub-btn-primary text-sm"
              onClick={() => setActivityHistoryLeadId(null)}
            >
              סגירה
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
