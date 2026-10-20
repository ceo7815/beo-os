import type { FastifyInstance } from 'fastify'
import { env } from '../config/env.js'
import { isValidApiKey, parseBody } from '../lib/hubApiHttpUtil.js'
import { getServiceSupabase } from '../lib/supabaseAdmin.js'
import { loadPipelineSummary } from '../lib/pipelineApi.js'
import {
  findDuplicateLead,
  normalizeDomainKey,
  shayReplyPatch,
  type DedupLead,
} from '../lib/pipelineModel.js'
import { secretEqual } from '../lib/secretEqual.js'

const INTAKE_SOURCES = new Set([
  'meta_ads',
  'google_ads',
  'organic_seo',
  'whatsapp',
  'cold_email',
  'facebook_groups',
  'referral',
  'phone',
  'manual',
  'other',
])

function header(headers: Record<string, string | string[] | undefined>, name: string): string {
  const v = headers[name] ?? headers[name.toLowerCase()]
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
}

function sourceSecrets(): Record<string, string> {
  if (!env.intakeSourceSecrets) return {}
  try {
    const parsed = JSON.parse(env.intakeSourceSecrets) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim()
    }
    return out
  } catch {
    return {}
  }
}

function addHours(iso: string, hours: number): { date: string; at: string } {
  const dt = new Date(iso)
  dt.setTime(dt.getTime() + hours * 60 * 60 * 1000)
  return { date: dt.toISOString().slice(0, 10), at: dt.toISOString() }
}

export async function registerPipelineExtraRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/pipeline/summary', async (req, reply) => {
    if (!isValidApiKey(req.headers as Record<string, string | string[] | undefined>)) {
      reply.code(401).send({ ok: false, error: 'unauthorized' })
      return
    }
    const sb = getServiceSupabase()
    if (!sb) {
      reply.code(503).send({ ok: false, error: 'supabase_not_configured' })
      return
    }
    const summary = await loadPipelineSummary(sb)
    reply.send({ ok: true, summary })
  })

  app.post('/api/intake/lead', async (req, reply) => {
    const sb = getServiceSupabase()
    if (!sb) {
      reply.code(503).send({ ok: false, error: 'supabase_not_configured' })
      return
    }
    const body = parseBody(req.body)
    const data =
      body.data && typeof body.data === 'object' && !Array.isArray(body.data)
        ? (body.data as Record<string, unknown>)
        : body
    const source = typeof data.source === 'string' ? data.source.trim() : ''
    if (!INTAKE_SOURCES.has(source)) {
      reply.code(400).send({
        ok: false,
        error: 'bad_source',
        message: `source חייב להיות אחד מ: ${[...INTAKE_SOURCES].join(', ')}`,
      })
      return
    }
    const secrets = sourceSecrets()
    const expected = secrets[source] || env.intakeWebhookSecret
    if (!expected) {
      reply.code(503).send({
        ok: false,
        error: 'intake_secret_missing',
        message: 'INTAKE_WEBHOOK_SECRET (או INTAKE_SOURCE_SECRETS) לא הוגדר בשרת',
      })
      return
    }
    const given = header(req.headers as Record<string, string | string[] | undefined>, 'x-intake-secret')
    if (!secretEqual(given, expected)) {
      reply.code(401).send({ ok: false, error: 'unauthorized' })
      return
    }

    const name = typeof data.name === 'string' ? data.name.trim() : ''
    const company = typeof data.company === 'string' ? data.company.trim() : ''
    if (!name && !company) {
      reply.code(400).send({ ok: false, error: 'name_required', message: 'name או company חובה' })
      return
    }
    const ownerFromBody = typeof data.ownerId === 'string' ? data.ownerId.trim() : ''
    const ownerId = ownerFromBody || env.defaultLeadOwnerId
    if (!ownerId) {
      reply.code(400).send({
        ok: false,
        error: 'owner_required',
        message: 'ownerId חסר ו-DEFAULT_LEAD_OWNER_ID לא הוגדר. אור צריך לאשר את מזהה ברירת המחדל.',
      })
      return
    }

    const phone = typeof data.phone === 'string' ? data.phone.trim() : ''
    const email = typeof data.email === 'string' ? data.email.trim() : ''
    const domain =
      (typeof data.domain === 'string' ? data.domain.trim() : '') ||
      normalizeDomainKey(email)
    const firstMessage = typeof data.firstMessage === 'string' ? data.firstMessage.trim() : ''
    const now = new Date().toISOString()

    const { data: existingRows, error: listErr } = await sb
      .from('leads')
      .select('id,phone,email,domain,activity_log,status')
      .limit(2000)
    if (listErr) {
      reply.code(400).send({ ok: false, error: listErr.message })
      return
    }
    const dup = findDuplicateLead((existingRows ?? []) as DedupLead[], {
      id: '',
      phone,
      email,
      domain,
    })
    const activityText = firstMessage || `פנייה חדשה מ-${source}`
    const entry = {
      id: crypto.randomUUID(),
      text: activityText,
      at: now,
      actorName: 'intake',
    }

    if (dup) {
      const current = (existingRows ?? []).find((r) => r.id === dup.id) as
        | { activity_log?: unknown }
        | undefined
      const log = Array.isArray(current?.activity_log) ? current.activity_log : []
      const { error } = await sb
        .from('leads')
        .update({
          activity_log: [...log, entry],
          last_activity_text: activityText,
          last_activity_at: now,
          last_contact_at: now,
        })
        .eq('id', dup.id)
      if (error) {
        reply.code(400).send({ ok: false, error: error.message })
        return
      }
      reply.send({ ok: true, deduped: true, id: dup.id })
      return
    }

    const due = addHours(now, env.leadContactWithinHours)
    const row: Record<string, unknown> = {
      name: name || company,
      company: company || null,
      phone: phone || null,
      email: email || null,
      domain: domain || null,
      source,
      source_detail: typeof data.sourceDetail === 'string' ? data.sourceDetail.trim() || null : null,
      utm_source: typeof data.utmSource === 'string' ? data.utmSource : null,
      utm_medium: typeof data.utmMedium === 'string' ? data.utmMedium : null,
      utm_campaign: typeof data.utmCampaign === 'string' ? data.utmCampaign : null,
      utm_content: typeof data.utmContent === 'string' ? data.utmContent : null,
      utm_term: typeof data.utmTerm === 'string' ? data.utmTerm : null,
      landing_page: typeof data.landingPage === 'string' ? data.landingPage : null,
      first_message: firstMessage || null,
      consent: data.consent === true ? true : data.consent === false ? false : null,
      status: 'new',
      owner_id: ownerId,
      client_needs: typeof data.clientNeeds === 'string' ? data.clientNeeds : null,
      estimated_value: typeof data.estimatedValue === 'number' ? data.estimatedValue : null,
      next_action: 'ליצור קשר',
      next_action_at: due.at,
      next_follow_up_date: due.date,
      last_activity_text: activityText,
      last_activity_at: now,
      activity_log: [entry],
    }
    const { data: created, error } = await sb.from('leads').insert(row).select('id').single()
    if (error) {
      reply.code(400).send({ ok: false, error: error.message })
      return
    }
    const id = String(created.id)
    const task = {
      title: `ליצור קשר · ${name || company}`,
      description: firstMessage || `ליד חדש מ-${source}`,
      status: 'todo',
      priority: 'high',
      assignee_id: ownerId,
      lead_id: id,
      due_date: due.date,
      tags: ['intake'],
      reminders: [],
      shared_with_user_ids: [],
      team_wide_shared: false,
      created_by: ownerId,
    }
    const taskInsert = await sb.from('tasks').insert(task)
    if (taskInsert.error && /lead_id/.test(taskInsert.error.message)) {
      const { lead_id: _drop, ...without } = task
      await sb.from('tasks').insert(without)
    }
    reply.code(201).send({ ok: true, deduped: false, id, nextActionAt: due.at })
  })

  app.post('/api/integrations/beo-offer/events', async (req, reply) => {
    const headers = req.headers as Record<string, string | string[] | undefined>
    const offerSecret = header(headers, 'x-offer-secret')
    const allowed =
      isValidApiKey(headers) || (env.offerPingSecret ? secretEqual(offerSecret, env.offerPingSecret) : false)
    if (!allowed) {
      reply.code(401).send({ ok: false, error: 'unauthorized' })
      return
    }
    const sb = getServiceSupabase()
    if (!sb) {
      reply.code(503).send({ ok: false, error: 'supabase_not_configured' })
      return
    }
    const body = parseBody(req.body)
    const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
    const event = typeof body.event === 'string' ? body.event.trim() : ''
    if (!slug || !['viewed', 'accepted', 'rejected', 'sent'].includes(event)) {
      reply.code(400).send({ ok: false, error: 'slug and event (viewed|accepted|rejected|sent) required' })
      return
    }
    const at = typeof body.at === 'string' && body.at.trim() ? body.at : new Date().toISOString()
    const patch: Record<string, unknown> = {}
    if (event === 'viewed') {
      patch.viewed_at = at
      patch.status = 'viewed'
    } else if (event === 'sent') {
      patch.sent_at = at
      patch.status = 'sent'
    } else if (event === 'accepted') {
      patch.decided_at = at
      patch.status = 'accepted'
    } else {
      patch.decided_at = at
      patch.status = 'rejected'
    }
    const { data, error } = await sb.from('quotes').update(patch).eq('slug', slug).select('id,status')
    if (error) {
      reply.code(400).send({ ok: false, error: error.message })
      return
    }
    if (!data?.length) {
      reply.code(404).send({ ok: false, error: 'quote_not_found', slug })
      return
    }
    reply.send({ ok: true, updated: data.length, ids: data.map((r) => r.id) })
  })

  app.post('/api/integrations/shay/sync-replies', async (req, reply) => {
    if (!isValidApiKey(req.headers as Record<string, string | string[] | undefined>)) {
      reply.code(401).send({ ok: false, error: 'unauthorized' })
      return
    }
    const sb = getServiceSupabase()
    if (!sb) {
      reply.code(503).send({ ok: false, error: 'supabase_not_configured' })
      return
    }
    const ownerId =
      typeof (req.body as { ownerId?: string } | null)?.ownerId === 'string'
        ? (req.body as { ownerId: string }).ownerId.trim()
        : env.defaultLeadOwnerId
    const result = await syncShayReplies(sb, env.beoAgentsBaseUrl, ownerId)
    reply.code(result.error ? 502 : 200).send({ ok: !result.error, ...result })
  })
}

type AgentReply = {
  id: string
  company?: string
  email?: string | null
  phone?: string | null
  owner_name?: string | null
  reply_kind?: string
  reply_preview?: string
  os_lead_created?: boolean
}

export async function syncShayReplies(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
  baseUrl: string,
  ownerId: string,
): Promise<{ created: number; upgraded: number; closed: number; error?: string }> {
  let items: AgentReply[] = []
  try {
    const res = await fetch(`${baseUrl}/api/leads/check-replies`, { method: 'POST' })
    const json = (await res.json()) as { ok?: boolean; items?: AgentReply[]; error?: string }
    if (!res.ok || !json.ok) return { created: 0, upgraded: 0, closed: 0, error: json.error || `HTTP ${res.status}` }
    items = json.items ?? []
  } catch (e) {
    return { created: 0, upgraded: 0, closed: 0, error: e instanceof Error ? e.message : 'shay_unreachable' }
  }

  const { data: leads, error } = await sb
    .from('leads')
    .select('id,email,phone,domain,status,company,source')
    .limit(2000)
  if (error) return { created: 0, upgraded: 0, closed: 0, error: error.message }

  let created = 0
  let upgraded = 0
  let closed = 0
  const now = new Date().toISOString()
  const rows = (leads ?? []) as Array<DedupLead & { status?: string; company?: string; source?: string }>

  for (const row of items) {
    const emailKey = (row.email || '').trim().toLowerCase()
    const companyKey = (row.company || '').trim().toLowerCase()
    const known =
      rows.find((l) => emailKey && (l.email || '').trim().toLowerCase() === emailKey) ||
      rows.find((l) => {
        const co = (l.company || '').trim().toLowerCase()
        return Boolean(companyKey && co === companyKey && (l.source === 'Beo AI Lead Agent' || l.source === 'cold_email'))
      })
    const decided = shayReplyPatch({
      currentStatus: known?.status ?? null,
      replyKind: row.reply_kind || '',
      preview: row.reply_preview,
    })
    if (!decided) continue
    if (known && decided.status) {
      const update: Record<string, unknown> = {
        last_activity_text: decided.lastActivityText,
        last_activity_at: now,
        last_contact_at: now,
        status: decided.status,
      }
      if (decided.notRelevantReason) update.not_relevant_reason = decided.notRelevantReason
      if (decided.markReplied) update.replied_at = now
      const { error: upErr } = await sb.from('leads').update(update).eq('id', known.id)
      if (!upErr) {
        known.status = decided.status
        if (decided.status === 'replied') upgraded += 1
        else closed += 1
      }
    } else if (!known && decided.status === 'replied' && ownerId) {
      const { data: inserted, error: insErr } = await sb
        .from('leads')
        .insert({
          name: row.owner_name || row.company || row.email || 'ליד',
          company: row.company || null,
          email: row.email || null,
          phone: row.phone || null,
          source: 'Beo AI Lead Agent',
          source_detail: 'shay',
          status: 'replied',
          owner_id: ownerId,
          replied_at: now,
          last_activity_text: decided.lastActivityText,
          last_activity_at: now,
          last_contact_at: now,
          client_needs: row.reply_preview || null,
          activity_log: [],
        })
        .select('id')
        .single()
      if (!insErr && inserted) {
        created += 1
        rows.push({
          id: String(inserted.id),
          email: row.email,
          phone: row.phone,
          company: row.company,
          source: 'Beo AI Lead Agent',
          status: 'replied',
        })
      }
    } else if (known && !decided.status) {
      await sb
        .from('leads')
        .update({ last_activity_text: decided.lastActivityText, last_activity_at: now })
        .eq('id', known.id)
    }
    if (!row.os_lead_created && row.id) {
      await fetch(`${baseUrl}/api/leads/items/${row.id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ os_lead_created: true }),
      }).catch(() => undefined)
    }
  }
  return { created, upgraded, closed }
}
