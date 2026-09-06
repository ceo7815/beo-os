import type { SupabaseClient } from '@supabase/supabase-js'
import {
  parseRivhitDateToIso,
  resolveRivhitDocumentTypes,
  rivhitCustomerGet,
  rivhitCustomerList,
  rivhitDocumentCopy,
  rivhitDocumentDetails,
  rivhitDocumentList,
  toRivhitDate,
  type RivhitCustomerRow,
  type RivhitDocumentListRow,
} from './rivhitClient.js'

/** קו תחתון קשיח — לא מושכים כלום מלפני התאריך הזה */
export const RIVHIT_SYNC_FROM_DATE = '15/08/2026'
export const RIVHIT_SYNC_FROM_ISO = '2026-08-15'

export type RivhitSyncResult = {
  fromDate: string
  toDate: string
  customers: { fetched: number; created: number; updated: number }
  workOrders: { fetched: number; created: number; updated: number }
  taxReceipts: { fetched: number; created: number; updated: number }
  errors: string[]
}

function str(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

async function upsertClientFromRivhit(
  sb: SupabaseClient,
  c: RivhitCustomerRow,
  stats: RivhitSyncResult['customers'],
): Promise<string> {
  const rivhitId = Number(c.customer_id)
  const { data: existing } = await sb
    .from('clients')
    .select('id')
    .eq('rivhit_customer_id', rivhitId)
    .maybeSingle()

  const name =
    [c.last_name, c.first_name].filter(Boolean).join(' ').trim() ||
    str(c.last_name) ||
    `לקוח ריווחית ${rivhitId}`

  const payload = {
    name: name.slice(0, 200),
    contact: str(c.first_name),
    phone: str(c.phone),
    phone2: str(c.phone2) || null,
    fax: str(c.fax) || null,
    email: str(c.email),
    address_line: str(c.address) || null,
    city: str(c.city) || null,
    zipcode: c.zipcode != null && str(c.zipcode) ? str(c.zipcode) : null,
    country: str(c.country) || 'ישראל',
    id_number: c.id_number != null && str(c.id_number) ? str(c.id_number) : null,
    tax_id: c.vat_number != null && str(c.vat_number) ? str(c.vat_number) : null,
    currency: Number(c.currency_id) === 2 ? 'USD' : 'ILS',
    rivhit_customer_id: rivhitId,
    status: 'active',
    source: 'manual',
  }

  if (existing?.id) {
    await sb.from('clients').update(payload).eq('id', existing.id)
    stats.updated += 1
    return existing.id as string
  }

  const { data: created, error } = await sb.from('clients').insert(payload).select('id').single()
  if (error) throw new Error(`לקוח ${rivhitId}: ${error.message}`)
  stats.created += 1
  return created.id as string
}

async function ensureClientId(
  sb: SupabaseClient,
  rivhitCustomerId: number | undefined,
  cache: Map<number, string>,
  stats: RivhitSyncResult['customers'],
  errors: string[],
): Promise<string | null> {
  if (!rivhitCustomerId) return null
  const hit = cache.get(rivhitCustomerId)
  if (hit) return hit

  const { data: existing } = await sb
    .from('clients')
    .select('id')
    .eq('rivhit_customer_id', rivhitCustomerId)
    .maybeSingle()
  if (existing?.id) {
    cache.set(rivhitCustomerId, existing.id)
    return existing.id
  }

  try {
    const c = await rivhitCustomerGet(rivhitCustomerId)
    const id = await upsertClientFromRivhit(sb, c, stats)
    cache.set(rivhitCustomerId, id)
    return id
  } catch (e) {
    errors.push(
      `לקוח ${rivhitCustomerId}: ${e instanceof Error ? e.message : String(e)}`,
    )
    return null
  }
}

async function upsertDocument(
  sb: SupabaseClient,
  opts: {
    kind: 'work_order' | 'tax_receipt'
    clientId: string
    row: RivhitDocumentListRow
    details?: Awaited<ReturnType<typeof rivhitDocumentDetails>> | null
    link?: string | null
    identity?: string | null
    parentId?: string | null
  },
  stats: { fetched: number; created: number; updated: number },
): Promise<string | null> {
  const docType = Number(opts.row.document_type)
  const docNum = Number(opts.row.document_number)
  const amount = num(opts.details?.document_total ?? opts.row.amount)
  const issueIso = parseRivhitDateToIso(opts.details?.document_date || opts.row.document_date)
  const dueIso = parseRivhitDateToIso(opts.details?.document_due_date)
  const cancelled = Boolean(opts.details?.is_cancelled || opts.row.is_cancelled)
  const title =
    opts.kind === 'work_order'
      ? str(opts.details?.items?.[0]?.description) || `הזמנת עבודה #${docNum}`
      : str(opts.details?.items?.[0]?.description) ||
        `חשבונית מס קבלה #${docNum}`

  const lines = (opts.details?.items ?? []).map((it) => ({
    description: str(it.description) || title,
    quantity: num(it.quantity) || 1,
    price_nis: num(it.price_nis),
    catalog_number: str(it.catalog_number) || undefined,
  }))

  const payload = {
    kind: opts.kind,
    client_id: opts.clientId,
    parent_id: opts.parentId ?? null,
    rivhit_customer_id: opts.row.customer_id ?? opts.details?.customer_id ?? null,
    rivhit_document_type: docType,
    rivhit_document_number: docNum,
    rivhit_document_identity: opts.identity ?? null,
    rivhit_document_link: opts.link ?? opts.row.document_link ?? null,
    title: title.slice(0, 300),
    amount_nis: amount,
    status: cancelled
      ? 'cancelled'
      : opts.kind === 'work_order'
        ? opts.details?.is_closed
          ? 'paid'
          : 'open'
        : 'paid',
    lines: lines.length ? lines : [{ description: title, quantity: 1, price_nis: amount }],
    payments: opts.details?.payments ?? [],
    notes: str(opts.details?.comments) || null,
    issue_date: issueIso,
    due_date: dueIso,
    discount_value: num(opts.details?.discount_amount),
    customer_snapshot: {
      name: opts.details?.customer_name || opts.row.customer_name,
      phone: opts.details?.customer_phone,
      email: opts.details?.customer_email,
      address: opts.details?.customer_address,
      city: opts.details?.customer_city,
    },
  }

  const { data: existing } = await sb
    .from('finance_documents')
    .select('id')
    .eq('rivhit_document_type', docType)
    .eq('rivhit_document_number', docNum)
    .maybeSingle()

  if (existing?.id) {
    await sb.from('finance_documents').update(payload).eq('id', existing.id)
    stats.updated += 1
    return existing.id as string
  }

  const { data: created, error } = await sb
    .from('finance_documents')
    .insert(payload)
    .select('id')
    .single()
  if (error) throw new Error(`מסמך ${docType}/${docNum}: ${error.message}`)
  stats.created += 1
  return created.id as string
}

/**
 * סנכרון מריווחית → Beo OS: לקוחות + הזמנות עבודה + חשבוניות מס קבלה מתאריך.
 */
export async function syncRivhitIntoBeo(
  sb: SupabaseClient,
  opts?: { fromDate?: string; toDate?: string },
): Promise<RivhitSyncResult> {
  // תמיד לפחות מ־15/08/2026 — מתעלמים מבקשה לתאריך מוקדם יותר
  const requested = opts?.fromDate || RIVHIT_SYNC_FROM_DATE
  const requestedIso = parseRivhitDateToIso(requested) || RIVHIT_SYNC_FROM_ISO
  const fromIso =
    requestedIso < RIVHIT_SYNC_FROM_ISO ? RIVHIT_SYNC_FROM_ISO : requestedIso
  const fromDate = toRivhitDate(fromIso)
  const toDate = opts?.toDate || toRivhitDate(new Date())
  const result: RivhitSyncResult = {
    fromDate,
    toDate,
    customers: { fetched: 0, created: 0, updated: 0 },
    workOrders: { fetched: 0, created: 0, updated: 0 },
    taxReceipts: { fetched: 0, created: 0, updated: 0 },
    errors: [],
  }

  const types = await resolveRivhitDocumentTypes()
  const clientCache = new Map<number, string>()

  // 1) לקוחות שנוצרו מ־fromDate (וגם נשלים לקוחות ממסמכים בהמשך)
  try {
    const customers = await rivhitCustomerList({
      customer_type: 1,
      created_after: fromDate,
    })
    result.customers.fetched = customers.length
    for (const c of customers) {
      try {
        const id = await upsertClientFromRivhit(sb, c, result.customers)
        clientCache.set(Number(c.customer_id), id)
      } catch (e) {
        result.errors.push(
          `לקוח ${c.customer_id}: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }
  } catch (e) {
    result.errors.push(`Customer.List: ${e instanceof Error ? e.message : String(e)}`)
  }

  async function importDocs(
    kind: 'work_order' | 'tax_receipt',
    docType: number,
    stats: { fetched: number; created: number; updated: number },
  ) {
    const rows = await rivhitDocumentList({
      from_date: fromDate,
      to_date: toDate,
      from_document_type: docType,
      to_document_type: docType,
    })
    // סינון כפול בצד שלנו — רק מסמכים מתאריך 15/08/2026 ומעלה
    const filtered = rows.filter((row) => {
      const iso = parseRivhitDateToIso(row.document_date)
      if (!iso) return true
      return iso >= fromIso
    })
    stats.fetched = filtered.length

    for (const row of filtered) {
      try {
        let details = null as Awaited<ReturnType<typeof rivhitDocumentDetails>> | null
        try {
          details = await rivhitDocumentDetails(row.document_type, row.document_number)
        } catch {
          details = null
        }
        const copy = await rivhitDocumentCopy(row.document_type, row.document_number)
        const rivhitCustomerId = Number(row.customer_id || details?.customer_id || 0) || undefined
        const clientId = await ensureClientId(
          sb,
          rivhitCustomerId,
          clientCache,
          result.customers,
          result.errors,
        )
        if (!clientId) {
          result.errors.push(
            `מסמך ${row.document_type}/${row.document_number}: אין לקוח מקושר`,
          )
          continue
        }

        let parentId: string | null = null
        if (kind === 'tax_receipt') {
          // ניסיון לקשר להזמנת עבודה לפי order_ref / comments עם מספר הזמנה
          const hint = str(details?.comments)
          const m = hint.match(/#?\s*(\d{1,9})/)
          if (m) {
            const { data: parent } = await sb
              .from('finance_documents')
              .select('id')
              .eq('kind', 'work_order')
              .eq('rivhit_document_number', Number(m[1]))
              .maybeSingle()
            parentId = parent?.id ?? null
          }
        }

        await upsertDocument(
          sb,
          {
            kind,
            clientId,
            row,
            details,
            link: copy.document_link ?? null,
            identity: copy.document_identity ?? null,
            parentId,
          },
          stats,
        )
      } catch (e) {
        result.errors.push(
          `מסמך ${row.document_type}/${row.document_number}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        )
      }
    }
  }

  try {
    await importDocs('work_order', types.workOrder, result.workOrders)
  } catch (e) {
    result.errors.push(`Document.List הזמנות: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    await importDocs('tax_receipt', types.taxReceipt, result.taxReceipts)
  } catch (e) {
    result.errors.push(`Document.List חשבוניות: ${e instanceof Error ? e.message : String(e)}`)
  }

  // גם «קבלה» (סוג 7) — מסמכי גבייה נפוצים כשאין עדיין חשבונית מס קבלה
  try {
    const receiptType = types.raw.find(
      (t) => t.document_type === 7 || /^קבלה$/.test(String(t.document_name || '').trim()),
    )
    if (receiptType && receiptType.document_type !== types.taxReceipt) {
      await importDocs('tax_receipt', receiptType.document_type, result.taxReceipts)
    }
  } catch (e) {
    result.errors.push(`Document.List קבלות: ${e instanceof Error ? e.message : String(e)}`)
  }

  // רענון סטטוסי הזמנות לפי קבלות
  const { data: orders } = await sb
    .from('finance_documents')
    .select('id, amount_nis, status')
    .eq('kind', 'work_order')
    .gte('issue_date', fromIso)

  for (const order of orders ?? []) {
    if (order.status === 'cancelled') continue
    const { data: kids } = await sb
      .from('finance_documents')
      .select('amount_nis, status, kind')
      .eq('parent_id', order.id)
    let paid = 0
    for (const k of kids ?? []) {
      if (k.status === 'cancelled') continue
      const amt = num(k.amount_nis)
      paid += k.kind === 'credit_note' ? -amt : amt
    }
    const total = num(order.amount_nis)
    let status: 'open' | 'partial' | 'paid' = 'open'
    if (paid <= 0) status = 'open'
    else if (paid + 0.009 >= total) status = 'paid'
    else status = 'partial'
    await sb.from('finance_documents').update({ status }).eq('id', order.id)
  }

  return result
}
