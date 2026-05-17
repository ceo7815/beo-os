import { useMemo } from 'react'
import { useAgentWorkspaceForUid } from '../../hooks/useAgentWorkspaceForUid'
import { paidInvoiceYmd, sumPaidRevenueAllTimeForClients } from '../../lib/agentRevenue'
import { hubSectionClass } from '../../lib/hubSectionBorder'

type PortalArea = {
  title: string
  path: string
  countLabel: string
  count: string
  affects: string[]
}

type Props = {
  agentUserId: string
  agentName: string
}

export function AgentPortalSyncPanel({ agentUserId, agentName }: Props) {
  const ws = useAgentWorkspaceForUid(agentUserId)

  const paidTotal = useMemo(
    () => sumPaidRevenueAllTimeForClients(ws.myInvoices, ws.myClientIds),
    [ws.myInvoices, ws.myClientIds],
  )

  const activeDeals = useMemo(
    () => ws.myDeals.filter((d) => d.status === 'active').length,
    [ws.myDeals],
  )

  const receiptsCount = useMemo(() => {
    let n = 0
    for (const inv of ws.myInvoices) {
      if (inv.status === 'paid' && paidInvoiceYmd(inv)) n += 1
    }
    return n
  }, [ws.myInvoices])

  const areas: PortalArea[] = [
    {
      title: 'דשבורד',
      path: '/agent',
      countLabel: 'לידים בטיפול',
      count: String(
        ws.myLeads.filter((l) =>
          ['new', 'specification', 'quote_sent', 'follow_up', 'no_answer'].includes(l.status),
        ).length,
      ),
      affects: ['סיכום חודשי', 'גרפים משוערים'],
    },
    {
      title: 'לידים',
      path: '/agent/leads',
      countLabel: 'הצעות פתוחות',
      count: String(ws.quotesOpen.length),
      affects: ['שיוך ליד לעסקה', 'סטטוס ליד'],
    },
    {
      title: 'עסקים ועסקאות',
      path: '/agent/business',
      countLabel: 'עסקים משויכים',
      count: String(ws.myClients.length),
      affects: ['עסק חדש / קיים', 'שיוך לקוח לסוכן'],
    },
    {
      title: 'כספים',
      path: '/agent/finance',
      countLabel: 'כסף זמין (מצטבר)',
      count: new Intl.NumberFormat('he-IL', {
        style: 'currency',
        currency: 'ILS',
        maximumFractionDigits: 0,
      }).format(paidTotal),
      affects: ['תקבולים מהלקוח', 'עמלה %', 'עסקאות פעילות'],
    },
  ]

  return (
    <section
      className={`rounded-2xl border border-[var(--border-orange-soft)] bg-gradient-to-l from-[#FFFBF7] to-[var(--dash-panel-bg)] p-4 ${hubSectionClass(2)}`}
      aria-label="סנכרון לפורטל הסוכן"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-[var(--text-dark)]">
            פורטל הסוכן — {agentName}
          </h3>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[var(--text-mid)]">
            כל מה שתעדכן כאן למטה משתקף מיד באזורי הפורטל האישי של הסוכן (דשבורד, לידים, עסקים,
            כספים). אין צורך לערוך שם בנפרד.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-bold text-[var(--text-mid)]">
          <span className="rounded-full bg-white px-2.5 py-1 tabular-nums shadow-sm">
            {activeDeals} עסקאות פעילות
          </span>
          <span className="rounded-full bg-white px-2.5 py-1 tabular-nums shadow-sm">
            {receiptsCount} תקבולים
          </span>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {areas.map((a, i) => (
          <div
            key={a.path}
            className={`rounded-xl border border-[var(--border)] bg-white/90 p-3 ${hubSectionClass(i)}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-[var(--orange)]">{a.title}</span>
              <code className="text-[9px] text-[var(--text-light)]" dir="ltr">
                {a.path}
              </code>
            </div>
            <p className="mt-2 text-lg font-extrabold tabular-nums text-[var(--text-dark)]">
              {a.count}
            </p>
            <p className="text-[10px] text-[var(--text-mid)]">{a.countLabel}</p>
            <ul className="mt-2 space-y-0.5 border-t border-[var(--border)] pt-2 text-[10px] text-[var(--text-mid)]">
              {a.affects.map((line) => (
                <li key={line}>← {line}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
