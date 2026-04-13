import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { FirestoreProviders } from './contexts/FirestoreProviders'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { Clients } from './pages/Clients'
import { Collections } from './pages/Collections'
import { Dashboard } from './pages/Dashboard'
import { Login } from './pages/Login'
import { ProjectDetail } from './pages/ProjectDetail'
import { Projects } from './pages/Projects'
import { Suppliers } from './pages/Suppliers'
import { Tasks } from './pages/Tasks'

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
                <Route path="projects" element={<Projects />} />
                <Route path="projects/:id" element={<ProjectDetail />} />
                <Route path="tasks" element={<Tasks />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
