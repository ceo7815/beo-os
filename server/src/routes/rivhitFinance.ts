import type { FastifyInstance, FastifyRequest } from 'fastify'
import { env } from '../config/env.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import {
  getServiceSupabase,
  getUserSupabase,
  readBearerFromRequest,
} from '../lib/supabaseAdmin.js'
import {
  resolveRivhitDocumentTypes,
  rivhitConfigured,
  rivhitCustomerNew,
  rivhitDocumentCancel,
  rivhitDocumentNew,
  rivhitDocumentPage,
  rivhitDocumentTypeList,
  RivhitError,
  clientToRivhitCustomerInput,
  toRivhitDate,
  type RivhitDocLine,
  type RivhitPayment,
} from '../lib/rivhitClient.js'
import { syncRivhitIntoBeo } from '../lib/rivhitSync.js'

function dbForRequest(req: FastifyRequest) {
  const token = readBearerFromRequest(req.headers.authorization)
  const userSb = token ? getUserSupabase(token) : null
  const sb = userSb ?? getServiceSupabase()
  if (!sb) {
    const err = new Error(
      'חסר חיבור סופאבייס — התחברו מחדש או הוסיפו SUPABASE_SERVICE_ROLE_KEY',
    )
    ;(err as { statusCode?: number }).statusCode = 503
    throw err
  }
  return sb
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : 0
}

function sumLines(lines: RivhitDocLine[]): number {
  return Math.round(lines.reduce((s, l) => s + l.quantity * l.price_nis, 0) * 100) / 100
}

const VAT_RATE = 0.18

function vatSplit(totalLines: number, priceIncludeVat: boolean, discountValue = 0) {
  const afterDiscount = Math.max(0, totalLines - discountValue)
  if (priceIncludeVat) {
    const before = Math.round((afterDiscount / (1 + VAT_RATE)) * 100) / 100
    const vat = Math.round((afterDiscount - before) * 100) / 100
    return { before, vat, total: afterDiscount }
  }
  const before = afterDiscount
  const vat = Math.round(before * VAT_RATE * 100) / 100
  return { before, vat, total: Math.round((before + vat) * 100) / 100 }
}

function parseLines(rawLines: unknown[], fallbackTitle: string): RivhitDocLine[] {
  return rawLines.map((row) => {
    const r = row as Record<string, unknown>
    return {
      description: String(r.description ?? fallbackTitle).slice(0, 200),
      quantity: Math.max(0.01, num(r.quantity) || 1),
      price_nis: num(r.priceNis ?? r.price_nis),
      catalog_number: r.catalogNumber
        ? String(r.catalogNumber)
        : r.catalog_number
          ? String(r.catalog_number)
          : undefined,
      exempt_vat: r.exemptVat === true || r.exempt_vat === true,
    }
  })
}

function parsePayments(raw: unknown, fallbackAmount: number): RivhitPayment[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [
      {
        payment_type: 2,
        amount_nis: fallbackAmount,
        description: 'תשלום',
      },
    ]
  }
  return raw.map((row) => {
    const r = row as Record<string, unknown>
    return {
      payment_type: Math.max(1, Math.floor(num(r.paymentType ?? r.payment_type) || 2)),
      amount_nis: num(r.amountNis ?? r.amount_nis) || fallbackAmount,
      due_date: r.dueDate ? String(r.dueDate) : r.due_date ? String(r.due_date) : undefined,
      description: r.description ? String(r.description).slice(0, 100) : undefined,
      bank_code: r.bankCode != null ? num(r.bankCode) : undefined,
      branch_number: r.branchNumber != null ? num(r.branchNumber) : undefined,
      bank_account_number: r.bankAccountNumber
        ? String(r.bankAccountNumber)
        : undefined,
      check_number: r.checkNumber != null ? num(r.checkNumber) : undefined,
      number_of_payments:
        r.numberOfPayments != null ? Math.floor(num(r.numberOfPayments)) : undefined,
    }
  })
}

async function refreshWorkOrderStatus(req: FastifyRequest, workOrderId: string): Promise<void> {
  const sb = dbForRequest(req)
  const { data: receipts } = await sb
    .from('finance_documents')
    .select('amount_nis, status, kind')
    .eq('parent_id', workOrderId)
    .in('kind', ['tax_receipt', 'credit_note'])

  const { data: order } = await sb
    .from('finance_documents')
    .select('amount_nis, status')
    .eq('id', workOrderId)
    .single()
  if (!order || order.status === 'cancelled') return

  let paid = 0
  for (const r of receipts ?? []) {
    if (r.status === 'cancelled') continue
    const amt = num(r.amount_nis)
    if (r.kind === 'credit_note') paid -= amt
    else paid += amt
  }
  paid = Math.round(paid * 100) / 100
  const total = num(order.amount_nis)
  let status: 'open' | 'partial' | 'paid' = 'open'
  if (paid <= 0) status = 'open'
  else if (paid + 0.009 >= total) status = 'paid'
  else status = 'partial'

  await sb.from('finance_documents').update({ status }).eq('id', workOrderId)
}

export async function registerRivhitFinanceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/rivhit/status', async (req, reply) => {
    await requireAdmin(req, reply)
    if (reply.sent) return
    let types: Awaited<ReturnType<typeof resolveRivhitDocumentTypes>> | null = null
    let typeError: string | null = null
    if (rivhitConfigured()) {
      try {
        types = await resolveRivhitDocumentTypes()
      } catch (e) {
        typeError = e instanceof Error ? e.message : String(e)
      }
    }
    reply.send({
      ok: true,
      configured: rivhitConfigured(),
      supabaseServiceRole: Boolean(getServiceSupabase()),
      supabaseUserDb: Boolean(env.supabaseUrl && env.supabaseAnonKey),
      types: types
        ? {
            workOrder: types.workOrder,
            taxReceipt: types.taxReceipt,
            creditNote: types.creditNote,
            catalog: types.raw.map((t) => ({
              id: t.document_type,
              name: t.document_name,
              isInvoiceReceipt: Boolean(t.is_invoice_receipt),
            })),
          }
        : null,
      typeError,
      paymentTypes: PAYMENT_TYPES,
    })
  })

  app.get('/api/rivhit/document-types', async (req, reply) => {
    await requireAdmin(req, reply)
    if (reply.sent) return
    try {
      const list = await rivhitDocumentTypeList()
      reply.send({ ok: true, items: list })
    } catch (e) {
      if (e instanceof RivhitError) {
        reply
          .code(400)
          .send({ ok: false, error: 'rivhit_error', message: e.message, code: e.errorCode })
        return
      }
      throw e
    }
  })

  /** תצוגה מקדימה — דף המסמך האמיתי בריווחית (Document.Page → page_url) */
  app.post('/api/rivhit/document-preview', async (req, reply) => {
    await requireAdmin(req, reply)
    if (reply.sent) return
    if (!rivhitConfigured()) {
      reply.code(503).send({ ok: false, error: 'rivhit_not_configured' })
      return
    }
    const body = (req.body ?? {}) as Record<string, unknown>
    const kind = String(body.kind ?? 'work_order')
    const clientId = String(body.clientId ?? '').trim()
    const rawLines = Array.isArray(body.lines) ? body.lines : []
    if (!clientId || rawLines.length === 0) {
      reply.code(400).send({
        ok: false,
        error: 'validation',
        message: 'חובה: clientId + lines[] לתצוגה מקדימה',
      })
      return
    }

    const sb = dbForRequest(req)
    const { data: client } = await sb.from('clients').select('*').eq('id', clientId).maybeSingle()
    if (!client) {
      reply.code(404).send({ ok: false, error: 'not_found', message: 'לקוח לא נמצא' })
      return
    }

    try {
      let rivhitCustomerId = client.rivhit_customer_id as number | null
      if (!rivhitCustomerId) {
        const created = await rivhitCustomerNew(clientToRivhitCustomerInput(client, clientId))
        rivhitCustomerId = created.customer_id
        await sb.from('clients').update({ rivhit_customer_id: rivhitCustomerId }).eq('id', clientId)
      }

      const types = await resolveRivhitDocumentTypes()
      const documentType = kind === 'tax_receipt' ? types.taxReceipt : types.workOrder
      const priceIncludeVat = body.priceIncludeVat === true
      const items = rawLines.map((row) => {
        const r = row as Record<string, unknown>
        return {
          description: String(r.description ?? '').slice(0, 200),
          quantity: Math.max(0.01, num(r.quantity) || 1),
          price: num(r.priceNis ?? r.price_nis ?? r.price),
          catalog_number: r.catalogNumber
            ? String(r.catalogNumber)
            : r.catalog_number
              ? String(r.catalog_number)
              : undefined,
        }
      })
      if (items.some((i) => !i.description || i.price <= 0)) {
        reply.code(400).send({
          ok: false,
          error: 'validation',
          message: 'כל שורה חייבת תיאור ומחיר > 0',
        })
        return
      }

      const payments = Array.isArray(body.payments)
        ? body.payments.map((row) => {
            const r = row as Record<string, unknown>
            return {
              payment_type: Math.max(1, Math.floor(num(r.paymentType ?? r.payment_type) || 2)),
              amount: num(r.amountNis ?? r.amount_nis ?? r.amount),
              due_date: r.dueDate
                ? toRivhitDate(String(r.dueDate))
                : r.due_date
                  ? toRivhitDate(String(r.due_date))
                  : undefined,
              description: r.description ? String(r.description) : undefined,
            }
          })
        : undefined

      const page = await rivhitDocumentPage({
        document_type: documentType,
        customer_id: rivhitCustomerId,
        last_name: String(body.lastName ?? client.name ?? '').slice(0, 30) || undefined,
        first_name: String(body.firstName ?? client.contact ?? '').slice(0, 20) || undefined,
        address: String(body.address ?? client.address_line ?? '').slice(0, 30) || undefined,
        city: String(body.city ?? client.city ?? '').slice(0, 20) || undefined,
        zipcode:
          body.zipcode && /^\d+$/.test(String(body.zipcode))
            ? Number(body.zipcode)
            : client.zipcode && /^\d+$/.test(String(client.zipcode))
              ? Number(client.zipcode)
              : undefined,
        phone: String(body.phone ?? client.phone ?? '').slice(0, 15) || undefined,
        comments: body.notes ? String(body.notes).trim() || undefined : undefined,
        order: body.orderRef ? String(body.orderRef) : undefined,
        due_date: body.dueDate ? toRivhitDate(String(body.dueDate)) : undefined,
        price_include_vat: priceIncludeVat,
        discount_value: Math.max(0, num(body.discountValue)),
        email_to: client.email ? String(client.email) : undefined,
        items,
        payments: kind === 'tax_receipt' ? payments : undefined,
      })

      reply.send({
        ok: true,
        pageUrl: page.page_url,
        documentType,
        rivhitCustomerId,
      })
    } catch (e) {
      if (e instanceof RivhitError) {
        reply
          .code(400)
          .send({ ok: false, error: 'rivhit_error', message: e.message, code: e.errorCode })
        return
      }
      throw e
    }
  })

  /** סנכרון מריווחית → Beo OS (לקוחות + הזמנות + חשבוניות מס קבלה) */
  app.post('/api/rivhit/sync', async (req, reply) => {
    await requireAdmin(req, reply)
    if (reply.sent) return
    if (!rivhitConfigured()) {
      reply.code(503).send({ ok: false, error: 'rivhit_not_configured' })
      return
    }
    const body = (req.body ?? {}) as Record<string, unknown>
    const fromDate = '15/08/2026'
    const toDate = body.toDate ? String(body.toDate) : toRivhitDate(new Date())
    try {
      const sb = dbForRequest(req)
      const result = await syncRivhitIntoBeo(sb, { fromDate, toDate })
      reply.send({ ok: true, result })
    } catch (e) {
      if (e instanceof RivhitError) {
        reply
          .code(400)
          .send({ ok: false, error: 'rivhit_error', message: e.message, code: e.errorCode })
        return
      }
      const msg = e instanceof Error ? e.message : String(e)
      reply.code(500).send({ ok: false, error: 'sync_failed', message: msg })
    }
  })

  app.get('/api/finance/documents', async (req, reply) => {
    await requireAdmin(req, reply)
    if (reply.sent) return
    const q = req.query as Record<string, unknown>
    const sb = dbForRequest(req)
    let query = sb
      .from('finance_documents')
      .select('*, clients(id, name, rivhit_customer_id, phone, email, address_line, city, tax_id, contact)')
      .order('created_at', { ascending: false })
      .limit(300)
    if (typeof q.clientId === 'string' && q.clientId) query = query.eq('client_id', q.clientId)
    if (typeof q.kind === 'string' && q.kind) query = query.eq('kind', q.kind)
    if (typeof q.parentId === 'string' && q.parentId) query = query.eq('parent_id', q.parentId)
    if (q.openOnly === '1' || q.openOnly === 'true') {
      query = query.in('status', ['open', 'partial']).eq('kind', 'work_order')
    }
    const { data, error } = await query
    if (error) {
      reply.code(500).send({ ok: false, error: 'db_error', message: error.message })
      return
    }
    reply.send({ ok: true, items: data ?? [] })
  })

  app.get('/api/finance/documents/:id', async (req, reply) => {
    await requireAdmin(req, reply)
    if (reply.sent) return
    const id = String((req.params as { id?: string }).id ?? '')
    const sb = dbForRequest(req)
    const { data, error } = await sb
      .from('finance_documents')
      .select(
        '*, clients(id, name, rivhit_customer_id, phone, email, address_line, city, tax_id, contact)',
      )
      .eq('id', id)
      .maybeSingle()
    if (error) {
      reply.code(500).send({ ok: false, error: 'db_error', message: error.message })
      return
    }
    if (!data) {
      reply.code(404).send({ ok: false, error: 'not_found' })
      return
    }
    const { data: children } = await sb
      .from('finance_documents')
      .select('*')
      .eq('parent_id', id)
      .order('created_at', { ascending: true })
    reply.send({ ok: true, document: data, children: children ?? [] })
  })

  app.post('/api/rivhit/customers/ensure', async (req, reply) => {
    await requireAdmin(req, reply)
    if (reply.sent) return
    const body = (req.body ?? {}) as Record<string, unknown>
    const clientId = String(body.clientId ?? '').trim()
    if (!clientId) {
      reply.code(400).send({ ok: false, error: 'validation', message: 'clientId חובה' })
      return
    }
    const sb = dbForRequest(req)
    const { data: client, error } = await sb.from('clients').select('*').eq('id', clientId).maybeSingle()
    if (error || !client) {
      reply.code(404).send({ ok: false, error: 'not_found', message: 'לקוח לא נמצא' })
      return
    }
    if (client.rivhit_customer_id) {
      reply.send({
        ok: true,
        created: false,
        rivhitCustomerId: client.rivhit_customer_id,
        clientId,
      })
      return
    }
    try {
      const created = await rivhitCustomerNew(clientToRivhitCustomerInput(client, clientId))
      await sb.from('clients').update({ rivhit_customer_id: created.customer_id }).eq('id', clientId)
      reply.code(201).send({
        ok: true,
        created: true,
        rivhitCustomerId: created.customer_id,
        clientId,
      })
    } catch (e) {
      if (e instanceof RivhitError) {
        reply
          .code(400)
          .send({ ok: false, error: 'rivhit_error', message: e.message, code: e.errorCode })
        return
      }
      throw e
    }
  })

  app.post('/api/rivhit/work-orders', async (req, reply) => {
    await requireAdmin(req, reply)
    if (reply.sent) return
    const body = (req.body ?? {}) as Record<string, unknown>
    const clientId = String(body.clientId ?? '').trim()
    const rawLines = Array.isArray(body.lines) ? body.lines : []
    if (!clientId || rawLines.length === 0) {
      reply.code(400).send({
        ok: false,
        error: 'validation',
        message: 'חובה: clientId + lines[]',
      })
      return
    }
    const lines = parseLines(rawLines, 'פריט')
    if (lines.some((l) => !l.description.trim() || l.price_nis <= 0)) {
      reply.code(400).send({
        ok: false,
        error: 'validation',
        message: 'כל שורה חייבת תיאור ומחיר > 0',
      })
      return
    }

    const priceIncludeVat = body.priceIncludeVat === true
    const discountValue = Math.max(0, num(body.discountValue ?? body.discount_value))
    const discountType = Math.floor(num(body.discountType ?? body.discount_type) || 0)
    const dueDate = body.dueDate ? String(body.dueDate) : body.due_date ? String(body.due_date) : undefined
    const issueDate = body.issueDate
      ? String(body.issueDate)
      : body.issue_date
        ? String(body.issue_date)
        : undefined
    // הערות רק אם המשתמש מילא — לא מעתיקים תיאור פריט / כותרת להערות
    const notes = String(body.notes ?? '').trim() || null
    const title =
      String(body.title ?? '').trim() ||
      lines[0]?.description?.trim() ||
      'הזמנת עבודה'
    const orderRef = body.orderRef ? String(body.orderRef) : body.order ? String(body.order) : undefined
    const reference = body.reference != null ? String(body.reference) : undefined

    const sb = dbForRequest(req)
    const { data: client } = await sb.from('clients').select('*').eq('id', clientId).maybeSingle()
    if (!client) {
      reply.code(404).send({ ok: false, error: 'not_found', message: 'לקוח לא נמצא' })
      return
    }

    try {
      let rivhitCustomerId = client.rivhit_customer_id as number | null
      if (!rivhitCustomerId) {
        const created = await rivhitCustomerNew(clientToRivhitCustomerInput(client, clientId))
        rivhitCustomerId = created.customer_id
        await sb.from('clients').update({ rivhit_customer_id: rivhitCustomerId }).eq('id', clientId)
      }

      const types = await resolveRivhitDocumentTypes()
      const lineTotal = sumLines(lines)
      const split = vatSplit(lineTotal, priceIncludeVat, discountValue)
      const issued = await rivhitDocumentNew({
        document_type: types.workOrder,
        customer_id: rivhitCustomerId,
        items: lines,
        ...(notes ? { comments: notes } : {}),
        create_items: true,
        send_mail: body.sendMail === true,
        price_include_vat: priceIncludeVat,
        due_date: dueDate,
        issue_date: issueDate,
        order: orderRef,
        reference: reference && /^\d+$/.test(reference) ? Number(reference) : undefined,
        discount_type: discountType || undefined,
        discount_value: discountValue || undefined,
        language: body.language ? String(body.language) : 'he',
        last_name: String(body.lastName ?? client.name ?? '').slice(0, 30) || undefined,
        first_name:
          String(body.firstName ?? client.contact ?? '').slice(0, 20) || undefined,
        address: String(body.address ?? client.address_line ?? '').slice(0, 30) || undefined,
        city: String(body.city ?? client.city ?? '').slice(0, 20) || undefined,
        zipcode:
          body.zipcode && /^\d+$/.test(String(body.zipcode))
            ? Number(body.zipcode)
            : undefined,
        phone: String(body.phone ?? client.phone ?? '').slice(0, 15) || undefined,
        email_to: body.sendMail === true && client.email ? String(client.email) : undefined,
      })

      const { data: row, error } = await sb
        .from('finance_documents')
        .insert({
          kind: 'work_order',
          client_id: clientId,
          project_id: body.projectId ? String(body.projectId) : null,
          rivhit_customer_id: rivhitCustomerId,
          rivhit_document_type: issued.document_type,
          rivhit_document_number: issued.document_number,
          rivhit_document_identity: issued.document_identity ?? null,
          rivhit_document_link: issued.document_link ?? null,
          title,
          amount_nis: split.total,
          amount_before_vat: split.before,
          vat_amount: split.vat,
          status: 'open',
          lines,
          payments: [],
          notes,
          due_date: dueDate ?? null,
          issue_date: issueDate ?? null,
          reference_text: reference ?? null,
          order_ref: orderRef ?? null,
          discount_type: discountType,
          discount_value: discountValue,
          price_include_vat: priceIncludeVat,
          language: body.language ? String(body.language) : 'he',
          send_mail: body.sendMail === true,
          customer_snapshot: {
            name: client.name,
            contact: client.contact,
            phone: client.phone,
            email: client.email,
            address: client.address_line,
            city: client.city,
            taxId: client.tax_id,
          },
          created_by: req.authUser?.uid ?? null,
        })
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      reply.code(201).send({ ok: true, document: row, rivhit: issued })
    } catch (e) {
      if (e instanceof RivhitError) {
        reply
          .code(400)
          .send({ ok: false, error: 'rivhit_error', message: e.message, code: e.errorCode })
        return
      }
      throw e
    }
  })

  app.post('/api/rivhit/tax-receipts', async (req, reply) => {
    await requireAdmin(req, reply)
    if (reply.sent) return
    const body = (req.body ?? {}) as Record<string, unknown>
    const workOrderId = String(body.workOrderId ?? '').trim()
    const rawLines = Array.isArray(body.lines) ? body.lines : null
    const amountNis = num(body.amountNis ?? body.amount)
    if (!workOrderId) {
      reply.code(400).send({ ok: false, error: 'validation', message: 'חובה: workOrderId' })
      return
    }

    const sb = dbForRequest(req)
    const { data: order } = await sb
      .from('finance_documents')
      .select('*')
      .eq('id', workOrderId)
      .eq('kind', 'work_order')
      .maybeSingle()
    if (!order || order.status === 'cancelled') {
      reply.code(404).send({ ok: false, error: 'not_found', message: 'הזמנת עבודה לא נמצאה' })
      return
    }
    if (!order.rivhit_customer_id || !order.rivhit_document_type || !order.rivhit_document_number) {
      reply.code(400).send({ ok: false, error: 'validation', message: 'להזמנה חסר קישור ריווחית' })
      return
    }

    const { data: kids } = await sb
      .from('finance_documents')
      .select('amount_nis, status, kind')
      .eq('parent_id', workOrderId)
    let paid = 0
    for (const r of kids ?? []) {
      if (r.status === 'cancelled') continue
      const amt = num(r.amount_nis)
      paid += r.kind === 'credit_note' ? -amt : amt
    }
    const open = Math.round((num(order.amount_nis) - paid) * 100) / 100

    const priceIncludeVat =
      body.priceIncludeVat === true || order.price_include_vat === true
    const lines: RivhitDocLine[] = rawLines?.length
      ? parseLines(rawLines, String(order.title))
      : [
          {
            description: String(body.description ?? order.title ?? 'תשלום על הזמנת עבודה').slice(
              0,
              200,
            ),
            quantity: 1,
            price_nis: amountNis,
          },
        ]
    if (lines.some((l) => l.price_nis <= 0)) {
      reply.code(400).send({ ok: false, error: 'validation', message: 'סכום/שורות חייבים להיות > 0' })
      return
    }

    const lineTotal = sumLines(lines)
    const discountValue = Math.max(0, num(body.discountValue ?? body.discount_value))
    const split = vatSplit(lineTotal, priceIncludeVat, discountValue)
    const chargeAmount = split.total

    if (chargeAmount - open > 0.05) {
      reply.code(400).send({
        ok: false,
        error: 'validation',
        message: `סכום גבוה מהיתרה הפתוחה (${open} ₪)`,
        openBalance: open,
      })
      return
    }

    const payments = parsePayments(body.payments, chargeAmount)
    const paySum = Math.round(payments.reduce((s, p) => s + p.amount_nis, 0) * 100) / 100
    if (Math.abs(paySum - chargeAmount) > 0.05) {
      reply.code(400).send({
        ok: false,
        error: 'validation',
        message: `סכום התשלומים (${paySum}) חייב להתאים לסכום המסמך (${chargeAmount})`,
      })
      return
    }

    const dueDate = body.dueDate ? String(body.dueDate) : body.due_date ? String(body.due_date) : undefined
    const issueDate = body.issueDate
      ? String(body.issueDate)
      : body.issue_date
        ? String(body.issue_date)
        : undefined
    const notes = String(body.notes ?? '').trim() || null

    try {
      const types = await resolveRivhitDocumentTypes()
      const issued = await rivhitDocumentNew({
        document_type: types.taxReceipt,
        customer_id: order.rivhit_customer_id,
        items: lines,
        payments,
        ...(notes ? { comments: notes } : {}),
        closed_document_type: order.rivhit_document_type,
        closed_document_number: order.rivhit_document_number,
        send_mail: body.sendMail === true,
        create_items: true,
        price_include_vat: priceIncludeVat,
        due_date: dueDate,
        issue_date: issueDate,
        order: body.orderRef ? String(body.orderRef) : String(order.rivhit_document_number),
        language: body.language ? String(body.language) : 'he',
        discount_type: Math.floor(num(body.discountType)) || undefined,
        discount_value: discountValue || undefined,
      })

      const { data: row, error } = await sb
        .from('finance_documents')
        .insert({
          kind: 'tax_receipt',
          client_id: order.client_id,
          parent_id: workOrderId,
          project_id: order.project_id,
          rivhit_customer_id: order.rivhit_customer_id,
          rivhit_document_type: issued.document_type,
          rivhit_document_number: issued.document_number,
          rivhit_document_identity: issued.document_identity ?? null,
          rivhit_document_link: issued.document_link ?? null,
          title: `חשבונית מס קבלה — ${chargeAmount} ₪`,
          amount_nis: chargeAmount,
          amount_before_vat: split.before,
          vat_amount: split.vat,
          status: 'paid',
          lines,
          payments,
          notes,
          due_date: dueDate ?? null,
          issue_date: issueDate ?? null,
          reference_text: body.reference != null ? String(body.reference) : null,
          order_ref: body.orderRef
            ? String(body.orderRef)
            : String(order.rivhit_document_number),
          discount_type: Math.floor(num(body.discountType)) || 0,
          discount_value: discountValue,
          price_include_vat: priceIncludeVat,
          language: body.language ? String(body.language) : 'he',
          send_mail: body.sendMail === true,
          customer_snapshot: order.customer_snapshot ?? {},
          created_by: req.authUser?.uid ?? null,
        })
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      await refreshWorkOrderStatus(req, workOrderId)
      reply.code(201).send({ ok: true, document: row, rivhit: issued, openBalanceBefore: open })
    } catch (e) {
      if (e instanceof RivhitError) {
        reply
          .code(400)
          .send({ ok: false, error: 'rivhit_error', message: e.message, code: e.errorCode })
        return
      }
      throw e
    }
  })

  app.post('/api/rivhit/documents/:id/cancel', async (req, reply) => {
    await requireAdmin(req, reply)
    if (reply.sent) return
    const id = String((req.params as { id?: string }).id ?? '')
    const body = (req.body ?? {}) as Record<string, unknown>
    const sb = dbForRequest(req)
    const { data: doc } = await sb.from('finance_documents').select('*').eq('id', id).maybeSingle()
    if (!doc) {
      reply.code(404).send({ ok: false, error: 'not_found', message: 'מסמך לא נמצא' })
      return
    }
    if (doc.status === 'cancelled') {
      reply.send({ ok: true, alreadyCancelled: true, document: doc })
      return
    }
    if (!doc.rivhit_document_type || !doc.rivhit_document_number) {
      reply.code(400).send({ ok: false, error: 'validation', message: 'אין מזהה ריווחית לביטול' })
      return
    }

    try {
      const cancelled = await rivhitDocumentCancel({
        document_type: doc.rivhit_document_type,
        document_number: doc.rivhit_document_number,
        comments: String(body.comments ?? 'בוטל מ-Beo OS'),
      })

      await sb
        .from('finance_documents')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', id)

      let creditRow = null
      if (doc.kind === 'tax_receipt' && cancelled.cancel_document_number) {
        const { data: credit } = await sb
          .from('finance_documents')
          .insert({
            kind: 'credit_note',
            client_id: doc.client_id,
            parent_id: doc.parent_id ?? doc.id,
            project_id: doc.project_id,
            rivhit_customer_id: doc.rivhit_customer_id,
            rivhit_document_type: cancelled.cancel_document_type,
            rivhit_document_number: cancelled.cancel_document_number,
            rivhit_document_identity: cancelled.cancel_document_identity ?? null,
            rivhit_document_link: cancelled.cancel_document_link ?? null,
            title: `זיכוי לחשבונית #${doc.rivhit_document_number}`,
            amount_nis: doc.amount_nis,
            status: 'cancelled',
            cancel_of_id: doc.id,
            created_by: req.authUser?.uid ?? null,
            cancelled_at: new Date().toISOString(),
          })
          .select('*')
          .single()
        creditRow = credit
      }

      if (doc.kind === 'tax_receipt' && doc.parent_id) {
        await refreshWorkOrderStatus(req, doc.parent_id)
      }

      reply.send({
        ok: true,
        documentId: id,
        rivhit: cancelled,
        creditNote: creditRow,
      })
    } catch (e) {
      if (e instanceof RivhitError) {
        reply
          .code(400)
          .send({ ok: false, error: 'rivhit_error', message: e.message, code: e.errorCode })
        return
      }
      throw e
    }
  })
}

/** סוגי תשלום נפוצים בריווחית */
export const PAYMENT_TYPES = [
  { id: 1, label: 'מזומן' },
  { id: 2, label: 'שיק' },
  { id: 3, label: 'אשראי' },
  { id: 4, label: 'העברה בנקאית' },
  { id: 5, label: 'תשלום אחר' },
  { id: 10, label: 'ביט' },
  { id: 11, label: 'פייבוקס' },
] as const
