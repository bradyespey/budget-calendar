import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { RequireAuth } from './components/Layout/RequireAuth';
import { Layout } from './components/Layout/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { UpcomingPage } from './pages/UpcomingPage';
import { SettingsPage } from './pages/SettingsPage';
import { AuthCallback } from './pages/AuthCallback';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          
          {/* Protected routes */}
          <Route path="/dashboard" element={
            <RequireAuth>
              <Layout>
                <DashboardPage />
              </Layout>
            </RequireAuth>
          } />
          
          <Route path="/transactions" element={
            <RequireAuth>
              <Layout>
                <TransactionsPage />
              </Layout>
            </RequireAuth>
          } />
          
          <Route path="/upcoming" element={
            <RequireAuth>
              <Layout>
                <UpcomingPage />
              </Layout>
            </RequireAuth>
          } />
          
          <Route path="/settings" element={
            <RequireAuth>
              <Layout>
                <SettingsPage />
              </Layout>
            </RequireAuth>
          } />
          
          {/* Redirect root to dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          
          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;