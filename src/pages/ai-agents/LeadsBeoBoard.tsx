import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { hubSectionClass } from '../../lib/hubSectionBorder'
import { EmptyState } from '../../components/shared/EmptyState'
import { useHubStore } from '../../store/useStore'
import { useAuth } from '../../contexts/AuthContext'
import { useLeads } from '../../hooks/useLeads'
import type { FleetAgent } from '../../lib/aiAgentsFleet'
import type { AiAgentBoardDef } from '../../lib/aiAgentsRegistry'
import {
  fetchLeadsApprovals,
  fetchLeadsCosts,
  fetchLeadsLearning,
  fetchLeadsOverview,
  fetchLeadsPipeline,
  postLeadAction,
  queueLeadFollowups,
  redraftLeads,
  runLeadsDaily,
  runLeadsLearn,
  stillNeedsApproval,
  waMeUrl,
  type LeadPipelineItem,
  type LeadsLearning,
  type LeadsOverview,
  type LearningArm,
} from '../../lib/leadsBeoApi'
import { syncBeoAgentRepliesToCrm, ensureColdLeadFromSent } from '../../lib/syncBeoLeadsCrm'
import {
  AgentBoardShell,
  AgentConnectionsList,
  AgentStatGrid,
} from './AgentBoardShell'
import { AgentCostsTabPanel } from '../../components/ai-agents/AgentCostsUi'
import { AgentProfilePanel } from '../../components/ai-agents/AgentProfilePanel'
import { displayToolsForAgent, formatUsd, AI_AGENT_COST_LABEL } from '../../lib/aiAgentsDisplay'

const TABS = [
  { id: 'approvals', label: 'אישורים', priority: true },
  { id: 'overview', label: 'סקירה' },
  { id: 'pipeline', label: 'צינור' },
  { id: 'leads', label: 'לידים' },
  { id: 'learning', label: 'למידה' },
  { id: 'connections', label: 'חיבורים' },
  { id: 'settings', label: 'הגדרות' },
  { id: 'costs', label: 'עלויות' },
  { id: 'profile', label: 'פרופיל' },
] as const

type TabId = (typeof TABS)[number]['id']

const PIPELINE_COLUMNS = ['עסק', 'אתר', 'מייל', 'ציון', 'סטטוס'] as const

const STATUS_HE: Record<string, string> = {
  found: 'נמצא',
  skipped_no_email: 'דילג (אין מייל)',
  skipped_too_big: 'דילג (גדול מדי)',
  skipped_low_score: 'דילג (ציון נמוך)',
  pending_approval: 'ממתין לאישור',
  rejected: 'נדחה',
  approved: 'אושר · ממתין ל-Gmail',
  sent: 'נשלח',
  replied: 'נענה → ליד',
  bounced: 'כתובת לא נכונה',
  closed_no_reply: 'לא ענו → סגור',
}

const SCORE_PARTS: { key: keyof NonNullable<LeadPipelineItem['score_parts']>; label: string; max: number }[] = [
  { key: 'icp', label: 'התאמת תחום', max: 40 },
  { key: 'site_signal', label: 'אות מהאתר', max: 25 },
  { key: 'pain_fit', label: 'כאב תפעולי', max: 25 },
  { key: 'contact', label: 'איכות פנייה', max: 10 },
]

function rateLabel(arm: LearningArm) {
  if (!arm.ready || arm.rate == null) return 'מוקדם'
  return `${Math.round(arm.rate * 100)}%`
}

function LearningTable({ title, rows }: { title: string; rows: LearningArm[] }) {
  if (rows.length === 0) return null
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)]">
      <div className="border-b border-[var(--border)] bg-[var(--surface-muted)]/50 px-3 py-2 text-[12px] font-bold">
        {title}
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[var(--border)] text-right text-[11px] text-[var(--text-mid)]">
            <th className="px-3 py-1.5 font-semibold">מה</th>
            <th className="px-3 py-1.5 font-semibold">נשלח</th>
            <th className="px-3 py-1.5 font-semibold">נענו</th>
            <th className="px-3 py-1.5 font-semibold">המרה</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-[var(--border)] last:border-0">
              <td className="px-3 py-1.5 font-semibold">{row.label}</td>
              <td className="px-3 py-1.5 tabular-nums">{row.sent}</td>
              <td className="px-3 py-1.5 tabular-nums">{row.human}</td>
              <td className="px-3 py-1.5 tabular-nums">{rateLabel(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ScoreBreakdown({ item }: { item: LeadPipelineItem }) {
  const parts = item.score_parts
  if (!parts) return null
  return (
    <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 px-3 py-2.5">
      <div className="text-[12px] font-bold text-[var(--text-dark)]">איך נבנה הציון</div>
      <p className="text-[12px] leading-relaxed text-[var(--text-mid)]">
        מייל באתר הוא תנאי כניסה, לא נקודות. הציון הוא סכום של ארבעה חלקים.
      </p>
      <ul className="space-y-1.5">
        {SCORE_PARTS.map((part) => {
          const value = Number(parts[part.key] ?? 0)
          const pct = Math.max(0, Math.min(100, (value / part.max) * 100))
          return (
            <li key={part.key}>
              <div className="mb-0.5 flex justify-between text-[11px] text-[var(--text-mid)]">
                <span>{part.label}</span>
                <span className="tabular-nums">
                  {value}/{part.max}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                <div
                  className="h-full rounded-full bg-[var(--brand)]"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function statusHe(status: string, labels?: Record<string, string>) {
  return labels?.[status] || STATUS_HE[status] || status
}

function GmailPreview({
  item,
  subject,
  body,
  onSubject,
  onBody,
}: {
  item: LeadPipelineItem
  subject: string
  body: string
  onSubject: (v: string) => void
  onBody: (v: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#dadce0] bg-white shadow-[0_1px_2px_rgba(60,64,67,0.12)]">
      <div className="border-b border-[#dadce0] bg-[#f8f9fa] px-4 py-2.5 text-[11px] font-semibold text-[#5f6368]">
        תצוגה כמו בגימייל — ערוך כאן לפני שליחה
      </div>
      <div className="space-y-2 px-4 py-3 text-[13px]" dir="rtl">
        <div className="flex gap-2 border-b border-[#eee] pb-2">
          <span className="w-12 shrink-0 text-[#5f6368]">מאת</span>
          <span className="font-semibold text-[#202124]">
            {item.from_name || 'שי | Beo Systems'}{' '}
            <span className="font-normal text-[#5f6368]">
              &lt;{item.from_email || 'sales@beosystem.com'}&gt;
            </span>
          </span>
        </div>
        <div className="flex gap-2 border-b border-[#eee] pb-2">
          <span className="w-12 shrink-0 text-[#5f6368]">אל</span>
          <span className="text-[#202124]">{item.email || '—'}</span>
        </div>
        <div className="flex gap-2 border-b border-[#eee] pb-2">
          <span className="w-12 shrink-0 text-[#5f6368]">נושא</span>
          <input
            value={subject}
            onChange={(e) => onSubject(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-[13px] font-semibold text-[#202124]"
          />
        </div>
        <textarea
          value={body}
          onChange={(e) => onBody(e.target.value)}
          rows={18}
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-[13px] leading-[1.7] text-[#202124]"
        />
        <p className="text-[11px] text-[#5f6368]">
          תיקון קטן? עורכים כאן. שמירה שומרת בלי לשלוח. אשר שליחה שולח את מה שעל המסך.
        </p>
      </div>
    </div>
  )
}

function ApprovalCard({
  item,
  labels,
  busy,
  onApprove,
  onReject,
  onSaveEdit,
}: {
  item: LeadPipelineItem
  labels?: Record<string, string>
  busy: boolean
  onApprove: (subject: string, body: string, whatsappBody: string) => void
  onReject: () => void
  onSaveEdit: (subject: string, body: string, whatsappBody: string) => void
}) {
  const [subject, setSubject] = useState(item.email_subject || '')
  const [body, setBody] = useState(item.email_body || '')
  const [waBody, setWaBody] = useState(item.whatsapp_body || '')
  const isFollowup = item.draft_kind === 'followup'
  const waHref = waMeUrl(item.phone || '', waBody)

  useEffect(() => {
    setSubject(item.email_subject || '')
    setBody(item.email_body || '')
    setWaBody(item.whatsapp_body || '')
  }, [item.id, item.email_subject, item.email_body, item.whatsapp_body])

  return (
    <article className={`${hubSectionClass(2)} space-y-4 rounded-2xl p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[18px] font-extrabold text-[var(--text-dark)]">{item.company}</h3>
            {isFollowup ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                פולואפ
              </span>
            ) : (
              <span className="rounded-full bg-[var(--brand-light)] px-2 py-0.5 text-[11px] font-bold text-[var(--brand-deep)]">
                פנייה ראשונה
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-[var(--text-light)]">{item.email || 'אין מייל'}</p>
          {item.phone ? (
            <p className="text-[12px] text-[var(--text-light)]">טלפון באתר: {item.phone}</p>
          ) : null}
        </div>
        <span className="rounded-full bg-[var(--brand-light)] px-2.5 py-1 text-[12px] font-extrabold tabular-nums text-[var(--brand-deep)]">
          ציון {item.score ?? '—'}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 px-3 py-3 text-center">
          <div className="text-[11px] font-semibold text-[var(--text-light)]">אתר</div>
          <a
            href={item.website}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 block truncate text-[13px] font-semibold text-[var(--brand)] hover:underline"
          >
            {item.website}
          </a>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 px-3 py-3 text-center">
          <div className="text-[11px] font-semibold text-[var(--text-light)]">שירות Beo</div>
          <div className="mt-0.5 text-[13px] font-semibold text-[var(--text-dark)]">
            {item.service || '—'}
          </div>
        </div>
      </div>

      <ScoreBreakdown item={item} />

      <div>
        <div className="text-[12px] font-bold text-[var(--text-dark)]">למה הוא נבחר</div>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-mid)]">
          {item.score_why || 'אין הסבר עדיין.'}
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-[#25D366]/40 bg-[#25D366]/10 px-4 py-3">
        <div className="text-[12px] font-bold text-[var(--text-dark)]">
          וואטסאפ אליהם — אתה שולח מהטלפון שלך
        </div>
        {item.phone ? (
          <>
            <textarea
              value={waBody}
              onChange={(e) => setWaBody(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[13px] leading-relaxed text-[#202124]"
            />
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-lg bg-[#25D366] px-3.5 py-2 text-[13px] font-bold text-white"
              >
                פתח וואטסאפ ל-{item.phone}
              </a>
            ) : (
              <p className="text-[12px] text-[var(--text-light)]">
                המספר באתר לא נראה ישראלי — שלח רק מייל.
              </p>
            )}
          </>
        ) : (
          <p className="text-[13px] text-[var(--text-mid)]">
            אין טלפון גלוי באתר. שלח רק את המייל אחרי אישור.
          </p>
        )}
      </div>

      <GmailPreview
        item={item}
        subject={subject}
        body={body}
        onSubject={setSubject}
        onBody={setBody}
      />

      {item.owner_name ? (
        <p className="text-[11px] text-[var(--text-light)]">שם באתר: {item.owner_name}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-[var(--border)] pt-4">
        <button
          type="button"
          disabled={busy}
          onClick={() => onApprove(subject, body, waBody)}
          className="min-h-[44px] min-w-[9rem] rounded-xl bg-[var(--brand)] px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-60"
        >
          {busy ? 'שולח…' : 'אשר שליחת מייל'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onReject}
          className="min-h-[44px] rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-[14px] font-semibold disabled:opacity-60"
        >
          דחה
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onSaveEdit(subject, body, waBody)}
          className="min-h-[44px] rounded-xl border border-[var(--border)] bg-white px-3.5 py-2.5 text-[13px] font-semibold disabled:opacity-60"
        >
          שמור טיוטה
        </button>
        <span className="self-center text-[11px] text-[var(--text-light)]">
          {statusHe(item.status, labels)}
        </span>
      </div>
    </article>
  )
}

export function LeadsBeoBoard({
  board,
  agent,
  fleetUp,
}: {
  board: AiAgentBoardDef
  agent: FleetAgent | null
  fleetUp: boolean
}) {
  const pushToast = useHubStore((s) => s.pushToast)
  const { user } = useAuth()
  const { leads, addLead, updateLead } = useLeads()
  const [tab, setTab] = useState<TabId>('approvals')
  const [overview, setOverview] = useState<LeadsOverview | null>(null)
  const [items, setItems] = useState<LeadPipelineItem[]>([])
  const [approvals, setApprovals] = useState<LeadPipelineItem[]>([])
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedApprovalIds, setSelectedApprovalIds] = useState<Set<string>>(new Set())
  const [batchBusy, setBatchBusy] = useState(false)
  const [runningDaily, setRunningDaily] = useState(false)
  const [redrafting, setRedrafting] = useState(false)
  const [queueingFu, setQueueingFu] = useState(false)
  const [learning, setLearning] = useState<LeadsLearning | null>(null)
  const [learningBusy, setLearningBusy] = useState(false)
  const [monthCost, setMonthCost] = useState(AI_AGENT_COST_LABEL)
  const hiddenIds = useRef(new Set<string>())

  const loadBoard = useCallback(async () => {
    if (!fleetUp) {
      setOverview(null)
      setItems([])
      setApprovals([])
      return
    }
    setLoading(true)
    const [ov, pipe, appr, learned, costs] = await Promise.all([
      fetchLeadsOverview(),
      fetchLeadsPipeline(),
      fetchLeadsApprovals(),
      fetchLeadsLearning(),
      fetchLeadsCosts(),
    ])
    if (ov.ok) setOverview(ov.data)
    if (pipe.ok) {
      setItems(pipe.items)
      setLabels(pipe.labels)
    }
    if (appr.ok) {
      setApprovals(
        appr.items.filter(
          (row) => stillNeedsApproval(row) && !hiddenIds.current.has(row.id),
        ),
      )
    }
    if (learned.ok) setLearning(learned.data)
    if (costs.ok) setMonthCost(formatUsd(costs.data.usd ?? 0))
    setLoading(false)
  }, [fleetUp])

  const syncInbox = useCallback(async () => {
    if (!fleetUp || !user) return
    const sync = await syncBeoAgentRepliesToCrm({
      userId: user.uid,
      leads,
      addLead,
      updateLead,
    })
    if (sync.upgraded > 0) {
      pushToast(
        sync.upgraded === 1
          ? 'ענה · עבר ללידים רגילים'
          : `${sync.upgraded} תשובות · עברו ללידים רגילים`,
        'success',
      )
      await loadBoard()
    } else if (sync.created > 0) {
      pushToast(
        sync.created === 1
          ? 'ענה · נוצר ליד רגיל בדף לידים'
          : `${sync.created} תשובות אנושיות — נוצרו לידים`,
        'success',
      )
      await loadBoard()
    } else if (sync.closed > 0) {
      pushToast('עודכן ליד קר (Bounce / לא מעוניין)', 'success')
      await loadBoard()
    }
  }, [fleetUp, user, leads, addLead, updateLead, pushToast, loadBoard])

  useEffect(() => {
    void loadBoard()
  }, [loadBoard])

  useEffect(() => {
    void syncInbox()
  }, [syncInbox])

  const act = async (
    id: string,
    action: 'approve' | 'reject' | 'edit' | 'close',
    body?: { email_subject?: string; email_body?: string; whatsapp_body?: string },
  ) => {
    setBusyId(id)
    const pendingItem = approvals.find((row) => row.id === id) || items.find((row) => row.id === id)
    const result = await postLeadAction(id, action, body)
    if (result.ok) {
      if (action === 'approve' || action === 'reject') {
        hiddenIds.current.add(id)
        setApprovals((prev) => prev.filter((row) => row.id !== id))
      }
      if (action === 'approve' && user && pendingItem) {
        const cold = await ensureColdLeadFromSent(
          { ...pendingItem, status: 'sent' },
          {
            userId: user.uid,
            leads,
            addLead,
            updateLead,
            forceAfterApprove: true,
          },
        )
        if (cold === 'created') {
          pushToast('נשלח · נפתח ליד קר בדף לידים', 'success')
        } else if (cold === 'updated') {
          pushToast('נשלח · עודכן ליד קר קיים', 'success')
        } else {
          pushToast('המייל נשלח מ-sales@beosystem.com', 'success')
        }
      } else if (action === 'approve') {
        pushToast('המייל נשלח מ-sales@beosystem.com', 'success')
      } else if (action === 'reject') {
        pushToast('הטיוטה נדחתה', 'success')
      } else {
        pushToast('נשמר', 'success')
      }
      await loadBoard()
    } else {
      pushToast(result.error, 'error')
      await loadBoard()
    }
    setBusyId(null)
  }

  const runDaily = async () => {
    setRunningDaily(true)
    const result = await runLeadsDaily(10)
    if (result.ok) {
      pushToast(
        result.message ||
          `נוספו ${result.added_pending ?? 0} טיוטות לאישור`,
        'success',
      )
      await loadBoard()
    } else {
      pushToast(result.error, 'error')
    }
    setRunningDaily(false)
  }

  const runRedraft = async () => {
    setRedrafting(true)
    const result = await redraftLeads()
    if (result.ok) {
      pushToast(result.message || 'הטיוטות שוכתבו', 'success')
      await loadBoard()
    } else {
      pushToast(result.error, 'error')
    }
    setRedrafting(false)
  }

  const runQueueFollowups = async () => {
    setQueueingFu(true)
    const result = await queueLeadFollowups()
    if (result.ok) {
      pushToast(result.message || `הוכנו ${result.queued ?? 0} פולואפים`, 'success')
      await loadBoard()
    } else {
      pushToast(result.error, 'error')
    }
    setQueueingFu(false)
  }

  const runLearn = async () => {
    setLearningBusy(true)
    const result = await runLeadsLearn()
    if (result.ok) {
      setLearning(result.data)
      pushToast('הלמידה עודכנה מהשוק', 'success')
    } else {
      pushToast(result.error, 'error')
    }
    setLearningBusy(false)
  }

  const inFleet = Boolean(agent)
  const running = Boolean(agent?.running)
  const connections = agent?.connections ?? [
    {
      kind: 'telegram',
      label: 'Telegram',
      connected: Boolean(overview?.telegram_connected),
      note: 'עדכונים ושאלות בלבד — לא ממשק ניהול',
    },
    { kind: 'openai', label: 'OpenAI', connected: Boolean(overview?.openai_connected) },
    {
      kind: 'gmail',
      label: 'Gmail',
      connected: Boolean(overview?.gmail_connected),
      note: 'שליחה אחרי אישור — מחכים ל-API של התיבה',
    },
  ]

  const statusBadge = !fleetUp ? (
    <span className="beo-agent-chip beo-agent-chip--muted inline-flex items-center gap-1.5">
      <span className="beo-agent-live-dot is-warn" aria-hidden />
      לא זמין
    </span>
  ) : running ? (
    <span className="beo-agent-chip beo-agent-chip--live inline-flex items-center gap-1.5">
      <span className="beo-agent-live-dot" aria-hidden />
      חי · מחובר
    </span>
  ) : inFleet ? (
    <span className="beo-agent-chip beo-agent-chip--muted inline-flex items-center gap-1.5">
      <span className="beo-agent-live-dot is-off" aria-hidden />
      כבוי
    </span>
  ) : (
    <span className="beo-agent-chip inline-flex items-center gap-1.5">בקרוב</span>
  )

  const tools = displayToolsForAgent(board.id, agent).map((t) =>
    t.kind === 'gmail'
      ? {
          ...t,
          connected: Boolean(overview?.gmail_connected),
          hint: overview?.gmail_connected ? undefined : 'sales@beosystem.com',
        }
      : t.kind === 'telegram'
        ? {
            ...t,
            hint: t.connected ? 'עדכונים בלבד' : 'עד שיעלה בוט',
          }
        : t,
  )

  return (
    <AgentBoardShell
      boardId={board.id}
      displayName={board.displayName}
      role={agent?.role || board.role}
      handle={agent?.handle || board.handle}
      purpose={board.purpose}
      statusBadge={statusBadge}
      tabs={[...TABS]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as TabId)}
      tools={tools}
      monthCost={monthCost}
      banner={
        !fleetUp ? (
          <div
            className={`${hubSectionClass(0)} rounded-2xl border border-[var(--brand)]/20 bg-[var(--brand-light)]/40 px-4 py-2.5 text-[13px] leading-relaxed text-[var(--text-dark)]`}
          >
            הצי כבוי (פורט 8788). הלוח מוכן — הפעילו Beo-agents control כדי לטעון טיוטות ולאשר
            שליחה.
          </div>
        ) : null
      }
    >
      {tab === 'profile' ? (
        <AgentProfilePanel
          boardId={board.id}
          displayName={board.displayName}
          handle={agent?.handle || board.handle}
          role={agent?.role || board.role}
          tools={tools}
          statusLabel={
            !fleetUp
              ? 'לא זמין'
              : running
                ? 'חי'
                : inFleet
                  ? 'כבוי'
                  : 'בקרוב'
          }
          lastActivity={
            overview?.date
              ? `מחזור ${overview.date} · ${overview.pending_approval ?? 0} ממתינים לאישור`
              : null
          }
        />
      ) : null}

      {tab === 'overview' ? (
        <div className="space-y-4">
          <div className={`${hubSectionClass(0)} rounded-2xl p-5 md:p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <h2 className="text-[15px] font-extrabold text-[var(--text-dark)]">
                  סקירה יומית
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-mid)]">
                  {board.purpose} שי כותב עברית לישראל. רק ציון{' '}
                  {overview?.score_floor ?? 72}+ עולה לאישור. שליחה א׳–ה׳ 09:00–17:00 אחרי
                  אישור. תשובה אנושית → ליד רגיל. אחרי שליחה → ליד קר.
                </p>
                {overview?.learning_headline ? (
                  <p className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/50 px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--text-dark)]">
                    למידה: {overview.learning_headline}
                  </p>
                ) : null}
                <p className="mt-3 text-[12px] text-[var(--text-light)]">
                  יעד: {overview?.daily_target ?? 10} מוכנים עד{' '}
                  {overview?.target_ready_by ?? '17:00'} · {overview?.date || '—'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!fleetUp || runningDaily}
                  onClick={() => void runDaily()}
                  className="rounded-xl bg-[var(--brand)] px-3.5 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
                >
                  {runningDaily ? 'מחפש עסקים…' : 'הרץ מחקר יומי'}
                </button>
                <button
                  type="button"
                  disabled={!fleetUp || redrafting}
                  onClick={() => void runRedraft()}
                  className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2.5 text-[13px] font-semibold disabled:opacity-60"
                >
                  {redrafting ? 'משכתב…' : 'שכתב טיוטות'}
                </button>
                <button
                  type="button"
                  disabled={!fleetUp || loading}
                  onClick={() => void loadBoard()}
                  className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2.5 text-[13px] font-semibold"
                >
                  רענון
                </button>
              </div>
            </div>
          </div>

          <div className={`${hubSectionClass(1)} rounded-2xl p-4 md:p-5`}>
            <h3 className="text-[13px] font-extrabold text-[var(--text-dark)]">
              האם שי שווה? · היום
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'נשלח היום', value: overview?.sent_today ?? 0 },
                { label: 'נענו', value: overview?.replied ?? 0 },
                {
                  label: 'המרה',
                  value:
                    (overview?.sent_today ?? 0) > 0
                      ? `${Math.round(((overview?.replied ?? 0) / Math.max(overview?.sent_today ?? 1, 1)) * 100)}%`
                      : '—',
                },
                { label: 'עלות חודש', value: monthCost },
              ].map((cell) => (
                <div key={cell.label} className="beo-agent-stat is-hot !min-h-0 !py-3">
                  <div className="beo-agent-stat-value !text-[1.1rem]">{cell.value}</div>
                  <div className="beo-agent-stat-label">{cell.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${hubSectionClass(2)} rounded-2xl p-4 md:p-5`}>
            <h3 className="text-[13px] font-extrabold text-[var(--text-dark)]">מסלול שי</h3>
            <ol className="mt-3 flex flex-wrap gap-2">
              {['מחקר', 'טיוטה', 'אישור', 'נשלח', 'ליד קר', 'תשובה', 'ליד חדש'].map(
                (step, i) => (
                  <li
                    key={step}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-[12px] font-bold text-[var(--text-dark)]"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand-light)] text-[10px] text-[var(--brand-deep)]">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ),
              )}
            </ol>
          </div>

          <AgentStatGrid
            items={[
              {
                label: 'היום בדק',
                value: overview?.checked_today ?? 0,
                onClick: () => setTab('pipeline'),
                hint: 'לצינור',
              },
              {
                label: 'דילג',
                value: overview?.skipped_today ?? 0,
                onClick: () => setTab('pipeline'),
              },
              {
                label: 'ממתינים לאישור',
                value: overview?.pending_approval ?? 0,
                onClick: () => setTab('approvals'),
                hint: 'לאישורים',
                hot: (overview?.pending_approval ?? 0) > 0,
              },
              {
                label: 'פולואפים ממתינים',
                value: overview?.followups_pending ?? 0,
                onClick: () => setTab('approvals'),
                hint: 'לאישורים',
              },
              {
                label: 'נשלח היום',
                value: overview?.sent_today ?? 0,
                onClick: () => setTab('pipeline'),
              },
              {
                label: 'נענו / לידים',
                value: overview?.replied ?? 0,
                onClick: () => setTab('leads'),
                hint: 'ללידים',
                hot: (overview?.replied ?? 0) > 0,
              },
            ]}
          />
        </div>
      ) : null}

      {tab === 'pipeline' ? (
        <div className={`${hubSectionClass(1)} overflow-hidden rounded-2xl`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]/50 text-right">
                  {PIPELINE_COLUMNS.map((col) => (
                    <th
                      key={col}
                      className="px-3 py-2.5 text-[11px] font-bold text-[var(--text-mid)]"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={PIPELINE_COLUMNS.length} className="p-0">
                      <EmptyState
                        title="הצינור ריק"
                        description="לחצו «הרץ מחקר יומי» בסקירה. אין מייל באתר → דילוג. לא ענו → סגור, בלי ליד."
                      />
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-3 py-2.5 font-semibold text-[var(--text-dark)]">
                        {row.company}
                        {row.draft_kind === 'followup' ? (
                          <span className="ms-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                            פולואפ
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <a
                          href={row.website}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--brand)] hover:underline"
                        >
                          אתר
                        </a>
                      </td>
                      <td className="px-3 py-2.5 text-[var(--text-mid)]">{row.email || '—'}</td>
                      <td className="px-3 py-2.5 tabular-nums">{row.score ?? '—'}</td>
                      <td className="px-3 py-2.5">{statusHe(row.status, labels)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'approvals' ? (
        <div className="space-y-5">
          <p className="text-center text-[13px] text-[var(--text-mid)]">
            ממתינים לאישור:{' '}
            <strong className="tabular-nums text-[var(--text-dark)]">
              {overview?.pending_approval ?? approvals.length}
            </strong>
            {approvals.length > 0 ? ' · וואטסאפ למעלה בכרטיס, מייל מתחת, אחר כך אשר שליחה' : null}
          </p>

          {approvals.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2.5">
              <label className="flex items-center gap-2 text-[12px] font-semibold text-[var(--text-dark)]">
                <input
                  type="checkbox"
                  checked={
                    approvals.length > 0 &&
                    approvals.every((a) => selectedApprovalIds.has(a.id))
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedApprovalIds(new Set(approvals.map((a) => a.id)))
                    } else {
                      setSelectedApprovalIds(new Set())
                    }
                  }}
                />
                בחירת הכל ({selectedApprovalIds.size})
              </label>
              <button
                type="button"
                disabled={batchBusy || selectedApprovalIds.size === 0}
                onClick={() => {
                  void (async () => {
                    setBatchBusy(true)
                    const ids = [...selectedApprovalIds]
                    for (const id of ids) {
                      await act(id, 'approve')
                    }
                    setSelectedApprovalIds(new Set())
                    setBatchBusy(false)
                  })()
                }}
                className="min-h-[40px] rounded-xl bg-[var(--brand)] px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-60"
              >
                {batchBusy
                  ? 'מאשר…'
                  : `אשר נבחרים (${selectedApprovalIds.size})`}
              </button>
            </div>
          ) : null}

          {approvals.length === 0 ? (
            <div className={`${hubSectionClass(2)} space-y-4 rounded-2xl p-5`}>
              <EmptyState
                title="אין מיילים ממתינים לאישור"
                description="אישור או דחייה רק כאן. מחקר יומי מביא עד 10 פניות ראשונות. פולואפ לנשלחים בלי תשובה — אחרי ~48 שעות, באותו שרשור."
              />
              <div className="flex justify-center">
                <button
                  type="button"
                  disabled={!fleetUp || queueingFu}
                  onClick={() => void runQueueFollowups()}
                  className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-semibold disabled:opacity-60"
                >
                  {queueingFu ? 'מכין פולואפים…' : 'הכן פולואפים לנשלחים'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  disabled={!fleetUp || redrafting}
                  onClick={() => void runRedraft()}
                  className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-semibold disabled:opacity-60"
                >
                  {redrafting ? 'משכתב…' : 'שכתב טיוטות (קצר + שאלה)'}
                </button>
                <button
                  type="button"
                  disabled={!fleetUp || queueingFu}
                  onClick={() => void runQueueFollowups()}
                  className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-semibold disabled:opacity-60"
                >
                  {queueingFu ? 'מכין פולואפים…' : 'הכן פולואפים לנשלחים'}
                </button>
              </div>
              {approvals.map((item) => (
                <div key={item.id} className="relative">
                  <label className="absolute start-3 top-3 z-10 flex items-center gap-1.5 rounded-lg bg-white/95 px-2 py-1 text-[11px] font-bold shadow-sm">
                    <input
                      type="checkbox"
                      checked={selectedApprovalIds.has(item.id)}
                      onChange={(e) => {
                        setSelectedApprovalIds((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(item.id)
                          else next.delete(item.id)
                          return next
                        })
                      }}
                    />
                    בחירה
                  </label>
                  <ApprovalCard
                    item={item}
                    labels={labels}
                    busy={busyId === item.id || batchBusy}
                    onApprove={(email_subject, email_body, whatsapp_body) =>
                      void act(item.id, 'approve', {
                        email_subject,
                        email_body,
                        whatsapp_body,
                      })
                    }
                    onReject={() => void act(item.id, 'reject')}
                    onSaveEdit={(email_subject, email_body, whatsapp_body) =>
                      void act(item.id, 'edit', {
                        email_subject,
                        email_body,
                        whatsapp_body,
                      })
                    }
                  />
                </div>
              ))}
            </>
          )}
        </div>
      ) : null}

      {tab === 'leads' ? (
        <div className={`${hubSectionClass(3)} space-y-4 rounded-2xl p-5`}>
          <p className="text-[13px] leading-relaxed text-[var(--text-mid)]">
            אחרי <strong>אישור שליחה</strong> נפתח <strong>ליד קר</strong> בדף לידים. רק תשובה
            אנושית בגימייל מעבירה לליד רגיל (<strong>חדש</strong>). Bounce / לא מעוניין — לא
            הופכים לליד חם. מקור: <strong>Beo AI Lead Agent</strong>.
          </p>
          <Link
            to="/leads?filter=cold"
            className="inline-flex rounded-xl border border-[#5B7C99]/40 bg-[#F1F5F9] px-3.5 py-2 text-[13px] font-semibold text-[#5B7C99]"
          >
            מעבר ללידים קרים ב-Beo OS
          </Link>
          {items.filter((row) => row.status === 'replied').length === 0 ? (
            <EmptyState
              title="עדיין אין תשובות"
              description="אחרי שליחה, רענון הלוח בודק את תיבת sales@ ומסמן תשובה אנושית."
            />
          ) : (
            <ul className="space-y-3">
              {items
                .filter((row) => row.status === 'replied')
                .map((row) => (
                  <li
                    key={row.id}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 px-3 py-2.5"
                  >
                    <div className="font-semibold text-[var(--text-dark)]">{row.company}</div>
                    <div className="text-[12px] text-[var(--text-mid)]">{row.email}</div>
                    {row.reply_preview ? (
                      <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-light)]">
                        {row.reply_preview}
                      </p>
                    ) : null}
                  </li>
                ))}
            </ul>
          )}
          {items.filter((row) => row.status === 'bounced').length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-[13px] font-bold text-[var(--text-dark)]">כתובת לא נכונה</h3>
              <ul className="space-y-2">
                {items
                  .filter((row) => row.status === 'bounced')
                  .map((row) => (
                    <li
                      key={row.id}
                      className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2.5"
                    >
                      <div className="font-semibold text-[var(--text-dark)]">{row.company}</div>
                      <div className="text-[12px] text-[var(--text-mid)]">{row.email}</div>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          <Link
            to="/leads"
            className="inline-flex rounded-xl bg-[var(--brand)] px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-[var(--brand-hover)]"
          >
            מעבר ללידים ב-Beo OS
          </Link>
        </div>
      ) : null}

      {tab === 'learning' ? (
        <div className="space-y-4">
          <div className={`${hubSectionClass(2)} space-y-3 rounded-2xl p-6 text-center`}>
            <h2 className="text-[16px] font-extrabold text-[var(--text-dark)]">מה השוק לימד את שי</h2>
            <p className="mx-auto max-w-2xl text-[13px] leading-relaxed text-[var(--text-mid)]">
              {learning?.lesson ||
                'עדיין אין שליחות. אחרי אישור מיילים והתשובות, יופיע כאן מה ממיר — תחום, מוצר, סגנון.'}
            </p>
            <button
              type="button"
              disabled={!fleetUp || learningBusy}
              onClick={() => void runLearn()}
              className="rounded-xl bg-[var(--brand)] px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {learningBusy ? 'מחשב…' : 'למד עכשיו מהצינור'}
            </button>
            <p className="text-[11px] text-[var(--text-light)]">
              המרה מוצגת רק אחרי {learning?.min_decided ?? 3} תוצאות סגורות לתא. בלי זה כתוב «מוקדם» —
              לא מזייפים אחוז.
            </p>
          </div>
          <AgentStatGrid
            items={[
              { label: 'נשלח (סה״כ)', value: learning?.totals?.sent ?? 0 },
              { label: 'ממתינים למענה', value: learning?.totals?.waiting ?? 0 },
              { label: 'תשובות אנושיות', value: learning?.totals?.human ?? 0 },
              { label: 'נדחו אצלך', value: learning?.totals?.or_rejected ?? 0 },
            ]}
          />
          {(learning?.tomorrow ?? []).length > 0 ? (
            <div className={`${hubSectionClass(0)} rounded-2xl p-5`}>
              <div className="text-[12px] font-bold text-[var(--text-dark)]">מה משתנה מחר</div>
              <ul className="mt-2 list-disc space-y-1 pe-5 text-[13px] text-[var(--text-mid)]">
                {(learning?.tomorrow ?? []).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <LearningTable title="תחום" rows={learning?.by_vertical ?? []} />
          <LearningTable title="מוצר Beo" rows={learning?.by_product ?? []} />
          <LearningTable title="סגנון שפה" rows={learning?.by_style ?? []} />
        </div>
      ) : null}

      {tab === 'connections' ? (
        <div className={`${hubSectionClass(0)} rounded-2xl p-6`}>
          <h2 className="beo-agent-section-title mb-4 text-center">חיבורים חיים</h2>
          <AgentConnectionsList connections={connections} />
        </div>
      ) : null}

      {tab === 'settings' ? (
        <div className={`${hubSectionClass(1)} space-y-4 rounded-2xl p-5`}>
          <h2 className="text-[15px] font-extrabold text-[var(--text-dark)]">כללים קשיחים</h2>
          <ul className="list-disc space-y-2 pe-5 text-[13px] leading-relaxed text-[var(--text-mid)]">
            <li>אין מייל גלוי באתר → דילוג. בלי Hunter.</li>
            <li>ציון מתחת ל-72 לא עולה לאישור. עדיף 5 חמים מ-10 בינוניים.</li>
            <li>
              פולואפ אחד אחרי ~48 שעות בלי תשובה — טיוטה לאישור כאן, באותו שרשור Gmail. לא ספאם.
            </li>
            <li>
              10 פניות ראשונות בכל יום עבודה (א׳–ה׳) עד 17:00. פולואפים מחוץ למכסה. שליחה אחרי
              אישור כאן.
            </li>
            <li>
              וואטסאפ: טיוטה לטלפון שלהם בכרטיס — אתה שולח מהמספר של Beo. במייל נשאר קישור אלינו.
            </li>
            <li>
              למידה יומית מהשוק: תשובה אנושית / לא מעוניין / לא ענו / דחייה שלך. מחר הציון, החיפוש
              והניסוח זזים לפי זה — בלי לנחש מאחוז על מדגם קטן.
            </li>
          </ul>
        </div>
      ) : null}

      {tab === 'costs' ? (
        <AgentCostsTabPanel agentLabel={`${board.displayName} (שי)`} source="leads" />
      ) : null}
    </AgentBoardShell>
  )
}
