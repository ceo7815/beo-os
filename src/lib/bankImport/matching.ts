import type { FinanceExpense, FinanceExpenseVatClass } from '../../types'
import type { ParsedTransaction } from './types'

/** כלל מיפוי נלמד — נשמר לפי merchantKey ב-Firestore */
export type ImportRule = {
  /** מפתח מנורמל של בית העסק */
  merchantKey: string
  type?: string
  vatClass?: FinanceExpenseVatClass
  projectId?: string
  clientId?: string
  name?: string
  recurring?: boolean
}

/** הצעת שיוך לעסקה מיובאת */
export type ImportSuggestion = {
  type?: string
  vatClass?: FinanceExpenseVatClass
  projectId?: string
  clientId?: string
  name?: string
  recurring?: boolean
  /** מקור ההצעה — לתצוגה */
  source: 'rule' | 'history' | 'none'
}

/**
 * מנרמל שם בית עסק למפתח יציב:
 * - מוריד קודי אסמכתא אחרי '*' (FACEBK *SKP32 → facebk)
 * - מוריד ספרות נלוות (GOOGLE*ADS4872 → google ads)
 * - lowercase + צמצום רווחים
 */
export function merchantKey(description: string): string {
  let s = description.trim().toLowerCase()
  s = s.split('*')[0] ?? s
  s = s.replace(/[0-9]+/g, ' ')
  s = s.replace(/[^\p{L}\s]/gu, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  // עד 3 מילים ראשונות — מספיק לזיהוי ספק
  return s.split(' ').slice(0, 3).join(' ')
}

function normalizeExpenseName(exp: FinanceExpense): string {
  return merchantKey(exp.name ?? exp.description ?? exp.supplierName ?? '')
}

/**
 * בונה הצעת שיוך לעסקה: כלל נלמד קודם, אחרת הוצאה היסטורית עם אותו merchantKey.
 */
export function suggestForTransaction(
  tx: ParsedTransaction,
  rulesByKey: Map<string, ImportRule>,
  expenses: FinanceExpense[],
): ImportSuggestion {
  const key = merchantKey(tx.description)
  if (!key) return { source: 'none' }

  const rule = rulesByKey.get(key)
  if (rule) {
    return {
      type: rule.type,
      vatClass: rule.vatClass,
      projectId: rule.projectId,
      clientId: rule.clientId,
      name: rule.name,
      recurring: rule.recurring,
      source: 'rule',
    }
  }

  // התאמה היסטורית — ההוצאה האחרונה עם אותו merchantKey
  const matches = expenses
    .filter((e) => normalizeExpenseName(e) === key)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  const hist = matches[0]
  if (hist) {
    return {
      type: hist.type,
      vatClass: hist.vatClass,
      projectId: hist.projectId,
      clientId: hist.clientId,
      name: hist.name ?? tx.description,
      recurring: hist.recurring,
      source: 'history',
    }
  }

  return { source: 'none' }
}

/** מפתח דה-דופ — מזהה עסקה שכבר יובאה (לפי bankRef שמור) */
export function existingBankRefs(expenses: FinanceExpense[]): Set<string> {
  const s = new Set<string>()
  for (const e of expenses) {
    if (e.bankRef) s.add(e.bankRef)
  }
  return s
}
