import { useMemo } from 'react'
import { useAgentPortalUserId } from '../contexts/AgentPreviewContext'
import { useUsers } from '../hooks/useUsers'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { useAgentWorkspace } from '../hooks/useAgentWorkspace'
import {
  currentYm,
  effectiveCommissionPercent,
  estimatedCommissionForAgentDashboardInYm,
  estimatedRevenueByDayForAgentDashboard,
  estimatedRevenueByMonthForAgentDashboard,
  estimatedRevenueForAgentDashboardInYm,
  financeTableMonthKeysMayThroughDec2026,
  lastNDayYmds,
} from '../lib/agentRevenue'
import { AgentEstimatedRevenueLineChart } from '../components/agent/AgentEstimatedRevenueLineChart'
import { AgentMonthlyRevenueTable } from '../components/agent/AgentMonthlyRevenueTable'

const ils = (n: number) =>
  new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: n % 1 === 0 ? 0 : 1,
  }).format(n)

export function AgentDashboard() {
  const agentUserId = useAgentPortalUserId()
  const { users } = useUsers()
  const { myClients, myLeads, myInvoices, myClientIds, myDeals } = useAgentWorkspace()

  const member = useMemo(
    () => users.find((m) => m.id === agentUserId),
    [users, agentUserId],
  )

  const ymNow = useMemo(() => currentYm(), [])

  const commissionPercent = effectiveCommissionPercent(member?.agentCommissionPercent)

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

  const leadsInProgress = useMemo(() => {
    const open = new Set([
      'new',
      'specification',
      'quote_sent',
      'follow_up',
      'no_answer',
    ])
    return myLeads.filter((l) => open.has(l.status)).length
  }, [myLeads])

  const financeDayCount = 30
  const dayYmds = useMemo(() => lastNDayYmds(financeDayCount), [])
  const tableMonthKeys = useMemo(() => financeTableMonthKeysMayThroughDec2026(), [])

  const estimatedDailyBars = useMemo(
    () => estimatedRevenueByDayForAgentDashboard(myInvoices, myClientIds, myDeals, dayYmds, ymNow),
    [myInvoices, myClientIds, myDeals, dayYmds, ymNow],
  )

  const estimatedMonthlyBars = useMemo(
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

  const kpis = useMemo(
    () => [
      {
        label: 'עסקים תחתיך',
        value: String(myClients.length),
        sub: '',
        color: 'text-[var(--text-dark)]',
      },
      {
        label: 'לידים בטיפול',
        value: String(leadsInProgress),
        sub: '',
        color: 'text-[var(--orange)]',
      },
      {
        label: 'הכנסות משוערות לחודש',
        value: ils(estimatedRevenueMonth),
        sub: '',
        color: 'text-[var(--blue-mid)]',
      },
      {
        label: 'עמלה משוערת לחודש',
        value: ils(estimatedCommissionMonth),
        sub: '',
        color: 'text-[#059669]',
      },
    ],
    [
      myClients.length,
      leadsInProgress,
      estimatedRevenueMonth,
      estimatedCommissionMonth,
    ],
  )

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-5 md:px-8 md:py-8">
      <header>
        <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">דשבורד</h1>
      </header>

      <section
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        aria-label="מדדים"
      >
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className={`flex flex-col gap-1 rounded-[12px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.06)] ${hubSectionClass(i)}`}
          >
            <span className="text-[11px] font-semibold leading-snug text-[var(--text-mid)]">
              {k.label}
            </span>
            <span
              className={`text-lg font-extrabold tabular-nums leading-tight sm:text-[22px] ${k.color}`}
            >
              {k.value}
            </span>
            {k.sub ? (
              <span className="text-[10px] font-medium text-[var(--text-light)]">{k.sub}</span>
            ) : null}
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <p className="text-[13px] leading-relaxed text-[var(--text-mid)]">
          הכנסה משוערת לפי <strong className="font-bold text-[var(--text-dark)]">סכום מוסכם בעסקאות פעילות</strong>{' '}
          (למשל ₪2,500) ועמלה לפי אחוז בעסקה (למשל 10% = ₪250). תקבולים בפועל מעדכנים «כסף זמין» בדף
          כספים.
        </p>
        <div
          className={`overflow-hidden rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.06)] ${hubSectionClass(0)}`}
          aria-labelledby="agent-estimated-finance-heading"
        >
          <div className="border-b border-[var(--border)] bg-gradient-to-l from-[#FFFBF7] to-transparent px-4 py-3">
            <h2
              id="agent-estimated-finance-heading"
              className="text-sm font-extrabold text-[var(--text-dark)]"
            >
              סיכום הכנסות משוערות
            </h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-mid)]">
              ניתן להרחיב כאן בהמשך (דוחות, ייצוא, וכו׳).
            </p>
          </div>
          <div className="space-y-4 bg-gradient-to-b from-[#FFFBF7]/80 to-[var(--dash-panel-bg)] p-4">
            <div>
              <h3 className="mb-2 text-[11px] font-extrabold text-[var(--text-mid)]">
                הכנסות משוערות יומיות
              </h3>
              <AgentEstimatedRevenueLineChart bars={estimatedDailyBars} variant="plain" />
            </div>
            <div>
              <h3 className="mb-2 text-[11px] font-extrabold text-[var(--text-mid)]">
                טבלת הכנסות משוערות חודשית (מאי 26 – דצמבר 26)
              </h3>
              <div className="overflow-hidden rounded-xl border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)]">
                <AgentMonthlyRevenueTable
                  bars={estimatedMonthlyBars}
                  commissionPercent={commissionPercent}
                  incomeColumnHeading="הכנסות משוערות"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
