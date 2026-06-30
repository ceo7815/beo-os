import { Modal } from '../shared/Modal'
import { formatDateIL } from '../../lib/dates'
import { formatNis, type FinanceSummary } from '../../lib/financeCalc'
import {
  FINANCE_INCOME_DOCUMENT_LABELS,
  incomeDocumentKind,
} from '../../lib/financeIncomeDocument'
import { incomePaymentDate } from '../../lib/financeIncomePayment'
import {
  expenseDisplayName,
  resolveExpenseType,
} from '../../lib/financeExpenseTypes'
import {
  EXPENSE_VAT_CLASS_SHORT,
  resolveExpenseVatClass,
} from '../../lib/financeExpenseVat'
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

function SourceTable({
  columns,
  rows,
  empty,
}: {
  columns: string[]
  rows: (string | { text: string; className?: string })[][]
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
                const isObj = typeof cell === 'object'
                const text = isObj ? cell.text : cell
                const cls = isObj ? cell.className : undefined
                return (
                  <td
                    key={ci}
                    className={`px-2.5 py-2 ${ci === cells.length - 1 ? 'text-left tabular-nums font-bold' : 'text-right'} ${cls ?? ''}`}
                  >
                    {text}
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
}

export function FinanceKpiDetailModal({
  metric,
  onClose,
  summary,
  incomes,
  expenses,
  expenseTypes,
  clientNameById,
  projectNameById,
  periodLabel,
}: {
  metric: FinanceMetricId | null
  onClose: () => void
  summary: FinanceSummary
  /** מסמכי הכנסה בפועל המסוננים לתקופה */
  incomes: FinanceIncome[]
  /** הוצאות מסוננות לתקופה */
  expenses: FinanceExpense[]
  expenseTypes: FinanceExpenseTypeDef[]
  clientNameById: Map<string, string>
  projectNameById: Map<string, string>
  periodLabel: string
}) {
  if (!metric) return null

  const expenseTypeById = new Map(expenseTypes.map((t) => [t.id, t]))
  const vatLiableExpenses = expenses.filter(
    (e) => resolveExpenseVatClass(e) === 'vat_liable',
  )
  const nonVatExpenses = expenses.filter(
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
            r.client,
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
            r.client,
            { text: formatNis(r.vat.vat), className: 'text-[#6366F1]' },
          ]
        })}
      />
    )
  } else if (metric === 'expense') {
    explanation =
      'סכום ברוטו (כולל מע״מ) של כל ההוצאות בתקופה — הוצאות חייבות מע״מ (חשבוניות ספקים) והוצאות ללא מע״מ (ביטוח לאומי, מסים, ספקים פטורים). ההוצאות מנוהלות ידנית.'
    sourceNode = (
      <SourceTable
        columns={['שם הוצאה', 'סוג', 'פרויקט', 'ברוטו']}
        empty="אין הוצאות בתקופה"
        rows={expenses.map((exp) => {
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
      'הוצאות ללא מע״מ — תשלומים חוקיים (ביטוח לאומי, מס הכנסה, מע״מ לתשלום) וספקים פטורים. אינן ניתנות לקיזוז מע״מ ונספרות בסכום מלא.'
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
      'המע״מ שיש להעביר למדינה: מע״מ עסקאות (שנגבה מלקוחות) בניכוי מע״מ תשומות (ששולם לספקים). לא יורד מתחת לאפס.'
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
      'השורה התחתונה. מתחילים מהכנסות כולל מע״מ, מורידים הוצאות כולל מע״מ (= רווח גולמי), ואז מורידים את המע״מ לתשלום למדינה.'
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
      },
      {
        label: 'מע״מ לתשלום',
        value: formatNis(summary.vatPayable),
        sign: '−',
        valueClass: 'text-[#6366F1]',
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
  }

  return (
    <Modal
      isOpen={metric !== null}
      onClose={onClose}
      title={METRIC_TITLES[metric]}
      size="lg"
    >
      <div className="space-y-4">
        <div className="text-[12px] text-[var(--text-mid)]">{periodLabel}</div>
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
