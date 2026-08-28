import { useState } from 'react'
import { hubSectionClass } from '../../lib/hubSectionBorder'
import { EmptyState } from '../../components/shared/EmptyState'
import { useHubStore } from '../../store/useStore'
import {
  postAgentGateway,
  statusLabel,
  statusTone,
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

const TABS = [
  { id: 'profile', label: 'פרופיל' },
  { id: 'overview', label: 'סקירה' },
  { id: 'connections', label: 'חיבורים' },
  { id: 'control', label: 'הפעלה' },
  { id: 'activity', label: 'פעילות' },
  { id: 'costs', label: 'עלויות' },
] as const

type TabId = (typeof TABS)[number]['id']

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
  const [tab, setTab] = useState<TabId>('profile')
  const [busy, setBusy] = useState(false)

  const live = agent?.status === 'live'
  const running = Boolean(agent?.running)
  const tools = displayToolsForAgent(board.id, agent)

  const statusBadge = !fleetUp ? (
    <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] font-bold text-[var(--text-mid)]">
      לא זמין
    </span>
  ) : agent ? (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${statusTone(agent)}`}
    >
      {running ? (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
      ) : null}
      {statusLabel(agent)}
    </span>
  ) : (
    <span className="rounded-full bg-[var(--brand-light)] px-2.5 py-1 text-[11px] font-bold text-[var(--brand-deep)]">
      בקרוב
    </span>
  )

  const toggle = async (action: 'start' | 'stop') => {
    if (!live || !agent) return
    setBusy(true)
    const result = await postAgentGateway(agent.id, action)
    if (result.ok) {
      pushToast(
        action === 'start' ? `${board.displayName} הופעל` : `${board.displayName} כובה`,
        'success',
      )
      await onFleetReload()
    } else {
      pushToast(result.error, 'error')
    }
    setBusy(false)
  }

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
            className={`${hubSectionClass(0)} rounded-2xl px-4 py-2.5 text-[13px] text-[var(--text-mid)]`}
          >
            הצי לא זמין — לא ניתן להפעיל או לכבות עד ש-Beo-agents יעלה על פורט 8788.
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
            !fleetUp ? 'לא זמין' : agent ? statusLabel(agent) : 'בקרוב'
          }
          lastActivity={
            agent?.running
              ? 'הסוכן פעיל'
              : agent
                ? 'הסוכן כבוי'
                : null
          }
        />
      ) : null}

      {tab === 'overview' ? (
        <div className="space-y-5">
          <div className={`${hubSectionClass(0)} rounded-2xl p-6 text-center`}>
            <p className="mx-auto max-w-2xl text-[13px] leading-relaxed text-[var(--text-mid)]">
              {board.purpose}
            </p>
            {live ? (
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                {running ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggle('stop')}
                    className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-semibold text-[var(--text-dark)] transition hover:bg-[var(--surface-hover)] disabled:opacity-60"
                  >
                    {busy ? 'מכבה…' : 'כבה'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggle('start')}
                    className="rounded-xl bg-[var(--brand)] px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-[var(--brand-hover)] disabled:opacity-60"
                  >
                    {busy ? 'מפעיל…' : 'הפעל'}
                  </button>
                )}
              </div>
            ) : null}
          </div>
          <AgentStatGrid
            items={[
              {
                label: 'סטטוס',
                value: !fleetUp ? 'לא זמין' : agent ? statusLabel(agent) : 'לא בצי',
              },
              {
                label: 'פרסום',
                value:
                  agent?.publish === 'preview'
                    ? 'תצוגה מקדימה'
                    : agent?.publish || '—',
              },
            ]}
          />
        </div>
      ) : null}

      {tab === 'connections' ? (
        <div className={`${hubSectionClass(1)} rounded-2xl p-6`}>
          <p className="mb-5 text-center text-[13px] leading-relaxed text-[var(--text-mid)]">
            Telegram ו-OpenAI לפי דיווח הצי. Instagram ו-Facebook נחשבים לא מחוברים כל עוד
            הפרסום במצב תצוגה מקדימה. טלגרם אינו ממשק ניהול — רק עדכונים.
          </p>
          <AgentConnectionsList
            connections={tools.map((c) => ({
              kind: c.kind,
              label: c.label,
              connected: c.connected,
              note: c.hint,
            }))}
            emptyHint={!fleetUp ? 'הצי כבוי — אין חיבורים לטעון.' : 'אין חיבורים בדיווח הצי.'}
          />
        </div>
      ) : null}

      {tab === 'control' ? (
        <div className={`${hubSectionClass(2)} space-y-4 rounded-2xl p-5`}>
          {!fleetUp || !live ? (
            <EmptyState
              title="אין הפעלה"
              description={
                !fleetUp
                  ? 'Beo-agents לא זמין. לא מוצג כפתור הפעלה כדי למנוע כשל שקט.'
                  : 'הסוכן לא במצב live בצי — אין מה להפעיל.'
              }
            />
          ) : (
            <>
              <p className="text-[13px] text-[var(--text-mid)]">
                סטטוס נוכחי: <strong>{statusLabel(agent!)}</strong>
              </p>
              <div className="flex flex-wrap gap-2">
                {running ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggle('stop')}
                    className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-semibold disabled:opacity-60"
                  >
                    {busy ? 'מכבה…' : 'כבה'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggle('start')}
                    className="rounded-xl bg-[var(--brand)] px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
                  >
                    {busy ? 'מפעיל…' : 'הפעל'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}

      {tab === 'activity' ? (
        <div className={`${hubSectionClass(3)} rounded-2xl p-5`}>
          <EmptyState
            title="אין פעילות עדיין"
            description="היסטוריית הרצות תופיע כאן כשיהיה מקור נתונים מ-Beo-agents. לא מוצגים נתונים מדומים."
          />
        </div>
      ) : null}

      {tab === 'costs' ? <AgentCostsTabPanel agentLabel={board.displayName} /> : null}
    </AgentBoardShell>
  )
}
