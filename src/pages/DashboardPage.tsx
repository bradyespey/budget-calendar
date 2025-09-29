//src/pages/DashboardPage.tsx

import { useEffect, useState } from 'react'
import {
  Wallet,
  PiggyBank,
  CreditCard,
  TrendingDown,
  TrendingUp,
  ArrowUpCircle,
  ArrowDownCircle,
  Calculator,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardContent } from '../components/ui/Card'
import { SavingsChart } from '../components/SavingsChart'
import { getHighLowProjections } from '../api/projections'
import { getBills } from '../api/bills'
import { getSavingsBalance, getSavingsHistory, getCreditCardDebt } from '../api/accounts'
import { Bill, Projection } from '../types'
import { format, parseISO } from 'date-fns'
import { useBalance } from '../context/BalanceContext'
import { getFunctionTimestamps, getSettings, getMonthlyCashFlow } from '../api/firebase'

interface CategoryAverage {
  monthly: number
  yearly: number
}

interface BillsIncome {
  bills: number
  income: number
}

interface BillsSummary {
  oneTime: BillsIncome
  daily: BillsIncome
  weekly: BillsIncome
  monthly: BillsIncome
  yearly: BillsIncome
}

export function DashboardPage() {
  // ── State ─────────────────────────────────────────────────────────────
  const [, setBills] = useState<Bill[]>([])
  const [highLow, setHighLow] = useState<{ highest?: Projection; lowest?: Projection }>({})
  const [categoryAverages, setCategoryAverages] = useState<Record<string, CategoryAverage>>({})
  const [billsSummary, setBillsSummary] = useState<BillsSummary>({
    oneTime: { bills: 0, income: 0 },
    daily: { bills: 0, income: 0 },
    weekly: { bills: 0, income: 0 },
    monthly: { bills: 0, income: 0 },
    yearly: { bills: 0, income: 0 },
  })
  const [monthlyTotals, setMonthlyTotals] = useState({ income: 0, bills: 0, leftover: 0 })
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState<'category' | 'monthly' | 'yearly'>('category')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [refreshAccountsTimestamp, setRefreshAccountsTimestamp] = useState<Date | null>(null)
  const [savingsBalance, setSavingsBalance] = useState<number | null>(null)
  const [savingsHistory, setSavingsHistory] = useState<Array<{ balance: number; timestamp: Date }>>([])
  const [creditCardDebt, setCreditCardDebt] = useState<number | null>(null)
  const [projectionDays, setProjectionDays] = useState<number>(7)
  const [thresholdBreach, setThresholdBreach] = useState<{ date: string; balance: number } | null>(null)
  const [settings, setSettings] = useState<any>(null)

  const { balance: checkingBalance, lastSync } = useBalance()

  // Load refresh accounts timestamp
  const loadTimestamp = async () => {
    try {
      const timestamps = await getFunctionTimestamps();
      if (timestamps.refreshAccounts) {
        setRefreshAccountsTimestamp(timestamps.refreshAccounts);
      }
    } catch (err) {
      console.error('Error loading timestamp:', err);
    }
  };

  // Format timestamp for display
  const formatTimestamp = (date: Date | null): string => {
    if (!date) return 'Never updated';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMinutes < 1) return 'Just updated';
    if (diffMinutes < 60) return `Updated ${diffMinutes}m ago`;
    if (diffHours < 24) return `Updated ${diffHours}h ago`;
    if (diffDays < 7) return `Updated ${diffDays}d ago`;
    
    return `Updated ${date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`;
  };

  // ── Fetch data ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const [billsData, highLowData, savings, history, creditCards, settings, monthlyCashFlow] = await Promise.all([
          getBills(),
          getHighLowProjections(),
          getSavingsBalance(),
          getSavingsHistory(),
          getCreditCardDebt(),
          getSettings(),
          getMonthlyCashFlow(),
        ])
        setBills(billsData)
        setHighLow(highLowData)
        setSavingsBalance(savings)
        setSavingsHistory(history)
        setCreditCardDebt(creditCards)
        setProjectionDays(settings.projectionDays ?? 7)
        setSettings(settings)
        
        // Get threshold breach from projections (set by budgetProjection function)
        if (highLowData.thresholdBreach) {
          setThresholdBreach({ date: highLowData.thresholdBreach.projDate, balance: highLowData.thresholdBreach.projectedBalance })
        } else {
          setThresholdBreach(null)
        }
        
        // Set Monthly Cash Flow from API (calculated by budgetProjection function)
        setCategoryAverages(monthlyCashFlow.categories || {})
        setBillsSummary(monthlyCashFlow.summary || {
          oneTime: { bills: 0, income: 0 },
          daily: { bills: 0, income: 0 },
          weekly: { bills: 0, income: 0 },
          monthly: { bills: 0, income: 0 },
          yearly: { bills: 0, income: 0 },
        })
        setMonthlyTotals(monthlyCashFlow.monthlyTotals || { income: 0, bills: 0, leftover: 0 })
        loadTimestamp()
      } catch (e) {
        console.error('Error fetching dashboard data:', e)
        // Ensure cards render zeros rather than staying empty
        setCategoryAverages({})
        setBillsSummary({
          oneTime: { bills: 0, income: 0 },
          daily: { bills: 0, income: 0 },
          weekly: { bills: 0, income: 0 },
          monthly: { bills: 0, income: 0 },
          yearly: { bills: 0, income: 0 },
        })
        setMonthlyTotals({ income: 0, bills: 0, leftover: 0 })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])


  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(amount))

  const handleSort = (field: 'category' | 'monthly' | 'yearly') => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (field: 'category' | 'monthly' | 'yearly') => {
    if (field !== sortField) return '↕️'
    return sortDirection === 'asc' ? '↑' : '↓'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    )
  }

  // ── UI ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 px-4 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Financial Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Your financial overview at a glance with current account balance, projected future balances, spending patterns, and projections calculated from recurring bills.
        </p>
      </div>
      
      {/* Row 1: Account Balances */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Account Balances</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Checking Balance */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 mr-4">
                  <Wallet size={24} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Checking Balance
                  </p>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(checkingBalance ?? 0)}
                  </h3>
                  {lastSync && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      as of {format(lastSync, 'MMM d, h:mm a')}
                    </p>
                  )}
                  {refreshAccountsTimestamp && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Refresh: {formatTimestamp(refreshAccountsTimestamp)}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Savings Balance */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 mr-4">
                  <PiggyBank size={24} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Savings Balance
                  </p>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {savingsBalance !== null ? formatCurrency(savingsBalance) : 'Not configured'}
                  </h3>
                  {lastSync && savingsBalance !== null && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      as of {format(lastSync, 'MMM d, h:mm a')}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Credit Card Debt */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center text-red-600 dark:text-red-400 mr-4">
                  <CreditCard size={24} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Credit Card Debt
                  </p>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {creditCardDebt !== null ? formatCurrency(creditCardDebt) : 'Not available'}
                  </h3>
                  {lastSync && creditCardDebt !== null && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      as of {format(lastSync, 'MMM d, h:mm a')}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Row 2: Projected Balances */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Projected Balances</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Threshold Breach Alert */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-full flex items-center justify-center text-orange-600 dark:text-orange-400 mr-4">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Low Balance Alert
                  </p>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {thresholdBreach 
                      ? format(parseISO(thresholdBreach.date), 'MMM d')
                      : 'No breach'
                    }
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    First date below ${(settings?.balanceThreshold ?? 1000).toLocaleString()} threshold
                  </p>
                  {thresholdBreach && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Balance: {formatCurrency(thresholdBreach.balance)}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lowest Projected Balance */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center text-red-600 dark:text-red-400 mr-4">
                  <TrendingDown size={24} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Lowest Projected Balance
                  </p>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {highLow.lowest
                      ? formatCurrency(highLow.lowest.projected_balance)
                      : formatCurrency(0)}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Minimum balance over next {projectionDays} days
                  </p>
                  {highLow.lowest && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      on {format(parseISO(highLow.lowest.proj_date), 'MMM d')}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Highest Projected Balance */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 mr-4">
                  <TrendingUp size={24} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Highest Projected Balance
                  </p>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {highLow.highest
                      ? formatCurrency(highLow.highest.projected_balance)
                      : formatCurrency(0)}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Peak balance over next {projectionDays} days
                  </p>
                  {highLow.highest && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      on {format(parseISO(highLow.highest.proj_date), 'MMM d')}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Row 3: Monthly Cash Flow */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Monthly Cash Flow</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total Monthly Income */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 mr-4">
                  <ArrowUpCircle size={24} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Total Monthly Income
                  </p>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(monthlyTotals.income)}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Expected recurring income from all sources
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Monthly Bills */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400 mr-4">
                  <ArrowDownCircle size={24} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Total Monthly Bills
                  </p>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(monthlyTotals.bills)}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Expected recurring expenses and payments
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Monthly Leftover */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center text-purple-600 dark:text-purple-400 mr-4">
                  <Calculator size={24} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Monthly Leftover
                  </p>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(monthlyTotals.leftover)}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Remaining balance left for spending after bills and food/drinks
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Savings Trend Chart */}
      {savingsBalance !== null && (
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-2">Savings Trend</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Track your savings growth over time. Updates when you click "Update Balances" or during nightly automation.
            </p>
            <SavingsChart data={savingsHistory} />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Averages */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4">Category Averages</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px]">
                <thead>
                  <tr className="border-b dark:border-gray-700">
                    <th 
                      className="text-left py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('category')}
                    >
                      Category {getSortIcon('category')}
                    </th>
                    <th 
                      className="text-right py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('monthly')}
                    >
                      Monthly {getSortIcon('monthly')}
                    </th>
                    <th 
                      className="text-right py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('yearly')}
                    >
                      Yearly {getSortIcon('yearly')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(categoryAverages)
                    .sort(([a, aData], [b, bData]) => {
                      let comparison = 0
                      switch (sortField) {
                        case 'category':
                          comparison = a.localeCompare(b)
                          break
                        case 'monthly':
                          comparison = aData.monthly - bData.monthly
                          break
                        case 'yearly':
                          comparison = aData.yearly - bData.yearly
                          break
                      }
                      return sortDirection === 'asc' ? comparison : -comparison
                    })
                    .map(([category, averages]) => (
                      <tr key={category} className="border-b dark:border-gray-700">
                        <td className="py-2 capitalize">{category}</td>
                        <td className="text-right">
                          {formatCurrency(averages.monthly)}
                        </td>
                        <td className="text-right">
                          {formatCurrency(averages.yearly)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Bills/Income Summary */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4">Bills/Income Summary</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px]">
                <thead>
                  <tr className="border-b dark:border-gray-700">
                    <th className="text-left py-2">Type</th>
                    <th className="text-right py-2">Bills</th>
                    <th className="text-right py-2">Income</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b dark:border-gray-700">
                    <td className="py-2">Daily</td>
                    <td className="text-right text-red-600 dark:text-red-400">
                      -{formatCurrency(billsSummary.daily.bills)}
                    </td>
                    <td className="text-right text-green-600 dark:text-green-400">
                      {formatCurrency(billsSummary.daily.income)}
                    </td>
                  </tr>
                  <tr className="border-b dark:border-gray-700">
                    <td className="py-2">Weekly</td>
                    <td className="text-right text-red-600 dark:text-red-400">
                      -{formatCurrency(billsSummary.weekly.bills)}
                    </td>
                    <td className="text-right text-green-600 dark:text-green-400">
                      {formatCurrency(billsSummary.weekly.income)}
                    </td>
                  </tr>
                  <tr className="border-b dark:border-gray-700">
                    <td className="py-2">Monthly</td>
                    <td className="text-right text-red-600 dark:text-red-400">
                      -{formatCurrency(billsSummary.monthly.bills)}
                    </td>
                    <td className="text-right text-green-600 dark:text-green-400">
                      {formatCurrency(billsSummary.monthly.income)}
                    </td>
                  </tr>
                  <tr className="border-b dark:border-gray-700">
                    <td className="py-2">Yearly</td>
                    <td className="text-right text-red-600 dark:text-red-400">
                      -{formatCurrency(billsSummary.yearly.bills)}
                    </td>
                    <td className="text-right text-green-600 dark:text-green-400">
                      {formatCurrency(billsSummary.yearly.income)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2">One-Time</td>
                    <td className="text-right text-red-600 dark:text-red-400">
                      -{formatCurrency(billsSummary.oneTime.bills)}
                    </td>
                    <td className="text-right text-green-600 dark:text-green-400">
                      {formatCurrency(billsSummary.oneTime.income)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}