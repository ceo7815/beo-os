import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDealPayments } from '../../hooks/useDealPayments'
import { useDeals } from '../../hooks/useDeals'
import { useLeads } from '../../hooks/useLeads'
import { useQuotes } from '../../hooks/useQuotes'
import { useRecurringCharges } from '../../hooks/useRecurringCharges'
import { todayYmd } from '../../lib/dates'
import { buildPipelineSummary } from '../../lib/pipelineModel'

function ils(n: number): string {
  return `₪${Math.round(n).toLocaleString('he-IL')}`
}

export function PipelineDashboardStrip() {
  const navigate = useNavigate()
  const { leads } = useLeads()
  const { quotes } = useQuotes()
  const { deals } = useDeals()
  const { payments } = useDealPayments()
  const { charges } = useRecurringCharges()
  const today = todayYmd()

  const summary = useMemo(
    () =>
      buildPipelineSummary({
        today,
        leads: leads.map((l) => ({
          id: l.id,
          status: l.status,
          estimatedValue: l.estimatedValue ?? null,
          probability: l.probability ?? null,
          source: l.source,
          nextFollowUpDate: l.nextFollowUpDate,
          nextActionAt: l.nextActionAt,
          createdAt: l.createdAt,
        })),
        quotes: quotes.map((q) => ({
          id: q.id,
          leadId: q.leadId,
          status: q.status,
          amountPreVat: q.amountPreVat ?? null,
          sentAt: q.sentAt,
          createdAt: q.createdAt,
        })),
        deals: deals.map((d) => ({
          id: d.id,
          stage: d.stage,
          status: d.status,
          amountTotal: d.amountTotal ?? null,
          agreedAmount: d.agreedAmount ?? null,
          leadId: d.leadId,
          createdAt: d.createdAt,
        })),
        payments: payments.map((p) => ({
          id: p.id,
          dealId: p.dealId,
          amount: p.amount,
          status: p.status,
          dueDate: p.dueDate,
        })),
        recurring: charges.map((c) => ({
          id: c.id,
          amount: c.amount,
          interval: c.interval,
          active: c.active,
          startDate: c.startDate,
          endDate: c.endDate,
        })),
      }),
    [today, leads, quotes, deals, payments, charges],
  )

  const cards = [
    { label: 'צנרת פתוחה', value: ils(summary.openPipelineAmount), hint: `${summary.openCount} רשומות`, to: '/pipeline' },
    { label: 'נסגר החודש', value: ils(summary.wonThisMonth.amount), hint: `${summary.wonThisMonth.count} עסקאות`, to: '/pipeline' },
    { label: 'פולואפ להיום', value: String(summary.followUpsDue.count), hint: 'לידים פתוחים', to: '/pipeline' },
    { label: 'תשלומים באיחור', value: ils(summary.overduePayments.amount), hint: `${summary.overduePayments.count} שורות`, to: '/receivables' },
    { label: 'הכנסה חודשית חוזרת', value: ils(summary.mrr), hint: 'ריטיינר ואחסון', to: '/receivables' },
  ]

  const topSource = summary.leadsBySourceThisWeek[0]

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-[15px] font-extrabold text-[var(--text-dark)]">צנרת</h2>
        {topSource ? (
          <p className="text-[12px] text-[var(--text-mid)]">
            השבוע הכי הרבה לידים מ־{topSource.source} ({topSource.count})
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {cards.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => navigate(c.to)}
            className="rounded-2xl border border-[var(--border)] bg-white px-3 py-3 text-right shadow-sm hover:border-[var(--brand)]/40"
          >
            <div className="text-[11px] font-bold text-[var(--text-light)]">{c.label}</div>
            <div className="mt-1 text-[18px] font-extrabold tabular-nums text-[var(--text-dark)]">{c.value}</div>
            <div className="text-[11px] text-[var(--text-mid)]">{c.hint}</div>
          </button>
        ))}
      </div>
    </section>
  )
}
