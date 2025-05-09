//src/components/Layout/Navbar.tsx

import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useBalance } from '../../context/BalanceContext'
import { formatDistanceToNow } from 'date-fns'

interface NavbarProps {
  toggleTheme: () => void
  isDarkMode: boolean
}

export function Navbar({ toggleTheme, isDarkMode }: NavbarProps) {
  // <-- NEW: read directly from context -->
  const { balance, lastSync } = useBalance()
  const location = useLocation()
  const { signOut } = useAuth()

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)

  const isActive = (path: string) => location.pathname === path

  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link
              to="/dashboard"
              className="text-xl font-semibold text-blue-600 dark:text-blue-400"
            >
              Budget Calendar
            </Link>
            <div className="flex items-center space-x-1">
              <Link
                to="/dashboard"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive('/dashboard')
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                }`}
              >
                Dashboard
              </Link>
              <Link
                to="/transactions"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive('/transactions')
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                }`}
              >
                Transactions
              </Link>
              <Link
                to="/upcoming"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive('/upcoming')
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                }`}
              >
                Upcoming
              </Link>
              <Link
                to="/settings"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive('/settings')
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                }`}
              >
                Settings
              </Link>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {balance !== null && (
              <div className="text-right">
                <div className="font-medium text-gray-900 dark:text-white">
                  {formatCurrency(balance)}
                </div>
                {lastSync && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Last synced{' '}
                    {formatDistanceToNow(lastSync, { addSuffix: true })}
                  </div>
                )}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              aria-label={
                isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'
              }
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </nav>
  )
}