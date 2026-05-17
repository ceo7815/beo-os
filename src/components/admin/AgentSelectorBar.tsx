import { useMemo } from 'react'
import { useClients } from '../../hooks/useClients'
import { useDeals } from '../../hooks/useDeals'
import { useInvoices } from '../../hooks/useInvoices'
import { useLeads } from '../../hooks/useLeads'
import { AGENT_COMMISSION_PERCENT_FALLBACK } from '../../lib/agentRevenue'
import { buildAgentWorkspaceData } from '../../lib/agentWorkspaceData'
import type { TeamMember } from '../../types'

type Props = {
  agents: TeamMember[]
  selectedAgentId: string
  onSelectAgent: (id: string) => void
  onUpdateCommission: (agentId: string, percent: number | null) => void
  /** בתוך קוביית ניהול סוכן — בלי מסגרת נפרדת */
  embedded?: boolean
}

export function AgentSelectorBar({
  agents,
  selectedAgentId,
  onSelectAgent,
  onUpdateCommission,
  embedded = false,
}: Props) {
  const { clients } = useClients()
  const { leads } = useLeads()
  const { deals } = useDeals()
  const { invoices } = useInvoices()

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null
  const selectedIndex = agents.findIndex((a) => a.id === selectedAgentId)

  const agentStats = useMemo(() => {
    if (!selectedAgent) return null
    const ws = buildAgentWorkspaceData(
      selectedAgent.id,
      clients,
      leads,
      [],
      invoices,
      deals,
      [],
    )
    return {
      quotes: ws.quotesOpen.length,
      activeDeals: ws.myDeals.filter((d) => d.status === 'active').length,
    }
  }, [selectedAgent, clients, leads, invoices, deals])

  const goPrev = () => {
    if (agents.length === 0) return
    const i = selectedIndex <= 0 ? agents.length - 1 : selectedIndex - 1
    onSelectAgent(agents[i].id)
  }

  const goNext = () => {
    if (agents.length === 0) return
    const i = selectedIndex < 0 || selectedIndex >= agents.length - 1 ? 0 : selectedIndex + 1
    onSelectAgent(agents[i].id)
  }

  if (!selectedAgent) return null

  const shellClass = embedded
    ? 'mb-5 flex flex-col gap-3 border-b border-[var(--border)] pb-4 md:flex-row md:items-center md:justify-between'
    : 'flex flex-col gap-3 rounded-2xl border border-[var(--border-orange-soft)] bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between'

  return (
    <div className={shellClass}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-[var(--text-mid)]">סוכן:</span>
        <div className="flex min-w-[min(100%,280px)] flex-1 items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            className="shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-2 text-sm font-bold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]"
            aria-label="סוכן קודם"
          >
            ‹
          </button>
          <select
            value={selectedAgentId}
            onChange={(e) => onSelectAgent(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2.5 text-sm font-extrabold text-[var(--text-dark)]"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={goNext}
            className="shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-2 text-sm font-bold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]"
            aria-label="סוכן הבא"
          >
            ›
          </button>
        </div>
        {agentStats ? (
          <div className="flex flex-wrap gap-2 text-[10px] font-bold text-[var(--text-mid)]">
            {agentStats.quotes > 0 ? (
              <span className="rounded-full bg-[var(--orange-light)] px-2.5 py-1 text-[var(--orange)]">
                {agentStats.quotes} הצעות
              </span>
            ) : null}
            <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1">
              {agentStats.activeDeals} עסקאות פעילות
            </span>
          </div>
        ) : null}
      </div>

      <label className="flex shrink-0 items-center gap-2">
        <span className="text-[10px] font-bold text-[var(--text-mid)]">עמלה % → פורטל</span>
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          dir="ltr"
          placeholder={String(AGENT_COMMISSION_PERCENT_FALLBACK)}
          className="w-20 rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-2 py-2 text-center text-sm font-semibold"
          defaultValue={
            typeof selectedAgent.agentCommissionPercent === 'number' &&
            Number.isFinite(selectedAgent.agentCommissionPercent)
              ? selectedAgent.agentCommissionPercent
              : ''
          }
          key={`bar-ac-${selectedAgent.id}-${String(selectedAgent.agentCommissionPercent ?? '')}`}
          onBlur={(e) => {
            const raw = e.target.value.trim().replace(',', '.')
            const prev =
              typeof selectedAgent.agentCommissionPercent === 'number' &&
              Number.isFinite(selectedAgent.agentCommissionPercent)
                ? Math.round(selectedAgent.agentCommissionPercent)
                : null
            if (raw === '') {
              if (prev !== null) onUpdateCommission(selectedAgent.id, null)
              return
            }
            const n = Math.round(Number(raw))
            if (!Number.isFinite(n) || n < 0 || n > 100) return
            if (prev !== null && prev === n) return
            onUpdateCommission(selectedAgent.id, n)
          }}
        />
      </label>
    </div>
  )
}
