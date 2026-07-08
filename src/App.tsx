import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { FirestoreProviders } from './contexts/FirestoreProviders'
import { AgentPortalPreviewShell } from './components/AgentPortalPreviewShell'
import { AgentShell } from './components/AgentShell'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { RequireAdmin } from './components/RequireAdmin'
import { StaffRoutesGuard } from './components/StaffRoutesGuard'
import { AgentDashboard } from './pages/AgentDashboard'
import { AgentLeadsPage } from './pages/agent/AgentLeadsPage'
import { AgentBusinessPage } from './pages/agent/AgentBusinessPage'
import { AgentFinancePage } from './pages/agent/AgentFinancePage'
import { AgentsAdmin } from './pages/AgentsAdmin'
import { Clients } from './pages/Clients'
import { Collections } from './pages/Collections'
import { Dashboard } from './pages/Dashboard'
import { Expenses } from './pages/Expenses'
import { Finance } from './pages/Finance'
import { FinanceProjects } from './pages/FinanceProjects'
import { Income } from './pages/Income'
import { Hosting } from './pages/Hosting'
import { Campaigns } from './pages/Campaigns'
import { Leads } from './pages/Leads'
import { Login } from './pages/Login'
import { ProjectDetail } from './pages/ProjectDetail'
import { Projects } from './pages/Projects'
import { PromptLibrary } from './pages/PromptLibrary'
import { Suppliers } from './pages/Suppliers'
import { Calendar } from './pages/Calendar'
import { MeetingSummaries } from './pages/MeetingSummaries'
import { Tasks } from './pages/Tasks'
import { Users } from './pages/Users'
import { HourlyServices } from './pages/HourlyServices'
import { HourlyServiceDetail } from './pages/HourlyServiceDetail'
import { HourlyServiceShare } from './pages/HourlyServiceShare'
import { Attendance } from './pages/Attendance'
import { Vault } from './pages/Vault'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/share/hours/:token" element={<HourlyServiceShare />} />
          <Route element={<RequireAuth />}>
            <Route element={<FirestoreProviders />}>
              <Route path="agent" element={<AgentShell />}>
                <Route index element={<AgentDashboard />} />
                <Route path="leads" element={<AgentLeadsPage />} />
                <Route path="business" element={<AgentBusinessPage />} />
                <Route path="finance" element={<AgentFinancePage />} />
              </Route>
              <Route
                path="agents/preview/:agentUserId"
                element={
                  <RequireAdmin>
                    <AgentPortalPreviewShell />
                  </RequireAdmin>
                }
              >
                <Route index element={<AgentDashboard />} />
                <Route path="leads" element={<AgentLeadsPage />} />
                <Route path="business" element={<AgentBusinessPage />} />
                <Route path="finance" element={<AgentFinancePage />} />
              </Route>
              <Route element={<StaffRoutesGuard />}>
                <Route element={<Layout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="clients" element={<Clients />} />
                  <Route path="collections" element={<Collections />} />
                  <Route
                    path="finance"
                    element={
                      <RequireAdmin>
                        <Finance />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="finance/income"
                    element={
                      <RequireAdmin>
                        <Income />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="finance/expenses"
                    element={
                      <RequireAdmin>
                        <Expenses />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="finance/projects"
                    element={
                      <RequireAdmin>
                        <FinanceProjects />
                      </RequireAdmin>
                    }
                  />
                  <Route path="suppliers" element={<Suppliers />} />
                  <Route path="hosting" element={<Hosting />} />
                  <Route path="campaigns" element={<Campaigns />} />
                  <Route path="leads" element={<Leads />} />
                  <Route path="projects" element={<Projects />} />
                  <Route path="projects/:id" element={<ProjectDetail />} />
                  <Route path="tasks" element={<Tasks />} />
                  <Route path="hourly-services" element={<HourlyServices />} />
                  <Route
                    path="hourly-services/:id"
                    element={<HourlyServiceDetail />}
                  />
                  <Route path="calendar" element={<Calendar />} />
                  <Route
                    path="calendar/summaries"
                    element={<MeetingSummaries />}
                  />
                  <Route path="prompts" element={<PromptLibrary />} />
                  <Route
                    path="users"
                    element={
                      <RequireAdmin>
                        <Users />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="agents"
                    element={
                      <RequireAdmin>
                        <AgentsAdmin />
                      </RequireAdmin>
                    }
                  />
                  <Route path="attendance" element={<Attendance />} />
                  <Route path="vault" element={<Vault />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
