import { Navigate, useParams } from 'react-router-dom'
import { getAiAgentBoard } from '../../lib/aiAgentsRegistry'
import { useAiAgentsFleet } from '../../hooks/useAiAgentsFleet'
import { SocialBeoBoard } from './SocialBeoBoard'
import { LeadsBeoBoard } from './LeadsBeoBoard'
import { JohnnyBeoBoard } from './JohnnyBeoBoard'

export function AiAgentBoard() {
  const { id } = useParams<{ id: string }>()
  const board = getAiAgentBoard(id)
  const { fleet, fleetUp, loading, reload } = useAiAgentsFleet()

  if (!board) {
    return <Navigate to="/ai-agents" replace />
  }

  if (loading) {
    return (
      <div className="beo-page py-10 text-center text-[13px] text-[var(--text-mid)]">
        טוען לוח סוכן…
      </div>
    )
  }

  const agent = fleet?.agents.find((a) => a.id === board.id) ?? null

  if (board.id === 'johnny-beo') {
    return (
      <JohnnyBeoBoard
        board={board}
        agent={agent}
        fleetUp={fleetUp}
        onFleetReload={reload}
      />
    )
  }

  if (board.id === 'social-beo') {
    return (
      <SocialBeoBoard
        board={board}
        agent={agent}
        fleetUp={fleetUp}
        onFleetReload={reload}
      />
    )
  }

  if (board.id === 'leads-beo') {
    return <LeadsBeoBoard board={board} agent={agent} fleetUp={fleetUp} />
  }

  return <Navigate to="/ai-agents" replace />
}
