import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { useEffect } from 'react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'

import Login from '@/pages/Login'
import Signup from '@/pages/Signup'
import AppLayout from '@/components/layout/AppLayout'
import Conversations from '@/pages/Conversations'
import Contacts from '@/pages/Contacts'
import Reports from '@/pages/Reports'
import Inboxes from '@/pages/settings/Inboxes'
import Agents from '@/pages/settings/Agents'
import CannedResponses from '@/pages/settings/CannedResponses'
import Labels from '@/pages/settings/Labels'
import OrgSettings from '@/pages/settings/OrgSettings'
import NotFound from '@/pages/NotFound'
import OAuthCallback from '@/pages/OAuthCallback'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

const Spinner = () => (
  <div className="flex items-center justify-center min-h-screen bg-background">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
)

const RootRedirect = () => {
  const { user, organization, loading } = useAuth()
  const navigate = useNavigate()

  console.log('[RootRedirect] loading:', loading, 'user:', !!user, 'org:', !!organization)

  useEffect(() => {
    console.log('[RootRedirect] useEffect — loading:', loading, 'user:', !!user, 'org:', organization?.slug)
    if (loading) return

    if (user && organization) {
      console.log('[RootRedirect] Navigating to:', `/app/${organization.slug}/conversations`)
      navigate(`/app/${organization.slug}/conversations`, { replace: true })
    } else if (!user) {
      console.log('[RootRedirect] No user, navigating to /login')
      navigate('/login', { replace: true })
    } else {
      console.warn('[RootRedirect] User exists but no org yet — waiting...')
    }
  }, [user, organization, loading])

  return <Spinner />
}

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth()
  console.log('[ProtectedRoute] loading:', loading, 'user:', !!user)
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
      element={
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      }
    >
      <Route index element={<Navigate to="conversations" replace />} />
      <Route path="conversations" element={<Conversations />} />
      <Route path="conversations/:conversationId" element={<Conversations />} />
      <Route path="contacts" element={<Contacts />} />
      <Route path="reports" element={<Reports />} />
      <Route path="settings" element={<Navigate to="settings/general" replace />} />
      <Route path="settings/general" element={<OrgSettings />} />
      <Route path="settings/inboxes" element={<Inboxes />} />
      <Route path="settings/agents" element={<Agents />} />
      <Route path="settings/canned-responses" element={<CannedResponses />} />
      <Route path="settings/labels" element={<Labels />} />
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
