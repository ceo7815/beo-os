import type {
  FinanceExpense,
  FinanceExpenseFieldMode,
  FinanceExpensePnlCategory,
  FinanceExpenseTypeDef,
  FinanceIncome,
} from '../types'
import {
  deriveExpensePnlMonth,
  expensePaymentMonth,
} from './financeExpensePnl'
import { monthsInRange, normalizeYmRange } from './financeMonthRange'

export const BUILTIN_FINANCE_EXPENSE_TYPES: FinanceExpenseTypeDef[] = [
  {
    id: 'fixed',
    label: 'קבועה',
    color: '#94A3B8',
    fieldMode: 'none',
    autoRecurring: false,
    pnlCategory: 'fixed',
    builtIn: true,
  },
  {
    id: 'one_time',
    label: 'חד פעמית כללית',
    color: '#F97316',
    fieldMode: 'none',
    autoRecurring: false,
    pnlCategory: 'fixed',
    builtIn: true,
  },
  {
    id: 'supplier',
    label: 'ספק',
    color: '#3B82F6',
    fieldMode: 'supplier',
    autoRecurring: false,
    pnlCategory: 'supplier',
    builtIn: true,
  },
  {
    id: 'platform',
    label: 'פלטפורמה',
    color: '#8B5CF6',
    fieldMode: 'platform',
    autoRecurring: false,
    pnlCategory: 'platform',
    builtIn: true,
  },
  {
    id: 'salary',
    label: 'משכורת',
    color: '#059669',
    fieldMode: 'salary',
    autoRecurring: false,
    pnlCategory: 'fixed',
    builtIn: true,
  },
]

export const EXPENSE_TYPE_COLOR_PRESETS = [
  '#94A3B8',
  '#3B82F6',
  '#8B5CF6',
  '#F97316',
  '#10B981',
  '#EF4444',
  '#F59E0B',
  '#6366F1',
] as const

export function mergeExpenseTypes(
  custom: FinanceExpenseTypeDef[],
): FinanceExpenseTypeDef[] {
  const customIds = new Set(custom.map((t) => t.id))
  const builtIn = BUILTIN_FINANCE_EXPENSE_TYPES.filter((t) => !customIds.has(t.id))
  return [...builtIn, ...custom].sort((a, b) =>
    a.label.localeCompare(b.label, 'he'),
  )
}

export function expenseTypeMap(
  types: FinanceExpenseTypeDef[],
): Map<string, FinanceExpenseTypeDef> {
  return new Map(types.map((t) => [t.id, t]))
}

export function resolveExpenseType(
  typeId: string,
  typeMap: Map<string, FinanceExpenseTypeDef>,
): FinanceExpenseTypeDef {
  return (
    typeMap.get(typeId) ?? {
      id: typeId,
      label: typeId,
      color: '#94A3B8',
      fieldMode: 'none',
      autoRecurring: false,
      pnlCategory: 'fixed',
    }
  )
}

/** חוזרת רק כשסומן במפורש על הרשומה */
export function isRecurringExpense(
  exp: FinanceExpense,
  _typeDef?: FinanceExpenseTypeDef,
): boolean {
  return exp.recurring === true
}

function parseYm(ym: string): { y: number; m: number } | null {
  const [ys, ms] = ym.split('-')
  const y = Number(ys)
  const m = Number(ms)
  if (!y || !m || m < 1 || m > 12) return null
  return { y, m }
}

/** האם ההוצאה חלה על חודש יעד (כולל הוצאות קבועות/חוזרות) */
export function expenseAppliesToMonth(
  exp: FinanceExpense,
  targetYm: string,
  typeDef: FinanceExpenseTypeDef,
  incomes: FinanceIncome[] = [],
): boolean {
  if (exp.projectId?.trim()) {
    return deriveExpensePnlMonth(exp, incomes) === targetYm
  }

  if (exp.billingMonth === targetYm) return true
  if (!isRecurringExpense(exp, typeDef)) return false

  const start = parseYm(exp.billingMonth)
  const target = parseYm(targetYm)
  if (!start || !target) return false
  if (target.y !== start.y) return false
  if (target.m < start.m) return false
  return true
}

export {
  deriveExpensePnlMonth,
  expenseReportMonth,
  expensePaymentMonth,
  expenseUsesPnlAttribution,
} from './financeExpensePnl'

export function expandExpensesForFilters(
  expenses: FinanceExpense[],
  filters: { ymFrom: string; ymTo: string; projectId: string; clientId: string },
  projectIdsForClient: Set<string>,
  typeMap: Map<string, FinanceExpenseTypeDef>,
  incomes: FinanceIncome[] = [],
): FinanceExpense[] {
  const { ymFrom, ymTo, projectId, clientId } = filters
  const { from, to } = normalizeYmRange(ymFrom, ymTo)

  const matchesClient = (exp: FinanceExpense): boolean => {
    if (!clientId) return true
    const direct = exp.clientId === clientId
    const viaProject =
      !!exp.projectId && projectIdsForClient.has(exp.projectId)
    return direct || viaProject
  }

  const expandForMonth = (ym: string): FinanceExpense[] => {
    const monthOut: FinanceExpense[] = []
    for (const exp of expenses) {
      if (projectId && exp.projectId !== projectId) continue
      if (!matchesClient(exp)) continue

      const def = resolveExpenseType(exp.type, typeMap)
      if (!expenseAppliesToMonth(exp, ym, def, incomes)) continue

      const payMonth = expensePaymentMonth(exp)

      if (exp.projectId?.trim()) {
        const reportMonth = deriveExpensePnlMonth(exp, incomes)
        monthOut.push({
          ...exp,
          billingMonth: payMonth,
          pnlMonth: reportMonth,
          ...(payMonth !== reportMonth ? { isPnlAttribution: true as const } : {}),
        })
        continue
      }

      if (exp.billingMonth === ym) {
        monthOut.push(exp)
      } else {
        monthOut.push({
          ...exp,
          billingMonth: ym,
          sourceBillingMonth: exp.billingMonth,
          isAutoOccurrence: true,
        })
      }
    }
    return monthOut
  }

  if (!from && !to) {
    const out: FinanceExpense[] = []
    for (const exp of expenses) {
      if (projectId && exp.projectId !== projectId) continue
      if (!matchesClient(exp)) continue
      out.push(exp)
    }
    return out
  }

  const out: FinanceExpense[] = []
  for (const ym of monthsInRange(from, to)) {
    out.push(...expandForMonth(ym))
  }
  return out
}

export function expenseTypeStyle(typeDef: FinanceExpenseTypeDef): {
  bg: string
  color: string
} {
  return { bg: typeDef.color, color: '#fff' }
}

export function defaultPnlForFieldMode(
  mode: FinanceExpenseFieldMode,
): FinanceExpensePnlCategory {
  if (mode === 'supplier') return 'supplier'
  if (mode === 'platform') return 'platform'
  return 'fixed'
}

export function expenseDisplayName(
  row: FinanceExpense,
  typeDef: FinanceExpenseTypeDef,
): string {
  if (typeDef.fieldMode === 'salary') {
    if (row.employeeName?.trim()) return `משכורת — ${row.employeeName.trim()}`
    return row.name?.trim() || 'משכורת'
  }
  return row.name?.trim() || row.description?.trim() || '—'
}

export function isOneTimeGeneralExpenseType(
  typeDef: Pick<FinanceExpenseTypeDef, 'id'>,
): boolean {
  return typeDef.id === 'one_time'
}
