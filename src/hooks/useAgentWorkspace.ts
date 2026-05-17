import { useMemo } from 'react'
import { useAgentPortalUserId } from '../contexts/AgentPreviewContext'
import { buildAgentWorkspaceData } from '../lib/agentWorkspaceData'
import { useCampaigns } from './useCampaigns'
import { useClients } from './useClients'
import { useDeals } from './useDeals'
import { useInvoices } from './useInvoices'
import { useLeads } from './useLeads'
import { useProjects } from './useProjects'

/** נתונים משותפים לדשבורד / לידים / עסקים בפורטל סוכן */
export function useAgentWorkspace() {
  const uid = useAgentPortalUserId()
  const { clients } = useClients()
  const { leads } = useLeads()
  const { projects } = useProjects()
  const { invoices } = useInvoices()
  const { deals } = useDeals()
  const { campaigns } = useCampaigns()

  return useMemo(
    () => buildAgentWorkspaceData(uid, clients, leads, projects, invoices, deals, campaigns),
    [uid, clients, leads, projects, invoices, deals, campaigns],
  )
}
