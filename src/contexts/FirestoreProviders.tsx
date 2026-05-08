import { Outlet } from 'react-router-dom'
import { FirestoreDocsSync } from '../components/FirestoreDocsSync'
import { ClientsProvider } from '../hooks/useClients'
import { CollectionTrackingProvider } from '../hooks/useCollectionTracking'
import { InvoicesProvider } from '../hooks/useInvoices'
import { ProjectsProvider } from '../hooks/useProjects'
import { SuppliersProvider } from '../hooks/useSuppliers'
import { HostingProvider } from '../hooks/useHosting'
import { LeadsProvider } from '../hooks/useLeads'
import { CampaignsProvider } from '../hooks/useCampaigns'
import { TasksProvider } from '../hooks/useTasks'
import { AttendanceProvider } from '../hooks/useAttendance'
import { UsersProvider } from '../hooks/useUsers'
import { useAuth } from './AuthContext'

/** ספקי Firestore — רק אחרי auth מוכן ומשתמש מחובר. */
export function FirestoreProviders() {
  const { user, loading } = useAuth()

  if (loading || !user) return null

  return (
    <UsersProvider>
      <SuppliersProvider>
        <ClientsProvider>
          <HostingProvider>
            <CollectionTrackingProvider>
              <InvoicesProvider>
                <CampaignsProvider>
                  <LeadsProvider>
                    <AttendanceProvider>
                      <TasksProvider>
                        <ProjectsProvider>
                          <FirestoreDocsSync />
                          <Outlet />
                        </ProjectsProvider>
                      </TasksProvider>
                    </AttendanceProvider>
                  </LeadsProvider>
                </CampaignsProvider>
              </InvoicesProvider>
            </CollectionTrackingProvider>
          </HostingProvider>
        </ClientsProvider>
      </SuppliersProvider>
    </UsersProvider>
  )
}
