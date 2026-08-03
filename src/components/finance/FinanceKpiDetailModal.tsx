import type { ReactNode } from 'react'
import { Modal } from '../shared/Modal'
import { formatDateIL } from '../../lib/dates'
import { formatNis, type FinanceSummary } from '../../lib/financeCalc'
import type { ClientFinanceTarget } from './ClientFinanceCardModal'
import { FinanceClickable } from './FinanceClickable'
import {
  FINANCE_INCOME_DOCUMENT_LABELS,
  incomeDocumentKind,
} from '../../lib/financeIncomeDocument'
import {
  incomeOutstandingAmount,
  incomePaymentDate,
} from '../../lib/financeIncomePayment'
import {
  expenseDisplayName,
  resolveExpenseType,
} from '../../lib/financeExpenseTypes'
import {
  EXPENSE_VAT_CLASS_SHORT,
  resolveExpenseVatClass,
} from '../../lib/financeExpenseVat'
import { isVatRemittanceExpense } from '../../lib/financeSalaryMonth'
import { resolveExpenseRowVat, resolveIncomeVat } from '../../lib/israeliVat'
import type {
  FinanceExpense,
  FinanceExpenseTypeDef,
  FinanceIncome,
} from '../../types'

export type FinanceMetricId =
  | 'income'
  | 'expense'
  | 'profit'
  | 'incomeVat'
  | 'expenseInputVat'
  | 'vatPayable'
  | 'expenseNonVat'
  | 'grossProfit'
  | 'collection'

type FormulaRow = {
  label: string
  value: string
  sign?: '+' | '−' | '='
  valueClass?: string
  strong?: boolean
}

function FormulaBlock({ rows }: { rows: FormulaRow[] }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 p-3">
      {rows.map((r, i) => (
        <div
          key={i}
          className={`flex items-center justify-between gap-3 px-1 py-1.5 ${
            r.sign === '=' ? 'mt-1 border-t border-[var(--border)] pt-2.5' : ''
          }`}
        >
          <span
            className={`text-[12px] ${r.strong ? 'font-extrabold text-[var(--text-dark)]' : 'font-semibold text-[var(--text-mid)]'}`}
          >
            {r.sign && r.sign !== '=' ? (
              <span className="ml-1 inline-block w-3 text-center font-bold">
                {r.sign}
              </span>
            ) : null}
            {r.label}
          </span>
          <span
            className={`tabular-nums ${r.strong ? 'text-[16px] font-extrabold' : 'text-[13px] font-bold'} ${r.valueClass ?? 'text-[var(--text-dark)]'}`}
          >
            {r.value}
          </span>
        </div>
      ))}
    </div>
  )
}

type SourceCell =
  | string
  | { text: string; className?: string }
  | { node: ReactNode; className?: string }

function SourceTable({
  columns,
  rows,
  empty,
}: {
  columns: string[]
  rows: SourceCell[][]
  empty: string
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-4 text-center text-[12px] text-[var(--text-mid)]">
        {empty}
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]/50 text-[11px] font-bold text-[var(--text-mid)]">
            {columns.map((c, i) => (
              <th
                key={i}
                className={`px-2.5 py-2 ${i === columns.length - 1 ? 'text-left' : 'text-right'}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, ri) => (
            <tr
              key={ri}
              className="border-b border-[var(--border)] last:border-0"
            >
              {cells.map((cell, ci) => {
                const isObj = typeof cell === 'object' && cell !== null
                const hasNode = isObj && 'node' in cell
                const text =
                  !isObj ? cell : hasNode ? null : (cell as { text: string }).text
                const node = hasNode
                  ? (cell as { node: ReactNode }).node
                  : null
                const cls = isObj
                  ? (cell as { className?: string }).className
                  : undefined
                return (
                  <td
                    key={ci}
                    className={`px-2.5 py-2 ${ci === cells.length - 1 ? 'text-left tabular-nums font-bold' : 'text-right'} ${cls ?? ''}`}
                  >
                    {node ?? text}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const METRIC_TITLES: Record<FinanceMetricId, string> = {
  income: 'הכנסות (כולל מע״מ)',
  expense: 'הוצאות (כולל מע״מ)',
  profit: 'רווח נקי אמיתי',
  incomeVat: 'מע״מ עסקאות',
  expenseInputVat: 'מע״מ תשומות',
  vatPayable: 'מע״מ לתשלום',
  expenseNonVat: 'הוצאות ללא מע״מ',
  grossProfit: 'רווח גולמי',
  collection: 'יתרה לגבייה',
}

export function FinanceKpiDetailModal({
  metric,
  onClose,
  summary,
  incomes,
  expenses,
  collectionIncomes = [],
  expenseTypes,
  clientNameById,
  projectNameById,
  periodLabel,
  onClientClick,
}: {
  metric: FinanceMetricId | null
  onClose: () => void
  summary: FinanceSummary
  /** מסמכי הכנסה בפועל המסוננים לתקופה */
  incomes: FinanceIncome[]
  /** הוצאות מסוננות לתקופה */
  expenses: FinanceExpense[]
  /** חשבונות עסקה פתוחים — לא מסוננים לפי תאריך */
  collectionIncomes?: FinanceIncome[]
  expenseTypes: FinanceExpenseTypeDef[]
  clientNameById: Map<string, string>
  projectNameById: Map<string, string>
  periodLabel: string
  onClientClick?: (target: ClientFinanceTarget) => void
}) {
  const clientCell = (inc: FinanceIncome): SourceCell => {
    const label =
      clientNameById.get(inc.clientId) ?? inc.greenInvoiceClientName ?? '—'
    if (label === '—' || !onClientClick) return label
    return {
      node: (
        <FinanceClickable
          title="כרטיס פיננסי ללקוח"
          onClick={() =>
            onClientClick({
              clientId: inc.clientId?.trim() || undefined,
              clientName: label,
              guestName: !inc.clientId?.trim() ? label : undefined,
            })
          }
        >
          {label}
        </FinanceClickable>
      ),
    }
  }
  if (!metric) return null

  const expenseTypeById = new Map(expenseTypes.map((t) => [t.id, t]))
  /** הוצאות שנכנסות לרווח — בלי תשלום מע״מ לרשות (סילוק חוב) */
  const pnlExpenses = expenses.filter((e) => {
    const def = resolveExpenseType(e.type, expenseTypeById)
    return !isVatRemittanceExpense(e, def)
  })
  const vatLiableExpenses = pnlExpenses.filter(
    (e) => resolveExpenseVatClass(e) === 'vat_liable',
  )
  const nonVatExpenses = pnlExpenses.filter(
    (e) => resolveExpenseVatClass(e) !== 'vat_liable',
  )

  const incomeRow = (inc: FinanceIncome) => {
    const kind = incomeDocumentKind(inc)
    const vat = resolveIncomeVat(inc)
    const date =
      kind === 'tax_invoice_receipt' || kind === 'receipt'
        ? incomePaymentDate(inc)
        : inc.invoiceDate
    const client =
      clientNameById.get(inc.clientId) ?? inc.greenInvoiceClientName ?? '—'
    return { kind, vat, date, client }
  }

  const expenseRow = (exp: FinanceExpense) => {
    const typeDef = resolveExpenseType(exp.type, expenseTypeById)
    return {
      name: expenseDisplayName(exp, typeDef),
      typeLabel: typeDef.label,
      vatClass: resolveExpenseVatClass(exp),
      breakdown: resolveExpenseRowVat(exp),
      project: exp.projectId
        ? (projectNameById.get(exp.projectId) ?? '—')
        : '—',
    }
  }

  let explanation = ''
  let formula: FormulaRow[] | null = null
  let sourceNode: React.ReactNode = null

  if (metric === 'income') {
    explanation =
      'סכום ברוטו (כולל מע״מ) של כל מסמכי ההכנסה בפועל בתקופה: חשבונית מס קבלה (320) + חשבונית מס (305), בניכוי חשבוניות זיכוי (330). קבלות (400) אינן נספרות — הן תקבול כנגד חשבונית שכבר נספרה. המקור: חשבונית ירוקה.'
    sourceNode = (
      <SourceTable
        columns={['סוג מסמך', 'תאריך', 'לקוח', 'ברוטו']}
        empty="אין מסמכי הכנסה בתקופה"
        rows={incomes.map((inc) => {
          const r = incomeRow(inc)
          return [
            FINANCE_INCOME_DOCUMENT_LABELS[r.kind],
            formatDateIL(r.date),
            clientCell(inc),
            formatNis(r.vat.gross),
          ]
        })}
      />
    )
  } else if (metric === 'incomeVat') {
    explanation =
      'רכיב המע״מ מתוך כל מסמכי ההכנסה — מע״מ עסקאות. סכום זה שייך למדינה ומתקזז מול מע״מ תשומות לקביעת המע״מ לתשלום.'
    sourceNode = (
      <SourceTable
        columns={['סוג מסמך', 'תאריך', 'לקוח', 'מע״מ']}
        empty="אין מסמכי הכנסה בתקופה"
        rows={incomes.map((inc) => {
          const r = incomeRow(inc)
          return [
            FINANCE_INCOME_DOCUMENT_LABELS[r.kind],
            formatDateIL(r.date),
            clientCell(inc),
            { text: formatNis(r.vat.vat), className: 'text-[#6366F1]' },
          ]
        })}
      />
    )
  } else if (metric === 'expense') {
    explanation =
      'סכום ברוטו (כולל מע״מ) של הוצאות שנכנסות לרווח — חשבוניות ספקים והוצאות ללא מע״מ (ביטוח לאומי, מס הכנסה, ספקים פטורים). תשלום מע״מ לרשות המסים אינו נכלל כאן: הוא סילוק חוב שכבר מחושב בעמודת מע״מ לתשלום, ולא עלות עסק נוספת.'
    sourceNode = (
      <SourceTable
        columns={['שם הוצאה', 'סוג', 'פרויקט', 'ברוטו']}
        empty="אין הוצאות בתקופה"
        rows={pnlExpenses.map((exp) => {
          const r = expenseRow(exp)
          return [
            r.name,
            EXPENSE_VAT_CLASS_SHORT[r.vatClass],
            r.project,
            { text: formatNis(r.breakdown.gross), className: 'text-[#EF4444]' },
          ]
        })}
      />
    )
  } else if (metric === 'expenseInputVat') {
    explanation =
      'מע״מ ששולם על הוצאות חייבות מע״מ (תשומות) — ניתן לקיזוז מול מע״מ עסקאות. רק הוצאות חייבות מע״מ נכללות.'
    sourceNode = (
      <SourceTable
        columns={['שם הוצאה', 'סוג', 'ברוטו', 'מע״מ']}
        empty="אין הוצאות חייבות מע״מ בתקופה"
        rows={vatLiableExpenses.map((exp) => {
          const r = expenseRow(exp)
          return [
            r.name,
            r.typeLabel,
            formatNis(r.breakdown.gross),
            { text: formatNis(r.breakdown.vat), className: 'text-[#8B5CF6]' },
          ]
        })}
      />
    )
  } else if (metric === 'expenseNonVat') {
    explanation =
      'הוצאות ללא מע״מ תשומות — ביטוח לאומי, מס הכנסה וספקים פטורים. נספרות בסכום מלא ברווח. תשלום מע״מ לרשות אינו נכלל כאן (מוצג בנפרד כמע״מ לתשלום).'
    sourceNode = (
      <SourceTable
        columns={['שם הוצאה', 'סוג', 'פרויקט', 'סכום']}
        empty="אין הוצאות ללא מע״מ בתקופה"
        rows={nonVatExpenses.map((exp) => {
          const r = expenseRow(exp)
          return [
            r.name,
            EXPENSE_VAT_CLASS_SHORT[r.vatClass],
            r.project,
            { text: formatNis(r.breakdown.gross), className: 'text-[#64748B]' },
          ]
        })}
      />
    )
  } else if (metric === 'vatPayable') {
    explanation =
      'המע״מ המחושב מול המדינה: מע״מ עסקאות (שנגבה מלקוחות) בניכוי מע״מ תשומות (ששולם לספקים). ערך שלילי = החזר שמגיע. התשלום בפועל לרשות שנרשם בבנק אינו נגרע שוב מהרווח.'
    formula = [
      {
        label: 'מע״מ עסקאות',
        value: formatNis(summary.incomeVat),
        sign: '+',
        valueClass: 'text-[#6366F1]',
      },
      {
        label: 'מע״מ תשומות',
        value: formatNis(summary.expenseInputVat),
        sign: '−',
        valueClass: 'text-[#8B5CF6]',
      },
      {
        label: 'מע״מ לתשלום',
        value: formatNis(summary.vatPayable),
        sign: '=',
        valueClass: 'text-[#6366F1]',
        strong: true,
      },
    ]
  } else if (metric === 'grossProfit') {
    explanation =
      'רווח גולמי = הכנסות (כולל מע״מ) בניכוי הוצאות (כולל מע״מ), לפני קיזוז המע״מ מול המדינה.'
    formula = [
      {
        label: 'הכנסות (כולל מע״מ)',
        value: formatNis(summary.incomeGross),
        sign: '+',
        valueClass: 'text-[#10B981]',
      },
      {
        label: 'הוצאות (כולל מע״מ)',
        value: formatNis(
          summary.expenseVatLiableGross + summary.expenseNonVatTotal,
        ),
        sign: '−',
        valueClass: 'text-[#EF4444]',
      },
      {
        label: 'רווח גולמי',
        value: formatNis(summary.grossProfit),
        sign: '=',
        valueClass:
          summary.grossProfit >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]',
        strong: true,
      },
    ]
  } else if (metric === 'profit') {
    explanation =
      'רווח נקי אמיתי = הכנסות נטו − הוצאות נטו. המע״מ אינו חלק מהרווח: הוא מחושב בנפרד כ«מע״מ לתשלום». תשלום מע״מ לרשות שנרשם כהוצאה בבנק הוצא מהחישוב — אחרת המע״מ היה נגרע פעמיים.' +
      (summary.vatRemittanceExcluded > 0
        ? ` בתקופה זו הוצאו מהרווח ${formatNis(summary.vatRemittanceExcluded)} של תשלומי מע״מ.`
        : '')
    formula = [
      {
        label: 'הכנסות נטו',
        value: formatNis(summary.incomeNet),
        sign: '+',
        valueClass: 'text-[#10B981]',
      },
      {
        label: 'הוצאות נטו (בלי תשלום מע״מ לרשות)',
        value: formatNis(summary.expenseNetTotal),
        sign: '−',
        valueClass: 'text-[#EF4444]',
      },
      {
        label: 'רווח נקי אמיתי',
        value: formatNis(summary.trueNetProfit),
        sign: '=',
        valueClass:
          summary.trueNetProfit >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]',
        strong: true,
      },
    ]
  } else if (metric === 'collection') {
    const sorted = [...collectionIncomes].sort((a, b) =>
      b.invoiceDate.localeCompare(a.invoiceDate),
    )
    explanation =
      'סכום כל היתרות הפתוחות בחשבונות עסקה (מסמך 300) מחשבונית ירוקה. לא נספר כהכנסה עד שמתקבל תשלום ומופקת חשבונית מס קבלה. היתרה תמיד פעילה — לא מושפעת מפילטר התאריך.'
    formula = [
      {
        label: `${sorted.length} חשבונות עסקה פתוחים`,
        value: formatNis(summary.collectionBalance),
        sign: '=',
        valueClass: 'text-[#D97706]',
        strong: true,
      },
    ]
    sourceNode = (
      <SourceTable
        columns={['מספר', 'תאריך', 'לקוח', 'פרויקט', 'סכום מסמך', 'יתרה פתוחה']}
        empty="אין חשבונות עסקה פתוחים"
        rows={sorted.map((inc) => {
          const vat = resolveIncomeVat(inc)
          const outstanding = incomeOutstandingAmount(inc)
          const project = inc.projectId
            ? (projectNameById.get(inc.projectId) ?? '—')
            : '—'
          return [
            `#${inc.invoiceNumber || inc.greenInvoiceNumber || '—'}`,
            formatDateIL(inc.invoiceDate),
            clientCell(inc),
            project,
            formatNis(vat.gross),
            {
              text: formatNis(outstanding),
              className: 'text-[#D97706]',
            },
          ]
        })}
      />
    )
  }

  const shownPeriod =
    metric === 'collection' ? 'כל התקופות · לא מסונן לפי תאריך' : periodLabel

  return (
    <Modal
      isOpen={metric !== null}
      onClose={onClose}
      title={METRIC_TITLES[metric]}
      size="lg"
    >
      <div className="space-y-4">
        <div className="text-[12px] text-[var(--text-mid)]">{shownPeriod}</div>
        <p className="text-[13px] leading-relaxed text-[var(--text-dark)]">
          {explanation}
        </p>
        {formula ? <FormulaBlock rows={formula} /> : null}
        {sourceNode ? (
          <div>
            <h3 className="mb-2 text-[12px] font-extrabold text-[var(--text-dark)]">
              פירוט מקור
            </h3>
            {sourceNode}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
