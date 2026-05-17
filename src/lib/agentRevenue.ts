import {
  activeDealRevenueInMonth,
  earliestScheduledPaymentYm,
  normalizedScheduledPayments,
} from './dealSchedule'
import { buildAgentWorkspaceData } from './agentWorkspaceData'
import type { AgentCommissionPayment, Client, Deal, Invoice, Lead } from '../types'

/** כשאין שדה `agentCommissionPercent` בפרופיל המשתמש */
export const AGENT_COMMISSION_PERCENT_FALLBACK = 8

export function effectiveCommissionPercent(
  configured: number | undefined,
): number {
  if (
    typeof configured === 'number' &&
    Number.isFinite(configured) &&
    configured >= 0 &&
    configured <= 100
  ) {
    return configured
  }
  return AGENT_COMMISSION_PERCENT_FALLBACK
}

/** אחוז עמלה לחישוב על חשבונית: עדיפות לשדה על המסמך, אחרת אחוז הפרופיל (כבר מנורמל) */
export function commissionPercentForInvoice(
  inv: Invoice,
  agentProfilePercentResolved: number,
): number {
  if (
    typeof inv.agentCommissionPercent === 'number' &&
    Number.isFinite(inv.agentCommissionPercent) &&
    inv.agentCommissionPercent >= 0 &&
    inv.agentCommissionPercent <= 100
  ) {
    return inv.agentCommissionPercent
  }
  return agentProfilePercentResolved
}

/** תאריך יום לשיוך חשבונית ששולמה (לפי paidDate, אחרת createdAt) */
export function paidInvoiceYmd(inv: Invoice): string | null {
  if (inv.status !== 'paid') return null
  const pd = inv.paidDate?.trim().slice(0, 10)
  if (pd && /^\d{4}-\d{2}-\d{2}$/.test(pd)) return pd
  const c = inv.createdAt?.trim().slice(0, 10)
  if (c && /^\d{4}-\d{2}-\d{2}$/.test(c)) return c
  return null
}

export function ymFromYmd(ymd: string): string {
  return ymd.slice(0, 7)
}

/** עמלה מצטברת על תשלומים ששולמו — משקל לפי אחוז לכל חשבונית */
export function weightedCommissionOnPaidAllTimeForClients(
  invoices: Invoice[],
  clientIds: Set<string>,
  agentProfilePercentResolved: number,
): number {
  let s = 0
  for (const inv of invoices) {
    if (!clientIds.has(inv.clientId)) continue
    if (inv.status !== 'paid') continue
    if (!paidInvoiceYmd(inv)) continue
    const pct = commissionPercentForInvoice(inv, agentProfilePercentResolved)
    s += (inv.amount * pct) / 100
  }
  return Math.round(s * 100) / 100
}

/** עמלה משוערת לחודש: תשלומים ששולמו בחודש + ממתינים עם יעד בחודש — לפי אחוז לכל חשבונית */
export function weightedEstimatedCommissionForClientsInYm(
  invoices: Invoice[],
  clientIds: Set<string>,
  monthYm: string,
  agentProfilePercentResolved: number,
): number {
  let s = 0
  for (const inv of invoices) {
    if (!clientIds.has(inv.clientId)) continue
    const pct = commissionPercentForInvoice(inv, agentProfilePercentResolved)
    const paidYmd = paidInvoiceYmd(inv)
    if (paidYmd && ymFromYmd(paidYmd) === monthYm) {
      s += (inv.amount * pct) / 100
      continue
    }
    if (inv.status === 'pending' || inv.status === 'overdue') {
      const due = inv.dueDate?.trim().slice(0, 10)
      if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) continue
      if (ymFromYmd(due) !== monthYm) continue
      s += (inv.amount * pct) / 100
    }
  }
  return Math.round(s * 100) / 100
}

/** שישה חודשים אחרונים כולל החודש הנוכחי — מפתחות YYYY-MM */
export function lastSixMonthKeys(): string[] {
  const d = new Date()
  d.setDate(1)
  const y = d.getFullYear()
  const m0 = d.getMonth()
  const keys: string[] = []
  for (let back = 5; back >= 0; back--) {
    const mm = new Date(y, m0 - back, 1)
    const yy = mm.getFullYear()
    const mo = String(mm.getMonth() + 1).padStart(2, '0')
    keys.push(`${yy}-${mo}`)
  }
  return keys
}

export function monthShortLabelHe(ym: string): string {
  const [ys, ms] = ym.split('-')
  const m = Number(ms)
  const names = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ']
  if (!m || m < 1 || m > 12) return ym
  const y2 = ys?.slice(-2) ?? ''
  return `${names[m - 1]} ${y2}`
}

export function currentYm(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** סכום חשבוניות במצב pending/overdue שתאריך היעד שלהן בחודש נתון */
export function sumPendingDueInYmForClients(
  invoices: Invoice[],
  clientIds: Set<string>,
  monthYm: string,
): number {
  let s = 0
  for (const inv of invoices) {
    if (!clientIds.has(inv.clientId)) continue
    if (inv.status !== 'pending' && inv.status !== 'overdue') continue
    const due = inv.dueDate?.trim().slice(0, 10)
    if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) continue
    if (ymFromYmd(due) !== monthYm) continue
    s += inv.amount
  }
  return Math.round(s * 100) / 100
}

/** הערכת הכנסות לחודש: שולמו בחודש + צפוי לגבייה (תאריך יעד בחודש) */
export function estimatedRevenueForClientsInYm(
  invoices: Invoice[],
  clientIds: Set<string>,
  monthYm: string,
): number {
  const paid = sumPaidRevenueForClientsInYm(invoices, clientIds, monthYm)
  const pendingDue = sumPendingDueInYmForClients(invoices, clientIds, monthYm)
  return Math.round((paid + pendingDue) * 100) / 100
}

/** סכום חשבוניות ששולמו ללקוחות בסט — לפי תאריך שיוך (יום) */
export function sumPaidRevenueForClientsInYm(
  invoices: Invoice[],
  clientIds: Set<string>,
  monthYm: string,
): number {
  let s = 0
  for (const inv of invoices) {
    if (!clientIds.has(inv.clientId)) continue
    const ymd = paidInvoiceYmd(inv)
    if (!ymd) continue
    if (ymFromYmd(ymd) !== monthYm) continue
    s += inv.amount
  }
  return Math.round(s * 100) / 100
}

/** סכום כל חשבוניות במצב «שולם» ללקוחות בסט (לפי תאריך שיוך לשולם) */
export function sumPaidRevenueAllTimeForClients(
  invoices: Invoice[],
  clientIds: Set<string>,
): number {
  let s = 0
  for (const inv of invoices) {
    if (!clientIds.has(inv.clientId)) continue
    if (inv.status !== 'paid') continue
    if (!paidInvoiceYmd(inv)) continue
    s += inv.amount
  }
  return Math.round(s * 100) / 100
}

/** עמלה מצטברת על כל ההכנסות ששולמו (משקל לפי שדה agentCommissionPercent על החשבונית אם קיים) */
export function commissionOnPaidAllTimeForClients(
  invoices: Invoice[],
  clientIds: Set<string>,
  commissionPercent: number,
): number {
  return weightedCommissionOnPaidAllTimeForClients(invoices, clientIds, commissionPercent)
}

export function revenueByMonthForClients(
  invoices: Invoice[],
  clientIds: Set<string>,
  monthKeys: string[],
): { ym: string; total: number }[] {
  const map = new Map<string, number>()
  for (const k of monthKeys) map.set(k, 0)
  for (const inv of invoices) {
    if (!clientIds.has(inv.clientId)) continue
    const ymd = paidInvoiceYmd(inv)
    if (!ymd) continue
    const ym = ymFromYmd(ymd)
    if (!map.has(ym)) continue
    map.set(ym, (map.get(ym) ?? 0) + inv.amount)
  }
  return monthKeys.map((ym) => ({
    ym,
    total: Math.round((map.get(ym) ?? 0) * 100) / 100,
  }))
}

export type AgentsFleetOverviewStats = {
  agentCount: number
  businessCount: number
  /** כסף זמין — סה״כ תקבולים מלקוחות שנרשמו (לא מוגבל לחודש) */
  availableMoneyAllTime: number
  /** עמלה מחושבת על תקבולים — לפני תשלום לסוכן */
  commissionAccruedAllTime: number
  /** סה״כ ששולם לסוכנים (רישום ידני) */
  commissionPaidToAgents: number
  /** עמלה שנצברה פחות ששולם */
  commissionBalance: number
  estimatedRevenueMonth: number
  estimatedCommissionMonth: number
  estimatedRevenueSinceActivity: number
  estimatedCommissionSinceActivity: number
  /** הכנסה משוערת בחודשים עתידיים עד דצמבר (לא כולל החודש הנוכחי) */
  estimatedRevenueFutureYear: number
  /** עמלה משוערת על הכנסות עתידיות עד דצמבר */
  estimatedCommissionFutureYear: number
  /** חודש התחלה לסיכום «מתחילת פעילות» (לפי עסקאות פעילות) */
  sinceActivityFromYm?: string
  /** חודש סיום לסיכום — בדרך כלל החודש הנוכחי */
  sinceActivityToYm: string
}

/** סכום תשלומי עמלה לסוכנים */
export function sumAgentCommissionPayments(
  payments: AgentCommissionPayment[],
  agentUserIds?: Set<string>,
): number {
  let s = 0
  for (const p of payments) {
    if (agentUserIds && !agentUserIds.has(p.agentUserId)) continue
    if (typeof p.amount === 'number' && Number.isFinite(p.amount) && p.amount > 0) {
      s += p.amount
    }
  }
  return Math.round(s * 100) / 100
}

/** סיכום מצטבר לכל סוכני המכירות (מרכז ניהול אדמין) */
export function computeAgentsFleetOverviewStats(
  agents: { id: string; agentCommissionPercent?: number }[],
  clients: Client[],
  leads: Lead[],
  invoices: Invoice[],
  deals: Deal[],
  agentPayments: AgentCommissionPayment[] = [],
  monthYm: string = currentYm(),
): AgentsFleetOverviewStats {
  const agentIdSet = new Set(agents.map((a) => a.id))
  let businessCount = 0
  let estimatedRevenueMonth = 0
  let estimatedCommissionMonth = 0
  let estimatedRevenueSinceActivity = 0
  let estimatedCommissionSinceActivity = 0
  let estimatedRevenueFutureYear = 0
  let estimatedCommissionFutureYear = 0
  let availableMoneyAllTime = 0
  let commissionAccruedAllTime = 0
  let sinceActivityFromYm: string | undefined

  for (const agent of agents) {
    const ws = buildAgentWorkspaceData(agent.id, clients, leads, [], invoices, deals, [])
    businessCount += ws.myClients.length
    const pct = effectiveCommissionPercent(agent.agentCommissionPercent)
    estimatedRevenueMonth += estimatedRevenueForAgentDashboardInYm(
      ws.myInvoices,
      ws.myClientIds,
      ws.myDeals,
      monthYm,
    )
    estimatedCommissionMonth += estimatedCommissionForAgentDashboardInYm(
      ws.myInvoices,
      ws.myClientIds,
      ws.myDeals,
      monthYm,
      pct,
    )
    estimatedRevenueFutureYear += estimatedRevenueFutureThroughEndOfYear(
      ws.myInvoices,
      ws.myClientIds,
      ws.myDeals,
      monthYm,
    )
    estimatedCommissionFutureYear += estimatedCommissionFutureThroughEndOfYear(
      ws.myInvoices,
      ws.myClientIds,
      ws.myDeals,
      monthYm,
      pct,
    )
    availableMoneyAllTime += sumPaidRevenueAllTimeForClients(ws.myInvoices, ws.myClientIds)
    commissionAccruedAllTime += weightedCommissionOnPaidAllTimeForClients(
      ws.myInvoices,
      ws.myClientIds,
      pct,
    )
    const activityMonthKeys = activityMonthKeysThroughCurrent(ws.myDeals, ws.myClientIds)
    const agentEarliest = activityMonthKeys[0]
    if (agentEarliest && (!sinceActivityFromYm || agentEarliest < sinceActivityFromYm)) {
      sinceActivityFromYm = agentEarliest
    }
    for (const ym of activityMonthKeys) {
      estimatedRevenueSinceActivity += estimatedRevenueForAgentDashboardInYm(
        ws.myInvoices,
        ws.myClientIds,
        ws.myDeals,
        ym,
      )
      estimatedCommissionSinceActivity += estimatedCommissionForAgentDashboardInYm(
        ws.myInvoices,
        ws.myClientIds,
        ws.myDeals,
        ym,
        pct,
      )
    }
  }

  const commissionPaidToAgents = sumAgentCommissionPayments(agentPayments, agentIdSet)
  const commissionBalance =
    Math.round((commissionAccruedAllTime - commissionPaidToAgents) * 100) / 100

  return {
    agentCount: agents.length,
    businessCount,
    availableMoneyAllTime: Math.round(availableMoneyAllTime * 100) / 100,
    commissionAccruedAllTime: Math.round(commissionAccruedAllTime * 100) / 100,
    commissionPaidToAgents,
    commissionBalance,
    estimatedRevenueMonth: Math.round(estimatedRevenueMonth * 100) / 100,
    estimatedCommissionMonth: Math.round(estimatedCommissionMonth * 100) / 100,
    estimatedRevenueSinceActivity: Math.round(estimatedRevenueSinceActivity * 100) / 100,
    estimatedCommissionSinceActivity: Math.round(estimatedCommissionSinceActivity * 100) / 100,
    estimatedRevenueFutureYear: Math.round(estimatedRevenueFutureYear * 100) / 100,
    estimatedCommissionFutureYear: Math.round(estimatedCommissionFutureYear * 100) / 100,
    sinceActivityFromYm,
    sinceActivityToYm: monthYm,
  }
}

/** חודשי YYYY-MM רציפים מ־fromYm עד toYm (כולל) */
export function monthKeysInclusive(fromYm: string, toYm: string): string[] {
  if (fromYm > toYm) return []
  const keys: string[] = []
  let y = Number(fromYm.slice(0, 4))
  let m = Number(fromYm.slice(5, 7))
  const endY = Number(toYm.slice(0, 4))
  const endM = Number(toYm.slice(5, 7))
  if (!y || !m || !endY || !endM) return []
  while (y < endY || (y === endY && m <= endM)) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return keys
}

/** החודש הראשון שבו עסקה פעילה תורמת להכנסה משוערת */
export function earliestDealActivityYm(
  deals: Deal[],
  clientIds: Set<string>,
): string | undefined {
  let min: string | undefined
  for (const d of deals) {
    if (!clientIds.has(d.clientId)) continue
    if (d.status !== 'active') continue
    if (dealAgreedAmount(d) <= 0) continue

    const ym = earliestScheduledPaymentYm(d)
    if (!ym) continue
    if (!min || ym < min) min = ym
  }
  return min
}

/** חודשים לסיכום «מתחילת פעילות» — מהתחלת עסקאות ועד החודש הנוכחי בלבד (ללא עתיד) */
export function activityMonthKeysThroughCurrent(
  deals: Deal[],
  clientIds: Set<string>,
): string[] {
  const start = earliestDealActivityYm(deals, clientIds)
  if (!start) return []
  return monthKeysInclusive(start, currentYm())
}

/** מפתחות YYYY-MM למאי 2026 עד דצמבר 2026 (לטבלת כספים בדשבורד סוכן) */
export function financeTableMonthKeysMayThroughDec2026(): string[] {
  const keys: string[] = []
  for (let mo = 5; mo <= 12; mo++) {
    keys.push(`2026-${String(mo).padStart(2, '0')}`)
  }
  return keys
}

/** חודשים אחרי `afterYm` עד דצמבר של אותה שנה (לסיכום עתידי) */
export function futureMonthKeysThroughEndOfCalendarYear(afterYm: string): string[] {
  const year = afterYm.slice(0, 4)
  if (!/^\d{4}$/.test(year)) return []
  const keys: string[] = []
  for (let mo = 1; mo <= 12; mo++) {
    const ym = `${year}-${String(mo).padStart(2, '0')}`
    if (ym > afterYm) keys.push(ym)
  }
  return keys
}

export function estimatedRevenueFutureThroughEndOfYear(
  invoices: Invoice[],
  clientIds: Set<string>,
  deals: Deal[],
  fromYm: string,
): number {
  let s = 0
  for (const ym of futureMonthKeysThroughEndOfCalendarYear(fromYm)) {
    s += estimatedRevenueForAgentDashboardInYm(invoices, clientIds, deals, ym)
  }
  return Math.round(s * 100) / 100
}

export function estimatedCommissionFutureThroughEndOfYear(
  invoices: Invoice[],
  clientIds: Set<string>,
  deals: Deal[],
  fromYm: string,
  profileCommissionPercent: number,
): number {
  let s = 0
  for (const ym of futureMonthKeysThroughEndOfCalendarYear(fromYm)) {
    s += estimatedCommissionForAgentDashboardInYm(
      invoices,
      clientIds,
      deals,
      ym,
      profileCommissionPercent,
    )
  }
  return Math.round(s * 100) / 100
}

/** N ימים אחרונים כולל היום — מפתחות YYYY-MM-DD מהישן לחדש */
export function lastNDayYmds(n: number): string[] {
  const out: string[] = []
  const end = new Date()
  end.setHours(12, 0, 0, 0)
  for (let back = n - 1; back >= 0; back--) {
    const x = new Date(end)
    x.setDate(x.getDate() - back)
    const y = x.getFullYear()
    const mo = String(x.getMonth() + 1).padStart(2, '0')
    const da = String(x.getDate()).padStart(2, '0')
    out.push(`${y}-${mo}-${da}`)
  }
  return out
}

/** תווית קומפקטית לציר יומי — יום/חודש מספרי */
export function dayAxisLabel(ymd: string): string {
  const part = ymd.slice(0, 10)
  const [, ms, ds] = part.split('-')
  if (!ms || !ds) return ymd
  return `${Number(ds)}/${Number(ms)}`
}

export function revenueByDayForClients(
  invoices: Invoice[],
  clientIds: Set<string>,
  dayYmds: string[],
): { ymd: string; total: number }[] {
  const map = new Map<string, number>()
  for (const k of dayYmds) map.set(k, 0)
  for (const inv of invoices) {
    if (!clientIds.has(inv.clientId)) continue
    const ymd = paidInvoiceYmd(inv)
    if (!ymd || !map.has(ymd)) continue
    map.set(ymd, (map.get(ymd) ?? 0) + inv.amount)
  }
  return dayYmds.map((ymd) => ({
    ymd,
    total: Math.round((map.get(ymd) ?? 0) * 100) / 100,
  }))
}

/** סיכום משוער ליום: שולם ביום + ממתין/באיחור עם תאריך יעד ביום */
export function estimatedRevenueByDayForClients(
  invoices: Invoice[],
  clientIds: Set<string>,
  dayYmds: string[],
): { ymd: string; total: number }[] {
  const map = new Map<string, number>()
  for (const k of dayYmds) map.set(k, 0)
  for (const inv of invoices) {
    if (!clientIds.has(inv.clientId)) continue
    if (inv.status === 'paid') {
      const ymd = paidInvoiceYmd(inv)
      if (ymd && map.has(ymd)) map.set(ymd, (map.get(ymd) ?? 0) + inv.amount)
    } else if (inv.status === 'pending' || inv.status === 'overdue') {
      const due = inv.dueDate?.trim().slice(0, 10)
      if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) continue
      if (map.has(due)) map.set(due, (map.get(due) ?? 0) + inv.amount)
    }
  }
  return dayYmds.map((ymd) => ({
    ymd,
    total: Math.round((map.get(ymd) ?? 0) * 100) / 100,
  }))
}

/** סיכום משוער לכל חודש בטווח (שולמו בחודש + צפוי לפי תאריך יעד בחודש) */
export function estimatedRevenueByMonthForClients(
  invoices: Invoice[],
  clientIds: Set<string>,
  monthKeys: string[],
): { ym: string; total: number }[] {
  return monthKeys.map((ym) => ({
    ym,
    total: estimatedRevenueForClientsInYm(invoices, clientIds, ym),
  }))
}

function dealAgreedAmount(d: Deal): number {
  const a = d.agreedAmount
  return typeof a === 'number' && Number.isFinite(a) && a >= 0 ? a : 0
}

export function estimatedRevenueFromActiveDealsForClientsInYm(
  deals: Deal[],
  clientIds: Set<string>,
  monthYm: string,
): number {
  let s = 0
  for (const d of deals) {
    if (!clientIds.has(d.clientId)) continue
    s += activeDealRevenueInMonth(d, monthYm)
  }
  return Math.round(s * 100) / 100
}

export function estimatedCommissionFromActiveDealsForClientsInYm(
  deals: Deal[],
  clientIds: Set<string>,
  monthYm: string,
): number {
  let s = 0
  for (const d of deals) {
    if (!clientIds.has(d.clientId)) continue
    const rev = activeDealRevenueInMonth(d, monthYm)
    if (rev <= 0) continue
    const pct = Math.min(100, Math.max(0, Math.round(Number(d.commissionPercent) || 0)))
    s += (rev * pct) / 100
  }
  return Math.round(s * 100) / 100
}

function agentUsesDealBasedEstimates(deals: Deal[], clientIds: Set<string>): boolean {
  for (const d of deals) {
    if (!clientIds.has(d.clientId)) continue
    if (d.status !== 'active') continue
    if (dealAgreedAmount(d) <= 0) continue
    if (normalizedScheduledPayments(d).length > 0) return true
  }
  return false
}

/** דשבורד: עדיפות לסכום מוסכם בעסקאות פעילות; אחרת חשבוניות */
export function estimatedRevenueForAgentDashboardInYm(
  invoices: Invoice[],
  clientIds: Set<string>,
  deals: Deal[],
  monthYm: string,
): number {
  const fromDeals = estimatedRevenueFromActiveDealsForClientsInYm(deals, clientIds, monthYm)
  if (fromDeals > 0) return fromDeals
  return estimatedRevenueForClientsInYm(invoices, clientIds, monthYm)
}

export function estimatedCommissionForAgentDashboardInYm(
  invoices: Invoice[],
  clientIds: Set<string>,
  deals: Deal[],
  monthYm: string,
  profileCommissionPercent: number,
): number {
  if (agentUsesDealBasedEstimates(deals, clientIds)) {
    return estimatedCommissionFromActiveDealsForClientsInYm(deals, clientIds, monthYm)
  }
  return weightedEstimatedCommissionForClientsInYm(
    invoices,
    clientIds,
    monthYm,
    profileCommissionPercent,
  )
}

function firstYmdByYm(dayYmds: string[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const ymd of dayYmds) {
    const ym = ymFromYmd(ymd)
    if (!m.has(ym)) m.set(ym, ymd)
  }
  return m
}

export function estimatedRevenueByDayFromActiveDeals(
  deals: Deal[],
  clientIds: Set<string>,
  dayYmds: string[],
): { ymd: string; total: number }[] {
  const map = new Map<string, number>()
  for (const k of dayYmds) map.set(k, 0)
  const firstByYm = firstYmdByYm(dayYmds)

  for (const d of deals) {
    if (!clientIds.has(d.clientId)) continue
    if (d.status !== 'active') continue
    const amt = dealAgreedAmount(d)
    if (amt <= 0) continue

    for (const p of normalizedScheduledPayments(d)) {
      const ymd = p.expectedPaymentYmd
      if (map.has(ymd)) {
        map.set(ymd, (map.get(ymd) ?? 0) + p.amount)
      } else {
        const ym = ymFromYmd(ymd)
        const anchor = firstByYm.get(ym)
        if (anchor) map.set(anchor, (map.get(anchor) ?? 0) + p.amount)
      }
    }
  }

  return dayYmds.map((ymd) => ({
    ymd,
    total: Math.round((map.get(ymd) ?? 0) * 100) / 100,
  }))
}

export function estimatedRevenueByDayForAgentDashboard(
  invoices: Invoice[],
  clientIds: Set<string>,
  deals: Deal[],
  dayYmds: string[],
  _monthYm: string,
): { ymd: string; total: number }[] {
  if (agentUsesDealBasedEstimates(deals, clientIds)) {
    return estimatedRevenueByDayFromActiveDeals(deals, clientIds, dayYmds)
  }
  return estimatedRevenueByDayForClients(invoices, clientIds, dayYmds)
}

export function estimatedRevenueByMonthFromActiveDeals(
  deals: Deal[],
  clientIds: Set<string>,
  monthKeys: string[],
): { ym: string; total: number; commission: number }[] {
  return monthKeys.map((ym) => ({
    ym,
    total: estimatedRevenueFromActiveDealsForClientsInYm(deals, clientIds, ym),
    commission: estimatedCommissionFromActiveDealsForClientsInYm(deals, clientIds, ym),
  }))
}

export function estimatedRevenueByMonthForAgentDashboard(
  invoices: Invoice[],
  clientIds: Set<string>,
  deals: Deal[],
  monthKeys: string[],
  _monthYm: string,
): { ym: string; total: number; commission?: number }[] {
  if (agentUsesDealBasedEstimates(deals, clientIds)) {
    return estimatedRevenueByMonthFromActiveDeals(deals, clientIds, monthKeys)
  }
  return estimatedRevenueByMonthForClients(invoices, clientIds, monthKeys).map((b) => ({
    ...b,
  }))
}
