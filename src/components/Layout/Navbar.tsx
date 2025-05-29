//src/components/Layout/Navbar.tsx

import { Link, useLocation } from 'react-router-dom';
import { Moon, Sun, Menu, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useBalance } from '../../context/BalanceContext';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';

interface NavbarProps {
  toggleTheme: () => void;
  isDarkMode: boolean;
}

export function Navbar({ toggleTheme, isDarkMode }: NavbarProps) {
  const { balance, lastSync } = useBalance();
  const { signOut } = useAuth();
  const { pathname } = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center space-x-8">
            {/* Logo */}
            <Link to="/dashboard" className="text-xl font-semibold text-blue-600 dark:text-blue-400">
              Budget Calendar
            </Link>
            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center space-x-1">
              {navLinks.map(({ path, label }) => (
                <Link
                  key={path}
                  to={path}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive(path)
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
          {/* Mobile Hamburger */}
          <div className="flex items-center md:hidden">
            <button
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-900 dark:hover:text-white focus:outline-none"
              aria-label="Open main menu"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
          {/* Balance, theme, sign out (always visible) */}
          <div className="hidden md:flex items-center space-x-4">
            {balance != null && (
              <div className="text-right">
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
            <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label="Toggle theme">
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign Out
            </Button>
          </div>
        </div>
        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 pb-4">
            <div className="flex flex-col space-y-1 pt-2">
              {navLinks.map(({ path, label }) => (
                <Link
                  key={path}
                  to={path}
                  className={`px-4 py-2 rounded-md text-base font-medium transition-colors ${
                    isActive(path)
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
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
              <div className="flex items-center px-4 pt-2 space-x-2">
                <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label="Toggle theme">
                  {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                </Button>
                <Button variant="outline" size="sm" onClick={signOut}>
                  Sign Out
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}