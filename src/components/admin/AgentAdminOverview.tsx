import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAgentCommissionPayments } from '../../hooks/useAgentCommissionPayments'
import { useClients } from '../../hooks/useClients'
import { useDeals } from '../../hooks/useDeals'
import { useInvoices } from '../../hooks/useInvoices'
import { useLeads } from '../../hooks/useLeads'
import { buildAgentOverviewCards, monthLabelHe } from '../../lib/agentOverviewCards'
import { computeAgentsFleetOverviewStats, currentYm } from '../../lib/agentRevenue'
import type { TeamMember } from '../../types'
import { AgentCommissionPaymentsPanel } from './AgentCommissionPaymentsPanel'
import { AgentOverviewKpiGrid } from './AgentOverviewKpiGrid'
import { RecordAgentPaymentDialog } from './RecordAgentPaymentDialog'

type Props = {
  agent: TeamMember
  embedded?: boolean
}

export function AgentAdminOverview({ agent, embedded = false }: Props) {
  const navigate = useNavigate()
  const { clients } = useClients()
  const { leads } = useLeads()
  const { deals } = useDeals()
  const { invoices } = useInvoices()
  const { payments } = useAgentCommissionPayments()
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)

  const ymNow = useMemo(() => currentYm(), [])
  const monthLabel = useMemo(() => monthLabelHe(ymNow), [ymNow])

  const stats = useMemo(
    () =>
      computeAgentsFleetOverviewStats([agent], clients, leads, invoices, deals, payments, ymNow),
    [agent, clients, leads, invoices, deals, payments, ymNow],
  )

  const cards = useMemo(
    () => buildAgentOverviewCards(stats, monthLabel),
    [stats, monthLabel],
  )

  return (
    <>
      <div className={embedded ? 'space-y-4' : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <AgentOverviewKpiGrid
              title={`ניהול — ${agent.name}`}
              subtitle={
                <>
                  <strong className="font-bold text-[var(--text-dark)]">משוערת</strong> = עסקאות
                  פתוחות. <strong className="font-bold text-[var(--text-dark)]">כסף זמין</strong> =
                  תקבולים מהלקוח. <strong className="font-bold text-[var(--text-dark)]">שולם
                  לסוכן</strong> = תשלום עמלה שרשמתם אחרי התקבול.
                </>
              }
              cards={cards}
              columns={4}
              sectionBorder={embedded ? 2 : 1}
              embedded={embedded}
              ariaLabel={`סקירת סוכן ${agent.name}`}
            />
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-xs font-bold text-[var(--text-dark)] shadow-sm transition hover:bg-[var(--surface-muted)]"
              onClick={() => navigate(`/agents/preview/${agent.id}`)}
            >
              מעבר לפורטל סוכן מלא
            </button>
            <button
              type="button"
              className="hub-btn-primary rounded-xl px-4 py-2.5 text-xs font-bold"
              onClick={() => setPaymentDialogOpen(true)}
            >
              + תשלום לסוכן
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-white/90 p-3">
          <h3 className="mb-2 text-[11px] font-extrabold text-[var(--text-dark)]">
            תשלומים שנרשמו לסוכן
          </h3>
          <AgentCommissionPaymentsPanel agentUserId={agent.id} />
        </div>
      </div>

      <RecordAgentPaymentDialog
        agent={agent}
        isOpen={paymentDialogOpen}
        onClose={() => setPaymentDialogOpen(false)}
      />
    </>
  )
}
