import { useMemo } from 'react'
import { useAgentPortalUserId } from '../../contexts/AgentPreviewContext'
import { useUsers } from '../../hooks/useUsers'
import { hubSectionClass } from '../../lib/hubSectionBorder'
import { useAgentWorkspace } from '../../hooks/useAgentWorkspace'
import {
  commissionOnPaidAllTimeForClients,
  currentYm,
  effectiveCommissionPercent,
  estimatedCommissionForAgentDashboardInYm,
  estimatedRevenueByDayForAgentDashboard,
  estimatedCommissionFutureThroughEndOfYear,
  estimatedRevenueByMonthForAgentDashboard,
  estimatedRevenueForAgentDashboardInYm,
  estimatedRevenueFutureThroughEndOfYear,
  financeTableMonthKeysMayThroughDec2026,
  lastNDayYmds,
  sumPaidRevenueAllTimeForClients,
  sumPaidRevenueForClientsInYm,
} from '../../lib/agentRevenue'
import { AgentRevenueDailyChart } from '../../components/agent/AgentRevenueDailyChart'
import { AgentMonthlyRevenueTable } from '../../components/agent/AgentMonthlyRevenueTable'

const financeDayCount = 30

const ils = (n: number) =>
  new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: n % 1 === 0 ? 0 : 1,
  }).format(n)

export function AgentFinancePage() {
  const agentUserId = useAgentPortalUserId()
  const { users } = useUsers()
  const { myInvoices, myClientIds, myDeals } = useAgentWorkspace()

  const member = useMemo(
    () => users.find((m) => m.id === agentUserId),
    [users, agentUserId],
  )

  const commissionPercent = effectiveCommissionPercent(member?.agentCommissionPercent)

  const ymNow = useMemo(() => currentYm(), [])

  const estimatedRevenueMonth = useMemo(
    () => estimatedRevenueForAgentDashboardInYm(myInvoices, myClientIds, myDeals, ymNow),
    [myInvoices, myClientIds, myDeals, ymNow],
  )

  const estimatedCommissionMonth = useMemo(
    () =>
      estimatedCommissionForAgentDashboardInYm(
        myInvoices,
        myClientIds,
        myDeals,
        ymNow,
        commissionPercent,
      ),
    [myInvoices, myClientIds, myDeals, ymNow, commissionPercent],
  )

  const estimatedRevenueFutureYear = useMemo(
    () => estimatedRevenueFutureThroughEndOfYear(myInvoices, myClientIds, myDeals, ymNow),
    [myInvoices, myClientIds, myDeals, ymNow],
  )

  const estimatedCommissionFutureYear = useMemo(
    () =>
      estimatedCommissionFutureThroughEndOfYear(
        myInvoices,
        myClientIds,
        myDeals,
        ymNow,
        commissionPercent,
      ),
    [myInvoices, myClientIds, myDeals, ymNow, commissionPercent],
  )

  const paidThisMonth = useMemo(
    () => sumPaidRevenueForClientsInYm(myInvoices, myClientIds, ymNow),
    [myInvoices, myClientIds, ymNow],
  )

  const paidAllTime = useMemo(
    () => sumPaidRevenueAllTimeForClients(myInvoices, myClientIds),
    [myInvoices, myClientIds],
  )

  const commissionPaidAllTime = useMemo(
    () => commissionOnPaidAllTimeForClients(myInvoices, myClientIds, commissionPercent),
    [myInvoices, myClientIds, commissionPercent],
  )

  const dayYmds = useMemo(() => lastNDayYmds(financeDayCount), [])
  const tableMonthKeys = useMemo(() => financeTableMonthKeysMayThroughDec2026(), [])

  const dailyChartBars = useMemo(
    () => estimatedRevenueByDayForAgentDashboard(myInvoices, myClientIds, myDeals, dayYmds, ymNow),
    [myInvoices, myClientIds, myDeals, dayYmds, ymNow],
  )

  const monthlyTableBars = useMemo(
    () =>
      estimatedRevenueByMonthForAgentDashboard(
        myInvoices,
        myClientIds,
        myDeals,
        tableMonthKeys,
        ymNow,
      ),
    [myInvoices, myClientIds, myDeals, tableMonthKeys, ymNow],
  )

  const financeKpis = useMemo(
    () => [
      {
        label: 'הכנסה משוערת החודש',
        value: ils(estimatedRevenueMonth),
        color: 'text-[var(--blue-mid)]',
        sub: 'תקבולים צפויים + כבר התקבלו מהלקוחות',
      },
      {
        label: 'עמלת סוכן משוערת',
        value: ils(estimatedCommissionMonth),
        color: 'text-[#059669]',
        sub: 'אחוז מהסכומים — לא תשלום שקיבלת',
      },
      {
        label: 'הכנסות עתידיות משוערות עד סוף שנה',
        value: ils(estimatedRevenueFutureYear),
        color: 'text-[var(--blue-mid)]',
        sub: 'תשלומים מתוכננים בחודשים שעדיין לא הגיעו',
      },
      {
        label: 'עמלה משוערת עד סוף שנה',
        value: ils(estimatedCommissionFutureYear),
        color: 'text-[#059669]',
        sub: 'חישוב על ההכנסות העתידיות — לא תשלום שקיבלת',
      },
      {
        label: 'כסף זמין',
        value: ils(paidThisMonth),
        color: 'text-[var(--text-dark)]',
        sub: 'תקבולים בפועל מהלקוחות החודש',
      },
      {
        label: 'כסף זמין מצטבר',
        value: ils(paidAllTime),
        color: 'text-[var(--text-dark)]',
        sub: 'סה״כ שהתקבל מבעלי העסקים',
      },
      {
        label: 'תקבולים מצטברים לחברה',
        value: ils(paidAllTime),
        color: 'text-[var(--blue-mid)]',
        sub: 'לפני ניכוי עמלת הסוכן',
      },
      {
        label: 'עמלת סוכן מצטברת (חישוב)',
        value: ils(commissionPaidAllTime),
        color: 'text-[#059669]',
        sub: 'אחוז על תקבולים — לא כסף ששולם לך',
      },
    ],
    [
      estimatedRevenueMonth,
      estimatedCommissionMonth,
      estimatedRevenueFutureYear,
      estimatedCommissionFutureYear,
      paidThisMonth,
      paidAllTime,
      commissionPaidAllTime,
    ],
  )

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 md:px-8 md:py-8">
      <header className="space-y-1">
        <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">כספים</h1>
        <p className="max-w-2xl text-[13px] leading-relaxed text-[var(--text-mid)]">
          תקבולים מבעלי העסקים (הלקוחות) שלך — לא תשלומים שקיבלת מהחברה. רישום תקבול מעביר
          מהכנסה משוערת לכסף זמין. גרף יומי ל־{financeDayCount} הימים האחרונים וטבלה חודשית מאי–דצמבר
          2026.
        </p>
      </header>

      <section
        className={`overflow-hidden rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.06)] ${hubSectionClass(0)}`}
        aria-labelledby="agent-finance-panel-heading"
      >
        <div className="border-b border-[var(--border)] bg-gradient-to-l from-[#FFFBF7] to-transparent px-4 py-3">
          <h2
            id="agent-finance-panel-heading"
            className="text-sm font-extrabold text-[var(--text-dark)]"
          >
            סיכום הכנסות
          </h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-mid)]">
            ניתן להרחיב כאן בהמשך (דוחות, ייצוא, וכו׳).
          </p>
        </div>
        <div className="space-y-4 bg-gradient-to-b from-[#FFFBF7]/80 to-[var(--dash-panel-bg)] p-4">
          <section
            className="grid grid-cols-2 gap-3 md:grid-cols-4"
            aria-label="מדדי כספים"
          >
            {financeKpis.map((k, i) => (
              <div
                key={k.label}
                className={`flex min-h-[88px] flex-col gap-1 rounded-[12px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.06)] ${hubSectionClass(i)}`}
              >
                <span className="text-[11px] font-semibold leading-snug text-[var(--text-mid)]">
                  {k.label}
                </span>
                <span
                  className={`text-base font-extrabold tabular-nums leading-tight sm:text-lg ${k.color}`}
                >
                  {k.value}
                </span>
                {k.sub ? (
                  <span className="mt-auto text-[10px] font-medium leading-snug text-[var(--text-light)]">
                    {k.sub}
                  </span>
                ) : null}
              </div>
            ))}
          </section>

          <div>
            <h3 className="mb-2 text-[11px] font-extrabold text-[var(--text-mid)]">
              הכנסות משוערות יומיות (לפי תאריך צפי לתשלום)
            </h3>
            <AgentRevenueDailyChart bars={dailyChartBars} variant="plain" />
          </div>
          <div>
            <h3 className="mb-2 text-[11px] font-extrabold text-[var(--text-mid)]">
              טבלת הכנסות משוערות חודשית (מאי 26 – דצמבר 26)
            </h3>
            <div className="overflow-hidden rounded-xl border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)]">
              <AgentMonthlyRevenueTable
                bars={monthlyTableBars}
                commissionPercent={commissionPercent}
                incomeColumnHeading="הכנסות משוערות"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
