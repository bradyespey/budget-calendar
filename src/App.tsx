//src/App.tsx

import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './components/ThemeProvider'
import { RequireAuth } from './components/Layout/RequireAuth'
import { Layout } from './components/Layout/Layout'
import { BalanceProvider } from './context/BalanceContext'

const LoginPage = lazy(async () => ({ default: (await import('./pages/LoginPage')).LoginPage }))
const DashboardPage = lazy(async () => ({ default: (await import('./pages/DashboardPage')).DashboardPage }))
const TransactionsPage = lazy(async () => ({ default: (await import('./pages/TransactionsPage')).TransactionsPage }))
const UpcomingPage = lazy(async () => ({ default: (await import('./pages/UpcomingPage')).UpcomingPage }))
const SettingsPage = lazy(async () => ({ default: (await import('./pages/SettingsPage')).SettingsPage }))

function App() {
  const routeFallback = (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="surface-card flex items-center gap-3 px-6 py-5">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[color:var(--line)] border-t-[color:var(--accent)]" />
        <div>
          <p className="eyebrow mb-2">Loading</p>
          <p className="text-sm text-[color:var(--muted)]">Opening your budget workspace.</p>
        </div>
      </div>
    </div>
  )

  return (
    <BrowserRouter>
      <ThemeProvider defaultTheme="system" storageKey="theme">
        <AuthProvider>
          <BalanceProvider>
            <Suspense fallback={routeFallback}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />


              {/* Protected (now act as demo-aware wrappers) */}
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
                <TransactionsPage />
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
            </Suspense>
          </BalanceProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
