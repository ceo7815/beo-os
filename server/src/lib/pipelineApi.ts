import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildPipelineSummary,
  numOrNull,
  type DealSnap,
  type LeadSnap,
  type PaymentSnap,
  type PipelineSummary,
  type QuoteSnap,
  type RecurringSnap,
} from './pipelineModel.js'

type Sb = SupabaseClient

function isMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const msg = error.message ?? ''
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(msg)
}

async function fetchAll(sb: Sb, table: string): Promise<Record<string, unknown>[]> {
  const page = 1000
  const out: Record<string, unknown>[] = []
  for (let from = 0; ; from += page) {
    const { data, error } = await sb.from(table).select('*').range(from, from + page - 1)
    if (error) {
      if (isMissing(error)) return []
      throw new Error(error.message)
    }
    const rows = (data ?? []) as Record<string, unknown>[]
    out.push(...rows)
    if (rows.length < page) break
  }
  return out
}

function str(row: Record<string, unknown>, key: string): string | null {
  const v = row[key]
  return typeof v === 'string' && v.trim() ? v : null
}

export async function loadPipelineSummary(sb: Sb, today = new Date().toISOString().slice(0, 10)): Promise<PipelineSummary> {
  const { error: expireError } = await sb.rpc('expire_stale_quotes')
  if (expireError && !isMissing(expireError) && !/expire_stale_quotes/i.test(expireError.message)) {
    // Missing function before the migration is fine. Other errors should not hide the summary.
    if (!/could not find the function|schema cache/i.test(expireError.message)) {
      throw new Error(expireError.message)
    }
  }

  const [leadRows, quoteRows, dealRows, paymentRows, recurringRows] = await Promise.all([
    fetchAll(sb, 'leads'),
    fetchAll(sb, 'quotes'),
    fetchAll(sb, 'deals'),
    fetchAll(sb, 'deal_payments'),
    fetchAll(sb, 'recurring_charges'),
  ])

  const leads: LeadSnap[] = leadRows.map((row) => ({
    id: String(row.id),
    status: str(row, 'status') ?? 'new',
    estimatedValue: numOrNull(row.estimated_value),
    probability: numOrNull(row.probability),
    source: str(row, 'source'),
    ownerId: str(row, 'owner_id'),
    nextFollowUpDate: str(row, 'next_follow_up_date'),
    nextActionAt: str(row, 'next_action_at'),
    createdAt: str(row, 'created_at'),
  }))
  const quotes: QuoteSnap[] = quoteRows.map((row) => ({
    id: String(row.id),
    leadId: str(row, 'lead_id'),
    dealId: str(row, 'deal_id'),
    status: str(row, 'status') ?? 'draft',
    amountPreVat: numOrNull(row.amount_pre_vat),
    period: str(row, 'period'),
    sentAt: str(row, 'sent_at'),
    createdAt: str(row, 'created_at'),
  }))
  const deals: DealSnap[] = dealRows.map((row) => ({
    id: String(row.id),
    stage: str(row, 'stage'),
    status: str(row, 'status'),
    amountTotal: numOrNull(row.amount_total),
    agreedAmount: numOrNull(row.agreed_amount),
    leadId: str(row, 'lead_id'),
    createdAt: str(row, 'created_at'),
  }))
  const payments: PaymentSnap[] = paymentRows.map((row) => ({
    id: String(row.id),
    dealId: str(row, 'deal_id'),
    amount: numOrNull(row.amount) ?? 0,
    status: str(row, 'status') ?? 'scheduled',
    dueDate: str(row, 'due_date'),
    paidAt: str(row, 'paid_at'),
  }))
  const recurring: RecurringSnap[] = recurringRows.map((row) => ({
    id: String(row.id),
    amount: numOrNull(row.amount) ?? 0,
    interval: str(row, 'interval') ?? 'monthly',
    active: row.active !== false,
    startDate: str(row, 'start_date'),
    endDate: str(row, 'end_date'),
  }))

  return buildPipelineSummary({ today, leads, quotes, deals, payments, recurring })
}

export async function insertLeadStageHistory(
  sb: Sb,
  row: { leadId: string; fromStatus: string | null; toStatus: string; changedBy: string | null; note?: string | null },
): Promise<void> {
  const { error } = await sb.from('lead_stage_history').insert({
    lead_id: row.leadId,
    from_status: row.fromStatus,
    to_status: row.toStatus,
    changed_by: row.changedBy,
    note: row.note ?? null,
  })
  if (error && !isMissing(error)) throw new Error(error.message)
}

export async function insertDealStageHistory(
  sb: Sb,
  row: { dealId: string; fromStage: string | null; toStage: string; changedBy: string | null; note?: string | null },
): Promise<void> {
  const { error } = await sb.from('deal_stage_history').insert({
    deal_id: row.dealId,
    from_stage: row.fromStage,
    to_stage: row.toStage,
    changed_by: row.changedBy,
    note: row.note ?? null,
  })
  if (error && !isMissing(error)) throw new Error(error.message)
}
