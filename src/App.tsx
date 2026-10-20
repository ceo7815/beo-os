import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { FirestoreProviders } from './contexts/FirestoreProviders'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { RequireAdmin } from './components/RequireAdmin'
import { StaffRoutesGuard } from './components/StaffRoutesGuard'
import { Clients } from './pages/Clients'
import { Collections } from './pages/Collections'
import { Dashboard } from './pages/Dashboard'
import { Finance } from './pages/Finance'
import { BeoExpenses } from './pages/BeoExpenses'
import { Campaigns } from './pages/Campaigns'
import { Leads } from './pages/Leads'
import { Pipeline } from './pages/Pipeline'
import { Receivables } from './pages/Receivables'
import { Login } from './pages/Login'
import { ProjectDetail } from './pages/ProjectDetail'
import { Projects } from './pages/Projects'
import { PromptLibrary } from './pages/PromptLibrary'
import { Suppliers } from './pages/Suppliers'
import { Tasks } from './pages/Tasks'
import { Users } from './pages/Users'
import { HourlyServices } from './pages/HourlyServices'
import { HourlyServiceDetail } from './pages/HourlyServiceDetail'
import { HourlyServiceShare } from './pages/HourlyServiceShare'
import { Vault } from './pages/Vault'
import { AiAgents } from './pages/AiAgents'
import { AiAgentsOverview } from './pages/ai-agents/AiAgentsOverview'
import { AiAgentBoard } from './pages/ai-agents/AiAgentBoard'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/share/hours/:token" element={<HourlyServiceShare />} />
          <Route element={<RequireAuth />}>
            <Route element={<FirestoreProviders />}>
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
                    path="finance/expenses"
                    element={
                      <RequireAdmin>
                        <BeoExpenses />
                      </RequireAdmin>
                    }
                  />
                  <Route path="finance/income" element={<Navigate to="/finance" replace />} />
                  <Route path="finance/reconciliation" element={<Navigate to="/finance" replace />} />
                  <Route path="finance/documents" element={<Navigate to="/finance" replace />} />
                  <Route path="finance/projects" element={<Navigate to="/finance" replace />} />
                  <Route path="finance/cashflow" element={<Navigate to="/finance" replace />} />
                  <Route path="finance/fixed-expenses" element={<Navigate to="/finance/expenses" replace />} />
                  <Route path="finance/retainers" element={<Navigate to="/finance" replace />} />
                  <Route path="suppliers" element={<Suppliers />} />
                  <Route path="campaigns" element={<Campaigns />} />
                  <Route path="leads" element={<Leads />} />
                  <Route path="pipeline" element={<Pipeline />} />
                  <Route path="receivables" element={<Receivables />} />
                  <Route path="projects" element={<Projects />} />
                  <Route path="projects/:id" element={<ProjectDetail />} />
                  <Route path="tasks" element={<Tasks />} />
                  <Route path="hourly-services" element={<HourlyServices />} />
                  <Route
                    path="hourly-services/:id"
                    element={<HourlyServiceDetail />}
                  />
                  <Route path="prompts" element={<PromptLibrary />} />
                  <Route
                    path="ai-agents"
                    element={
                      <RequireAdmin>
                        <AiAgents />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="ai-agents/overview"
                    element={
                      <RequireAdmin>
                        <AiAgentsOverview />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="ai-agents/:id"
                    element={
                      <RequireAdmin>
                        <AiAgentBoard />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="users"
                    element={
                      <RequireAdmin>
                        <Users />
                      </RequireAdmin>
                    }
                  />
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
