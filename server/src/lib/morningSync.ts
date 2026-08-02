import type { Firestore } from 'firebase-admin/firestore'
import { env } from '../config/env.js'
import { getAdminDb } from './firebaseAdmin.js'
import { MorningClient } from './morningClient.js'
import {
  loadMorningCredentials,
  writeSyncState,
} from './morningCredentials.js'
import {
  INCOME_DOC_TYPES,
  mapMorningDocument,
  type MappedIncome,
} from './documentMapper.js'
import { mapMorningClient, type MappedClient } from './clientMapper.js'

const INCOMES_COLLECTION = 'financeIncomes'
const CLIENTS_COLLECTION = 'clients'
const GI_DOC_PREFIX = 'gi_'

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

function normalizeTaxId(raw: string): string {
  return raw.replace(/\D/g, '')
}

function normalizeName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

type ClientIndex = {
  byGreenInvoiceId: Map<string, string>
  byTaxId: Map<string, string>
  byEmail: Map<string, string>
  byName: Map<string, string>
}

/** טוען את כל הלקוחות ובונה אינדקס להתאמה לפי מזהה GI / ח.פ / אימייל / שם */
async function buildClientIndex(db: Firestore): Promise<ClientIndex> {
  const snap = await db.collection(CLIENTS_COLLECTION).get()
  const byGreenInvoiceId = new Map<string, string>()
  const byTaxId = new Map<string, string>()
  const byEmail = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const doc of snap.docs) {
    const d = doc.data()
    const giId = String(d.greenInvoiceId ?? '').trim()
    if (giId) byGreenInvoiceId.set(giId, doc.id)
    const taxId = normalizeTaxId(
      String(d.taxId ?? d.companyId ?? d.businessId ?? d.vatId ?? ''),
    )
    if (taxId) byTaxId.set(taxId, doc.id)
    const email = String(d.email ?? '').trim().toLowerCase()
    if (email) byEmail.set(email, doc.id)
    const name = normalizeName(String(d.name ?? d.companyName ?? ''))
    if (name) byName.set(name, doc.id)
  }
  return { byGreenInvoiceId, byTaxId, byEmail, byName }
}

function matchClient(index: ClientIndex, m: MappedIncome): string {
  const giId = m.clientGreenInvoiceId.trim()
  if (giId && index.byGreenInvoiceId.has(giId)) {
    return index.byGreenInvoiceId.get(giId)!
  }
  const taxId = normalizeTaxId(m.clientTaxId)
  if (taxId && index.byTaxId.has(taxId)) return index.byTaxId.get(taxId)!
  const email = m.clientEmail.trim().toLowerCase()
  if (email && index.byEmail.has(email)) return index.byEmail.get(email)!
  const name = normalizeName(m.clientName)
  if (name && index.byName.has(name)) return index.byName.get(name)!
  return ''
}

export type ClientSyncResult = {
  ok: true
  fetched: number
  created: number
  updated: number
  active: number
  inactive: number
  durationMs: number
}

export type MorningSyncPayload = {
  ok: true
  mode: 'client_write'
  fromDate: string
  toDate: string
  clients: MappedClient[]
  incomes: MappedIncome[]
}

export type MorningClientsPayload = {
  ok: true
  mode: 'client_write'
  clients: MappedClient[]
}

/**
 * משיכת לקוחות מחשבונית ירוקה בלבד — בלי כתיבה ל-Firestore.
 * השמירה מתבצעת בדפדפן עם המשתמש המחובר (לא Admin SDK).
 */
export async function fetchMorningClients(): Promise<MappedClient[]> {
  const creds = await loadMorningCredentials()
  if (!creds) throw new Error('Morning credentials not configured')

  const client = new MorningClient(creds)
  const [activeRaw, inactiveRaw] = await Promise.all([
    client.searchAllClients(true),
    client.searchAllClients(false),
  ])

  const byId = new Map<string, MappedClient>()
  for (const raw of [...activeRaw, ...inactiveRaw]) {
    const m = mapMorningClient(raw)
    if (m) byId.set(m.greenInvoiceId, m)
  }
  return [...byId.values()]
}

/**
 * משיכת לקוחות + הכנסות מחשבונית ירוקה — בלי כתיבה ל-Firestore.
 */
export async function fetchMorningSyncPayload(options?: {
  fromDate?: string
}): Promise<MorningSyncPayload> {
  const creds = await loadMorningCredentials()
  if (!creds) throw new Error('Morning credentials not configured')

  const api = new MorningClient(creds)
  const [activeRaw, inactiveRaw] = await Promise.all([
    api.searchAllClients(true),
    api.searchAllClients(false),
  ])
  const byId = new Map<string, MappedClient>()
  for (const raw of [...activeRaw, ...inactiveRaw]) {
    const m = mapMorningClient(raw)
    if (m) byId.set(m.greenInvoiceId, m)
  }
  const clients = [...byId.values()]

  const fromDate = (options?.fromDate ?? env.sync.fromDate).slice(0, 10)
  const toDate = todayYmd()
  const docs = await api.searchAllDocuments({
    fromDate,
    toDate,
    types: INCOME_DOC_TYPES,
    pageSize: 100,
  })
  const incomes: MappedIncome[] = []
  for (const raw of docs) {
    const m = mapMorningDocument(raw)
    if (m) incomes.push(m)
  }

  return {
    ok: true,
    mode: 'client_write',
    fromDate,
    toDate,
    clients,
    incomes,
  }
}

/**
 * סנכרון כל הלקוחות מחשבונית ירוקה ל-Firestore.
 * - מושך פעילים + לא פעילים.
 * - מתאים ללקוח קיים לפי מזהה GI / ח.פ / אימייל / שם (לא יוצר כפילות).
 * - על לקוח קיים: מעדכן רק שדות מ-GI שאינם ריקים + סטטוס, ושומר שדות Hub (סוכן, עובדים, מחלקה).
 * - לקוח חדש: נוצר עם מזהה gi_<id>.
 */
export async function syncClients(): Promise<ClientSyncResult> {
  const startedAt = Date.now()
  const db = getAdminDb()
  if (!db) throw new Error('Firebase Admin not configured')

  const creds = await loadMorningCredentials()
  if (!creds) throw new Error('Morning credentials not configured')

  const client = new MorningClient(creds)
  const [activeRaw, inactiveRaw] = await Promise.all([
    client.searchAllClients(true),
    client.searchAllClients(false),
  ])

  // מיזוג ייחודי לפי מזהה GI (אם פילוח active לא נתמך והוחזר הכל פעמיים)
  const byId = new Map<string, MappedClient>()
  for (const raw of [...activeRaw, ...inactiveRaw]) {
    const m = mapMorningClient(raw)
    if (m) byId.set(m.greenInvoiceId, m)
  }
  const mapped = [...byId.values()]

  const index = await buildClientIndex(db)
  const claimed = new Set<string>()

  let created = 0
  let updated = 0
  let active = 0
  let inactive = 0

  const list = mapped
  for (let i = 0; i < list.length; i += 400) {
    const slice = list.slice(i, i + 400)
    const batch = db.batch()
    for (const m of slice) {
      if (m.active) active += 1
      else inactive += 1

      // איתור לקוח קיים: מזהה GI → ח.פ → אימייל → שם
      const taxId = normalizeTaxId(m.taxId)
      const email = m.email.trim().toLowerCase()
      const name = normalizeName(m.name)
      let existingId =
        index.byGreenInvoiceId.get(m.greenInvoiceId) ??
        (taxId ? index.byTaxId.get(taxId) : undefined) ??
        (email ? index.byEmail.get(email) : undefined) ??
        (name ? index.byName.get(name) : undefined)

      // לא נדרוס לקוח קיים שכבר שויך ל-GI אחר בריצה זו
      if (existingId && claimed.has(existingId)) existingId = undefined

      if (existingId) {
        claimed.add(existingId)
        const patch: Record<string, unknown> = {
          greenInvoiceId: m.greenInvoiceId,
          status: m.active ? 'active' : 'inactive',
        }
        if (m.name) patch.name = m.name
        if (m.email) patch.email = m.email
        if (m.phone) patch.phone = m.phone
        if (m.contact) patch.contact = m.contact
        if (m.taxId) patch.taxId = m.taxId
        if (m.addressLine) patch.addressLine = m.addressLine
        if (m.city) patch.city = m.city
        batch.set(db.collection(CLIENTS_COLLECTION).doc(existingId), patch, {
          merge: true,
        })
        updated += 1
      } else {
        const ref = db
          .collection(CLIENTS_COLLECTION)
          .doc(GI_DOC_PREFIX + m.greenInvoiceId)
        claimed.add(ref.id)
        const row: Record<string, unknown> = {
          name: m.name,
          contact: m.contact,
          phone: m.phone,
          email: m.email,
          status: m.active ? 'active' : 'inactive',
          greenInvoiceId: m.greenInvoiceId,
          source: 'green_invoice',
          createdAt: new Date().toISOString(),
        }
        if (m.taxId) row.taxId = m.taxId
        if (m.addressLine) row.addressLine = m.addressLine
        if (m.city) row.city = m.city
        batch.set(ref, row, { merge: true })
        created += 1
      }
    }
    await batch.commit()
  }

  return {
    ok: true,
    fetched: mapped.length,
    created,
    updated,
    active,
    inactive,
    durationMs: Date.now() - startedAt,
  }
}

export type SyncResult = {
  ok: true
  fromDate: string
  toDate: string
  fetched: number
  imported: number
  updated: number
  removed: number
  unmatchedClients: number
  durationMs: number
  clients?: ClientSyncResult
}

/**
 * משיכת כל מסמכי ההכנסה מ-Morning והעלאתם ל-Firestore.
 * idempotent — מזהה המסמך ב-Firestore הוא gi_<greenInvoiceId>, כך שריצה חוזרת מעדכנת ולא משכפלת.
 * אם syncClientsFirst=true (ברירת מחדל) — מסנכרן קודם את כל הלקוחות, כדי שההכנסות יקושרו במלואן.
 */
export async function runMorningSync(options?: {
  fromDate?: string
  syncClientsFirst?: boolean
}): Promise<SyncResult> {
  const startedAt = Date.now()
  const db = getAdminDb()
  if (!db) throw new Error('Firebase Admin not configured')

  const creds = await loadMorningCredentials()
  if (!creds) throw new Error('Morning credentials not configured')

  // סנכרון לקוחות תחילה — חשבונית ירוקה מקור האמת גם ללקוחות
  let clientsResult: ClientSyncResult | undefined
  if (options?.syncClientsFirst !== false) {
    clientsResult = await syncClients()
  }

  const fromDate = (options?.fromDate ?? env.sync.fromDate).slice(0, 10)
  const toDate = todayYmd()

  const client = new MorningClient(creds)
  const docs = await client.searchAllDocuments({
    fromDate,
    toDate,
    types: INCOME_DOC_TYPES,
    pageSize: 100,
  })

  const clientIndex = await buildClientIndex(db)

  let imported = 0
  let updated = 0
  let removed = 0
  let unmatchedClients = 0

  // עיבוד באצוות של 400 (מגבלת writeBatch = 500)
  const mapped: MappedIncome[] = []
  for (const raw of docs) {
    const m = mapMorningDocument(raw)
    if (m) mapped.push(m)
  }

  for (let i = 0; i < mapped.length; i += 400) {
    const slice = mapped.slice(i, i + 400)
    const batch = db.batch()
    for (const m of slice) {
      const ref = db.collection(INCOMES_COLLECTION).doc(GI_DOC_PREFIX + m.greenInvoiceId)
      if (m.cancelled) {
        batch.delete(ref)
        removed += 1
        continue
      }
      const matchedClientId = matchClient(clientIndex, m)
      if (!matchedClientId) unmatchedClients += 1

      const row: Record<string, unknown> = {
        clientId: matchedClientId,
        amount: m.amount,
        amountIncludesVat: m.amountIncludesVat,
        documentKind: m.documentKind,
        invoiceNumber: m.invoiceNumber,
        invoiceDate: m.invoiceDate,
        status: m.status,
        source: m.source,
        greenInvoiceId: m.greenInvoiceId,
        greenInvoiceType: m.greenInvoiceType,
        greenInvoiceNumber: m.greenInvoiceNumber,
        greenInvoiceClientName: m.clientName,
        ...(m.greenInvoiceStatus !== undefined
          ? { greenInvoiceStatus: m.greenInvoiceStatus }
          : {}),
        syncedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }
      if (m.vatAmount !== undefined) row.vatAmount = m.vatAmount
      if (m.description) row.description = m.description
      if (m.status === 'paid') {
        row.paidAmount = m.amount
        row.paidDate = m.invoiceDate
        row.paymentMethod = 'bank_transfer'
      }
      // merge: שומר createdAt מקורי אם כבר קיים
      batch.set(ref, row, { merge: true })
      imported += 1
    }
    await batch.commit()
  }

  const result: SyncResult = {
    ok: true,
    fromDate,
    toDate,
    fetched: docs.length,
    imported,
    updated,
    removed,
    unmatchedClients,
    durationMs: Date.now() - startedAt,
    ...(clientsResult ? { clients: clientsResult } : {}),
  }

  await writeSyncState({
    lastSyncAt: new Date().toISOString(),
    lastFromDate: fromDate,
    lastToDate: toDate,
    lastFetched: docs.length,
    lastImported: imported,
    lastRemoved: removed,
    lastUnmatchedClients: unmatchedClients,
    ...(clientsResult
      ? {
          lastClientsFetched: clientsResult.fetched,
          lastClientsCreated: clientsResult.created,
          lastClientsUpdated: clientsResult.updated,
          lastClientsActive: clientsResult.active,
          lastClientsInactive: clientsResult.inactive,
        }
      : {}),
  })

  return result
}

/** מחיקת כל ההכנסות מהמערכת (איפוס לפני סנכרון מלא מ-Morning) */
export async function resetAllIncomes(): Promise<number> {
  const db = getAdminDb()
  if (!db) throw new Error('Firebase Admin not configured')

  const snap = await db.collection(INCOMES_COLLECTION).get()
  if (snap.empty) return 0
  const refs = snap.docs.map((d) => d.ref)
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch()
    for (const ref of refs.slice(i, i + 400)) batch.delete(ref)
    await batch.commit()
  }
  return refs.length
}
