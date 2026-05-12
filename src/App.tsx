import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { FirestoreProviders } from './contexts/FirestoreProviders'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { RequireAdmin } from './components/RequireAdmin'
import { Clients } from './pages/Clients'
import { Collections } from './pages/Collections'
import { Dashboard } from './pages/Dashboard'
import { Hosting } from './pages/Hosting'
import { Campaigns } from './pages/Campaigns'
import { Leads } from './pages/Leads'
import { Login } from './pages/Login'
import { ProjectDetail } from './pages/ProjectDetail'
import { Projects } from './pages/Projects'
import { PromptLibrary } from './pages/PromptLibrary'
import { Suppliers } from './pages/Suppliers'
import { Calendar } from './pages/Calendar'
import { Tasks } from './pages/Tasks'
import { Users } from './pages/Users'
import { Attendance } from './pages/Attendance'
import { Vault } from './pages/Vault'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route element={<FirestoreProviders />}>
              <Route path="/" element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="clients" element={<Clients />} />
                <Route path="collections" element={<Collections />} />
                <Route path="suppliers" element={<Suppliers />} />
                <Route path="hosting" element={<Hosting />} />
                <Route path="campaigns" element={<Campaigns />} />
                <Route path="leads" element={<Leads />} />
                <Route path="projects" element={<Projects />} />
                <Route path="projects/:id" element={<ProjectDetail />} />
                <Route path="tasks" element={<Tasks />} />
                <Route path="calendar" element={<Calendar />} />
                <Route path="prompts" element={<PromptLibrary />} />
                <Route
                  path="users"
                  element={
                    <RequireAdmin>
                      <Users />
                    </RequireAdmin>
                  }
                />
                <Route path="attendance" element={<Attendance />} />
                <Route path="vault" element={<Vault />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
