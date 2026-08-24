import type { Lead } from '../types'
import { checkLeadsReplies, postLeadAction } from './leadsBeoApi'

let inflight: Promise<{ created: number; error?: string }> | null = null

/** Human Gmail replies → CRM row on /leads. Bounces never create a lead. */
export function syncBeoAgentRepliesToCrm(opts: {
  userId: string | undefined
  addLead: (data: Omit<Lead, 'id' | 'createdAt'>) => Promise<void>
}): Promise<{ created: number; error?: string }> {
  if (inflight) return inflight
  inflight = runSync(opts).finally(() => {
    inflight = null
  })
  return inflight
}

async function runSync(opts: {
  userId: string | undefined
  addLead: (data: Omit<Lead, 'id' | 'createdAt'>) => Promise<void>
}): Promise<{ created: number; error?: string }> {
  const { userId, addLead } = opts
  if (!userId) return { created: 0 }
  const replies = await checkLeadsReplies()
  if (!replies.ok) return { created: 0, error: replies.error }
  let created = 0
  for (const row of replies.items ?? []) {
    if (row.os_lead_created) continue
    const kind = row.reply_kind || 'human'
    if (kind !== 'human') continue
    await addLead({
      name: row.owner_name || row.company,
      company: row.company,
      phone: row.phone || undefined,
      email: row.email || undefined,
      source: 'Beo AI Lead Agent',
      status: 'new',
      ownerId: userId,
      clientNeeds: row.reply_preview || undefined,
    })
    await postLeadAction(row.id, 'edit', { os_lead_created: true })
    created += 1
  }
  return { created }
}
