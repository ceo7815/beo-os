import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { hubSectionClass } from '../../lib/hubSectionBorder'
import { useHubStore } from '../../store/useStore'
import { AI_AGENT_BOARDS, type AiAgentBoardDef } from '../../lib/aiAgentsRegistry'
import {
  postAgentGateway,
  statusLabel,
  type FleetAgent,
} from '../../lib/aiAgentsFleet'
import {
  AI_AGENT_COST_LABEL,
  displayToolsForAgent,
  formatUsd,
} from '../../lib/aiAgentsDisplay'
import { useAiAgentsFleet } from '../../hooks/useAiAgentsFleet'
import { FleetCostsBlock, ConnectionCubes } from '../../components/ai-agents/AgentCostsUi'
import { AgentStatGrid } from './AgentBoardShell'
import { AgentAvatar } from '../../components/ai-agents/AgentProfilePanel'
import { getAgentProfile } from '../../lib/aiAgentProfiles'
import { fetchLeadsCosts } from '../../lib/leadsBeoApi'

type CardModel = {
  board: AiAgentBoardDef
  agent: FleetAgent | null
  mode: 'fleet' | 'planned' | 'unavailable'
}

function buildCards(fleetAgents: FleetAgent[] | null, fleetUp: boolean): CardModel[] {
  const byId = new Map((fleetAgents ?? []).map((a) => [a.id, a]))
  return AI_AGENT_BOARDS.map((board) => {
    const agent = byId.get(board.id) ?? null
    if (!fleetUp) return { board, agent: null, mode: 'unavailable' as const }
    if (agent) return { board, agent, mode: 'fleet' as const }
    return { board, agent: null, mode: 'planned' as const }
  })
}

function cardStatusLabel(card: CardModel): string {
  if (card.mode === 'unavailable') return 'לא זמין'
  if (card.mode === 'planned') return 'בקרוב'
  return statusLabel(card.agent!)
}

function LiveDot({ state }: { state: 'on' | 'off' | 'warn' }) {
  return (
    <span
      className={`beo-agent-live-dot ${state === 'off' ? 'is-off' : state === 'warn' ? 'is-warn' : ''}`}
      aria-hidden
    />
  )
}

/** סקירה תפעולית — נפרדת ממפת הרשת */
export function AiAgentsOverview() {
  const pushToast = useHubStore((s) => s.pushToast)
  const { loading, error, fleet, fleetUp, reload } = useAiAgentsFleet()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [leadsUsd, setLeadsUsd] = useState(0)
  const [leadsCostsReady, setLeadsCostsReady] = useState(false)

  useEffect(() => {
    if (!fleetUp) return
    let cancelled = false
    void fetchLeadsCosts().then((result) => {
      if (cancelled || !result.ok) return
      setLeadsUsd(result.data.usd ?? 0)
      setLeadsCostsReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [fleetUp])

  const cards = useMemo(
    () => buildCards(fleet?.agents ?? null, fleetUp),
    [fleet, fleetUp],
  )

  const runningCount = cards.filter(
    (c) => c.mode === 'fleet' && c.agent?.running,
  ).length
  const stoppedLive = cards.filter(
    (c) => c.mode === 'fleet' && c.agent?.status === 'live' && !c.agent.running,
  ).length
  const plannedCount = cards.filter((c) => c.mode === 'planned').length

  const toggleAgent = async (
    e: MouseEvent,
    agent: FleetAgent,
    action: 'start' | 'stop',
  ) => {
    e.preventDefault()
    e.stopPropagation()
    if (agent.status !== 'live') return
    setBusyId(agent.id)
    const result = await postAgentGateway(agent.id, action)
    if (result.ok) {
      pushToast(
        action === 'start' ? `${agent.display_name} הופעל` : `${agent.display_name} כובה`,
        'success',
      )
      await reload()
    } else {
      pushToast(result.error || 'פעולה נכשלה', 'error')
    }
    setBusyId(null)
  }

  return (
    <div className="beo-page beo-agent-deck space-y-5">
      <header className="beo-agent-panel beo-agent-panel--hero overflow-hidden">
        <div className="beo-agent-panel-grid" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-5 px-5 py-5 md:px-7 md:py-6">
          <div className="min-w-0">
            <p className="beo-agent-kicker">Beo OS · תפעול</p>
            <h1 className="mt-0.5 text-[24px] font-extrabold tracking-tight text-[var(--text-dark)] md:text-[28px]">
              סקירת סוכנים
            </h1>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-[var(--text-mid)]">
              סטטוס, עלויות והפעלה. למפת הרשת —{' '}
              <Link to="/ai-agents" className="font-bold text-[var(--brand)] hover:underline">
                רשת סוכנים
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`beo-agent-chip ${fleetUp ? 'beo-agent-chip--live' : 'beo-agent-chip--muted'}`}
            >
              <LiveDot state={fleetUp ? 'on' : 'warn'} />
              {fleetUp ? 'צי מחובר' : 'צי מקומי לא זמין'}
            </span>
            <button
              type="button"
              onClick={() => void reload()}
              className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-semibold text-[var(--text-dark)] transition hover:bg-[var(--surface-hover)]"
            >
              רענון
            </button>
            <Link
              to="/ai-agents"
              className="rounded-xl bg-[var(--brand)] px-3.5 py-2 text-[13px] font-bold text-white shadow-[0_8px_18px_-10px_rgba(88,40,160,0.65)] transition hover:bg-[var(--brand-hover)]"
            >
              מפת רשת
            </Link>
          </div>
        </div>
      </header>

      {!loading && error ? (
        <div
          className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-[13px] leading-relaxed text-amber-950"
          role="status"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className={`${hubSectionClass(0)} rounded-2xl p-10 text-[13px] text-[var(--text-mid)]`}>
          טוען…
        </div>
      ) : (
        <>
          <AgentStatGrid
            items={[
              {
                label: fleetUp ? 'רצים עכשיו' : 'מצב צי',
                value: fleetUp ? runningCount : 'לא זמין',
                hot: fleetUp && runningCount > 0,
              },
              {
                label: 'כבויים (live)',
                value: fleetUp ? stoppedLive : '—',
              },
              {
                label: 'בקרוב',
                value: plannedCount,
              },
              {
                label: 'עלות שי החודש',
                value: leadsCostsReady ? formatUsd(leadsUsd) : AI_AGENT_COST_LABEL,
                href: '/ai-agents/leads-beo',
              },
            ]}
          />

          <section className="space-y-3">
            <h2 className="beo-agent-section-title">הסוכנים</h2>
            <div className="beo-agent-fleet-grid">
              {cards.map((card, idx) => {
                const { board, agent, mode } = card
                const live = mode === 'fleet' && agent?.status === 'live'
                const running = live && Boolean(agent?.running)
                const busy = busyId === board.id
                const profile = getAgentProfile(board.id)
                const name = profile?.personName ?? agent?.display_name ?? board.displayName
                const tools = displayToolsForAgent(board.id, agent)
                const connectedCount = tools.filter((t) => t.connected).length
                const dotState: 'on' | 'off' | 'warn' =
                  mode === 'unavailable' ? 'warn' : running ? 'on' : 'off'

                return (
                  <div
                    key={board.id}
                    className={`${hubSectionClass(idx % 4)} beo-agent-cube`}
                  >
                    <div className="beo-agent-avatar-wrap">
                      <AgentAvatar boardId={board.id} size="md" />
                      <LiveDot state={dotState} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[17px] font-extrabold text-[var(--text-dark)]">
                          {name}
                        </h2>
                        <span
                          className={`beo-agent-chip ${
                            running
                              ? 'beo-agent-chip--live'
                              : mode === 'planned'
                                ? ''
                                : 'beo-agent-chip--muted'
                          }`}
                        >
                          {cardStatusLabel(card)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12px] font-semibold text-[var(--brand-deep)]">
                        {profile?.title ?? board.role}
                      </p>
                      <p className="mt-2 line-clamp-2 text-[13px] text-[var(--text-mid)]">
                        {profile?.tagline ?? board.purpose}
                      </p>
                      <div className="mt-3">
                        <ConnectionCubes tools={tools} compact />
                      </div>
                      <p className="mt-2 text-[11px] text-[var(--text-light)]">
                        חיבורים: {connectedCount}/{tools.length || 0}
                        {' · '}
                        עלות:{' '}
                        <span className="font-mono font-bold text-[var(--text-dark)]">
                          {board.id === 'leads-beo' && leadsCostsReady
                            ? formatUsd(leadsUsd)
                            : AI_AGENT_COST_LABEL}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:min-w-[8rem]">
                      <Link
                        to={board.path}
                        className="rounded-xl bg-[var(--brand)] px-3.5 py-2.5 text-center text-[13px] font-bold text-white hover:bg-[var(--brand-hover)]"
                      >
                        כניסה ללוח
                      </Link>
                      {live && agent ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={(e) =>
                            void toggleAgent(e, agent, agent.running ? 'stop' : 'start')
                          }
                          className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-[12px] font-semibold disabled:opacity-60"
                        >
                          {busy ? '…' : agent.running ? 'כיבוי' : 'הפעלה'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <FleetCostsBlock leadsUsd={leadsUsd} leadsReady={leadsCostsReady} />
        </>
      )}
    </div>
  )
}
