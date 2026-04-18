//src/components/Layout/Navbar.tsx

import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  Eye,
  LayoutDashboard,
  LogIn,
  LogOut,
  Settings2,
  WalletCards,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useBalance } from '../../context/BalanceContext';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import { useState, useEffect } from 'react';
import { getHighLowProjections } from '../../api/projections';
import { ThemeToggleMenu } from '../ThemeToggleMenu';

interface NavbarProps {
  onTransactionsClick?: () => void;
}

export function Navbar({ onTransactionsClick }: NavbarProps) {
  const { balance, lastSync } = useBalance();
  const { signOut, signIn, session } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [thresholdBreach, setThresholdBreach] = useState<{ date: string; balance: number } | null>(null);

  // Fetch threshold breach data
  useEffect(() => {
    async function fetchThresholdBreach() {
      try {
        const highLowData = await getHighLowProjections();
        if (highLowData.thresholdBreach) {
          setThresholdBreach({ 
            date: highLowData.thresholdBreach.projDate, 
            balance: highLowData.thresholdBreach.projectedBalance 
          });
        } else {
          setThresholdBreach(null);
        }
      } catch (error) {
        console.error('Error fetching threshold breach:', error);
      }
    }
    fetchThresholdBreach();
  }, []);

  const formatCurrency = (amt: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amt);

  const isActive = (path: string) => pathname === path;

  const navLinks = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/transactions', label: 'Transactions', icon: WalletCards },
    { path: '/upcoming', label: 'Upcoming', icon: CalendarDays },
    { path: '/settings', label: 'Settings', icon: Settings2 },
  ];

  const handleSignIn = async () => {
    try {
      await signIn();
      navigate('/dashboard');
    } catch (error) {
      console.error('Sign in failed', error);
    }
  };

  const statusCards = (
    <div className="grid gap-3">
      <div className="stat-card">
        <p className="eyebrow mb-2">Current Balance</p>
        <p className="display-copy text-[1.9rem] text-[color:var(--text)]">
          {formatCurrency(balance ?? 0)}
        </p>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          {lastSync
            ? `Updated ${formatDistanceToNow(lastSync, { addSuffix: true }).replace('about ', '')}`
            : 'Preview data ready'}
        </p>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-2 text-[color:var(--warning)]">
          <AlertTriangle size={16} />
          <p className="eyebrow text-current">Next low point</p>
        </div>
        <p className="display-copy mt-3 text-[1.55rem] text-[color:var(--text)]">
          {thresholdBreach ? format(parseISO(thresholdBreach.date), 'MMM d') : 'No alert'}
        </p>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          {thresholdBreach ? formatCurrency(thresholdBreach.balance) : 'Projected balances stay above threshold.'}
        </p>
      </div>
    </div>
  )

  return (
    <>
      <aside className="hidden lg:block lg:w-[300px] lg:flex-shrink-0">
        <div className="surface-card sticky top-6 flex h-[calc(100vh-3rem)] flex-col overflow-y-auto overscroll-contain p-5">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-[color:var(--accent-soft)] text-[color:var(--accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
                <WalletCards size={26} />
              </div>

              <ThemeToggleMenu align="end" />
            </div>

            <div className="mt-5">
              <Link to="/dashboard" className="display-copy block text-[2.22rem] leading-[1.02] text-[color:var(--text)]">
                Budget Calendar
              </Link>
              <p className="mt-3 text-sm font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">
                Forecasts, transactions, and calendar sync
              </p>
              <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
                Keep balances, recurring payments, and Google Calendar aligned in one planning workspace.
              </p>
            </div>
          </div>

          {!session.isAuthenticated && (
            <div className="pill-chip mt-5 inline-flex w-fit items-center gap-2 px-3 py-2 text-xs font-semibold">
              <Eye size={14} />
              Demo mode
            </div>
          )}

          <div className="mt-6">{statusCards}</div>

          <nav className="mt-6 flex flex-1 flex-col gap-2">
            {navLinks.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-3 rounded-[20px] border px-4 py-3 text-sm font-semibold transition ${
                  isActive(path)
                    ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                    : 'border-transparent text-[color:var(--muted)] hover:border-[color:var(--line)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]'
                }`}
                onClick={() => {
                  if (path === '/transactions' && onTransactionsClick) {
                    onTransactionsClick();
                  }
                }}
              >
                <Icon size={18} />
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          <div className="surface-panel mt-6 p-4">
            <p className="eyebrow mb-2">Access</p>
            <p className="text-sm leading-6 text-[color:var(--muted)]">
              {session.isAuthenticated
                ? 'Live data is available for your account.'
                : 'Previewing mock financial data until you sign in.'}
            </p>
            <div className="mt-4">
              {session.isAuthenticated ? (
                <Button variant="outline" size="md" onClick={signOut} className="w-full">
                  <LogOut size={16} />
                  Sign Out
                </Button>
              ) : (
                <Button variant="primary" size="md" onClick={handleSignIn} className="w-full">
                  <LogIn size={16} />
                  Sign In
                </Button>
              )}
            </div>
          </div>
        </div>
      </aside>

      <div className="w-full lg:hidden">
        <div className="surface-card mb-5 w-full space-y-4 p-4 sm:p-5">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                <WalletCards size={24} />
              </div>

              <ThemeToggleMenu align="end" />
            </div>

            <div className="mt-4">
              <Link to="/dashboard" className="display-copy block text-[1.98rem] leading-[1.02] text-[color:var(--text)]">
                Budget Calendar
              </Link>
              <p className="mt-3 text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-[color:var(--muted)]">
                Forecasts, transactions, and calendar sync
              </p>
              <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
                Keep balances, recurring payments, and Google Calendar aligned in one planning workspace.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {statusCards}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {navLinks.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-2 rounded-[18px] border px-3 py-3 text-sm font-semibold transition ${
                  isActive(path)
                    ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                    : 'border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--muted)] hover:text-[color:var(--text)]'
                }`}
                onClick={() => {
                  if (path === '/transactions' && onTransactionsClick) {
                    onTransactionsClick();
                  }
                }}
              >
                <Icon size={16} />
                {label}
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {!session.isAuthenticated && (
              <div className="pill-chip inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold">
                <Eye size={14} />
                Demo mode
              </div>
            )}
            {session.isAuthenticated ? (
              <Button variant="outline" size="sm" onClick={signOut}>
                <LogOut size={16} />
                Sign Out
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={handleSignIn}>
                <LogIn size={16} />
                Sign In
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
