import { isAdminRole } from '../components/RequireAdmin'
import type { Client, Lead, TeamMember } from '../types'

/** משתמש מסומן כסוכן מכירות בפרופיל */
export function memberIsSalesAgentFlag(m: Pick<TeamMember, 'isAgent'> | undefined): boolean {
  return m?.isAgent === true
}

/**
 * סוכן רואה פורטל מצומצם: עובד + דגל סוכן, לא אדמין/מנהל מערכת.
 * אדמין עם דגל סוכן נשאר בממשק המלא.
 */
export function usesSalesAgentPortal(m: TeamMember | undefined): boolean {
  if (!m?.id) return false
  if (isAdminRole(m.role)) return false
  return memberIsSalesAgentFlag(m)
}

export function clientsForAgentUid(clients: Client[], agentUid: string): Client[] {
  const uid = agentUid.trim()
  if (!uid) return []
  return clients.filter((c) => (c.salesAgentUserId ?? '').trim() === uid)
}

export function leadsVisibleToAgent(
  leads: Lead[],
  myClientIds: Set<string>,
  agentUid: string,
): Lead[] {
  const uid = agentUid.trim()
  if (!uid) return []
  return leads.filter((l) => {
    if ((l.salesAgentUserId ?? '').trim() === uid) return true
    const cid = (l.clientId ?? '').trim()
    if (cid && myClientIds.has(cid)) return true
    return false
  })
}
