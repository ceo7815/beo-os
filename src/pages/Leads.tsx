import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { deleteField } from 'firebase/firestore'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { formatDateIL, todayYmd } from '../lib/dates'
import { formatFirebaseErrorDetail } from '../lib/formatFirebaseError'
import { uploadLeadQuotePdf } from '../lib/leadQuoteStorage'
import { useLeads } from '../hooks/useLeads'
import { useCampaigns } from '../hooks/useCampaigns'
import { useClients } from '../hooks/useClients'
import { useUsers } from '../hooks/useUsers'
import type { Client, Lead, LeadQuoteChannel, LeadStatus } from '../types'
import { Badge } from '../components/shared/Badge'
import { HubDropdownSelect, type HubDropdownOption } from '../components/shared/HubDropdownSelect'
import { Modal } from '../components/shared/Modal'
import { hubSectionClass } from '../lib/hubSectionBorder'

/** ערך נשמר ב־Firestore בשדה `source` כשבוחרים מהרשימה הקבועה */
const LEAD_SOURCE_BEO_SYSTEMS = 'Beo systems'

const manualLeadSourcePresetOptions: HubDropdownOption[] = [
  { value: LEAD_SOURCE_BEO_SYSTEMS, label: LEAD_SOURCE_BEO_SYSTEMS },
]

function ManualLeadSourceFields({
  source,
  onChange,
  idPrefix,
}: {
  source: string
  onChange: (next: string) => void
  idPrefix: string
}) {
  const isBeo = source === LEAD_SOURCE_BEO_SYSTEMS
  return (
    <div className="space-y-2">
      <HubDropdownSelect
        id={`${idPrefix}-preset`}
        value={isBeo ? LEAD_SOURCE_BEO_SYSTEMS : ''}
        onChange={(v) => {
          if (v === LEAD_SOURCE_BEO_SYSTEMS) onChange(LEAD_SOURCE_BEO_SYSTEMS)
          else onChange('')
        }}
        options={manualLeadSourcePresetOptions}
        emptyOption={{ label: 'מקור אחר (הקלדה בשדה למטה)' }}
      />
      <input
        placeholder="מקור ליד חופשי (פייסבוק/המלצה/וואטסאפ…)"
        value={isBeo ? '' : source}
        onChange={(e) => onChange(e.target.value)}
        disabled={isBeo}
      />
    </div>
  )
}

function isValidHttpUrl(s: string): boolean {
  try {
    const u = new URL(s.trim())
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

function normalizePhoneDigits(p?: string): string {
  if (!p?.trim()) return ''
  return p.replace(/\D/g, '')
}

/**
 * מזהה כרטיס לקוח לליד: clientId, מקור כמזהה/שם לקוח (לא קמפיין), שם חברה בליד, או טלפון (ייחודי).
 * עוזר כשב־Firestore נשמרו מזהים ישנים או שם טקסט במקום id של מסמך clients.
 */
function leadResolvedClient(
  l: Lead,
  clientsList: Client[],
  campaignNameById: Map<string, string>,
): Client | undefined {
  const src = l.source?.trim() ?? ''
  const cid = l.clientId?.trim() ?? ''

  if (cid) {
    const byCid = clientsList.find((x) => x.id === cid)
    if (byCid) return byCid
  }
  if (src && !campaignNameById.has(src)) {
    const bySrcId = clientsList.find((x) => x.id === src)
    if (bySrcId) return bySrcId
    const bySrcName = clientsList.filter((x) => x.name.trim() === src)
    if (bySrcName.length === 1) return bySrcName[0]
  }
  const comp = l.company?.trim()
  if (comp) {
    const byComp = clientsList.filter((x) => x.name.trim() === comp)
    if (byComp.length === 1) return byComp[0]
  }
  const pIn = normalizePhoneDigits(l.phone)
  if (pIn.length >= 7) {
    const byPhone = clientsList.filter((x) => normalizePhoneDigits(x.phone) === pIn)
    if (byPhone.length === 1) return byPhone[0]
  }
  return undefined
}

const statusLabels: Record<LeadStatus, string> = {
  new: 'חדש',
  specification: 'בתהליך אפיון',
  quote_sent: 'נשלחה הצעת מחיר',
  follow_up: 'יש לבצע פולואפ',
  closed: 'נסגרה',
}

const statusColors: Record<LeadStatus, string> = {
  new: '#F97316',
  specification: '#7C3AED',
  quote_sent: '#D97706',
  follow_up: '#EA580C',
  closed: '#16A34A',
}

/** סדר תצוגה במסננים ובקוביות הסיכום */
const LEAD_STATUSES_ORDERED: LeadStatus[] = [
  'new',
  'specification',
  'quote_sent',
  'follow_up',
  'closed',
]

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
  const { clients, loading: clientsLoading, error: clientsError } = useClients()
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
  const [activityDraftById, setActivityDraftById] = useState<Record<string, string>>({})
  const [followUpDraftById, setFollowUpDraftById] = useState<Record<string, string>>({})
  const [clientNeedsViewerLeadId, setClientNeedsViewerLeadId] = useState<string | null>(null)
  const [clientNeedsEditDraft, setClientNeedsEditDraft] = useState('')
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
  const [quoteReturnByDraft, setQuoteReturnByDraft] = useState('')
  const [quoteModalError, setQuoteModalError] = useState('')
  const [quoteSubmitting, setQuoteSubmitting] = useState(false)
  /** רק במסלול PDF — כדי להבחין בין עיכוב באחסון לבין עיכוב ב-Firestore */
  const [quoteSubmitPhase, setQuoteSubmitPhase] = useState<'idle' | 'upload' | 'firestore'>(
    'idle',
  )

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
    setQuoteReturnByDraft('')
    setQuoteModalError('')
    setQuoteSubmitting(false)
    setQuoteSubmitPhase('idle')
  }, [quoteModalLeadId])

  const quoteModalLead = useMemo(
    () => leads.find((x) => x.id === quoteModalLeadId) ?? null,
    [leads, quoteModalLeadId],
  )
  const leadDetailsLead = useMemo(
    () => leads.find((x) => x.id === leadDetailsLeadId) ?? null,
    [leads, leadDetailsLeadId],
  )
  const actionMenuLead = useMemo(
    () => (openActionLeadId ? leads.find((x) => x.id === openActionLeadId) ?? null : null),
    [leads, openActionLeadId],
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

  /** שם לתצוגה — לפי מפת id או לפי התאמה חכמה לכרטיס לקוח (שם/טלפון/חברה). */
  const leadLinkedClientName = (l: Lead): string | null =>
    leadResolvedClient(l, clients, campaignNameById)?.name ?? null

  const leadLinkedClientRawRef = (l: Lead): string | null =>
    l.clientId?.trim() || l.source?.trim() || null

  /** לטולטיפ כשאין שם — כל המזהים השמורים (לעומת רק הראשון) */
  const leadLinkedClientRefsTitle = (l: Lead): string =>
    [...new Set([l.clientId?.trim(), l.source?.trim()].filter(Boolean) as string[])].join(' · ')

  const statusCounts = useMemo(() => {
    const counts: Record<LeadStatus, number> = {
      new: 0,
      specification: 0,
      quote_sent: 0,
      follow_up: 0,
      closed: 0,
    }
    for (const l of leads) {
      counts[l.status]++
    }
    return counts
  }, [leads])

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
          (leadLinkedClientName(l)?.toLowerCase().includes(text) ?? false)
        )
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [leads, statusFilter, q, clientNameById, clients, campaignNameById])
  const clientNeedsViewerLead = useMemo(
    () => leads.find((l) => l.id === clientNeedsViewerLeadId) ?? null,
    [leads, clientNeedsViewerLeadId],
  )

  useEffect(() => {
    if (!clientNeedsViewerLeadId) {
      setClientNeedsEditDraft('')
      return
    }
    setClientNeedsEditDraft(clientNeedsViewerLead?.clientNeeds ?? '')
  }, [clientNeedsViewerLeadId, clientNeedsViewerLead?.clientNeeds])

  const activityHistoryLead = useMemo(
    () => leads.find((l) => l.id === activityHistoryLeadId) ?? null,
    [leads, activityHistoryLeadId],
  )

  const submitLead = async () => {
    if (!name.trim() || !ownerId) return
    const srcT = source.trim()
    /** מזהה לקוח שנשמר ב־source במצב «לקוח פעיל» — id או שם לקוח יחיד */
    let clientIdFromSource: string | undefined
    if (srcT && !campaignNameById.has(srcT)) {
      if (clientNameById.has(srcT)) clientIdFromSource = srcT
      else {
        const exact = clientsSorted.filter((c) => c.name.trim() === srcT)
        if (exact.length === 1) clientIdFromSource = exact[0].id
      }
    }
    await addLead({
      name: name.trim(),
      company: company.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      clientId: resolveSubmitClientId() ?? clientIdFromSource,
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
    return { label: 'מתוכנן', color: '#64748B' }
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
    try {
      await updateLead(leadId, {
        ...(text ? { lastActivityText: text } : {}),
        ...(followUpDate ? { nextFollowUpDate: nextFollowUp } : { nextFollowUpDate: undefined }),
        lastActivityAt: nowIso,
        activityLog: nextLog,
        status: 'follow_up',
      })
      setActivityDraftById((prev) => ({ ...prev, [leadId]: '' }))
      setOpenActionLeadId(null)
    } catch {
      /* toast כבר הוצג ב־updateLead */
    }
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
    try {
      await updateLead(leadId, {
        status,
        activityLog: nextLog,
        lastActivityText: `סטטוס שונה ל: ${statusLabels[status]}`,
        lastActivityAt: nowIso,
      })
      setOpenActionLeadId(null)
    } catch {
      /* toast כבר הוצג ב־updateLead */
    }
  }

  const applyQuoteSentWithLog = async (
    leadId: string,
    channel: LeadQuoteChannel,
    quoteReturnByDate: string,
    opts: { pdfUrl?: string; pdfName?: string; visualUrl?: string },
  ) => {
    const lead = leads.find((x) => x.id === leadId)
    if (!lead) {
      throw new Error('הליד לא נמצא — רעננו את העמוד ונסו שוב')
    }
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
      quoteReturnByDate: quoteReturnByDate.slice(0, 10),
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
    const returnBy = quoteReturnByDraft.trim()
    if (!returnBy || !/^\d{4}-\d{2}-\d{2}$/.test(returnBy)) {
      setQuoteModalError('נא לבחור תאריך חזרה ללקוח להצעת המחיר')
      return
    }
    if (quoteChannelDraft === 'pdf_file') {
      if (!quotePdfFile) {
        setQuoteModalError('נא להעלות קובץ PDF')
        return
      }
      setQuoteSubmitting(true)
      setQuoteSubmitPhase('upload')
      try {
        const { url, fileName } = await uploadLeadQuotePdf(quoteModalLeadId, quotePdfFile)
        setQuoteSubmitPhase('firestore')
        await applyQuoteSentWithLog(quoteModalLeadId, 'pdf_file', returnBy, {
          pdfUrl: url,
          pdfName: fileName,
        })
      } catch (e) {
        setQuoteModalError(formatFirebaseErrorDetail(e))
      } finally {
        setQuoteSubmitting(false)
        setQuoteSubmitPhase('idle')
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
        await applyQuoteSentWithLog(quoteModalLeadId, 'visual_link', returnBy, { visualUrl: u })
      } catch (e) {
        setQuoteModalError(formatFirebaseErrorDetail(e))
      } finally {
        setQuoteSubmitting(false)
      }
      return
    }
    setQuoteSubmitting(true)
    try {
      await applyQuoteSentWithLog(quoteModalLeadId, 'green_invoice', returnBy, {})
    } catch (e) {
      setQuoteModalError(formatFirebaseErrorDetail(e))
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
    try {
      await updateLead(leadId, {
        [field]: trimmed || undefined,
      })
    } catch {
      /* toast כבר הוצג ב־updateLead */
    }
  }

  const sourceLabelForLead = (l: Lead) => {
    const raw = l.source?.trim() ?? ''
    if (raw && campaignNameById.has(raw)) {
      return campaignNameById.get(raw) ?? raw
    }
    const resolved = leadResolvedClient(l, clients, campaignNameById)
    if (resolved) return resolved.name
    return raw ? clientNameById.get(raw) ?? raw : ''
  }

  /** שורת קטגוריה מעל שם המקור (מקמפיין / לקוח קיים / Beo systems / מקור חופשי) */
  const sourceKindCaptionForLead = (l: Lead) => {
    const raw = l.source?.trim() ?? ''
    if (!raw && !leadResolvedClient(l, clients, campaignNameById)) return ''
    if (raw && campaignNameById.has(raw)) return 'מקמפיין'
    if (leadResolvedClient(l, clients, campaignNameById) || (raw && clientNameById.has(raw))) {
      return 'לקוח קיים'
    }
    if (raw === LEAD_SOURCE_BEO_SYSTEMS) return 'Beo systems'
    if (raw) return 'מקור חופשי'
    return ''
  }

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
    if (current) {
      const exactName = clientsSorted.filter((c) => c.name.trim() === current.trim())
      if (exactName.length === 1) {
        setSourcePickerMode('active_client')
        setSourcePickerClientId(exactName[0].id)
        setSourcePickerCampaignId('')
        setSourcePickerManual('')
        return
      }
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
    try {
      const cid =
        sourcePickerMode === 'active_client' && sourcePickerClientId.trim()
          ? sourcePickerClientId.trim()
          : undefined
      await updateLead(sourcePickerLeadId, {
        source: next || undefined,
        ...(cid ? { clientId: cid } : {}),
      })
      setSourcePickerLeadId(null)
      setSourcePickerCampaignId('')
      setSourcePickerClientId('')
      setSourcePickerManual('')
      setSourcePickerMode('campaign')
    } catch {
      /* toast כבר הוצג ב־updateLead */
    }
  }

  function LeadMobileCard({ l }: { l: Lead }) {
    const fu = l.nextFollowUpDate?.slice(0, 10)
    const qr = l.quoteReturnByDate?.slice(0, 10)
    const fuV = fu && /^\d{4}-\d{2}-\d{2}$/.test(fu) ? fu : undefined
    const qrV = qr && /^\d{4}-\d{2}-\d{2}$/.test(qr) ? qr : undefined
    const scheduleDate = fuV ?? qrV
    const urgency = scheduleDate ? urgencyForLead(scheduleDate) : null
    const caption = fuV ? 'חזרה' : 'תאריך חזרה ללקוח'

    const mobField = (label: string, node: ReactNode) => (
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-[var(--text-light)]">{label}</p>
        <div className="mt-1 min-w-0 text-[13px] text-[var(--text-dark)]">{node}</div>
      </div>
    )

    return (
      <article className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border)] pb-3">
          <h3 className="min-w-0 flex-1 text-base font-extrabold leading-snug text-[var(--text-dark)]">
            {l.name}
          </h3>
          <Badge label={statusLabels[l.status]} color={statusColors[l.status]} />
        </div>

        {l.status === 'quote_sent' &&
        (l.quoteChannel || l.quotePdfUrl || l.quoteVisualUrl) ? (
          <div className="mt-2 space-y-1 border-b border-[var(--border)] pb-3 text-[10px] text-[var(--text-mid)]">
            {l.quoteChannel === 'green_invoice' ? (
              <span className="block text-[var(--text-dark)]">חשבונית ירוקה</span>
            ) : null}
            {l.quotePdfUrl ? (
              <a
                href={l.quotePdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block font-medium text-[var(--orange)] hover:underline"
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
                className="block break-all font-medium text-[var(--orange)] hover:underline"
                dir="ltr"
              >
                קישור להצעה
              </a>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 space-y-3">
          {mobField(
            'חברה',
            l.company ? (
              <span className="text-[var(--text-mid)]">{l.company}</span>
            ) : (
              <button
                type="button"
                className="rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--orange-light)] px-2 py-1 text-[10px] font-semibold text-[var(--orange)]"
                onClick={() => void promptAndUpdateField(l.id, 'company', 'חברה', l.company)}
              >
                + הוסף
              </button>
            ),
          )}
          {mobField(
            'לקוח במערכת',
            (() => {
              const nm = leadLinkedClientName(l)
              const raw = leadLinkedClientRawRef(l)
              if (nm) return <span className="font-medium text-[var(--text-dark)]">{nm}</span>
              if (raw)
                return (
                  <span className="text-[var(--text-mid)]" title={leadLinkedClientRefsTitle(l)}>
                    מזהה לא מקושר לכרטיס לקוח
                  </span>
                )
              return <span className="text-[var(--text-light)]">—</span>
            })(),
          )}
          {mobField(
            'טלפון',
            l.phone ? (
              <span className="break-all font-mono text-[13px] leading-relaxed" dir="ltr">
                {l.phone}
              </span>
            ) : (
              <button
                type="button"
                className="rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--orange-light)] px-2 py-1 text-[10px] font-semibold text-[var(--orange)]"
                onClick={() => void promptAndUpdateField(l.id, 'phone', 'טלפון', l.phone)}
              >
                + הוסף
              </button>
            ),
          )}
          {mobField(
            'אימייל',
            l.email ? (
              <span className="break-all text-[13px] leading-relaxed" dir="ltr">
                {l.email}
              </span>
            ) : (
              <button
                type="button"
                className="rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--orange-light)] px-2 py-1 text-[10px] font-semibold text-[var(--orange)]"
                onClick={() => void promptAndUpdateField(l.id, 'email', 'אימייל', l.email)}
              >
                + הוסף
              </button>
            ),
          )}
          {mobField(
            'מקור',
            l.source ? (
              <button
                type="button"
                className="text-right hover:underline"
                onClick={() => openSourcePicker(l.id, l.source)}
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-[var(--text-light)]">
                    {sourceKindCaptionForLead(l)}
                  </span>
                  <span className="break-words text-[var(--text-mid)]">{sourceLabelForLead(l)}</span>
                </span>
              </button>
            ) : (
              <button
                type="button"
                className="rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--orange-light)] px-2 py-1 text-[10px] font-semibold text-[var(--orange)]"
                onClick={() => openSourcePicker(l.id, l.source)}
              >
                + הוסף
              </button>
            ),
          )}
          {mobField('מנהל תיק לקוח', ownerNameById.get(l.ownerId) ?? 'לא משויך')}
          {mobField(
            'צרכי לקוח',
            l.clientNeeds ? (
              <button
                type="button"
                className="text-right text-[var(--text-mid)] hover:underline"
                onClick={() => setClientNeedsViewerLeadId(l.id)}
              >
                {l.clientNeeds}
              </button>
            ) : (
              <button
                type="button"
                className="rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--orange-light)] px-2 py-1 text-[10px] font-semibold text-[var(--orange)]"
                onClick={() =>
                  void promptAndUpdateField(l.id, 'clientNeeds', 'צרכי לקוח', l.clientNeeds)
                }
              >
                + הוסף
              </button>
            ),
          )}
          {l.lastActivityText ? (
            <button
              type="button"
              onClick={() => setActivityHistoryLeadId(l.id)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-right text-[11px] text-[var(--text-mid)] transition hover:bg-white"
            >
              <span className="font-bold text-[var(--text-light)]">עדכון אחרון: </span>
              {l.lastActivityText}
              {l.lastActivityAt ? ` · ${new Date(l.lastActivityAt).toLocaleString('he-IL')}` : ''}
            </button>
          ) : null}
          {mobField(
            'דחיפות',
            !scheduleDate || !urgency ? (
              <span className="text-[12px] text-[var(--text-light)]">ללא תזמון</span>
            ) : (
              <div className="space-y-1">
                <Badge label={urgency.label} color={urgency.color} />
                <p className="text-[11px] text-[var(--text-light)]">
                  {caption}: {formatDateIL(scheduleDate)}
                </p>
              </div>
            ),
          )}
          {mobField('תאריך כניסה', formatDateIL(l.createdAt))}
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t border-[var(--border)] pt-3">
          <button
            type="button"
            onClick={() => setOpenActionLeadId(l.id)}
            className="w-full rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2 text-[12px] font-semibold text-[var(--text-mid)]"
          >
            פעולות ▾
          </button>
          <button
            type="button"
            onClick={() => {
              setOpenActionLeadId(null)
              setLeadDetailsLeadId(l.id)
            }}
            className="w-full rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--orange-light)] px-3 py-2 text-[12px] font-semibold text-[var(--orange)]"
          >
            פרטים
          </button>
        </div>
      </article>
    )
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 md:px-8 md:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">לידים</h1>
          <p className="mt-1 text-[13px] text-[var(--text-mid)]">ניהול ומעקב לידים לצוות</p>
        </div>
        <button type="button" className="hub-btn-orange text-sm" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? 'סגירה' : '+ ליד חדש'}
        </button>
      </header>

      {!clientsLoading && clients.length === 0 ? (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-950"
        >
          <p className="font-semibold">לא נטענו לקוחות מהמערכת.</p>
          <p className="mt-1 text-[11px] text-amber-900/90">
            בלי רשימת לקוחות לא ניתן להציג שמות בעמודות «לקוח במערכת» ו«מקור». ודאו שיש מסמכים באוסף clients ב־Firestore ושחוקי האבטחה מאפשרים קריאה.
            {clientsError ? ` (${clientsError.message})` : ''}
          </p>
        </div>
      ) : null}

      <section
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        aria-label="סיכום לידים לפי סטטוס"
      >
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`flex flex-col items-stretch gap-1 rounded-[12px] border px-3 py-2.5 text-right transition ${
            statusFilter === 'all'
              ? 'border-[var(--orange)] bg-[var(--orange-light)] shadow-[0_1px_4px_rgba(249,115,22,0.18)]'
              : 'border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] hover:bg-[var(--surface-muted)]'
          }`}
        >
          <span className="text-[11px] font-semibold text-[var(--text-mid)]">סה״כ לידים</span>
          <span className="text-[22px] font-extrabold tabular-nums text-[var(--text-dark)]">
            {leads.length}
          </span>
        </button>
        {LEAD_STATUSES_ORDERED.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`flex flex-col items-stretch gap-1 rounded-[12px] border px-3 py-2.5 text-right transition ${
              statusFilter === s
                ? 'shadow-[0_1px_4px_rgba(0,0,0,0.08)]'
                : 'border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] hover:bg-[var(--surface-muted)]'
            }`}
            style={
              statusFilter === s
                ? {
                    borderColor: statusColors[s],
                    backgroundColor: `${statusColors[s]}14`,
                  }
                : undefined
            }
          >
            <span className="text-[11px] font-semibold text-[var(--text-mid)]">{statusLabels[s]}</span>
            <span
              className="text-[22px] font-extrabold tabular-nums"
              style={{ color: statusColors[s] }}
            >
              {statusCounts[s]}
            </span>
          </button>
        ))}
      </section>

      {formOpen ? (
        <section className={`grid grid-cols-1 gap-3 rounded-2xl ${hubSectionClass(0)} p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] md:grid-cols-2`}>
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
                  className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-[10px] border-2 border-[var(--orange)] bg-[var(--dash-panel-bg)] py-1 shadow-[0_10px_24px_rgba(0,0,0,0.12)]"
                  role="listbox"
                >
                  {clientLinkMatches.map((c) => (
                    <li key={c.id} role="option">
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-right text-[13px] text-[var(--text-dark)] hover:bg-[var(--orange-light)]"
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
              <p className="mt-1 text-[10px] font-medium text-[var(--orange)]">
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
                    ? 'bg-[var(--orange-light)] text-[var(--orange)]'
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
                    ? 'bg-[var(--orange-light)] text-[var(--orange)]'
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
                    ? 'bg-[var(--orange-light)] text-[var(--orange)]'
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
              <ManualLeadSourceFields
                idPrefix="lead-new-manual"
                source={source}
                onChange={setSource}
              />
            )}
          </div>
          <input placeholder="צרכי לקוח" value={clientNeeds} onChange={(e) => setClientNeeds(e.target.value)} />
          <div className="md:col-span-2 flex justify-end gap-2">
            <button type="button" className="rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-5 py-2 text-sm font-semibold text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)]" onClick={() => setFormOpen(false)}>
              ביטול
            </button>
            <button type="button" className="hub-btn-orange text-sm" onClick={() => void submitLead()}>
              שמירת ליד
            </button>
          </div>
        </section>
      ) : null}

      <section className="flex flex-wrap items-center gap-2">
        <input
          className="w-full max-w-full md:max-w-[320px]"
          placeholder="חיפוש ליד..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold ${statusFilter === 'all' ? 'hub-btn-orange' : 'border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] text-[var(--text-mid)]'}`} onClick={() => setStatusFilter('all')}>
          הכל
        </button>
        {LEAD_STATUSES_ORDERED.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold ${
              statusFilter === s
                ? 'text-white'
                : 'border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] text-[var(--text-mid)]'
            }`}
            style={statusFilter === s ? { backgroundColor: statusColors[s] } : undefined}
          >
            {statusLabels[s]}
          </button>
        ))}
      </section>

      <section className={`rounded-2xl ${hubSectionClass(formOpen ? 1 : 0)} shadow-[0_2px_8px_rgba(0,0,0,0.06)]`}>
        <div className="md:hidden">
          <div className="space-y-3 p-3 sm:p-5">
            {filtered.map((l) => (
              <LeadMobileCard key={l.id} l={l} />
            ))}
          </div>
        </div>

        <div className="hidden min-w-0 overflow-x-auto md:block">
          <table className="w-full min-w-[1024px] table-fixed text-sm">
            <thead className="bg-[var(--surface-muted)]">
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
                        className="rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--orange-light)] px-2 py-1 text-[10px] font-semibold text-[var(--orange)]"
                        onClick={() =>
                          void promptAndUpdateField(l.id, 'company', 'חברה', l.company)
                        }
                      >
                        + הוסף
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[var(--text-mid)]">
                    {(() => {
                      const nm = leadLinkedClientName(l)
                      const raw = leadLinkedClientRawRef(l)
                      if (nm) {
                        return (
                          <span className="font-medium text-[var(--text-dark)]">{nm}</span>
                        )
                      }
                      if (raw) {
                        return (
                          <span className="text-[var(--text-mid)]" title={leadLinkedClientRefsTitle(l)}>
                            מזהה לא מקושר לכרטיס לקוח
                          </span>
                        )
                      }
                      return <span className="text-[var(--text-light)]">—</span>
                    })()}
                  </td>
                  <td className="px-3 py-3 text-[var(--text-mid)] break-all" dir="ltr">
                    {l.phone ? (
                      l.phone
                    ) : (
                      <button
                        type="button"
                        className="rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--orange-light)] px-2 py-1 text-[10px] font-semibold text-[var(--orange)]"
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
                        className="rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--orange-light)] px-2 py-1 text-[10px] font-semibold text-[var(--orange)]"
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
                        <span className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-bold text-[var(--text-light)]">
                            {sourceKindCaptionForLead(l)}
                          </span>
                          <span className="break-words">{sourceLabelForLead(l)}</span>
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--orange-light)] px-2 py-1 text-[10px] font-semibold text-[var(--orange)]"
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
                            className="block font-medium text-[var(--orange)] hover:underline"
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
                            className="block truncate font-medium text-[var(--orange)] hover:underline"
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
                        className="rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--orange-light)] px-2 py-1 text-[10px] font-semibold text-[var(--orange)]"
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
                    {(() => {
                      const fu = l.nextFollowUpDate?.slice(0, 10)
                      const qr = l.quoteReturnByDate?.slice(0, 10)
                      const fuV =
                        fu && /^\d{4}-\d{2}-\d{2}$/.test(fu) ? fu : undefined
                      const qrV =
                        qr && /^\d{4}-\d{2}-\d{2}$/.test(qr) ? qr : undefined
                      const scheduleDate = fuV ?? qrV
                      const urgency = scheduleDate
                        ? urgencyForLead(scheduleDate)
                        : null
                      if (!scheduleDate || !urgency) {
                        return (
                          <span className="text-[11px] text-[var(--text-light)]">ללא תזמון</span>
                        )
                      }
                      const caption = fuV ? 'חזרה' : 'תאריך חזרה ללקוח'
                      return (
                        <div className="space-y-1">
                          <Badge label={urgency.label} color={urgency.color} />
                          <p className="text-[10px] text-[var(--text-light)]">
                            {caption}: {formatDateIL(scheduleDate)}
                          </p>
                        </div>
                      )
                    })()}
                  </td>
                  <td className="px-3 py-3 text-[var(--text-mid)] text-xs">
                    {formatDateIL(l.createdAt)}
                  </td>
                  <td className="w-[9.5rem] min-w-[9.5rem] max-w-[9.5rem] overflow-visible px-2 py-3 align-top">
                    <div className="flex w-full min-w-0 max-w-full flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => setOpenActionLeadId(l.id)}
                        className="w-full rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-mid)]"
                      >
                        פעולות ▾
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenActionLeadId(null)
                          setLeadDetailsLeadId(l.id)
                        }}
                        className="w-full rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--orange-light)] px-3 py-1.5 text-[11px] font-semibold text-[var(--orange)]"
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
        isOpen={Boolean(openActionLeadId && actionMenuLead)}
        onClose={() => setOpenActionLeadId(null)}
        title={`פעולות · ${actionMenuLead?.name ?? ''}`}
        size="lg"
        bodyClassName="max-h-[min(85vh,720px)] overflow-y-auto overflow-x-hidden"
      >
        {actionMenuLead ? (
          <div className="space-y-3">
            <p className="mb-1 text-[10px] font-bold text-[var(--text-light)]">סטטוס ליד</p>
            <div className="flex flex-wrap gap-1.5">
              {LEAD_STATUSES_ORDERED.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    if (s === 'quote_sent') {
                      setOpenActionLeadId(null)
                      setQuoteModalLeadId(actionMenuLead.id)
                      return
                    }
                    void setLeadStatusWithLog(actionMenuLead.id, s)
                  }}
                  className="rounded-[8px] border px-2 py-1 text-[10px] font-semibold"
                  style={{
                    borderColor: statusColors[s],
                    color: actionMenuLead.status === s ? '#fff' : statusColors[s],
                    backgroundColor: actionMenuLead.status === s ? statusColors[s] : '#fff',
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
              className="w-full"
              value={actionMenuLead.ownerId}
              onChange={(e) => {
                void updateLead(actionMenuLead.id, { ownerId: e.target.value }).catch(() => {})
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
              value={activityDraftById[actionMenuLead.id] ?? ''}
              onChange={(e) =>
                setActivityDraftById((prev) => ({
                  ...prev,
                  [actionMenuLead.id]: e.target.value,
                }))
              }
            />
            <input
              type="date"
              value={
                followUpDraftById[actionMenuLead.id] ??
                actionMenuLead.nextFollowUpDate ??
                ''
              }
              onChange={(e) =>
                setFollowUpDraftById((prev) => ({
                  ...prev,
                  [actionMenuLead.id]: e.target.value,
                }))
              }
            />
            <button
              type="button"
              onClick={() => void saveFollowUp(actionMenuLead.id)}
              className="w-full rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--orange-light)] px-2 py-1.5 text-[10px] font-semibold text-[var(--orange)]"
            >
              שמירת מעקב
            </button>
            <button
              type="button"
              onClick={() => {
                void deleteLead(actionMenuLead.id)
                setOpenActionLeadId(null)
              }}
              className="w-full rounded-[8px] border border-[#FECACA] bg-[#FEF2F2] px-2 py-1.5 text-[10px] font-semibold text-[#B91C1C]"
            >
              מחיקת ליד
            </button>
            <div className="flex justify-end border-t border-[var(--border)] pt-3">
              <button
                type="button"
                className="rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-5 py-2 text-sm font-semibold text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)]"
                onClick={() => setOpenActionLeadId(null)}
              >
                סגירה
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

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
            חובה לבחור אופן שליחה ותאריך חזרה ללקוח. חשבונית ירוקה — בלי קובץ או קישור. PDF — העלאת קובץ
            בלבד. קישור ויזואלי — כתובת מלאה (https).
          </p>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[var(--text-mid)]">
              תאריך חזרה ללקוח להצעת המחיר <span className="text-[#B91C1C]">*</span>
            </label>
            <input
              type="date"
              className="max-w-[280px]"
              value={quoteReturnByDraft}
              onChange={(e) => {
                setQuoteReturnByDraft(e.target.value)
                setQuoteModalError('')
              }}
            />
          </div>
          <div className="space-y-3">
            <label className="flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-[10px] border border-[var(--border)] p-3 has-[:checked]:border-[var(--orange)] has-[:checked]:bg-[var(--orange-light)]">
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
            <label className="flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-[10px] border border-[var(--border)] p-3 has-[:checked]:border-[var(--orange)] has-[:checked]:bg-[var(--orange-light)]">
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
                  className="mt-2 box-border block w-full max-w-full min-w-0 text-[12px] text-[var(--text-mid)] file:me-2 file:max-w-[12rem] file:truncate file:rounded-[6px] file:border-0 file:bg-[var(--orange-light)] file:px-2 file:py-1.5 file:text-[11px] file:font-semibold file:text-[var(--orange)] disabled:opacity-45"
                  disabled={quoteChannelDraft !== 'pdf_file' || quoteSubmitting}
                  onChange={(e) => {
                    setQuotePdfFile(e.target.files?.[0] ?? null)
                    setQuoteModalError('')
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </span>
            </label>
            <label className="flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-[10px] border border-[var(--border)] p-3 has-[:checked]:border-[var(--orange)] has-[:checked]:bg-[var(--orange-light)]">
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
              className="rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-5 py-2 text-sm font-semibold text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)]"
              disabled={quoteSubmitting}
              onClick={() => setQuoteModalLeadId(null)}
            >
              ביטול
            </button>
            <button
              type="button"
              className="hub-btn-orange text-sm"
              disabled={quoteSubmitting}
              onClick={() => void confirmQuoteSent()}
            >
              {quoteSubmitting
                ? quoteChannelDraft === 'pdf_file'
                  ? quoteSubmitPhase === 'upload'
                    ? 'מעלה קובץ…'
                    : quoteSubmitPhase === 'firestore'
                      ? 'שומר פרטים…'
                      : 'שומר…'
                  : 'שומר…'
                : 'אישור ועדכון סטטוס'}
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
                  ? 'bg-[var(--orange-light)] text-[var(--orange)]'
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
                  ? 'bg-[var(--orange-light)] text-[var(--orange)]'
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
                  ? 'bg-[var(--orange-light)] text-[var(--orange)]'
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
            <ManualLeadSourceFields
              idPrefix="lead-edit-source"
              source={sourcePickerManual}
              onChange={setSourcePickerManual}
            />
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-5 py-2 text-sm font-semibold text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)]"
              onClick={() => setSourcePickerLeadId(null)}
            >
              ביטול
            </button>
            <button type="button" className="hub-btn-orange text-sm" onClick={() => void saveSourcePicker()}>
              שמירה
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(clientNeedsViewerLead)}
        onClose={() => setClientNeedsViewerLeadId(null)}
        title={`צרכי לקוח${clientNeedsViewerLead ? ` · ${clientNeedsViewerLead.name}` : ''}`}
        size="lg"
        bodyClassName="min-h-0 max-h-[min(82vh,720px)] overflow-y-auto overflow-x-hidden"
      >
        <div className="space-y-3">
          <textarea
            rows={14}
            className="min-h-[220px] w-full resize-y rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] p-3 text-sm leading-relaxed text-[var(--text-dark)]"
            placeholder="תארו את צרכי הלקוח…"
            value={clientNeedsEditDraft}
            onChange={(e) => setClientNeedsEditDraft(e.target.value)}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-5 py-2 text-sm font-semibold text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)]"
              onClick={() => setClientNeedsViewerLeadId(null)}
            >
              סגירה
            </button>
            <button
              type="button"
              className="hub-btn-orange text-sm"
              onClick={() => {
                if (!clientNeedsViewerLeadId) return
                void updateLead(clientNeedsViewerLeadId, {
                  clientNeeds: clientNeedsEditDraft.trim() || undefined,
                }).catch(() => {})
              }}
            >
              שמירה
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
            <section className="rounded-[12px] hub-dash-inset p-4">
              <h3 className="mb-1 text-[12px] font-bold text-[var(--text-light)]">פרטים כלליים</h3>
              <div className="mt-2">
                <LeadDetailRow label="שם ליד">{leadDetailsLead.name}</LeadDetailRow>
                <LeadDetailRow label="חברה">
                  {leadDetailsLead.company ?? '—'}
                </LeadDetailRow>
                <LeadDetailRow label="לקוח במערכת">
                  {(() => {
                    const nm = leadLinkedClientName(leadDetailsLead)
                    const raw = leadLinkedClientRawRef(leadDetailsLead)
                    if (nm) return <span className="font-medium">{nm}</span>
                    if (raw)
                      return (
                        <span className="text-[var(--text-mid)]" title={leadLinkedClientRefsTitle(leadDetailsLead)}>
                          מזהה לא מקושר לכרטיס לקוח
                        </span>
                      )
                    return '—'
                  })()}
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
                  {leadDetailsLead.source ? (
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-[var(--text-light)]">
                        {sourceKindCaptionForLead(leadDetailsLead)}
                      </span>
                      <span className="break-words">{sourceLabelForLead(leadDetailsLead)}</span>
                    </span>
                  ) : (
                    '—'
                  )}
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
              <section className={`rounded-[12px] ${hubSectionClass(0)} p-4 shadow-none`}>
                <h3 className="mb-1 text-[12px] font-bold text-[var(--text-light)]">הצעת מחיר</h3>
                <p className="mb-3 text-[12px] text-[var(--text-mid)]">
                  אופן השליחה והקבצים / הקישורים השמורים על הליד.
                </p>
                <div>
                  <LeadDetailRow label="תאריך חזרה ללקוח להצעת המחיר">
                    {leadDetailsLead.quoteReturnByDate
                      ? formatDateIL(leadDetailsLead.quoteReturnByDate)
                      : '—'}
                  </LeadDetailRow>
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
                          className="inline-flex rounded-[8px] bg-[var(--orange-light)] px-2.5 py-1 text-[11px] font-semibold text-[var(--orange)] hover:underline"
                        >
                          פתיחה בדפדפן
                        </a>
                        <a
                          href={leadDetailsLead.quotePdfUrl}
                          download={leadDetailsLead.quotePdfFileName || 'quote.pdf'}
                          className="inline-flex rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--orange)] hover:bg-[var(--orange-light)]"
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
                        className="break-all text-[13px] font-semibold text-[var(--orange)] hover:underline"
                        dir="ltr"
                      >
                        {leadDetailsLead.quoteVisualUrl}
                      </a>
                    </LeadDetailRow>
                  ) : null}
                </div>
              </section>
            ) : null}

            <section
              className={`rounded-[12px] ${hubSectionClass(
                leadDetailsLead.status === 'quote_sent' ||
                  !!leadDetailsLead.quoteChannel ||
                  !!leadDetailsLead.quotePdfUrl ||
                  !!leadDetailsLead.quoteVisualUrl
                  ? 1
                  : 0,
              )} p-4 shadow-none`}
            >
              <h3 className="mb-1 text-[12px] font-bold text-[var(--text-light)]">צרכי לקוח</h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--text-dark)]">
                {leadDetailsLead.clientNeeds?.trim() ? leadDetailsLead.clientNeeds : '—'}
              </p>
            </section>

            <section
              className={`rounded-[12px] ${hubSectionClass(
                leadDetailsLead.status === 'quote_sent' ||
                  !!leadDetailsLead.quoteChannel ||
                  !!leadDetailsLead.quotePdfUrl ||
                  !!leadDetailsLead.quoteVisualUrl
                  ? 2
                  : 1,
              )} p-4 shadow-none`}
            >
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

            <section
              className={`rounded-[12px] ${hubSectionClass(
                leadDetailsLead.status === 'quote_sent' ||
                  !!leadDetailsLead.quoteChannel ||
                  !!leadDetailsLead.quotePdfUrl ||
                  !!leadDetailsLead.quoteVisualUrl
                  ? 3
                  : 2,
              )} p-4 shadow-none`}
            >
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
            className="hub-btn-orange text-sm"
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
              className="hub-btn-orange text-sm"
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
