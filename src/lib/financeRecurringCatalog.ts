/** כללי זיהוי הוצאות חוזרות חודשיות (מקור אמת לסנכרון נתונים) */
export type RecurringExpenseRule = {
  id: string
  label: string
  terms: string[]
  amount?: number
  tolerance?: number
  /** התאמה לפי שם בלבד (ללא בדיקת סכום) */
  keywordOnly?: boolean
}

export const MONTHLY_RECURRING_EXPENSE_RULES: RecurringExpenseRule[] = [
  {
    id: 'green-invoice',
    label: 'חשבונית ירוקה',
    terms: ['חשבונית ירוקה', 'ירוקה'],
    amount: 97.94,
    tolerance: 8,
  },
  {
    id: 'paycall',
    label: 'Paycall',
    terms: ['paycall'],
    amount: 93,
    tolerance: 8,
  },
  {
    id: 'bituach-leumi',
    label: 'ביטוח לאומי',
    terms: ['ביטוח לאומי'],
    amount: 2082,
    tolerance: 150,
    keywordOnly: true,
  },
  {
    id: 'income-tax-withholding',
    label: 'מס הכנסה ניכויים',
    terms: ['ניכויים', 'מ"ה ניכויים', 'מס הכנסה ניכויים'],
    amount: 2175,
    tolerance: 150,
    keywordOnly: true,
  },
  {
    id: 'meitav-dash',
    label: 'מיטב דש',
    terms: ['מיטב דש', 'מיטב', 'meitav'],
    keywordOnly: true,
  },
  {
    id: 'google-workspace',
    label: 'Google Workspace',
    terms: ['google workspace'],
    amount: 117.6,
    tolerance: 15,
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude Team',
    terms: ['anthropic', 'claude team'],
    amount: 379.94,
    tolerance: 25,
  },
  {
    id: 'openai',
    label: 'OpenAI ChatGPT',
    terms: ['openai', 'chatgpt'],
    amount: 62,
    tolerance: 20,
  },
  {
    id: 'hetzner',
    label: 'Hetzner',
    terms: ['hetzner'],
    amount: 140,
    tolerance: 40,
  },
  {
    id: 'telezar-019',
    label: 'טלזר 019',
    terms: ['טלזר', '019'],
    amount: 124.5,
    tolerance: 20,
  },
  {
    id: 'spd',
    label: 'אס.פי.די',
    terms: ['אס.פי.די', 'אס פי די', 'spd', 'ס.פ.י'],
    amount: 518.26,
    tolerance: 30,
  },
  {
    id: 'xcloud',
    label: 'Xcloud Hosting',
    terms: ['xcloud'],
    amount: 80.46,
    tolerance: 15,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    terms: ['cursor'],
    amount: 60,
    tolerance: 25,
  },
]

export function expenseSearchBlob(exp: {
  name?: string
  description?: string
  supplierName?: string
  platformName?: string
  employeeName?: string
}): string {
  return [
    exp.name,
    exp.description,
    exp.supplierName,
    exp.platformName,
    exp.employeeName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function matchMonthlyRecurringExpense(exp: {
  name?: string
  description?: string
  supplierName?: string
  platformName?: string
  employeeName?: string
  amount: number
}): RecurringExpenseRule | null {
  const text = expenseSearchBlob(exp)
  const amount = exp.amount

  for (const rule of MONTHLY_RECURRING_EXPENSE_RULES) {
    const termHit = rule.terms.some((t) => text.includes(t.toLowerCase()))
    if (!termHit) continue
    if (rule.keywordOnly) return rule
    if (
      typeof rule.amount === 'number' &&
      Math.abs(amount - rule.amount) <= (rule.tolerance ?? 10)
    ) {
      return rule
    }
    if (typeof rule.amount !== 'number') return rule
  }
  return null
}

export function shouldExpenseRecurMonthly(exp: {
  name?: string
  description?: string
  supplierName?: string
  platformName?: string
  employeeName?: string
  amount: number
  recurring?: boolean
}): boolean {
  return matchMonthlyRecurringExpense(exp) != null
}
