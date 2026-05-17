import type { AgentsFleetOverviewStats } from './agentRevenue'
import { monthShortLabelHe } from './agentRevenue'

function futureThroughYearEndHint(monthLabel: string, commission: boolean): string {
  return commission
    ? `מחודשים אחרי ${monthLabel} עד סוף השנה · סיכום עמלות משוערות`
    : `מחודשים אחרי ${monthLabel} עד סוף השנה · מעסקאות פעילות (לפני תקבול)`
}

function sinceActivityHint(stats: AgentsFleetOverviewStats, commission: boolean): string {
  const from = stats.sinceActivityFromYm
  const to = stats.sinceActivityToYm
  const range =
    from && to
      ? from === to
        ? `חודש ${monthShortLabelHe(from)}`
        : `מ${monthShortLabelHe(from)} עד ${monthShortLabelHe(to)}`
      : 'עד החודש הנוכחי'
  return commission
    ? `${range} · סיכום עמלות משוערות (ללא חודשים עתידיים)`
    : `${range} · סיכום חודשי מעסקאות פעילות (ללא חודשים עתידיים)`
}

const ils = (n: number) =>
  new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: n % 1 === 0 ? 0 : 1,
  }).format(n)

export type AgentOverviewCard = {
  title: string
  value: string
  hint: string
}

/** קוביות ניהול כללי — סיכום כל הסוכנים */
export function buildGlobalFleetOverviewCards(
  stats: AgentsFleetOverviewStats,
  monthLabel: string,
): AgentOverviewCard[] {
  return [
    {
      title: 'סוכני מכירות',
      value: String(stats.agentCount),
      hint: 'סוכנים פעילים במערכת',
    },
    {
      title: 'עסקים משויכים',
      value: String(stats.businessCount),
      hint: 'לקוחות (עסקים) המשויכים לסוכני מכירות',
    },
    {
      title: 'הכנסה משוערת החודש',
      value: ils(stats.estimatedRevenueMonth),
      hint: `חודש ${monthLabel} · מעסקאות פעילות (לפני תקבול)`,
    },
    {
      title: 'עמלה משוערת החודש',
      value: ils(stats.estimatedCommissionMonth),
      hint: `חודש ${monthLabel} · סיכום אחוזי עמלה לכל הסוכנים`,
    },
    {
      title: 'הכנסות עתידיות משוערות עד סוף שנה',
      value: ils(stats.estimatedRevenueFutureYear),
      hint: futureThroughYearEndHint(monthLabel, false),
    },
    {
      title: 'עמלה משוערת עד סוף שנה',
      value: ils(stats.estimatedCommissionFutureYear),
      hint: futureThroughYearEndHint(monthLabel, true),
    },
    {
      title: 'הכנסה מתחילת פעילות',
      value: ils(stats.estimatedRevenueSinceActivity),
      hint: sinceActivityHint(stats, false),
    },
    {
      title: 'עמלה מתחילת פעילות',
      value: ils(stats.estimatedCommissionSinceActivity),
      hint: sinceActivityHint(stats, true),
    },
  ]
}

export function buildAgentOverviewCards(
  stats: AgentsFleetOverviewStats,
  monthLabel: string,
): AgentOverviewCard[] {
  const balanceHint =
    stats.commissionBalance > 0
      ? `יתרה לתשלום: ${ils(stats.commissionBalance)}`
      : stats.commissionBalance < 0
        ? `שולם מעבר: ${ils(Math.abs(stats.commissionBalance))}`
        : 'שולם במלוא העמלה שנצברה'

  return [
    {
      title: 'הכנסה משוערת החודש',
      value: ils(stats.estimatedRevenueMonth),
      hint: `חודש ${monthLabel} · מעסקאות פעילות (לפני תקבול)`,
    },
    {
      title: 'עמלה משוערת החודש',
      value: ils(stats.estimatedCommissionMonth),
      hint: `חודש ${monthLabel} · אחוז מההכנסה המשוערת`,
    },
    {
      title: 'הכנסות עתידיות משוערות עד סוף שנה',
      value: ils(stats.estimatedRevenueFutureYear),
      hint: futureThroughYearEndHint(monthLabel, false),
    },
    {
      title: 'עמלה משוערת עד סוף שנה',
      value: ils(stats.estimatedCommissionFutureYear),
      hint: futureThroughYearEndHint(monthLabel, true),
    },
    {
      title: 'הכנסה מתחילת פעילות',
      value: ils(stats.estimatedRevenueSinceActivity),
      hint: sinceActivityHint(stats, false),
    },
    {
      title: 'עמלה מתחילת פעילות',
      value: ils(stats.estimatedCommissionSinceActivity),
      hint: sinceActivityHint(stats, true),
    },
    {
      title: 'כסף זמין',
      value: ils(stats.availableMoneyAllTime),
      hint: 'סה״כ תקבולים מלקוחות שנרשמו (לא לפי חודש)',
    },
    {
      title: 'כסף ששולם לסוכן',
      value: ils(stats.commissionPaidToAgents),
      hint: balanceHint,
    },
  ]
}

export function monthLabelHe(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  const d = new Date(y, m - 1, 1, 12, 0, 0)
  return d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
}
