//src/components/Layout/Navbar.tsx

import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, AlertTriangle, Eye, LogIn } from 'lucide-react';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useBalance } from '../../context/BalanceContext';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import { useState, useEffect } from 'react';
import { getHighLowProjections } from '../../api/projections';

interface NavbarProps {
  onTransactionsClick?: () => void;
}

export function Navbar({ onTransactionsClick }: NavbarProps) {
  const { balance, lastSync } = useBalance();
  const { signOut, signIn, session } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/transactions', label: 'Transactions' },
    { path: '/upcoming', label: 'Upcoming' },
    { path: '/settings', label: 'Settings' },
  ];

  const handleSignIn = async () => {
    try {
      await signIn();
      navigate('/dashboard');
    } catch (error) {
      console.error("Sign in failed", error);
    }
  };

  return (
    <nav className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center space-x-8">
            {/* Logo */}
            <Link to="/dashboard" className="flex items-center gap-2 text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
              <span>Budget Calendar</span>
              {!session.isAuthenticated && (
                <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  <Eye size={12} className="mr-1" />
                  Demo Mode
                </span>
              )}
            </Link>
            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center space-x-2">
              {navLinks.map(({ path, label }) => (
                <Link
                  key={path}
                  to={path}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    isActive(path)
                      ? 'bg-blue-500 text-white shadow-md'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (path === '/transactions' && onTransactionsClick) {
                      onTransactionsClick();
                    }
                  }}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
          {/* Mobile Hamburger */}
          <div className="flex items-center md:hidden">
            {!session.isAuthenticated && (
               <span className="mr-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  <Eye size={12} className="mr-1" />
                  Demo
                </span>
            )}
            <button
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-900 dark:hover:text-white focus:outline-none"
              aria-label="Open main menu"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
          {/* Balance, theme, sign out (always visible) */}
          <div className="hidden md:flex items-baseline space-x-4">
            {balance != null && (
              <div className="text-right self-center">
                <div className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatCurrency(balance)}
                </div>
                {lastSync && (
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    As of {formatDistanceToNow(lastSync, { addSuffix: false }).replace('about ', '').replace(' hour', ' hr').replace(' hours', ' hrs').replace(' minute', ' min').replace(' minutes', ' mins')} ago
                  </div>
                )}
              </div>
            )}
            {thresholdBreach && (
              <div className="text-right self-center">
                <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                  <AlertTriangle size={14} />
                  <span className="text-sm font-medium">
                    Low: {format(parseISO(thresholdBreach.date), 'MMM d')}
                  </span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {formatCurrency(thresholdBreach.balance)}
                </div>
              </div>
            )}
            <div className="pt-1">
              {session.isAuthenticated ? (
              <Button variant="outline" size="sm" onClick={signOut}>
                Sign Out
              </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={handleSignIn} className="bg-blue-600 hover:bg-blue-700 text-white">
                  <LogIn size={16} className="mr-2" />
                  Sign In
                </Button>
              )}
            </div>
          </div>
        </div>
        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 pb-4">
            <div className="flex flex-col space-y-2 pt-3 px-2">
              {navLinks.map(({ path, label }) => (
                <Link
                  key={path}
                  to={path}
                  className={`px-4 py-3 rounded-lg text-base font-semibold transition-all ${
                    isActive(path)
                      ? 'bg-blue-500 text-white shadow-md'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (path === '/transactions' && onTransactionsClick) {
                      onTransactionsClick();
                    }
                  }}
                >
                  {label}
                </Link>
              ))}
              {/* Balance, theme, sign out for mobile */}
              {balance != null && (
                <div className="px-4 pt-2 text-right">
                  <div className="font-medium text-gray-900 dark:text-white">
                    {formatCurrency(balance)}
                  </div>
                  {lastSync && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Last synced {formatDistanceToNow(lastSync, { addSuffix: true })}
                    </div>
                  )}
                </div>
              )}
              <div className="px-4 pt-2">
                 {session.isAuthenticated ? (
                <Button variant="outline" size="sm" onClick={signOut} className="w-full">
                  Sign Out
                </Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={handleSignIn} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                    <LogIn size={16} className="mr-2" />
                    Sign In
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}