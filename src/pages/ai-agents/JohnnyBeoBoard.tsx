import { useCallback, useEffect, useState } from 'react'
import { hubSectionClass } from '../../lib/hubSectionBorder'
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
import {
  AgentBoardShell,
  AgentConnectionsList,
  AgentStatGrid,
} from './AgentBoardShell'
import { fetchJohnnyOverview, type JohnnyOverview } from '../../lib/johnnyBeoApi'

const TABS = [
  { id: 'overview', label: 'סקירה' },
  { id: 'profile', label: 'פרופיל' },
  { id: 'connections', label: 'חיבורים' },
  { id: 'settings', label: 'הגדרות' },
  { id: 'costs', label: 'עלויות' },
] as const

type TabId = (typeof TABS)[number]['id']

export function JohnnyBeoBoard({
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
  const [tab, setTab] = useState<TabId>('overview')
  const [busy, setBusy] = useState(false)
  const [overview, setOverview] = useState<JohnnyOverview | null>(null)

  const live = agent?.status === 'live'
  const running = Boolean(agent?.running)
  const tools = displayToolsForAgent(board.id, agent)

  const load = useCallback(async () => {
    if (!fleetUp) {
      setOverview(null)
      return
    }
    const result = await fetchJohnnyOverview()
    if (result.ok) setOverview(result.data)
  }, [fleetUp])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = async (action: 'start' | 'stop') => {
    if (!live || !agent) return
    setBusy(true)
    const result = await postAgentGateway(agent.id, action)
    if (result.ok) {
      pushToast(action === 'start' ? 'ג׳וני הופעל' : 'ג׳וני כובה', 'success')
      await onFleetReload()
      await load()
    } else {
      pushToast(result.error, 'error')
    }
    setBusy(false)
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
      <span className={`beo-agent-live-dot ${running ? '' : 'is-off'}`} aria-hidden />
      {statusLabel(agent)}
    </span>
  ) : (
    <span className="beo-agent-chip inline-flex items-center gap-1.5">בקרוב</span>
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
    >
      {tab === 'overview' ? (
        <div className="space-y-5">
          <AgentStatGrid
            items={[
              { label: 'משימות פתוחות', value: overview?.open_tasks ?? '—' },
              { label: 'ליעד היום', value: overview?.due_today ?? '—' },
              { label: 'טיוטות שי', value: overview?.shay_pending ?? '—' },
              { label: 'פוסטים עדי', value: overview?.adi_pending ?? '—' },
              { label: 'Beo OS', value: overview?.os_connected ? 'מחובר' : 'ממתין למפתח' },
              { label: 'יומן + Meet', value: overview?.calendar ? 'Google' : 'ממתין לטוקן' },
              { label: 'ריווחית', value: overview?.rivhit ? 'מחובר' : 'עתידי' },
            ]}
          />
          {overview?.pending?.summary ? (
            <div className={`${hubSectionClass(0)} rounded-2xl p-4 text-[13px]`}>
              <p className="font-extrabold">ממתין לאישור בטלגרם</p>
              <p className="mt-1 text-[var(--text-mid)]">{overview.pending.summary}</p>
            </div>
          ) : null}
          <div className={`${hubSectionClass(1)} space-y-3 rounded-2xl p-5`}>
            <h2 className="text-[16px] font-extrabold">אין שיחה כאן</h2>
            <p className="text-[13px] leading-relaxed text-[var(--text-mid)]">
              מדברים עם ג׳וני רק בטלגרם — טקסט וקול. הלוח הזה סטטוס וחיבורים בלבד. Beo OS הוא
              ספרי החברה שהוא קורא וכותב משם (אחרי כן שלך בטלגרם). מייל ויומן/Meet מגיעים מטוקן
              Gmail בצי agents — לא ממסך זה.
            </p>
            <ul className="list-disc space-y-1 pe-5 text-[13px] text-[var(--text-mid)]">
              <li>Beo OS מחובר בצי רק אחרי BOT_API_KEY זהה + BEO_OS_URL</li>
              <li>כל כתיבה לחברה — רק אחרי כן בטלגרם</li>
              <li>ceo@ / יומן — CEO_GMAIL_REFRESH_TOKEN בצי</li>
            </ul>
          </div>
          <div className={`${hubSectionClass(2)} space-y-2 rounded-2xl p-5`}>
            <h3 className="text-[14px] font-extrabold">פעולות אחרונות</h3>
            {(overview?.actions || []).length === 0 ? (
              <p className="text-[13px] text-[var(--text-light)]">עדיין אין. תדברו בטלגרם.</p>
            ) : (
              (overview?.actions || []).map((row, i) => (
                <div key={`${row.at}-${i}`} className="text-[12px] text-[var(--text-mid)]">
                  <span className="font-bold">{row.kind}</span> · {row.detail}
                </div>
              ))
            )}
          </div>
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
          <AgentConnectionsList
            connections={tools.map((c) => ({
              kind: c.kind,
              label: c.label,
              connected: c.connected,
              note: c.hint,
            }))}
            emptyHint={!fleetUp ? 'צי הסוכנים לא זמין.' : 'אין חיבורים.'}
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
                  כבה את ג׳וני
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggle('start')}
                  className="rounded-xl bg-[var(--brand)] px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
                >
                  הפעל את ג׳וני
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'settings' ? (
        <div className={`${hubSectionClass(1)} space-y-3 rounded-2xl p-5 text-[13px] leading-relaxed text-[var(--text-mid)]`}>
          <h2 className="text-[15px] font-extrabold text-[var(--text-dark)]">איך ג׳וני עובד</h2>
          <ul className="list-disc space-y-2 pe-5">
            <li>אין צ׳אט עם ג׳וני ב-Beo OS. מדברים רק בטלגרם.</li>
            <li>Beo OS: קריאה/כתיבה דרך /api/bot-data אחרי BOT_API_KEY בצי.</li>
            <li>כל כתיבה אחרי כן בטלגרם.</li>
            <li>יומן + Meet + ceo@ — מ-CEO_GMAIL_REFRESH_TOKEN בצי, לא מכאן.</li>
            <li>חשבונית ירוקה: POST /api/bot-morning/documents אחרי MORNING_* בשרת OS.</li>
          </ul>
        </div>
      ) : null}

      {tab === 'costs' ? <AgentCostsTabPanel agentLabel={`${board.displayName} (ג׳וני)`} /> : null}
    </AgentBoardShell>
  )
}
