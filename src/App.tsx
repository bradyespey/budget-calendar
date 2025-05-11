//src/App.tsx

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { RequireAuth } from './components/Layout/RequireAuth'
import { Layout } from './components/Layout/Layout'
import { LoginPage } from './pages/LoginPage'
import { AuthCallback } from './pages/AuthCallback'
import { DashboardPage } from './pages/DashboardPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { UpcomingPage } from './pages/UpcomingPage'
import { SettingsPage } from './pages/SettingsPage'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Protected */}
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Layout><DashboardPage /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/transactions"
            element={
              <RequireAuth>
                <Layout><TransactionsPage /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/upcoming"
            element={
              <RequireAuth>
                <Layout><UpcomingPage /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <Layout><SettingsPage /></Layout>
              </RequireAuth>
            }
          />

          {/* Redirects */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App