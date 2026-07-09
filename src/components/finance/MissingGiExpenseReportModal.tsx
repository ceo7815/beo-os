import { useMemo } from 'react'
import {
  buildMissingGiReportData,
  printMissingGiReport,
  type MissingGiReportData,
} from '../../lib/missingGiExpenseReport'
import { formatNis } from '../../lib/financeCalc'
import type { FinanceExpense, FinanceExpenseTypeDef } from '../../types'

export function MissingGiExpenseReportModal({
  open,
  onClose,
  expenses,
  ymFrom,
  ymTo,
  typeById,
  projectNameById,
}: {
  open: boolean
  onClose: () => void
  expenses: FinanceExpense[]
  ymFrom: string
  ymTo: string
  typeById?: Map<string, FinanceExpenseTypeDef>
  projectNameById?: Map<string, string>
}) {
  const data: MissingGiReportData = useMemo(
    () =>
      buildMissingGiReportData(expenses, ymFrom, ymTo, {
        typeById,
        projectNameById,
      }),
    [expenses, ymFrom, ymTo, typeById, projectNameById],
  )

  if (!open) return null

  const handlePrint = () => {
    try {
      printMissingGiReport(data)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'לא ניתן להדפיס את הדוח')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="missing-gi-report-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] shadow-2xl">
        <div className="border-b border-[var(--border)] px-5 py-4 text-right">
          <h2
            id="missing-gi-report-title"
            className="text-lg font-extrabold text-[var(--text-dark)]"
          >
            דוח PDF — חסר בחשבונית ירוקה
          </h2>
          <p className="mt-1 text-[12px] text-[var(--text-mid)]">
            {data.periodLabel} · {data.rows.length} תשלומי בנק · סה״כ{' '}
            {formatNis(data.totalAmount)}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-right">
          {data.rows.length === 0 ? (
            <p className="text-[13px] text-[var(--text-mid)]">
              אין תשלומי בנק חסרים בתקופה — הכל מסונכרן או פטור ממסמך.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[12px] text-[#92400E]">
                הדוח ממוין לפי תאריך תשלום בבנק, מקובץ לפי חודש, וכולל את כל
                הפרטים להזנה ב-GI. בלחיצה ייפתח חלון הדפסה — בחרו «שמור כ-PDF».
              </p>
              <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--bg-main)]">
                {data.rows.slice(0, 12).map((row) => (
                  <li
                    key={`${row.bankRef}-${row.index}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[12px]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-[var(--text-dark)]">
                        {row.merchant}
                      </div>
                      <div className="text-[11px] text-[var(--text-mid)]">
                        {row.paidDateLabel} · {row.typeLabel}
                        {row.bankRef !== '—' ? ` · אסמכתא ${row.bankRef}` : ''}
                      </div>
                    </div>
                    <div className="shrink-0 font-extrabold tabular-nums text-[var(--orange)]">
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
            className="hub-btn-orange text-[13px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            הדפסה / שמירה כ-PDF
          </button>
        </div>
      </div>
    </div>
  )
}
