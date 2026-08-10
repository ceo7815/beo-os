import { type ReactNode } from 'react'
import { userIsAdmin } from '../components/RequireAdmin'
import { FinanceExpenseTypesProvider } from '../hooks/useFinanceExpenseTypes'
import { FinanceExpensesProvider } from '../hooks/useFinanceExpenses'
import { FinanceIncomesProvider } from '../hooks/useFinanceIncomes'
import { FinanceCashflowProvider } from '../hooks/useFinanceCashflow'
import { FinanceFixedExpenseCatalogProvider } from '../hooks/useFinanceFixedExpenseCatalog'
import { useHubStore } from '../store/useStore'
import { useAuth } from './AuthContext'
import { useUsers } from '../hooks/useUsers'

/** ספקי פיננסים — רק למנהלי מערכת (admin / superadmin). */
export function AdminFinanceProviders({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { users, loading } = useUsers()
  const hubUser = useHubStore((s) => s.currentUser)
  const isAdmin =
    Boolean(user) && !loading && userIsAdmin(user?.uid, users, hubUser)

  if (!isAdmin) {
    return children
  }

  return (
    <FinanceIncomesProvider>
      <FinanceExpensesProvider>
        <FinanceExpenseTypesProvider>
          <FinanceCashflowProvider>
            <FinanceFixedExpenseCatalogProvider>
              {children}
            </FinanceFixedExpenseCatalogProvider>
          </FinanceCashflowProvider>
        </FinanceExpenseTypesProvider>
      </FinanceExpensesProvider>
    </FinanceIncomesProvider>
  )
}
