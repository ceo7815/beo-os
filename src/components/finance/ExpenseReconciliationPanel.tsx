import { useMemo, useState } from 'react'
import { useMorningIntegration } from '../../hooks/useMorningIntegration'
import { toastFsSuccess } from '../../lib/fsToast'
import {
  auditExpenseDuplicates,
  isAccountantSelfFiledExpense,
  listMissingGiBankExpenses,
  listUnpaidGiExpenses,
  RECONCILIATION_STATUS_LABEL,
  reconciliationBadgeClass,
  summarizeExpenseReconciliation,
} from '../../lib/expenseReconciliation'
import type {
  ExpenseReconciliationStatus,
  FinanceExpense,
  FinanceExpenseTypeDef,
} from '../../types'
import { MissingGiExpenseReportModal } from './MissingGiExpenseReportModal'
import { UnpaidGiExpenseReportModal } from './UnpaidGiExpenseReportModal'

export function ExpenseReconciliationPanel({
  expenses,
  ymFrom,
  ymTo,
  typeById,
  projectNameById,
}: {
  expenses: FinanceExpense[]
  ymFrom: string
  ymTo: string
  typeById?: Map<string, FinanceExpenseTypeDef>
  projectNameById?: Map<string, string>
}) {
  const [reportOpen, setReportOpen] = useState(false)
  const [unpaidReportOpen, setUnpaidReportOpen] = useState(false)
  const { status, busy, error, reconcileExpenses } = useMorningIntegration()

  const summary = useMemo(
    () => summarizeExpenseReconciliation(expenses, ymFrom, ymTo),
    [expenses, ymFrom, ymTo],
  )

  const missingCount = useMemo(
    () => listMissingGiBankExpenses(expenses, ymFrom, ymTo).length,
    [expenses, ymFrom, ymTo],
  )

  const unpaidGiCount = useMemo(
    () => listUnpaidGiExpenses(expenses, ymFrom, ymTo).length,
    [expenses, ymFrom, ymTo],
  )

  const duplicateAudit = useMemo(
    () => auditExpenseDuplicates(expenses, ymFrom, ymTo),
    [expenses, ymFrom, ymTo],
  )

  const handleReconcile = async () => {
    const result = await reconcileExpenses()
    if (result) {
      toastFsSuccess(
        `התאמה עודכנה — ${result.matched} מלאות · ${result.bankMissingDocument} חסר ב-GI · ${result.giUnpaid} מסמכי GI ללא בנק`,
      )
    }
  }

  const connected = status?.connected ?? false

  return (
    <section className="rounded-2xl border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-[var(--text-dark)]">
            התאמת הוצאות — בנק מול חשבונית ירוקה
          </h2>
          <p className="mt-1 text-[12px] text-[var(--text-mid)]">
            הבנק = מקור האמת לתשלומים. ההוצאות נכנסות דרך הסוכן אחרי אישורך.
            הטבלה מסמנת כל תשלום שעדיין אין לו מסמך תואם.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={missingCount === 0}
            onClick={() => setReportOpen(true)}
            className="rounded-[10px] border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-sm font-semibold text-[#92400E] transition hover:bg-[#FEF3C7] disabled:cursor-not-allowed disabled:opacity-50"
          >
            דוח PDF — חסר ב-GI ({missingCount})
          </button>
          <button
            type="button"
            disabled={unpaidGiCount === 0}
            onClick={() => setUnpaidReportOpen(true)}
            className="rounded-[10px] border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2 text-sm font-semibold text-[#1E40AF] transition hover:bg-[#DBEAFE] disabled:cursor-not-allowed disabled:opacity-50"
          >
            דוח PDF — חסר בבנק ({unpaidGiCount})
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleReconcile()}
            className="rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-2 text-sm font-semibold text-[var(--orange)] transition hover:bg-[var(--orange-light)] disabled:opacity-50"
          >
            {busy ? 'מריץ…' : 'התאם מחדש'}
          </button>
        </div>
      </div>

      {!connected ? (
        <p className="mb-3 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[12px] text-[#92400E]">
          חיבור לחשבונית ירוקה לא מוגדר — הגדירו מפתחות בדף פיננסים → סנכרון
          Morning.
        </p>
      ) : null}

      {error ? (
        <p className="mb-3 text-[12px] font-semibold text-[#DC2626]">
          {error.includes('RESOURCE_EXHAUSTED') || error.includes('Quota exceeded')
            ? 'מכסת Firestore מלאה זמנית — נסו שוב בעוד דקה, או הפעילו חיוב ב-Firebase Console.'
            : error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ['matched', 'חשבונית בהתאמה מלאה', summary.matched, 'text-[#166534]'],
            [
              'bank_missing_document',
              'חסר בחשבונית ירוקה',
              summary.bankMissingDocument,
              'text-[#92400E]',
            ],
            [
              'document_not_required',
              'לא נדרש מסמך',
              summary.documentNotRequired,
              'text-[#166534]',
            ],
            ['gi_unpaid', 'מסמך GI ללא בנק', summary.giUnpaid, 'text-[#1E40AF]'],
          ] as const
        ).map(([id, label, count, color]) => (
          <div
            key={id}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-3 text-right"
          >
            <div className="text-[11px] font-bold text-[var(--text-mid)]">
              {label}
            </div>
            <div className={`mt-1 text-2xl font-extrabold tabular-nums ${color}`}>
              {count}
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--text-light)]">
              {RECONCILIATION_STATUS_LABEL[id]}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-[var(--text-mid)]">
        תשלומי בנק בתקופה: {summary.totalBank} · מסמכי GI בתקופה:{' '}
        {summary.totalGi}
        {summary.giUnpaid > 0 ? (
          <>
            {' '}
            · {summary.giUnpaid} מסמכי GI ללא תשלום מותאם (ייתכן חיוב בחודש
            אחר או טיוטה ב-GI)
          </>
        ) : null}
      </p>

      <div className="mt-3 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-2.5 text-[11px] text-[#166534]">
        <div className="font-bold">מניעת כפילויות בסיכומים</div>
        <p className="mt-1 leading-relaxed">
          ב-Firestore: {duplicateAudit.firestoreTotal} רשומות · נספרות בדוחות:{' '}
          {duplicateAudit.countedInReports} · מסמכי GI מוסתרים:{' '}
          {duplicateAudit.giHiddenCount}
          {duplicateAudit.giHiddenGrossInPeriod > 0
            ? ` (₪${duplicateAudit.giHiddenGrossInPeriod.toLocaleString('he-IL')} לא נספרו פעמיים)`
            : ''}
          · התאמות בנק↔GI: {duplicateAudit.matchedPairs}
        </p>
        {duplicateAudit.duplicateBankRefGroups > 0 ? (
          <p className="mt-1 font-semibold text-[#92400E]">
            אזהרה: {duplicateAudit.duplicateBankRefRows} שורות בנק עם אסמכתא
            כפולה ({duplicateAudit.duplicateBankRefGroups} קבוצות) — ייתכן
            ייבוא כפול מהבנק.
          </p>
        ) : (
          <p className="mt-1">אין כפילויות ייבוא בנק (אסמכתאות ייחודיות).</p>
        )}
      </div>

      <MissingGiExpenseReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        expenses={expenses}
        ymFrom={ymFrom}
        ymTo={ymTo}
        typeById={typeById}
        projectNameById={projectNameById}
      />

      <UnpaidGiExpenseReportModal
        open={unpaidReportOpen}
        onClose={() => setUnpaidReportOpen(false)}
        expenses={expenses}
        ymFrom={ymFrom}
        ymTo={ymTo}
      />
    </section>
  )
}

export function ExpenseReconciliationBadge({
  status,
  linkedGi,
  expense,
}: {
  status?: ExpenseReconciliationStatus
  linkedGi?: FinanceExpense
  expense?: FinanceExpense
}) {
  if (!status) return null
  const giNum = linkedGi?.greenInvoiceNumber
  const giSupplier =
    linkedGi?.greenInvoiceSupplierName ?? linkedGi?.supplierName
  const accountantSelfFiled =
    expense != null && isAccountantSelfFiledExpense(expense)
  const label = accountantSelfFiled
    ? 'חשבונית אצל רואה החשבון · סגור'
    : RECONCILIATION_STATUS_LABEL[status]
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold leading-tight ${reconciliationBadgeClass(status)}`}
    >
      <span className="truncate">
        {label}
        {!accountantSelfFiled && status === 'matched' && giNum
          ? ` · #${giNum}`
          : ''}
        {!accountantSelfFiled && status === 'matched' && giSupplier
          ? ` · ${giSupplier}`
          : ''}
      </span>
    </span>
  )
}
