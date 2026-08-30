import { useMemo } from 'react'
import { AI_AGENT_BOARDS, type AiAgentBoardDef } from '../lib/aiAgentsRegistry'
import { statusLabel, type FleetAgent } from '../lib/aiAgentsFleet'
import { useAiAgentsFleet } from '../hooks/useAiAgentsFleet'
import { AgentFleetGraph } from '../components/ai-agents/AgentFleetGraph'

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

/** כניסה ראשית לסוכני AI — מפת רשת כהה */
export function AiAgents() {
  const { fleet, fleetUp, reload } = useAiAgentsFleet()

  const cards = useMemo(
    () => buildCards(fleet?.agents ?? null, fleetUp),
    [fleet, fleetUp],
  )

  return (
    <AgentFleetGraph
      fleetUp={fleetUp}
      onReload={() => void reload()}
      cards={cards.map((c) => ({
        ...c,
        statusLabel: cardStatusLabel(c),
      }))}
    />
  )
}
