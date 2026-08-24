import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { useHubStore } from '../store/useStore'
import { AI_AGENT_BOARDS, type AiAgentBoardDef } from '../lib/aiAgentsRegistry'
import {
  postAgentGateway,
  statusLabel,
  statusTone,
  type FleetAgent,
} from '../lib/aiAgentsFleet'
import {
  AI_AGENT_COST_LABEL,
  displayToolsForAgent,
  formatUsd,
} from '../lib/aiAgentsDisplay'
import { useAiAgentsFleet } from '../hooks/useAiAgentsFleet'
import {
  FleetCostsBlock,
  ToolStatusLine,
} from '../components/ai-agents/AgentCostsUi'
import { AgentAvatar } from '../components/ai-agents/AgentProfilePanel'
import { getAgentProfile } from '../lib/aiAgentProfiles'
import { fetchLeadsCosts } from '../lib/leadsBeoApi'

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

function cardStatusTone(card: CardModel): string {
  if (card.mode === 'unavailable') return 'bg-[var(--surface-muted)] text-[var(--text-mid)]'
  if (card.mode === 'planned') return 'bg-[var(--brand-light)] text-[var(--brand-deep)]'
  return statusTone(card.agent!)
}

function StatusPill({ card }: { card: CardModel }) {
  const running = card.mode === 'fleet' && Boolean(card.agent?.running)
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${cardStatusTone(card)}`}
    >
      {running ? (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />
      )}
      {cardStatusLabel(card)}
    </span>
  )
}

export function AiAgents() {
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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight text-[var(--text-dark)]">
            סוכני AI
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--text-mid)]">
            מרכז השליטה של Beo Systems. טלגרם לעדכונים בלבד — אישורים והפעלה כאן.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-semibold text-[var(--text-dark)] transition hover:bg-[var(--surface-hover)]"
        >
          רענון
        </button>
      </header>

      {!loading && error ? (
        <div
          className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-2.5 text-[13px] text-amber-950"
          role="status"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div
          className={`${hubSectionClass(0)} rounded-2xl p-8 text-center text-[13px] text-[var(--text-mid)]`}
        >
          טוען צי סוכנים…
        </div>
      ) : (
        <>
          <FleetCostsBlock leadsUsd={leadsUsd} leadsReady={leadsCostsReady} />

          <p className="text-[13px] text-[var(--text-mid)]">
            {!fleetUp ? (
              <>מצב צי: <strong className="text-[var(--text-dark)]">לא זמין</strong> · הקוביות
              נשארות לניהול</>
            ) : (
              <>
                רצים עכשיו:{' '}
                <strong className="tabular-nums text-[var(--text-dark)]">{runningCount}</strong>
                {' · '}
                כבויים (live):{' '}
                <strong className="tabular-nums text-[var(--text-dark)]">{stoppedLive}</strong>
                {plannedCount > 0 ? (
                  <>
                    {' · '}
                    בקרוב:{' '}
                    <strong className="tabular-nums text-[var(--text-dark)]">
                      {plannedCount}
                    </strong>
                  </>
                ) : null}
              </>
            )}
          </p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card, idx) => {
              const { board, agent, mode } = card
              const live = mode === 'fleet' && agent?.status === 'live'
              const busy = busyId === board.id
              const profile = getAgentProfile(board.id)
              const name = profile?.personName ?? agent?.display_name ?? board.displayName
              const handle = agent?.handle ?? board.handle
              const blurb = profile?.tagline ?? board.purpose
              const tools = displayToolsForAgent(board.id, agent)

              return (
                <Link
                  key={board.id}
                  to={board.path}
                  title="פתיחת לוח הסוכן"
                  className={`${hubSectionClass(idx % 4)} beo-agent-cube group flex min-h-[280px] flex-col rounded-2xl p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <AgentAvatar boardId={board.id} size="sm" />
                      <div className="min-w-0">
                        <h2 className="truncate text-[17px] font-extrabold text-[var(--text-dark)]">
                          {name}
                        </h2>
                        <p className="mt-0.5 font-mono text-[12px] text-[var(--text-light)]" dir="ltr">
                          {handle}
                        </p>
                      </div>
                    </div>
                    <StatusPill card={card} />
                  </div>

                  <p className="mt-4 line-clamp-3 flex-1 text-[13px] leading-relaxed text-[var(--text-mid)]">
                    {blurb}
                  </p>

                  <ToolStatusLine tools={tools} />

                  <p className="mt-3 text-[11px] text-[var(--text-light)]">
                    עלות החודש ·{' '}
                    <span className="font-semibold tabular-nums text-[var(--text-mid)]">
                      {board.id === 'leads-beo' && leadsCostsReady
                        ? formatUsd(leadsUsd)
                        : AI_AGENT_COST_LABEL}
                    </span>
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
                    <span className="text-[12px] font-bold text-[var(--brand)] transition group-hover:underline">
                      פתיחת לוח הסוכן
                    </span>
                    {live && agent ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(e) =>
                          void toggleAgent(e, agent, agent.running ? 'stop' : 'start')
                        }
                        className="mr-auto rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-dark)] transition hover:bg-[var(--surface-hover)] disabled:opacity-60"
                      >
                        {busy
                          ? '…'
                          : agent.running
                            ? 'כבה'
                            : 'הפעל'}
                      </button>
                    ) : null}
                  </div>
                </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
