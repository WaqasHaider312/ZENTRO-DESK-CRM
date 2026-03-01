import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { useEffect } from 'react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'

import Login from '@/pages/Login'
import Signup from '@/pages/Signup'
import AppLayout from '@/components/layout/AppLayout'
import SettingsLayout from '@/components/layout/SettingsLayout'
import Conversations from '@/pages/Conversations'
import Contacts from '@/pages/Contacts'
import Reports from '@/pages/Reports'
import Inboxes from '@/pages/settings/Inboxes'
import Agents from '@/pages/settings/Agents'
import CannedResponses from '@/pages/settings/CannedResponses'
import Labels from '@/pages/settings/Labels'
import OrgSettings from '@/pages/settings/OrgSettings'
import AISettings from '@/pages/settings/AISettings'
import AutoAssign from '@/pages/settings/AutoAssign'
import NotFound from '@/pages/NotFound'
import OAuthCallback from '@/pages/OAuthCallback'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

const Spinner = () => (
  <div className="flex items-center justify-center min-h-screen bg-background">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
)

const RootRedirect = () => {
  const { user, organization, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (user && organization) {
      navigate(`/app/${organization.slug}/conversations`, { replace: true })
    } else if (!user) {
      navigate('/login', { replace: true })
    }
  }, [user, organization, loading])

  return <Spinner />
}

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<RootRedirect />} />
    <Route path="/login" element={<Login />} />
    <Route path="/signup" element={<Signup />} />
    <Route path="/oauth/callback" element={<OAuthCallback />} />

    <Route
      path="/app/:orgSlug"
      element={<ProtectedRoute><AppLayout /></ProtectedRoute>}
    >
      <Route index element={<Navigate to="conversations" replace />} />
      <Route path="conversations" element={<Conversations />} />
      <Route path="conversations/:conversationId" element={<Conversations />} />
      <Route path="contacts" element={<Contacts />} />
      <Route path="reports" element={<Reports />} />

      {/* Settings — own layout with sidebar */}
      <Route path="settings" element={<SettingsLayout />}>
        <Route index element={<Navigate to="general" replace />} />
        <Route path="general" element={<OrgSettings />} />
        <Route path="inboxes" element={<Inboxes />} />
        <Route path="agents" element={<Agents />} />
        <Route path="canned-responses" element={<CannedResponses />} />
        <Route path="labels" element={<Labels />} />
        <Route path="ai" element={<AISettings />} />
        <Route path="auto-assign" element={<AutoAssign />} />
      </Route>
    </Route>

    <Route path="*" element={<NotFound />} />
  </Routes>
)

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster position="top-right" richColors closeButton />
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
)

export default App