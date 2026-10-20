import type { Lead } from '../types'
import {
  checkLeadsReplies,
  fetchLeadsPipeline,
  postLeadAction,
  type LeadPipelineItem,
} from './leadsBeoApi'
import {
  BEO_AI_LEAD_SOURCE,
  COLD_LEAD_NEEDS,
} from './leadStatusUi'

function normEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase()
}

function normCompany(company?: string | null): string {
  return (company || '').trim().toLowerCase()
}

/** התאמה לכרטיס CRM קיים לפי מייל (עדיף) או חברה + מקור שי */
export function findBeoAgentCrmLead(
  leads: Lead[],
  opts: { email?: string | null; company?: string | null },
): Lead | undefined {
  const email = normEmail(opts.email)
  const company = normCompany(opts.company)
  if (email) {
    const byEmail = leads.find((l) => normEmail(l.email) === email)
    if (byEmail) return byEmail
  }
  if (company) {
    return leads.find(
      (l) =>
        l.source === BEO_AI_LEAD_SOURCE &&
        normCompany(l.company) === company,
    )
  }
  return undefined
}

type CrmMutators = {
  userId: string
  leads: Lead[]
  addLead: (data: Omit<Lead, 'id' | 'createdAt'>) => Promise<void>
  updateLead: (id: string, data: Partial<Lead>) => Promise<void>
}

/**
 * אחרי שליחה מאושרת — פותח/מעדכן ליד קר ב-CRM.
 * לא יוצר כפיל אם כבר יש כרטיס לאותו מייל/חברה.
 */
export async function ensureColdLeadFromSent(
  item: LeadPipelineItem,
  opts: CrmMutators & { forceAfterApprove?: boolean },
): Promise<'created' | 'updated' | 'skipped'> {
  if (item.status === 'bounced' || item.status === 'replied') return 'skipped'
  if (!opts.forceAfterApprove) {
    if (
      item.status === 'pending_approval' ||
      item.status === 'rejected' ||
      item.status === 'draft' ||
      item.status === 'found'
    ) {
      return 'skipped'
    }
    if (item.status !== 'sent' && item.status !== 'approved') return 'skipped'
  }

  const existing = findBeoAgentCrmLead(opts.leads, {
    email: item.email,
    company: item.company,
  })

  if (existing) {
    if (existing.status === 'cold') {
      await opts.updateLead(existing.id, {
        lastActivityText:
          item.draft_kind === 'followup'
            ? 'פולואפ נשלח משי — ממתין לתשובה'
            : 'מייל נשלח משי — ממתין לתשובה',
        lastActivityAt: new Date().toISOString(),
        phone: existing.phone || item.phone || undefined,
        email: existing.email || item.email || undefined,
      })
      if (!item.os_lead_created) {
        await postLeadAction(item.id, 'edit', { os_lead_created: true })
      }
      return 'updated'
    }
    if (!item.os_lead_created) {
      await postLeadAction(item.id, 'edit', { os_lead_created: true })
    }
    return 'skipped'
  }

  await opts.addLead({
    name: item.owner_name || item.company,
    company: item.company,
    phone: item.phone || undefined,
    email: item.email || undefined,
    source: BEO_AI_LEAD_SOURCE,
    status: 'cold',
    ownerId: opts.userId,
    clientNeeds: COLD_LEAD_NEEDS,
    lastActivityText: 'מייל נשלח משי — ממתין לתשובה',
    lastActivityAt: new Date().toISOString(),
  })
  await postLeadAction(item.id, 'edit', { os_lead_created: true })
  return 'created'
}

let replyInflight: Promise<{
  created: number
  upgraded: number
  closed: number
  error?: string
}> | null = null

/** תשובות Gmail → CRM. Human: cold→new או new. Bounce/לא מעוניין: לא ל-new. */
export function syncBeoAgentRepliesToCrm(opts: {
  userId: string | undefined
  leads: Lead[]
  addLead: (data: Omit<Lead, 'id' | 'createdAt'>) => Promise<void>
  updateLead: (id: string, data: Partial<Lead>) => Promise<void>
}): Promise<{ created: number; upgraded: number; closed: number; error?: string }> {
  if (replyInflight) return replyInflight
  replyInflight = runReplySync(opts).finally(() => {
    replyInflight = null
  })
  return replyInflight
}

async function runReplySync(opts: {
  userId: string | undefined
  leads: Lead[]
  addLead: (data: Omit<Lead, 'id' | 'createdAt'>) => Promise<void>
  updateLead: (id: string, data: Partial<Lead>) => Promise<void>
}): Promise<{ created: number; upgraded: number; closed: number; error?: string }> {
  const { userId, leads, addLead, updateLead } = opts
  if (!userId) return { created: 0, upgraded: 0, closed: 0 }
  const replies = await checkLeadsReplies()
  if (!replies.ok) return { created: 0, upgraded: 0, closed: 0, error: replies.error }

  let created = 0
  let upgraded = 0
  let closed = 0
  const working = [...leads]

  for (const row of replies.items ?? []) {
    const kind = (row.reply_kind || 'human').toLowerCase()
    const existing = findBeoAgentCrmLead(working, {
      email: row.email,
      company: row.company,
    })

    if (kind === 'bounce' || kind === 'bounced') {
      if (existing?.status === 'cold') {
        await updateLead(existing.id, {
          status: 'not_relevant',
          notRelevantReason: 'כתובת לא נכונה',
          lastActivityText: 'Bounce — כתובת לא נכונה',
          lastActivityAt: new Date().toISOString(),
        })
        closed += 1
      }
      if (!row.os_lead_created) {
        await postLeadAction(row.id, 'edit', { os_lead_created: true })
      }
      continue
    }

    if (
      kind === 'not_interested' ||
      kind === 'not-interested' ||
      kind === 'reject' ||
      kind === 'rejected'
    ) {
      if (existing?.status === 'cold') {
        await updateLead(existing.id, {
          status: 'not_relevant',
          notRelevantReason: 'לא מעוניין',
          lastActivityText: row.reply_preview || 'לא מעוניין',
          lastActivityAt: new Date().toISOString(),
        })
        closed += 1
      }
      if (!row.os_lead_created) {
        await postLeadAction(row.id, 'edit', { os_lead_created: true })
      }
      continue
    }

    if (kind === 'ooo' || kind === 'out_of_office' || kind === 'auto') {
      if (existing?.status === 'cold') {
        await updateLead(existing.id, {
          lastActivityText: row.reply_preview || 'OOO — נשאר ליד קר',
          lastActivityAt: new Date().toISOString(),
        })
      }
      continue
    }

    if (kind !== 'human') continue
    const preReply =
      !existing ||
      existing.status === 'cold' ||
      existing.status === 'new' ||
      existing.status === 'contacted' ||
      existing.status === 'follow_up' ||
      existing.status === 'no_answer'
    if (existing && !preReply) {
      if (!row.os_lead_created) {
        await postLeadAction(row.id, 'edit', { os_lead_created: true })
      }
      continue
    }

    if (existing) {
      const nowIso = new Date().toISOString()
      await updateLead(existing.id, {
        status: 'replied',
        repliedAt: existing.repliedAt || nowIso,
        clientNeeds: row.reply_preview || existing.clientNeeds,
        lastActivityText: 'ענה · חזר אלינו',
        lastActivityAt: nowIso,
        lastContactAt: nowIso,
      })
      await postLeadAction(row.id, 'edit', { os_lead_created: true })
      upgraded += 1
      const idx = working.findIndex((l) => l.id === existing.id)
      if (idx >= 0) working[idx] = { ...working[idx], status: 'replied' }
      continue
    }

    if (existing) {
      if (!row.os_lead_created) {
        await postLeadAction(row.id, 'edit', { os_lead_created: true })
      }
      continue
    }

    await addLead({
      name: row.owner_name || row.company,
      company: row.company,
      phone: row.phone || undefined,
      email: row.email || undefined,
      source: BEO_AI_LEAD_SOURCE,
      sourceDetail: 'shay',
      status: 'replied',
      repliedAt: new Date().toISOString(),
      ownerId: userId,
      clientNeeds: row.reply_preview || undefined,
      lastActivityText: 'ענה · חזר אלינו',
      lastActivityAt: new Date().toISOString(),
      lastContactAt: new Date().toISOString(),
    })
    await postLeadAction(row.id, 'edit', { os_lead_created: true })
    created += 1
  }

  return { created, upgraded, closed }
}

let backfillInflight: Promise<{ created: number; updated: number; error?: string }> | null =
  null

/** חד־פעמי זהיר: sent בלי כרטיס CRM → cold */
export function backfillColdLeadsFromSent(opts: {
  userId: string | undefined
  leads: Lead[]
  addLead: (data: Omit<Lead, 'id' | 'createdAt'>) => Promise<void>
  updateLead: (id: string, data: Partial<Lead>) => Promise<void>
}): Promise<{ created: number; updated: number; error?: string }> {
  if (backfillInflight) return backfillInflight
  backfillInflight = runBackfill(opts).finally(() => {
    backfillInflight = null
  })
  return backfillInflight
}

async function runBackfill(opts: {
  userId: string | undefined
  leads: Lead[]
  addLead: (data: Omit<Lead, 'id' | 'createdAt'>) => Promise<void>
  updateLead: (id: string, data: Partial<Lead>) => Promise<void>
}): Promise<{ created: number; updated: number; error?: string }> {
  if (!opts.userId) return { created: 0, updated: 0 }
  const pipe = await fetchLeadsPipeline('sent')
  if (!pipe.ok) {
    const all = await fetchLeadsPipeline()
    if (!all.ok) return { created: 0, updated: 0, error: all.error }
    return processBackfillItems(
      all.items.filter((r) => r.status === 'sent'),
      { ...opts, userId: opts.userId },
    )
  }
  return processBackfillItems(pipe.items, { ...opts, userId: opts.userId })
}

async function processBackfillItems(
  items: LeadPipelineItem[],
  opts: CrmMutators,
): Promise<{ created: number; updated: number }> {
  let created = 0
  let updated = 0
  const working = [...opts.leads]
  const seenEmails = new Set<string>()

  for (const row of items) {
    if (row.status !== 'sent') continue
    if (row.reply_kind === 'bounce' || row.reply_kind === 'bounced') continue
    if (row.reply_kind === 'human' || row.reply_kind === 'replied') continue
    if (row.os_lead_created) {
      const existing = findBeoAgentCrmLead(working, {
        email: row.email,
        company: row.company,
      })
      if (existing) continue
    }

    const email = normEmail(row.email)
    if (email) {
      if (seenEmails.has(email)) continue
      seenEmails.add(email)
    }

    const result = await ensureColdLeadFromSent(row, {
      ...opts,
      leads: working,
    })
    if (result === 'created') {
      created += 1
      working.push({
        id: `tmp-${row.id}`,
        name: row.company,
        company: row.company,
        email: row.email || undefined,
        source: BEO_AI_LEAD_SOURCE,
        status: 'cold',
        ownerId: opts.userId,
        createdAt: new Date().toISOString(),
      })
    } else if (result === 'updated') {
      updated += 1
    }
  }
  return { created, updated }
}
