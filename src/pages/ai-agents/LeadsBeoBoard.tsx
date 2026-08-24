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
  fetchLeadsLearning,
  fetchLeadsOverview,
  fetchLeadsPipeline,
  postLeadAction,
  redraftLeads,
  runLeadsDaily,
  runLeadsLearn,
  stillNeedsApproval,
  type LeadPipelineItem,
  type LeadsLearning,
  type LeadsOverview,
  type LearningArm,
} from '../../lib/leadsBeoApi'
import { syncBeoAgentRepliesToCrm } from '../../lib/syncBeoLeadsCrm'
import {
  AgentBoardShell,
  AgentConnectionsList,
  AgentStatGrid,
} from './AgentBoardShell'
import { AgentCostsTabPanel } from '../../components/ai-agents/AgentCostsUi'
import { AgentProfilePanel } from '../../components/ai-agents/AgentProfilePanel'
import { displayToolsForAgent } from '../../lib/aiAgentsDisplay'

const TABS = [
  { id: 'profile', label: 'פרופיל' },
  { id: 'overview', label: 'סקירה' },
  { id: 'pipeline', label: 'צינור' },
  { id: 'approvals', label: 'אישורים' },
  { id: 'leads', label: 'לידים' },
  { id: 'learning', label: 'למידה' },
  { id: 'connections', label: 'חיבורים' },
  { id: 'settings', label: 'הגדרות' },
  { id: 'costs', label: 'עלויות' },
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
        {item.whatsapp_url ? (
          <a
            href={item.whatsapp_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-lg bg-[#25D366] px-3 py-1.5 text-[12px] font-bold text-white"
          >
            וואטסאפ
          </a>
        ) : null}
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
  onApprove: (subject: string, body: string) => void
  onReject: () => void
  onSaveEdit: (subject: string, body: string) => void
}) {
  const [subject, setSubject] = useState(item.email_subject || '')
  const [body, setBody] = useState(item.email_body || '')

  useEffect(() => {
    setSubject(item.email_subject || '')
    setBody(item.email_body || '')
  }, [item.id, item.email_subject, item.email_body])

  return (
    <article className={`${hubSectionClass(2)} space-y-4 rounded-2xl p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[18px] font-extrabold text-[var(--text-dark)]">{item.company}</h3>
          <p className="mt-0.5 text-[12px] text-[var(--text-light)]">{item.email || 'אין מייל'}</p>
        </div>
        <span className="rounded-full bg-[var(--brand-light)] px-2.5 py-1 text-[12px] font-extrabold tabular-nums text-[var(--brand-deep)]">
          ציון {item.score ?? '—'}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 px-3 py-2">
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
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 px-3 py-2">
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

      <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
        <button
          type="button"
          disabled={busy}
          onClick={() => onApprove(subject, body)}
          className="rounded-xl bg-[var(--brand)] px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          אשר שליחה
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onReject}
          className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-semibold disabled:opacity-60"
        >
          דחה
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onSaveEdit(subject, body)}
          className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-semibold disabled:opacity-60"
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
  const { addLead } = useLeads()
  const [tab, setTab] = useState<TabId>('profile')
  const [overview, setOverview] = useState<LeadsOverview | null>(null)
  const [items, setItems] = useState<LeadPipelineItem[]>([])
  const [approvals, setApprovals] = useState<LeadPipelineItem[]>([])
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [runningDaily, setRunningDaily] = useState(false)
  const [redrafting, setRedrafting] = useState(false)
  const [learning, setLearning] = useState<LeadsLearning | null>(null)
  const [learningBusy, setLearningBusy] = useState(false)
  const hiddenIds = useRef(new Set<string>())

  const loadBoard = useCallback(async () => {
    if (!fleetUp) {
      setOverview(null)
      setItems([])
      setApprovals([])
      return
    }
    setLoading(true)
    const [ov, pipe, appr, learned] = await Promise.all([
      fetchLeadsOverview(),
      fetchLeadsPipeline(),
      fetchLeadsApprovals(),
      fetchLeadsLearning(),
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
    setLoading(false)
  }, [fleetUp])

  const syncInbox = useCallback(async () => {
    if (!fleetUp || !user) return
    const sync = await syncBeoAgentRepliesToCrm({
      userId: user.uid,
      addLead,
    })
    if (sync.created > 0) {
      pushToast(
        sync.created === 1
          ? 'תשובה אנושית — נוצר ליד בדף לידים'
          : `${sync.created} תשובות אנושיות — נוצרו לידים`,
        'success',
      )
      await loadBoard()
    }
  }, [fleetUp, user, addLead, pushToast, loadBoard])

  useEffect(() => {
    void loadBoard()
  }, [loadBoard])

  useEffect(() => {
    void syncInbox()
  }, [syncInbox])

  const act = async (
    id: string,
    action: 'approve' | 'reject' | 'edit' | 'close',
    body?: { email_subject?: string; email_body?: string },
  ) => {
    setBusyId(id)
    const result = await postLeadAction(id, action, body)
    if (result.ok) {
      if (action === 'approve' || action === 'reject') {
        hiddenIds.current.add(id)
        setApprovals((prev) => prev.filter((row) => row.id !== id))
      }
      if (action === 'approve') {
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
    <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] font-bold text-[var(--text-mid)]">
      לא זמין
    </span>
  ) : running ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      חי
    </span>
  ) : inFleet ? (
    <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] font-bold text-[var(--text-mid)]">
      כבוי
    </span>
  ) : (
    <span className="rounded-full bg-[var(--brand-light)] px-2.5 py-1 text-[11px] font-bold text-[var(--brand-deep)]">
      בקרוב
    </span>
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
          <div className={`${hubSectionClass(0)} rounded-2xl p-5`}>
            <p className="text-[13px] leading-relaxed text-[var(--text-mid)]">
              {board.purpose} שי כותב עברית לישראל. רק ציון {overview?.score_floor ?? 72}+ עולה לאישור.
              שליחה א׳–ה׳ 09:00–17:00 אחרי אישור. תשובה אנושית → ליד כאן. כל יום שי לומד מה ענה.
            </p>
            {overview?.learning_headline ? (
              <p className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 px-3 py-2 text-[13px] leading-relaxed text-[var(--text-dark)]">
                למידה: {overview.learning_headline}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!fleetUp || runningDaily}
                onClick={() => void runDaily()}
                className="rounded-xl bg-[var(--brand)] px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
              >
                {runningDaily ? 'מחפש עסקים…' : 'הרץ מחקר יומי (עד 10)'}
              </button>
              <button
                type="button"
                disabled={!fleetUp || redrafting}
                onClick={() => void runRedraft()}
                className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-semibold disabled:opacity-60"
              >
                {redrafting ? 'משכתב…' : 'שכתב טיוטות ממתינות'}
              </button>
              <button
                type="button"
                disabled={!fleetUp || loading}
                onClick={() => void loadBoard()}
                className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-semibold"
              >
                רענון צינור
              </button>
            </div>
          </div>
          <AgentStatGrid
            items={[
              { label: 'היום בדק', value: overview?.checked_today ?? 0 },
              { label: 'דילג', value: overview?.skipped_today ?? 0 },
              { label: 'ממתינים לאישור', value: overview?.pending_approval ?? 0 },
              { label: 'נשלח היום', value: overview?.sent_today ?? 0 },
              { label: 'נענו / לידים', value: overview?.replied ?? 0 },
              { label: 'כתובת לא נכונה', value: overview?.bounced ?? 0 },
            ]}
          />
          <p className="text-[12px] text-[var(--text-light)]">
            יעד: {overview?.daily_target ?? 10} מוכנים עד {overview?.target_ready_by ?? '10:00'} ·{' '}
            {overview?.date || '—'}
          </p>
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
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {(
              [
                {
                  label: 'ממתינים לאישור',
                  value: overview?.pending_approval ?? approvals.length,
                  accent: 'text-[var(--brand-deep)]',
                },
                {
                  label: 'נדחו',
                  value: items.filter((r) => r.status === 'rejected').length,
                  accent: 'text-[var(--text-dark)]',
                },
                {
                  label: 'אושרו · ממתינים למייל',
                  value: items.filter((r) => r.status === 'approved').length,
                  accent: 'text-[var(--text-dark)]',
                },
                {
                  label: 'נשלחו היום',
                  value: overview?.sent_today ?? items.filter((r) => r.status === 'sent').length,
                  accent: 'text-emerald-800',
                },
                {
                  label: 'נענו → ליד',
                  value: overview?.replied ?? items.filter((r) => r.status === 'replied').length,
                  accent: 'text-emerald-800',
                },
                {
                  label: 'כתובת לא נכונה',
                  value: overview?.bounced ?? items.filter((r) => r.status === 'bounced').length,
                  accent: 'text-amber-800',
                },
              ] as const
            ).map((kpi) => (
              <div key={kpi.label} className="beo-agent-stat">
                <div className={`font-mono text-[22px] font-extrabold tabular-nums ${kpi.accent}`}>
                  {kpi.value}
                </div>
                <div className="mt-1 text-[12px] font-semibold text-[var(--text-mid)]">
                  {kpi.label}
                </div>
              </div>
            ))}
          </div>

          {approvals.length === 0 ? (
            <div className={`${hubSectionClass(2)} rounded-2xl p-5`}>
              <EmptyState
                title="אין מיילים ממתינים לאישור"
                description="אישור או דחייה רק כאן — לא בטלגרם. אחרי מחקר יומי יופיעו כאן עד 10 כרטיסים עם דוח וציון ותצוגת גימייל."
              />
            </div>
          ) : (
            <>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={!fleetUp || redrafting}
                  onClick={() => void runRedraft()}
                  className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-semibold disabled:opacity-60"
                >
                  {redrafting ? 'משכתב…' : 'שכתב טיוטות (קצר + שאלה)'}
                </button>
              </div>
              {approvals.map((item) => (
                <ApprovalCard
                  key={item.id}
                  item={item}
                  labels={labels}
                  busy={busyId === item.id}
                  onApprove={(email_subject, email_body) =>
                    void act(item.id, 'approve', { email_subject, email_body })
                  }
                  onReject={() => void act(item.id, 'reject')}
                  onSaveEdit={(email_subject, email_body) =>
                    void act(item.id, 'edit', { email_subject, email_body })
                  }
                />
              ))}
            </>
          )}
        </div>
      ) : null}

      {tab === 'leads' ? (
        <div className={`${hubSectionClass(3)} space-y-4 rounded-2xl p-5`}>
          <p className="text-[13px] leading-relaxed text-[var(--text-mid)]">
            ליד ב-Beo OS נוצר רק אחרי תשובה אנושית בגימייל. מקור:{' '}
            <strong>Beo AI Lead Agent</strong>, סטטוס <strong>new</strong>. מייל שחזר (כתובת שגויה)
            לא נפתח כליד.
          </p>
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
          <div className={`${hubSectionClass(2)} space-y-3 rounded-2xl p-5`}>
            <h2 className="text-[16px] font-extrabold text-[var(--text-dark)]">מה השוק לימד את שי</h2>
            <p className="text-[13px] leading-relaxed text-[var(--text-mid)]">
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
        <div className={`${hubSectionClass(0)} rounded-2xl p-5`}>
          <AgentConnectionsList connections={connections} />
        </div>
      ) : null}

      {tab === 'settings' ? (
        <div className={`${hubSectionClass(1)} space-y-4 rounded-2xl p-5`}>
          <h2 className="text-[15px] font-extrabold text-[var(--text-dark)]">כללים קשיחים</h2>
          <ul className="list-disc space-y-2 pe-5 text-[13px] leading-relaxed text-[var(--text-mid)]">
            <li>אין מייל גלוי באתר → דילוג. בלי Hunter.</li>
            <li>ציון מתחת ל-72 לא עולה לאישור. עדיף 5 חמים מ-10 בינוניים.</li>
            <li>בלי follow-up. לא ענו → סגור.</li>
            <li>10 טיוטות עד 10:00. שליחה א׳–ה׳ 09:00–17:00 אחרי אישור כאן.</li>
            <li>החתימה מהתיבה בגימייל. כפתור וואטסאפ במייל.</li>
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
