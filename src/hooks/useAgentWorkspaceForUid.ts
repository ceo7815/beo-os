import { useMemo } from 'react'
import { buildAgentWorkspaceData } from '../lib/agentWorkspaceData'
import { useCampaigns } from './useCampaigns'
import { useClients } from './useClients'
import { useDeals } from './useDeals'
import { useInvoices } from './useInvoices'
import { useLeads } from './useLeads'
import { useProjects } from './useProjects'

/** תצוגת אדמין: אותם נתונים שהסוכן רואה ב־`/agent` */
export function useAgentWorkspaceForUid(agentUserId: string) {
  const uid = agentUserId.trim()
  const { clients } = useClients()
  const { leads } = useLeads()
  const { projects } = useProjects()
  const { invoices } = useInvoices()
  const { deals } = useDeals()
  const { campaigns } = useCampaigns()

  return useMemo(() => {
    if (!uid) {
      return buildAgentWorkspaceData('', [], [], [], [], [], [])
    }
    return buildAgentWorkspaceData(uid, clients, leads, projects, invoices, deals, campaigns)
  }, [uid, clients, leads, projects, invoices, deals, campaigns])
}
