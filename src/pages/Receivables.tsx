import { useMemo, useState } from 'react'
import { useDealPayments } from '../hooks/useDealPayments'
import { useDeals } from '../hooks/useDeals'
import { useRecurringCharges } from '../hooks/useRecurringCharges'
import { todayYmd } from '../lib/dates'
import { monthlyRecurring, paymentIsOverdue } from '../lib/pipelineModel'
import { ExportExcelButton } from '../components/shared/ExportExcelButton'
import { downloadRtlExcel } from '../lib/excelExport'

function ils(n: number): string {
  return `₪${Math.round(n).toLocaleString('he-IL')}`
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

const KIND_HE: Record<string, string> = {
  deposit: 'מקדמה',
  milestone: 'אבן דרך',
  installment: 'תשלום',
  retainer: 'ריטיינר',
  hosting: 'אחסון',
}

export function Receivables() {
  const { payments, schemaMissing, updatePayment } = useDealPayments()
  const { charges, schemaMissing: chargesMissing, updateCharge } = useRecurringCharges()
  const { deals } = useDeals()
  const today = todayYmd()
  const horizon = addDays(today, 30)
  const [tab, setTab] = useState<'due' | 'mrr'>('due')

  const dealTitle = useMemo(() => new Map(deals.map((d) => [d.id, d.title])), [deals])

  const rows = useMemo(() => {
    return payments
      .filter((p) => p.status !== 'paid')
      .map((p) => ({
        ...p,
        overdue: paymentIsOverdue(
          { id: p.id, dealId: p.dealId, amount: p.amount, status: p.status, dueDate: p.dueDate },
          today,
        ),
      }))
      .filter((p) => p.overdue || (p.dueDate && p.dueDate <= horizon))
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
  }, [payments, today, horizon])

  const overdueAmount = rows.filter((r) => r.overdue).reduce((s, r) => s + r.amount, 0)
  const mrr = monthlyRecurring(
    charges.map((c) => ({
      id: c.id,
      amount: c.amount,
      interval: c.interval,
      active: c.active,
      startDate: c.startDate,
      endDate: c.endDate,
    })),
    today,
  )

  return (
    <div className="beo-page space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">תקבולים</h1>
          <p className="mt-1 text-[13px] text-[var(--text-mid)]">
            באיחור {ils(overdueAmount)} · הכנסה חודשית חוזרת {ils(mrr)}
          </p>
        </div>
        <ExportExcelButton
          onClick={() =>
            downloadRtlExcel({
              filenamePrefix: 'תקבולים',
              sheets: [
                {
                  sheetName: 'תשלומים',
                  headers: ['עסקה', 'תאריך', 'סכום', 'סוג', 'סטטוס'],
                  rows: rows.map((r) => [
                    dealTitle.get(r.dealId) || r.dealId,
                    r.dueDate || '',
                    r.amount,
                    KIND_HE[r.kind] || r.kind,
                    r.overdue ? 'באיחור' : r.status,
                  ]),
                },
              ],
            })
          }
        />
      </header>
      {schemaMissing || chargesMissing ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950">
          טבלאות התשלומים עדיין לא הותקנו. מריצים את מיגרציות הצנרת אחרי אישור אור.
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="button" className={`rounded-xl px-3 py-1.5 text-sm font-bold ${tab === 'due' ? 'bg-[var(--brand)] text-white' : 'border'}`} onClick={() => setTab('due')}>
          קרוב ובאיחור
        </button>
        <button type="button" className={`rounded-xl px-3 py-1.5 text-sm font-bold ${tab === 'mrr' ? 'bg-[var(--brand)] text-white' : 'border'}`} onClick={() => setTab('mrr')}>
          הכנסה חוזרת
        </button>
      </div>
      {tab === 'due' ? (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
          <table className="w-full min-w-[640px] text-right text-[13px]">
            <thead className="bg-[var(--surface-muted)] text-[11px] font-bold text-[var(--text-light)]">
              <tr>
                {['עסקה', 'יעד', 'סכום', 'סוג', 'מצב', ''].map((h) => (
                  <th key={h} className="px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-[var(--text-mid)]">אין תשלומים פתוחים ב־30 הימים הקרובים</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">{dealTitle.get(r.dealId) || '—'}</td>
                  <td className="px-3 py-2">{r.dueDate || '—'}</td>
                  <td className="px-3 py-2 font-bold tabular-nums">{ils(r.amount)}</td>
                  <td className="px-3 py-2">{KIND_HE[r.kind] || r.kind}</td>
                  <td className={`px-3 py-2 ${r.overdue ? 'font-bold text-red-700' : ''}`}>{r.overdue ? 'באיחור' : 'מתוכנן'}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-[12px] font-bold text-[var(--brand)]"
                      onClick={() => void updatePayment(r.id, { status: 'paid', paidAt: new Date().toISOString() })}
                    >
                      סמן שולם
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="space-y-2">
          {charges.length === 0 ? <li className="text-[13px] text-[var(--text-mid)]">אין חיובים קבועים</li> : null}
          {charges.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2">
              <div>
                <p className="text-[13px] font-bold">{c.title || (c.kind === 'hosting' ? 'אחסון' : 'ריטיינר')}</p>
                <p className="text-[12px] text-[var(--text-mid)]">
                  {ils(c.amount)} · {c.interval === 'yearly' ? 'שנתי' : 'חודשי'} · הבא {c.nextDue || '—'}
                </p>
              </div>
              <button
                type="button"
                className="text-[12px] font-bold"
                onClick={() => void updateCharge(c.id, { active: !c.active })}
              >
                {c.active ? 'פעיל · השהה' : 'מושהה · הפעל'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
