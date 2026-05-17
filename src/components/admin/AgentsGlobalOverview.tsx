import { useMemo } from 'react'
import { useAgentCommissionPayments } from '../../hooks/useAgentCommissionPayments'
import { useClients } from '../../hooks/useClients'
import { useDeals } from '../../hooks/useDeals'
import { useInvoices } from '../../hooks/useInvoices'
import { useLeads } from '../../hooks/useLeads'
import { buildGlobalFleetOverviewCards, monthLabelHe } from '../../lib/agentOverviewCards'
import { computeAgentsFleetOverviewStats, currentYm } from '../../lib/agentRevenue'
import type { TeamMember } from '../../types'
import { AgentOverviewKpiGrid } from './AgentOverviewKpiGrid'

type Props = {
  agents: TeamMember[]
}

export function AgentsGlobalOverview({ agents }: Props) {
  const { clients } = useClients()
  const { leads } = useLeads()
  const { deals } = useDeals()
  const { invoices } = useInvoices()
  const { payments } = useAgentCommissionPayments()

  const ymNow = useMemo(() => currentYm(), [])
  const monthLabel = useMemo(() => monthLabelHe(ymNow), [ymNow])

  const stats = useMemo(
    () =>
      computeAgentsFleetOverviewStats(agents, clients, leads, invoices, deals, payments, ymNow),
    [agents, clients, leads, invoices, deals, payments, ymNow],
  )

  const cards = useMemo(
    () => buildGlobalFleetOverviewCards(stats, monthLabel),
    [stats, monthLabel],
  )

  return (
    <AgentOverviewKpiGrid
      title="ניהול כל הסוכנים"
      subtitle={
        <>
          <strong className="font-bold text-[var(--text-dark)]">משוערת</strong> = עסקאות פתוחות
          לכל הסוכנים. כסף זמין ותשלומים לסוכן — בניהול הסוכן הספציפי למטה.
        </>
      }
      cards={cards}
      columns={4}
      sectionBorder={0}
      ariaLabel="סקירת כל הסוכנים"
    />
  )
}
