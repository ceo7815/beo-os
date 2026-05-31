import { type ReactNode } from 'react'
import { isAdminRole } from '../components/RequireAdmin'
import { FinanceExpenseTypesProvider } from '../hooks/useFinanceExpenseTypes'
import { FinanceExpensesProvider } from '../hooks/useFinanceExpenses'
import { FinanceIncomesProvider } from '../hooks/useFinanceIncomes'
import { useAuth } from './AuthContext'
import { useUsers } from '../hooks/useUsers'

/** ספקי פיננסים — רק למנהלי מערכת (admin / superadmin). */
export function AdminFinanceProviders({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { users, loading } = useUsers()
  const role = users.find((m) => m.id === user?.uid)?.role ?? ''
  const isAdmin = Boolean(user) && !loading && isAdminRole(role)

  if (!isAdmin) {
    return children
  }

  return (
    <FinanceIncomesProvider>
      <FinanceExpensesProvider>
        <FinanceExpenseTypesProvider>{children}</FinanceExpenseTypesProvider>
      </FinanceExpensesProvider>
    </FinanceIncomesProvider>
  )
}
