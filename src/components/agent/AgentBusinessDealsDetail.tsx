import { useMemo, useState } from 'react'
import { paidInvoiceYmd } from '../../lib/agentRevenue'
import { normalizedScheduledPayments } from '../../lib/dealSchedule'
import type { Deal, DealKind, DealStatus, Invoice } from '../../types'
import { Badge } from '../shared/Badge'

const ils = (n: number) =>
  new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: n % 1 === 0 ? 0 : 1,
  }).format(n)

/** תווית סוג עסקה לפורטל סוכן — תמיד אחת משלוש הקטגוריות */
function dealTypeLabelHe(k: DealKind): string {
  if (k === 'retainer_yearly') return 'ריטיינר שנתי'
  if (k === 'one_time') return 'עסקה חד פעמית'
  return 'ריטיינר חודשי'
}

function dealTypeBadgeColor(k: DealKind): string {
  if (k === 'retainer_yearly') return '#2563EB'
  if (k === 'one_time') return '#7C3AED'
  return '#F97316'
}

function dealStatusHe(s: DealStatus): string {
  if (s === 'completed') return 'הושלמה'
  if (s === 'cancelled') return 'בוטלה'
  return 'פעילה'
}

function statusColor(s: DealStatus): string {
  if (s === 'completed') return '#2563EB'
  if (s === 'cancelled') return '#64748B'
  return '#16A34A'
}

function formatYmdHe(ymd: string): string {
  const s = ymd.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ymd
  const d = new Date(`${s}T12:00:00`)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Props = {
  deals: Deal[]
  invoices: Invoice[]
}

export function AgentBusinessDealsDetail({ deals, invoices }: Props) {
  const [expanded, setExpanded] = useState(true)

  const paidByDealId = useMemo(() => {
    const m = new Map<string, number>()
    for (const inv of invoices) {
      if (!inv.dealId || inv.status !== 'paid') continue
      if (!paidInvoiceYmd(inv)) continue
      m.set(inv.dealId, (m.get(inv.dealId) ?? 0) + inv.amount)
    }
    return m
  }, [invoices])

  const invoicesByDealId = useMemo(() => {
    const m = new Map<string, Invoice[]>()
    for (const inv of invoices) {
      if (!inv.dealId) continue
      const list = m.get(inv.dealId) ?? []
      list.push(inv)
      m.set(inv.dealId, list)
    }
    for (const list of m.values()) {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    }
    return m
  }, [invoices])

  const sortedDeals = useMemo(
    () => [...deals].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [deals],
  )

  if (sortedDeals.length === 0) {
    return (
      <p className="border-t border-[var(--border)] bg-white/80 px-4 py-3 text-[11px] text-[var(--text-mid)]">
        אין עסקאות רשומות לעסק זה.
      </p>
    )
  }

  return (
    <div className="border-t border-[var(--border)] bg-white/80">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--orange-light)]/20 px-4 py-2 text-right text-[11px] font-bold text-[var(--text-mid)] transition-colors hover:bg-[var(--orange-light)]/35"
      >
        <span>
          <span className="text-[var(--orange)] underline decoration-[var(--orange)]/40 underline-offset-2">
            עסקאות
          </span>{' '}
          ({sortedDeals.length})
        </span>
        <span
          className={`shrink-0 text-[10px] text-[var(--text-light)] transition-transform ${expanded ? 'rotate-180' : ''}`}
          aria-hidden
        >
          ▼
        </span>
      </button>
      {expanded ? (
      <div className="space-y-0 divide-y divide-[var(--border)]">
        {sortedDeals.map((d) => {
          const schedule = normalizedScheduledPayments(d)
          const receipts = invoicesByDealId.get(d.id) ?? []
          const paid = paidByDealId.get(d.id) ?? 0
          return (
            <article key={d.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-extrabold text-[var(--text-dark)]">{d.title}</h4>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge
                      label={dealTypeLabelHe(d.dealKind)}
                      color={dealTypeBadgeColor(d.dealKind)}
                    />
                    {d.isHostingDeal ? (
                      <Badge label="עסקת אחסון" color="#64748B" />
                    ) : null}
                  </div>
                  {d.notes?.trim() ? (
                    <p className="mt-1 text-[11px] text-[var(--text-mid)]">{d.notes.trim()}</p>
                  ) : null}
                </div>
                <Badge label={dealStatusHe(d.status)} color={statusColor(d.status)} />
              </div>

              <dl className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <dt className="font-bold text-[var(--text-light)]">סוג עסקה</dt>
                  <dd className="mt-0.5 font-semibold text-[var(--text-dark)]">
                    {dealTypeLabelHe(d.dealKind)}
                    {d.isHostingDeal ? ' · אחסון' : ''}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-[var(--text-light)]">סכום מוסכם</dt>
                  <dd className="mt-0.5 tabular-nums font-semibold text-[var(--text-dark)]">
                    {typeof d.agreedAmount === 'number' ? ils(d.agreedAmount) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-[var(--text-light)]">עמלת סוכן</dt>
                  <dd className="mt-0.5 tabular-nums font-semibold text-[var(--text-dark)]">
                    {d.commissionPercent}%
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-[var(--text-light)]">התקבל מהלקוח</dt>
                  <dd className="mt-0.5 tabular-nums font-semibold text-[#059669]">{ils(paid)}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[var(--text-light)]">נוצרה</dt>
                  <dd className="mt-0.5 text-[var(--text-mid)]">{formatYmdHe(d.createdAt.slice(0, 10))}</dd>
                </div>
              </dl>

              {schedule.length > 0 ? (
                <div className="mt-3">
                  <p className="mb-1 text-[10px] font-bold text-[var(--text-mid)]">
                    לוח תשלומים מתוכנן (הכנסה משוערת לפי חודש)
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-[var(--border-orange-soft)]">
                    <table className="w-full min-w-[320px] border-collapse text-[11px]">
                      <thead className="bg-[var(--surface-muted)] text-right font-bold text-[var(--text-light)]">
                        <tr>
                          <th className="px-2 py-1.5">תאריך צפי</th>
                          <th className="px-2 py-1.5">סכום</th>
                          <th className="px-2 py-1.5">הערה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schedule.map((p) => (
                          <tr key={p.id} className="border-t border-[var(--border)]">
                            <td className="px-2 py-1.5" dir="ltr">
                              {formatYmdHe(p.expectedPaymentYmd)}
                            </td>
                            <td className="px-2 py-1.5 tabular-nums font-semibold">{ils(p.amount)}</td>
                            <td className="px-2 py-1.5 text-[var(--text-mid)]">{p.label ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {receipts.length > 0 ? (
                <div className="mt-3">
                  <p className="mb-1 text-[10px] font-bold text-[var(--text-mid)]">תקבולים שנרשמו</p>
                  <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                    <table className="w-full min-w-[360px] border-collapse text-[11px]">
                      <thead className="bg-[var(--surface-muted)] text-right font-bold text-[var(--text-light)]">
                        <tr>
                          <th className="px-2 py-1.5">חשבונית</th>
                          <th className="px-2 py-1.5">סכום</th>
                          <th className="px-2 py-1.5">תאריך תקבול</th>
                          <th className="px-2 py-1.5">סטטוס</th>
                        </tr>
                      </thead>
                      <tbody>
                        {receipts.map((inv) => (
                          <tr key={inv.id} className="border-t border-[var(--border)]">
                            <td className="px-2 py-1.5 font-mono" dir="ltr">
                              {inv.invoiceNumber}
                            </td>
                            <td className="px-2 py-1.5 tabular-nums">{ils(inv.amount)}</td>
                            <td className="px-2 py-1.5" dir="ltr">
                              {inv.paidDate ? formatYmdHe(inv.paidDate) : '—'}
                            </td>
                            <td className="px-2 py-1.5">
                              {inv.status === 'paid'
                                ? 'שולם'
                                : inv.status === 'overdue'
                                  ? 'באיחור'
                                  : 'ממתין'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-[10px] text-[var(--text-mid)]">עדיין לא נרשמו תקבולים לעסקה זו.</p>
              )}
            </article>
          )
        })}
      </div>
      ) : null}
    </div>
  )
}
