//src/pages/LoginPage.tsx

// ── Login page ─────────────────────────────────────────────────────────────
import { Navigate, useLocation } from 'react-router-dom'
import { CircleDollarSign } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { session, signIn, loading } = useAuth()
  const location = useLocation()

  // Redirect if already signed in
  if (session.isAuthenticated) {
    const from = location.state?.from?.pathname || '/dashboard'
    return <Navigate to={from} replace />
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-md p-8 border border-gray-200 dark:border-gray-700">
        {/* Logo & title */}
        <div className="text-center mb-8">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400">
              <CircleDollarSign size={32} />
            </div>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Budget Calendar</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Sign in to access your budget calendar
          </p>
        </div>

        {/* Google sign-in button */}
        <Button
          className="w-full flex items-center justify-center"
          onClick={signIn}
          isLoading={loading}
          leftIcon={
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              {/* Google “G” logo paths */}
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 ..."/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98..."/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43..."/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45..."/>
            </svg>
          }
        >
          Sign in with Google
        </Button>

        {/* Footer note */}
        <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          This application is private and only accessible to authorized users.
        </div>
      </div>
    </div>
  )
}