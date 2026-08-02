import { useMemo } from 'react'
import { useFinanceExpenses } from './useFinanceExpenses'
import { listOpenReconciliationRows } from '../lib/expenseReconciliation'
import type { FinanceTabBadges } from '../components/finance/FinanceTabs'

/**
 * מה דורש טיפול ממך עכשיו במודול הפיננסים.
 *
 * מרוכז במקום אחד כדי שכל מסך יציג את אותם מספרים, ושלא יהיה צורך
 * להיכנס למסך רק כדי לגלות שאין בו כלום.
 */
export function useFinanceAttention(ymFrom?: string, ymTo?: string): FinanceTabBadges {
  const { expenses } = useFinanceExpenses()

  return useMemo(() => {
    const unmatched = listOpenReconciliationRows(expenses, ymFrom, ymTo).length
    return unmatched > 0 ? { unmatched } : {}
  }, [expenses, ymFrom, ymTo])
}
