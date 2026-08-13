import { Outlet } from 'react-router-dom'
import { FirestoreDocsSync } from '../components/FirestoreDocsSync'
import { HubRealtimeNotifications } from '../components/HubRealtimeNotifications'
import { ClientsProvider } from '../hooks/useClients'
import { CollectionTrackingProvider } from '../hooks/useCollectionTracking'
import { DealsProvider } from '../hooks/useDeals'
import { AdminFinanceProviders } from './AdminFinanceProviders'
import { InvoicesProvider } from '../hooks/useInvoices'
import { ProjectsProvider } from '../hooks/useProjects'
import { SuppliersProvider } from '../hooks/useSuppliers'
import { LeadsProvider } from '../hooks/useLeads'
import { CampaignsProvider } from '../hooks/useCampaigns'
import { TasksProvider } from '../hooks/useTasks'
import { UsersProvider } from '../hooks/useUsers'
import { HourlyServicesProvider } from '../hooks/useHourlyServices'
import { useAuth } from './AuthContext'

/** ספקי Firestore — רק אחרי auth מוכן ומשתמש מחובר. */
export function FirestoreProviders() {
  const { user, loading } = useAuth()

  if (loading || !user) return null

  return (
    <UsersProvider>
      <SuppliersProvider>
        <ClientsProvider>
          <CollectionTrackingProvider>
            <InvoicesProvider>
              <AdminFinanceProviders>
                <DealsProvider>
                  <CampaignsProvider>
                    <LeadsProvider>
                      <TasksProvider>
                        <ProjectsProvider>
                          <HourlyServicesProvider>
                            <FirestoreDocsSync />
                            <HubRealtimeNotifications />
                            <Outlet />
                          </HourlyServicesProvider>
                        </ProjectsProvider>
                      </TasksProvider>
                    </LeadsProvider>
                  </CampaignsProvider>
                </DealsProvider>
              </AdminFinanceProviders>
            </InvoicesProvider>
          </CollectionTrackingProvider>
        </ClientsProvider>
      </SuppliersProvider>
    </UsersProvider>
  )
}
