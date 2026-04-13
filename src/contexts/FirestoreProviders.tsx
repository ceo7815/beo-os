import { Outlet } from 'react-router-dom'
import { FirestoreDocsSync } from '../components/FirestoreDocsSync'
import { ClientsProvider } from '../hooks/useClients'
import { InvoicesProvider } from '../hooks/useInvoices'
import { ProjectsProvider } from '../hooks/useProjects'
import { SuppliersProvider } from '../hooks/useSuppliers'
import { TasksProvider } from '../hooks/useTasks'
import { UsersProvider } from '../hooks/useUsers'

/** ספקי Firestore + סנכרון docs — ילדים חייבים להשתמש ב-hooks */
export function FirestoreProviders() {
  return (
    <UsersProvider>
      <SuppliersProvider>
        <ClientsProvider>
          <InvoicesProvider>
            <TasksProvider>
              <ProjectsProvider>
                <FirestoreDocsSync />
                <Outlet />
              </ProjectsProvider>
            </TasksProvider>
          </InvoicesProvider>
        </ClientsProvider>
      </SuppliersProvider>
    </UsersProvider>
  )
}
