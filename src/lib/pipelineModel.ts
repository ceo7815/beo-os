/**
 * Pure pipeline maths shared by the bot summary.
 * Browser copy of server/src/lib/pipelineModel.ts — keep the rules aligned.
 */

export const OPEN_LEAD_STAGES = [
  'new',
  'contacted',
  'follow_up',
  'replied',
  'meeting_scheduled',
  'specification',
  'quote_sent',
  'negotiation',
] as const

export const ARCHIVE_LEAD_STAGES = [
  'lost',
  'not_relevant',
  'no_answer',
  'nurture',
  'cold',
] as const

export const DEAL_STAGES = [
  'signed',
  'deposit_paid',
  'in_progress',
  'delivered',
  'paid_in_full',
  'cancelled',
] as const

/** Stages that still represent money not yet fully collected. */
export const OPEN_DEAL_STAGES = ['signed', 'deposit_paid', 'in_progress', 'delivered'] as const

export const STAGE_LABELS: Record<string, string> = {
  new: 'ליד חדש',
  contacted: 'נוצר קשר',
  follow_up: 'פולואפ',
  replied: 'חזר אלינו',
  meeting_scheduled: 'פגישה נקבעה',
  specification: 'אפיון',
  quote_sent: 'הצעה נשלחה',
  negotiation: 'משא ומתן',
  lost: 'לא נסגר',
  not_relevant: 'לא רלוונטי',
  no_answer: 'אין מענה',
  nurture: 'להמשך מעקב',
  cold: 'ליד קר',
  closed: 'נסגר',
  signed: 'נחתם',
  deposit_paid: 'מקדמה שולמה',
  in_progress: 'בביצוע',
  delivered: 'נמסר',
  paid_in_full: 'שולם',
  cancelled: 'בוטל',
  archive: 'לא נסגר',
}

export type LeadSnap = {
  id: string
  status: string
  estimatedValue?: number | null
  probability?: number | null
  source?: string | null
  ownerId?: string | null
  nextFollowUpDate?: string | null
  nextActionAt?: string | null
  createdAt?: string | null
}

export type QuoteSnap = {
  id: string
  leadId?: string | null
  dealId?: string | null
  status: string
  amountPreVat?: number | null
  period?: string | null
  sentAt?: string | null
  createdAt?: string | null
}

export type DealSnap = {
  id: string
  stage?: string | null
  status?: string | null
  amountTotal?: number | null
  agreedAmount?: number | null
  leadId?: string | null
  createdAt?: string | null
}

export type PaymentSnap = {
  id: string
  dealId?: string | null
  amount: number
  status: string
  dueDate?: string | null
  paidAt?: string | null
}

export type RecurringSnap = {
  id: string
  amount: number
  interval: string
  active?: boolean | null
  startDate?: string | null
  endDate?: string | null
}

export type StageSummary = {
  stage: string
  label: string
  kind: 'lead' | 'deal' | 'archive'
  count: number
  amount: number
  weightedAmount: number
  countsTowardOpen: boolean
}

export type PipelineSummary = {
  asOf: string
  currency: 'ILS'
  stages: StageSummary[]
  openPipelineAmount: number
  openPipelineWeighted: number
  openCount: number
  wonThisMonth: { count: number; amount: number }
  followUpsDue: { count: number; items: { id: string; due: string }[] }
  overduePayments: { count: number; amount: number }
  upcomingPayments: { count: number; amount: number }
  mrr: number
  leadsBySourceThisWeek: { source: string; count: number }[]
  conversionBySource: { source: string; leads: number; won: number; rate: number }[]
}

const OPEN_LEAD = new Set<string>(OPEN_LEAD_STAGES)
const ARCHIVE_LEAD = new Set<string>(ARCHIVE_LEAD_STAGES)

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
  return null
}

export function ymd(value: string | null | undefined): string | null {
  if (!value) return null
  const s = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

/** Sunday-start week, matching an Israel work week. */
export function weekStartSunday(today: string): string {
  const [y, m, d] = today.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay())
  return dt.toISOString().slice(0, 10)
}

export function monthPrefix(today: string): string {
  return today.slice(0, 7)
}

function quoteSortKey(q: QuoteSnap): string {
  return q.sentAt || q.createdAt || ''
}

/** Face value for a lead: explicit estimate, otherwise the newest live quote. */
export function leadFaceAmount(lead: LeadSnap, quotes: QuoteSnap[]): number {
  if (lead.estimatedValue != null && Number.isFinite(lead.estimatedValue)) {
    return lead.estimatedValue
  }
  const live = quotes
    .filter(
      (q) =>
        q.leadId === lead.id &&
        q.status !== 'rejected' &&
        q.status !== 'expired' &&
        q.amountPreVat != null,
    )
    .sort((a, b) => quoteSortKey(b).localeCompare(quoteSortKey(a)))
  return live[0]?.amountPreVat ?? 0
}

export function leadWeight(lead: LeadSnap): number {
  if (lead.probability == null || !Number.isFinite(lead.probability)) return 1
  return Math.min(100, Math.max(0, lead.probability)) / 100
}

export function dealFaceAmount(deal: DealSnap): number {
  if (deal.amountTotal != null && Number.isFinite(deal.amountTotal)) return deal.amountTotal
  if (deal.agreedAmount != null && Number.isFinite(deal.agreedAmount)) return deal.agreedAmount
  return 0
}

export function dealStageOf(deal: DealSnap): string {
  if (deal.stage && (DEAL_STAGES as readonly string[]).includes(deal.stage)) return deal.stage
  if (deal.status === 'cancelled') return 'cancelled'
  if (deal.status === 'completed') return 'paid_in_full'
  return 'signed'
}

export function paymentIsOverdue(p: PaymentSnap, today: string): boolean {
  if (p.status === 'paid') return false
  if (p.status === 'overdue') return true
  const due = ymd(p.dueDate)
  if (!due) return false
  return (p.status === 'scheduled' || p.status === 'invoiced') && due < today
}

export function balanceDue(deal: DealSnap, payments: PaymentSnap[]): number {
  const paid = payments
    .filter((p) => p.dealId === deal.id && p.status === 'paid')
    .reduce((sum, p) => sum + (Number.isFinite(p.amount) ? p.amount : 0), 0)
  return roundMoney(Math.max(0, dealFaceAmount(deal) - paid))
}

export function monthlyRecurring(rows: RecurringSnap[], today: string): number {
  let total = 0
  for (const row of rows) {
    if (row.active === false) continue
    const end = ymd(row.endDate)
    if (end && end < today) continue
    const start = ymd(row.startDate)
    if (start && start > today) continue
    const amount = Number.isFinite(row.amount) ? row.amount : 0
    if (row.interval === 'yearly') total += amount / 12
    else total += amount
  }
  return roundMoney(total)
}

function emptyStage(
  stage: string,
  kind: StageSummary['kind'],
  countsTowardOpen: boolean,
): StageSummary {
  return {
    stage,
    label: STAGE_LABELS[stage] ?? stage,
    kind,
    count: 0,
    amount: 0,
    weightedAmount: 0,
    countsTowardOpen,
  }
}

export function buildPipelineSummary(input: {
  today: string
  leads: LeadSnap[]
  quotes: QuoteSnap[]
  deals: DealSnap[]
  payments: PaymentSnap[]
  recurring: RecurringSnap[]
}): PipelineSummary {
  const { today, leads, quotes, deals, payments, recurring } = input
  const stages: StageSummary[] = [
    ...OPEN_LEAD_STAGES.map((s) => emptyStage(s, 'lead', true)),
    ...OPEN_DEAL_STAGES.map((s) => emptyStage(s, 'deal', true)),
    emptyStage('paid_in_full', 'deal', false),
    emptyStage('archive', 'archive', false),
    emptyStage('cancelled', 'deal', false),
  ]
  const byStage = new Map(stages.map((s) => [s.stage, s]))

  const followItems: { id: string; due: string }[] = []
  const sourceWeek = new Map<string, number>()
  const sourceAll = new Map<string, { leads: number; won: number }>()
  const weekStart = weekStartSunday(today)
  const month = monthPrefix(today)
  const wonLeadIds = new Set(
    deals.filter((d) => dealStageOf(d) !== 'cancelled').map((d) => d.leadId).filter(Boolean) as string[],
  )

  for (const lead of leads) {
    const source = (lead.source || 'unknown').trim() || 'unknown'
    const bucket = sourceAll.get(source) ?? { leads: 0, won: 0 }
    bucket.leads += 1
    if (lead.status === 'closed' || wonLeadIds.has(lead.id)) bucket.won += 1
    sourceAll.set(source, bucket)

    const created = ymd(lead.createdAt)
    if (created && created >= weekStart && created <= today) {
      sourceWeek.set(source, (sourceWeek.get(source) ?? 0) + 1)
    }

    if (lead.status === 'closed') continue

    const amount = leadFaceAmount(lead, quotes)
    const weighted = amount * leadWeight(lead)
    if (OPEN_LEAD.has(lead.status)) {
      const row = byStage.get(lead.status)
      if (row) {
        row.count += 1
        row.amount += amount
        row.weightedAmount += weighted
      }
      const due = ymd(lead.nextActionAt) || ymd(lead.nextFollowUpDate)
      if (due && due <= today) followItems.push({ id: lead.id, due })
    } else if (ARCHIVE_LEAD.has(lead.status)) {
      const row = byStage.get('archive')!
      row.count += 1
      row.amount += amount
      row.weightedAmount += weighted
    }
  }

  let wonCount = 0
  let wonAmount = 0
  for (const deal of deals) {
    const stage = dealStageOf(deal)
    const amount = dealFaceAmount(deal)
    const row = byStage.get(stage)
    if (row) {
      row.count += 1
      row.amount += amount
      row.weightedAmount += amount
    }
    const created = deal.createdAt?.slice(0, 7)
    if (created === month && stage !== 'cancelled') {
      wonCount += 1
      wonAmount += amount
    }
  }

  let overdueCount = 0
  let overdueAmount = 0
  let upcomingCount = 0
  let upcomingAmount = 0
  const horizon = addDays(today, 14)
  for (const p of payments) {
    if (p.status === 'paid') continue
    const due = ymd(p.dueDate)
    const amount = Number.isFinite(p.amount) ? p.amount : 0
    if (paymentIsOverdue(p, today)) {
      overdueCount += 1
      overdueAmount += amount
    } else if (due && due >= today && due <= horizon) {
      upcomingCount += 1
      upcomingAmount += amount
    }
  }

  for (const row of stages) {
    row.amount = roundMoney(row.amount)
    row.weightedAmount = roundMoney(row.weightedAmount)
  }

  const openStages = stages.filter((s) => s.countsTowardOpen)
  return {
    asOf: today,
    currency: 'ILS',
    stages,
    openPipelineAmount: roundMoney(openStages.reduce((s, r) => s + r.amount, 0)),
    openPipelineWeighted: roundMoney(openStages.reduce((s, r) => s + r.weightedAmount, 0)),
    openCount: openStages.reduce((s, r) => s + r.count, 0),
    wonThisMonth: { count: wonCount, amount: roundMoney(wonAmount) },
    followUpsDue: {
      count: followItems.length,
      items: followItems.sort((a, b) => a.due.localeCompare(b.due)).slice(0, 50),
    },
    overduePayments: { count: overdueCount, amount: roundMoney(overdueAmount) },
    upcomingPayments: { count: upcomingCount, amount: roundMoney(upcomingAmount) },
    mrr: monthlyRecurring(recurring, today),
    leadsBySourceThisWeek: [...sourceWeek.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
    conversionBySource: [...sourceAll.entries()]
      .map(([source, v]) => ({
        source,
        leads: v.leads,
        won: v.won,
        rate: v.leads === 0 ? 0 : roundMoney((v.won / v.leads) * 100),
      }))
      .sort((a, b) => b.leads - a.leads),
  }
}

function addDays(ymdValue: string, days: number): string {
  const [y, m, d] = ymdValue.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

export function normalizePhoneKey(phone: string | null | undefined): string {
  if (!phone) return ''
  let d = phone.replace(/\D/g, '')
  if (d.startsWith('972')) d = d.slice(3)
  d = d.replace(/^0+/, '')
  return d.length >= 8 ? d : ''
}

export function normalizeEmailKey(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase()
}

export function normalizeDomainKey(raw: string | null | undefined): string {
  if (!raw) return ''
  let s = raw.trim().toLowerCase()
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '')
  s = (s.split('/')[0] ?? '').split('?')[0] ?? ''
  if (s.includes('@')) s = s.split('@')[1] ?? ''
  return s.length >= 3 ? s : ''
}

export type DedupLead = {
  id: string
  phone?: string | null
  email?: string | null
  domain?: string | null
}

/** First match wins: phone, then email, then domain. */
export function findDuplicateLead(leads: DedupLead[], incoming: DedupLead): DedupLead | null {
  const phone = normalizePhoneKey(incoming.phone)
  const email = normalizeEmailKey(incoming.email)
  const domain = normalizeDomainKey(incoming.domain) || normalizeDomainKey(incoming.email)
  if (phone) {
    const hit = leads.find((l) => normalizePhoneKey(l.phone) === phone)
    if (hit) return hit
  }
  if (email) {
    const hit = leads.find((l) => normalizeEmailKey(l.email) === email)
    if (hit) return hit
  }
  if (domain) {
    const hit = leads.find((l) => {
      const own = normalizeDomainKey(l.domain) || normalizeDomainKey(l.email)
      return own === domain
    })
    if (hit) return hit
  }
  return null
}

const PRE_REPLY = new Set(['cold', 'new', 'contacted', 'follow_up', 'no_answer'])

/**
 * Shay reply → CRM status.
 * A human reply moves a pre-sale lead to `replied` and does not pull a later stage backwards.
 */
export function shayReplyPatch(input: {
  currentStatus: string | null
  replyKind: string
  preview?: string | null
}): { status?: string; notRelevantReason?: string; lastActivityText: string; markReplied: boolean } | null {
  const kind = input.replyKind.trim().toLowerCase()
  const preview = input.preview?.trim() || ''
  if (kind === 'bounce' || kind === 'bounced') {
    if (input.currentStatus === 'cold' || input.currentStatus == null) {
      return {
        status: 'not_relevant',
        notRelevantReason: 'כתובת לא נכונה',
        lastActivityText: 'Bounce — כתובת לא נכונה',
        markReplied: false,
      }
    }
    return null
  }
  if (kind === 'not_interested' || kind === 'not-interested' || kind === 'reject' || kind === 'rejected') {
    if (input.currentStatus === 'cold' || input.currentStatus == null) {
      return {
        status: 'not_relevant',
        notRelevantReason: 'לא מעוניין',
        lastActivityText: preview || 'לא מעוניין',
        markReplied: false,
      }
    }
    return null
  }
  if (kind === 'ooo' || kind === 'out_of_office' || kind === 'auto') {
    return { lastActivityText: preview || 'OOO — נשאר בסטטוס הנוכחי', markReplied: false }
  }
  if (kind !== 'human' && kind !== 'replied') return null
  if (input.currentStatus && !PRE_REPLY.has(input.currentStatus)) return null
  return {
    status: 'replied',
    lastActivityText: preview || 'ענה · חזר אלינו',
    markReplied: true,
  }
}
