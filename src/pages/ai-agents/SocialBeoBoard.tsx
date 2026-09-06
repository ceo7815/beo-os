import { useCallback, useEffect, useMemo, useState } from 'react'
import { hubSectionClass } from '../../lib/hubSectionBorder'
import { EmptyState } from '../../components/shared/EmptyState'
import { useHubStore } from '../../store/useStore'
import {
  postAgentGateway,
  statusLabel,
  type FleetAgent,
} from '../../lib/aiAgentsFleet'
import { displayToolsForAgent } from '../../lib/aiAgentsDisplay'
import type { AiAgentBoardDef } from '../../lib/aiAgentsRegistry'
import { AgentCostsTabPanel } from '../../components/ai-agents/AgentCostsUi'
import { AgentProfilePanel } from '../../components/ai-agents/AgentProfilePanel'
import { SocialPostDialog } from '../../components/ai-agents/SocialPostDialog'
import {
  AgentBoardShell,
  AgentConnectionsList,
  AgentStatGrid,
} from './AgentBoardShell'
import {
  SOCIAL_STATUS_HE,
  fetchSocialInbox,
  fetchSocialOverview,
  fetchSocialPosts,
  ilDateKey,
  postSocialAction,
  refreshSocialInbox,
  type SocialInboxItem,
  type SocialOverview,
  type SocialPost,
} from '../../lib/socialBeoApi'

const TABS = [
  { id: 'calendar', label: 'יומן' },
  { id: 'queue', label: 'תור' },
  { id: 'inbox', label: 'תגובות' },
  { id: 'analytics', label: 'אנליטיקה' },
  { id: 'profile', label: 'פרופיל' },
  { id: 'connections', label: 'חיבורים' },
  { id: 'settings', label: 'הגדרות' },
  { id: 'costs', label: 'עלויות' },
] as const

type TabId = (typeof TABS)[number]['id']
const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
const MONTH_HE = [
  '',
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
]

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function statusChip(status: string) {
  const map: Record<string, string> = {
    draft: 'bg-amber-100 text-amber-900',
    pending_review: 'bg-orange-100 text-orange-900',
    scheduled: 'bg-emerald-100 text-emerald-900',
    publishing: 'bg-sky-100 text-sky-900',
    published: 'bg-blue-100 text-blue-900',
    failed: 'bg-red-100 text-red-900',
    skipped: 'bg-zinc-100 text-zinc-700',
  }
  return map[status] || 'bg-zinc-100 text-zinc-700'
}

export function SocialBeoBoard({
  board,
  agent,
  fleetUp,
  onFleetReload,
}: {
  board: AiAgentBoardDef
  agent: FleetAgent | null
  fleetUp: boolean
  onFleetReload: () => Promise<void>
}) {
  const pushToast = useHubStore((s) => s.pushToast)
  const [tab, setTab] = useState<TabId>('calendar')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [overview, setOverview] = useState<SocialOverview | null>(null)
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [inbox, setInbox] = useState<SocialInboxItem[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dialogPostId, setDialogPostId] = useState<string | null>(null)

  const live = agent?.status === 'live'
  const running = Boolean(agent?.running)
  const tools = displayToolsForAgent(board.id, agent, { dryRun: overview?.dry_run })

  const load = useCallback(async () => {
    if (!fleetUp) {
      setOverview(null)
      setPosts([])
      setInbox([])
      return
    }
    setLoading(true)
    const [ov, list, box] = await Promise.all([
      fetchSocialOverview(),
      fetchSocialPosts(year, month),
      fetchSocialInbox(),
    ])
    if (ov.ok) setOverview(ov.data)
    if (list.ok) setPosts(list.items)
    if (box.ok) setInbox(box.items)
    setLoading(false)
  }, [fleetUp, year, month])

  useEffect(() => {
    void load()
  }, [load])

  const postsByDate = useMemo(() => {
    const map = new Map<string, SocialPost[]>()
    for (const p of posts) {
      const key = ilDateKey(p.scheduled_at)
      const list = map.get(key) ?? []
      list.push(p)
      map.set(key, list)
    }
    return map
  }, [posts])

  const cells = useMemo(() => {
    const first = new Date(year, month - 1, 1)
    const offset = (first.getDay() + 7) % 7
    const days = new Date(year, month, 0).getDate()
    const out: Array<{ date: string; day: number } | null> = []
    for (let i = 0; i < offset; i++) out.push(null)
    for (let d = 1; d <= days; d++) out.push({ date: `${year}-${pad(month)}-${pad(d)}`, day: d })
    return out
  }, [year, month])

  const toggle = async (action: 'start' | 'stop') => {
    if (!live || !agent) return
    setBusy(true)
    const result = await postAgentGateway(agent.id, action)
    if (result.ok) {
      pushToast(action === 'start' ? 'עדי הופעלה' : 'עדי כובתה', 'success')
      await onFleetReload()
    } else {
      pushToast(result.error, 'error')
    }
    setBusy(false)
  }

  const openDay = (date: string, postId?: string) => {
    setSelectedDate(date)
    setDialogPostId(postId || null)
  }

  const act = async (id: string, action: 'approve' | 'skip' | 'publish', immediate = false) => {
    const result = await postSocialAction(id, action, action === 'approve' ? { immediate } : {})
    if (result.ok) {
      pushToast(
        action === 'approve'
          ? immediate
            ? 'אושר · עולה עכשיו'
            : 'אושר ומתוזמן'
          : action === 'publish'
            ? 'נשלח לפרסום'
            : 'דולג',
        'success',
      )
      await load()
    } else {
      pushToast(result.error, 'error')
    }
  }

  const statusBadge = !fleetUp ? (
    <span className="beo-agent-chip beo-agent-chip--muted inline-flex items-center gap-1.5">
      <span className="beo-agent-live-dot is-warn" aria-hidden />
      לא זמין
    </span>
  ) : agent ? (
    <span
      className={`beo-agent-chip inline-flex items-center gap-1.5 ${
        running ? 'beo-agent-chip--live' : 'beo-agent-chip--muted'
      }`}
    >
      <span
        className={`beo-agent-live-dot ${running ? '' : 'is-off'}`}
        aria-hidden
      />
      {statusLabel(agent)}
    </span>
  ) : (
    <span className="beo-agent-chip inline-flex items-center gap-1.5">בקרוב</span>
  )

  const dayPosts = selectedDate ? (postsByDate.get(selectedDate) ?? []) : []

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
          <div className={`${hubSectionClass(0)} rounded-2xl px-4 py-2.5 text-[13px] text-[var(--text-mid)]`}>
            צי הסוכנים לא זמין (agents.beosystem.com). בדקו את הפרוקסי /api/beo-agents.
          </div>
        ) : overview?.dry_run ? (
          <div className={`${hubSectionClass(0)} rounded-2xl px-4 py-2.5 text-[13px] text-[var(--text-mid)]`}>
            מצב תרגול: אישור ותזמון עובדים. פרסום חי מחכה לטוקני Meta חדשים של Beo (לא של ליבה).
          </div>
        ) : null
      }
    >
      {tab === 'calendar' ? (
        <div className="space-y-5">
          <AgentStatGrid
            items={[
              { label: 'ממתינים לאישור', value: overview?.pending_review ?? 0 },
              { label: 'מתוזמנים', value: overview?.scheduled ?? 0 },
              { label: 'פורסמו', value: overview?.published ?? 0 },
              { label: 'נכשלו', value: overview?.failed ?? 0 },
              {
                label: 'Meta',
                value: overview?.meta_connected ? 'מחובר' : 'ממתין לטוקן',
              },
              { label: 'תגובות חדשות', value: overview?.inbox_new ?? 0 },
            ]}
          />
          <div className={`${hubSectionClass(1)} space-y-4 rounded-2xl p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                className="rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-[13px] font-semibold"
                onClick={() => {
                  if (month === 1) {
                    setMonth(12)
                    setYear((y) => y - 1)
                  } else setMonth((m) => m - 1)
                }}
              >
                חודש קודם
              </button>
              <h2 className="text-[18px] font-extrabold text-[var(--text-dark)]">
                {MONTH_HE[month]} {year}
              </h2>
              <button
                type="button"
                className="rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-[13px] font-semibold"
                onClick={() => {
                  if (month === 12) {
                    setMonth(1)
                    setYear((y) => y + 1)
                  } else setMonth((m) => m + 1)
                }}
              >
                חודש הבא
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-[var(--text-light)]">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, i) =>
                cell ? (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => openDay(cell.date)}
                    className={`min-h-[72px] rounded-xl border px-1.5 py-1.5 text-right ${
                      selectedDate === cell.date
                        ? 'border-[var(--brand)] bg-[var(--brand-light)]'
                        : 'border-[var(--border)] bg-white'
                    }`}
                  >
                    <div className="text-[12px] font-bold">{cell.day}</div>
                    <div className="mt-1 space-y-0.5">
                      {(postsByDate.get(cell.date) ?? []).slice(0, 3).map((p) => (
                        <div
                          key={p.id}
                          className={`truncate rounded-md px-1 py-0.5 text-[9px] font-bold ${statusChip(p.status)}`}
                        >
                          {SOCIAL_STATUS_HE[p.status] || p.status}
                        </div>
                      ))}
                    </div>
                  </button>
                ) : (
                  <div key={`e-${i}`} />
                ),
              )}
            </div>
            {loading ? <p className="text-center text-[12px] text-[var(--text-light)]">טוען יומן…</p> : null}
          </div>
          <p className="text-center text-[13px] text-[var(--text-light)]">
            לחצו על יום — נפתח חלון עם תצוגות מקדימות לאינסטגרם, פייסבוק וסטורי.
          </p>
        </div>
      ) : null}

      {tab === 'queue' ? (
        <div className={`${hubSectionClass(1)} space-y-3 rounded-2xl p-5`}>
          {posts.filter((p) => ['pending_review', 'scheduled', 'publishing', 'failed'].includes(p.status)).length ===
          0 ? (
            <EmptyState title="התור ריק" description="פוסטים ממתינים לאישור או מתוזמנים יופיעו כאן." />
          ) : (
            posts
              .filter((p) => ['pending_review', 'scheduled', 'publishing', 'failed'].includes(p.status))
              .map((p) => (
                <div key={p.id} className="rounded-xl border border-[var(--border)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusChip(p.status)}`}>
                      {SOCIAL_STATUS_HE[p.status]}
                    </span>
                    <span className="text-[12px] text-[var(--text-light)]">{p.scheduled_at?.slice(0, 16)}</span>
                  </div>
                  <p className="mt-2 text-[13px]">{p.caption_ig || p.caption}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-[12px] font-semibold"
                      onClick={() => openDay(ilDateKey(p.scheduled_at), p.id)}
                    >
                      תצוגה מקדימה
                    </button>
                    {p.status === 'pending_review' || p.status === 'failed' ? (
                      <>
                        <button
                          type="button"
                          className="rounded-lg bg-[var(--brand)] px-2.5 py-1 text-[12px] font-bold text-white"
                          onClick={() => void act(p.id, 'approve')}
                        >
                          אשר
                        </button>
                        <button
                          type="button"
                          className="rounded-lg bg-[var(--brand)] px-2.5 py-1 text-[12px] font-bold text-white"
                          onClick={() => void act(p.id, 'publish')}
                        >
                          עכשיו
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))
          )}
        </div>
      ) : null}

      {tab === 'inbox' ? (
        <div className={`${hubSectionClass(2)} space-y-3 rounded-2xl p-5`}>
          <div className="flex justify-center">
            <button
              type="button"
              disabled={!fleetUp}
              onClick={() =>
                void refreshSocialInbox().then((r) => {
                  if (r.ok) {
                    pushToast('תגובות עודכנו', 'success')
                    void load()
                  } else pushToast(r.error, 'error')
                })
              }
              className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-semibold disabled:opacity-60"
            >
              רענון תגובות מ-Meta
            </button>
          </div>
          {inbox.length === 0 ? (
            <EmptyState
              title="אין תגובות"
              description="תגובות מפייסבוק ומאינסטגרם יופיעו כאן לתצוגה בלבד. עדי לא עונה עליהן אוטומטית."
            />
          ) : (
            inbox.map((item) => (
              <div key={item.id} className="rounded-xl border border-[var(--border)] p-3 text-[13px]">
                <div className="text-[11px] font-bold text-[var(--text-light)]">
                  {item.platform} · {item.author_name || 'אנונימי'}
                </div>
                <p className="mt-1">{item.body}</p>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === 'analytics' ? (
        <div className={`${hubSectionClass(3)} space-y-3 rounded-2xl p-5`}>
          {posts.filter((p) => p.status === 'published').length === 0 ? (
            <EmptyState title="אין אנליטיקה עדיין" description="אחרי פרסום חי, מדדים מ-Meta יופיעו על הפוסט." />
          ) : (
            posts
              .filter((p) => p.status === 'published')
              .map((p) => (
                <div key={p.id} className="rounded-xl border border-[var(--border)] p-3 text-[13px]">
                  <p className="font-semibold">{(p.caption_ig || p.caption || '').slice(0, 80)}</p>
                  <p className="mt-1 text-[12px] text-[var(--text-light)]">
                    לייקים {p.analytics?.likes ?? 0} · תגובות {p.analytics?.comments ?? 0} · חשיפה{' '}
                    {p.analytics?.impressions ?? 0}
                  </p>
                </div>
              ))
          )}
        </div>
      ) : null}

      {tab === 'profile' ? (
        <AgentProfilePanel
          boardId={board.id}
          displayName={board.displayName}
          handle={agent?.handle || board.handle}
          role={agent?.role || board.role}
          tools={tools}
          statusLabel={!fleetUp ? 'לא זמין' : agent ? statusLabel(agent) : 'בקרוב'}
          lastActivity={agent?.running ? 'הסוכן פעיל' : agent ? 'הסוכן כבוי' : null}
        />
      ) : null}

      {tab === 'connections' ? (
        <div className={`${hubSectionClass(1)} space-y-4 rounded-2xl p-6`}>
          <p className="text-center text-[13px] leading-relaxed text-[var(--text-mid)]">
            אינסטגרם ופייסבוק מתחברים בטוקני Meta של Beo בלבד. טלגרם — שיחה חופשית ועדכונים, בלי אישור פרסום.
          </p>
          <AgentConnectionsList
            connections={tools.map((c) => ({
              kind: c.kind,
              label: c.label,
              connected: c.connected,
              note: c.hint,
            }))}
            emptyHint={!fleetUp ? 'הצי כבוי.' : 'אין חיבורים.'}
          />
          {live ? (
            <div className="flex justify-center">
              {running ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggle('stop')}
                  className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-semibold disabled:opacity-60"
                >
                  כבה את עדי
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggle('start')}
                  className="rounded-xl bg-[var(--brand)] px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
                >
                  הפעל את עדי
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'settings' ? (
        <div className={`${hubSectionClass(1)} space-y-3 rounded-2xl p-5 text-[13px] leading-relaxed text-[var(--text-mid)]`}>
          <h2 className="text-[15px] font-extrabold text-[var(--text-dark)]">איך עדי עובדת</h2>
          <ul className="list-disc space-y-2 pe-5">
            <li>יומן + אישור + תזמון רק כאן. בלי זה אין פרסום.</li>
            <li>אותו ויזואל לאינסטגרם ולפייסבוק. כותרת מותאמת לכל רשת.</li>
            <li>מיתוג beosystem.com — סגול #5828A0, לוגו רשמי.</li>
            <li>טלגרם: שיחה על מה שבוצע ועדכונים. לא מאשרים משם.</li>
            <li>תגובות בתיבה לתצוגה בלבד — בלי מענה אוטומטי.</li>
            <li>טוקני Meta חדשים של Beo כשהמערכת מוכנה. לא נוגעים בליבה.</li>
            <li>תמונות עם כיתוב עברית: gpt-image-2. סרטונים לא יוצאים ממודל התמונה.</li>
          </ul>
        </div>
      ) : null}

      {tab === 'costs' ? <AgentCostsTabPanel agentLabel={`${board.displayName} (עדי)`} /> : null}

      <SocialPostDialog
        open={Boolean(selectedDate)}
        date={selectedDate}
        posts={dayPosts}
        initialPostId={dialogPostId}
        defaultTime={overview?.settings?.default_publish_time || '10:00'}
        onClose={() => {
          setSelectedDate(null)
          setDialogPostId(null)
        }}
        onChanged={load}
      />
    </AgentBoardShell>
  )
}
