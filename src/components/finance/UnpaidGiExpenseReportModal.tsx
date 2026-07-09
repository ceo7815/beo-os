import { useMemo } from 'react'
import {
  buildUnpaidGiReportData,
  printUnpaidGiReport,
  type UnpaidGiReportData,
} from '../../lib/unpaidGiExpenseReport'
import { formatNis } from '../../lib/financeCalc'
import type { FinanceExpense } from '../../types'

export function UnpaidGiExpenseReportModal({
  open,
  onClose,
  expenses,
  ymFrom,
  ymTo,
}: {
  open: boolean
  onClose: () => void
  expenses: FinanceExpense[]
  ymFrom: string
  ymTo: string
}) {
  const data: UnpaidGiReportData = useMemo(
    () => buildUnpaidGiReportData(expenses, ymFrom, ymTo),
    [expenses, ymFrom, ymTo],
  )

  if (!open) return null

  const handlePrint = () => {
    try {
      printUnpaidGiReport(data)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'לא ניתן להדפיס את הדוח')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unpaid-gi-report-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#BFDBFE] bg-[var(--dash-panel-bg)] shadow-2xl">
        <div className="border-b border-[var(--border)] px-5 py-4 text-right">
          <h2
            id="unpaid-gi-report-title"
            className="text-lg font-extrabold text-[var(--text-dark)]"
          >
            דוח PDF — קיים ב-GI, חסר בבנק
          </h2>
          <p className="mt-1 text-[12px] text-[var(--text-mid)]">
            {data.periodLabel} · {data.rows.length} מסמכי GI · סה״כ{' '}
            {formatNis(data.totalAmount)}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-right">
          {data.rows.length === 0 ? (
            <p className="text-[13px] text-[var(--text-mid)]">
              אין מסמכי GI ללא בנק בתקופה — הכל מותאם או אין מסמכים מסונכרנים.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2 text-[12px] text-[#1E40AF]">
                הדוח ממוין לפי תאריך מסמך ב-GI, מקובץ לפי חודש. בדקו אם התשלום בוצע
                בחודש אחר, חסר ייבוא בנק, או שמדובר בזיכוי/טיוטה. בלחיצה — שמירה
                כ-PDF.
              </p>
              <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--bg-main)]">
                {data.rows.slice(0, 12).map((row) => (
                  <li
                    key={`${row.greenInvoiceId}-${row.index}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[12px]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-[var(--text-dark)]">
                        {row.supplier}
                      </div>
                      <div className="text-[11px] text-[var(--text-mid)]">
                        {row.documentDateLabel}
                        {row.invoiceNumber !== '—'
                          ? ` · חשבונית #${row.invoiceNumber}`
                          : ''}
                        {row.docKindLabel !== '—' ? ` · ${row.docKindLabel}` : ''}
                      </div>
                    </div>
                    <div className="shrink-0 font-extrabold tabular-nums text-[#1D4ED8]">
                      ₪{row.amount.toLocaleString('he-IL', { minimumFractionDigits: 2 })}
                    </div>
                  </li>
                ))}
              </ul>
              {data.rows.length > 12 ? (
                <p className="text-[11px] text-[var(--text-light)]">
                  + עוד {data.rows.length - 12} שורות בדוח המלא
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[13px] font-semibold text-[var(--text-mid)]"
          >
            סגור
          </button>
          <button
            type="button"
            disabled={data.rows.length === 0}
            onClick={handlePrint}
            className="rounded-[10px] bg-[#2563EB] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            הדפסה / שמירה כ-PDF
          </button>
        </div>
      </div>
    </div>
  )
}
