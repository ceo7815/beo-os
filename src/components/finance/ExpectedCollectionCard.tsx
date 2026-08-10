import { useMemo } from 'react'
import { ExpectedCollectionScheduleEditor } from './ExpectedCollectionScheduleEditor'
import { formatNis } from '../../lib/financeCalc'
import { hasCollectionForecast } from '../../lib/expectedCollectionSchedule'
import type { FinanceIncome } from '../../types'

type Props = {
  income: FinanceIncome
  clientName: string
  outstanding: number
  onSave: Parameters<typeof ExpectedCollectionScheduleEditor>[0]['onSave']
}

export function ExpectedCollectionCard({
  income,
  clientName,
  outstanding,
  onSave,
}: Props) {
  const docLabel =
    income.invoiceNumber || income.greenInvoiceNumber || '—'

  const hasSchedule = useMemo(
    () => hasCollectionForecast(income, outstanding),
    [income, outstanding],
  )

  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)]/70 pb-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[11px] font-bold text-[var(--text-mid)]">לקוח</p>
          <p className="text-[14px] font-extrabold leading-snug text-[var(--text-dark)]">
            {clientName}
          </p>
        </div>
        <div className="space-y-1 text-left sm:text-right">
          <p className="text-[11px] font-bold text-[var(--text-mid)]">מסמך</p>
          <p className="tabular-nums text-[14px] font-bold text-[var(--text-dark)]">
            {docLabel}
          </p>
        </div>
        <div className="space-y-1 text-left sm:text-right">
          <p className="text-[11px] font-bold text-[var(--text-mid)]">יתרה</p>
          <p className="tabular-nums text-[16px] font-extrabold text-[#059669]">
            {formatNis(outstanding)}
          </p>
        </div>
        {!hasSchedule ? (
          <span className="rounded-full bg-[#FEF3C7] px-2.5 py-1 text-[10px] font-bold text-[#92400E]">
            ללא תאריך צפי
          </span>
        ) : (
          <span className="rounded-full bg-[#D1FAE5] px-2.5 py-1 text-[10px] font-bold text-[#065F46]">
            מתוזמן לתזרim
          </span>
        )}
      </header>

      <ExpectedCollectionScheduleEditor
        income={income}
        outstanding={outstanding}
        onSave={onSave}
      />
    </article>
  )
}
