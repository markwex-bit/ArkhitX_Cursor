import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectWorkspace from './pages/ProjectWorkspace'
import GovernancePage from './pages/GovernancePage'
import ToolsPage from './pages/ToolsPage'
import ApplicationsPage from './pages/ApplicationsPage'
import ApplicationDetailPage from './pages/ApplicationDetailPage'
import { useAuthStore } from './lib/stores/authStore'

export default function App() {
  const { token } = useAuthStore()

  if (!token) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    )
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/applications" />} />
        <Route path="/applications" element={<ApplicationsPage />} />
        <Route path="/applications/:slug" element={<ApplicationDetailPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectWorkspace />} />
        <Route path="/governance" element={<GovernancePage />} />
        <Route path="/tools" element={<ToolsPage />} />
        <Route path="*" element={<Navigate to="/applications" />} />
      </Routes>
    </Layout>
  )
}
