import { Outlet } from 'react-router-dom'
import { FirestoreDocsSync } from '../components/FirestoreDocsSync'
import { ClientsProvider } from '../hooks/useClients'
import { CollectionTrackingProvider } from '../hooks/useCollectionTracking'
import { InvoicesProvider } from '../hooks/useInvoices'
import { ProjectsProvider } from '../hooks/useProjects'
import { SuppliersProvider } from '../hooks/useSuppliers'
import { HostingProvider } from '../hooks/useHosting'
import { TasksProvider } from '../hooks/useTasks'
import { UsersProvider } from '../hooks/useUsers'

/** ספקי Firestore + סנכרון docs — ילדים חייבים להשתמש ב-hooks */
export function FirestoreProviders() {
  return (
    <UsersProvider>
      <SuppliersProvider>
        <ClientsProvider>
          <HostingProvider>
            <CollectionTrackingProvider>
              <InvoicesProvider>
                <TasksProvider>
                  <ProjectsProvider>
                    <FirestoreDocsSync />
                    <Outlet />
                  </ProjectsProvider>
                </TasksProvider>
              </InvoicesProvider>
            </CollectionTrackingProvider>
          </HostingProvider>
        </ClientsProvider>
      </SuppliersProvider>
    </UsersProvider>
  )
}
