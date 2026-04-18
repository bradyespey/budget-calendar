//src/pages/LoginPage.tsx

import { Link, Navigate, useLocation } from 'react-router-dom'
import { ArrowRight, CircleDollarSign, Eye } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { session, signIn, loading } = useAuth()
  const location = useLocation()

  // ── Redirect if already signed in ────────────────────────
  if (session.isAuthenticated) {
    const from = (location.state as any)?.from?.pathname || '/dashboard'
    return <Navigate to={from} replace />
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="surface-card overflow-hidden p-8 sm:p-10 lg:p-12">
            <div className="pill-chip inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold">
              <Eye size={14} />
              Demo mode is available
            </div>
            <h1 className="display-copy mt-6 text-[3rem] sm:text-[4rem] text-[color:var(--text)]">
              Budget tracking that feels like a workspace, not a spreadsheet.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[color:var(--muted)]">
              Review projected balances, recurring bills, and calendar syncs from one warmer, faster shell. Sign in for live data, or keep exploring the full interface with preview data first.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                ['Forecasts', 'Projected highs, lows, and threshold alerts stay visible.'],
                ['Transactions', 'Recurring streams and manual bills share one cleaner workspace.'],
                ['Settings', 'Automation, maintenance, and theme controls stay easy to reach.'],
              ].map(([label, copy]) => (
                <div key={label} className="stat-card">
                  <p className="eyebrow mb-2">{label}</p>
                  <p className="text-sm leading-6 text-[color:var(--muted)]">{copy}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="surface-card mx-auto flex w-full max-w-md flex-col justify-center p-8 sm:p-10">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                <CircleDollarSign size={32} />
              </div>
              <h2 className="display-copy mt-5 text-[2.4rem] text-[color:var(--text)]">
                Open your budget calendar
              </h2>
              <p className="mt-3 text-sm leading-7 text-[color:var(--muted)]">
                Sign in for your real accounts and projections, or continue in preview mode while we keep live data protected.
              </p>
            </div>

            <div className="mt-8 space-y-3">
              <Button
                className="w-full justify-center"
                onClick={signIn}
                isLoading={loading}
                leftIcon={
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92
                         c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57
                         c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77
                         c-.98.66-2.23 1.06-3.71 1.06
                         -2.86 0-5.29-1.93-6.16-4.53H2.18v2.84
                         C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09
                         s.13-1.43.35-2.09V7.07H2.18
                         C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93
                         l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15
                         C17.45 2.09 14.97 1 12 1
                         7.7 1 3.99 3.47 2.18 7.07l3.66 2.84
                         c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                    <path d="M0 0h24v24H0z" fill="none" />
                  </svg>
                }
              >
                Sign in with Google
              </Button>

              <Link to="/dashboard" className="block">
                <Button variant="outline" className="w-full justify-center">
                  Continue in Demo
                  <ArrowRight size={16} />
                </Button>
              </Link>
            </div>

            <p className="mt-6 text-center text-sm leading-6 text-[color:var(--muted)]">
              Authorized users can access live financial data. Demo mode keeps the full layout available without touching real accounts.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
