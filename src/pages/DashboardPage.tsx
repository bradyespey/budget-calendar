//src/pages/DashboardPage.tsx

import type { ComponentType } from 'react'
import { useEffect, useState } from 'react'
import {
  Wallet,
  PiggyBank,
  CreditCard,
  TrendingDown,
  TrendingUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ArrowUpCircle,
  ArrowDownCircle,
  Calculator,
  AlertTriangle,
} from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Card, CardContent } from '../components/ui/Card'
import { SavingsChart } from '../components/SavingsChart'
import { getHighLowProjections } from '../api/projections'
import { getBills } from '../api/bills'
import { getSavingsBalance, getSavingsHistory, getCreditCardDebt } from '../api/accounts'
import { Bill, Projection } from '../types'
import { format, parseISO } from 'date-fns'
import { useBalance } from '../context/BalanceContext'
import { useAuth } from '../context/AuthContext'
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

interface SummaryCard {
  label: string
  value: string
  icon: ComponentType<{ size?: number | string; className?: string }>
  iconTone: string
  iconBg: string
  detail: string
  supporting?: string
}

function SortIndicator({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) {
  if (!active) {
    return <ArrowUpDown className="table-sort-icon h-3 w-3" />
  }

  return direction === 'asc'
    ? <ArrowUp className="table-sort-icon h-3 w-3" />
    : <ArrowDown className="table-sort-icon h-3 w-3" />
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
  const { session } = useAuth()

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
  }, [session.isAuthenticated])


  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(amount))

  const accountSummaryCards: SummaryCard[] = [
    {
      label: 'Checking Balance',
      value: formatCurrency(checkingBalance ?? 0),
      icon: Wallet,
      iconTone: 'text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-100 dark:bg-blue-900/50',
      detail: lastSync
        ? `as of ${format(lastSync, 'MMM d, h:mm a')} • ${refreshAccountsTimestamp ? `Refresh: ${formatTimestamp(refreshAccountsTimestamp)}` : 'Awaiting refresh'}`
        : 'Live checking balance',
    },
    {
      label: 'Savings Balance',
      value: savingsBalance !== null ? formatCurrency(savingsBalance) : 'Not configured',
      icon: PiggyBank,
      iconTone: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/50',
      detail: lastSync && savingsBalance !== null
        ? `as of ${format(lastSync, 'MMM d, h:mm a')} • Tracked in savings trend`
        : 'Savings account snapshot',
      supporting: savingsBalance === null ? 'Add a savings account ID to enable' : undefined,
    },
    {
      label: 'Credit Card Debt',
      value: creditCardDebt !== null ? formatCurrency(creditCardDebt) : 'Not available',
      icon: CreditCard,
      iconTone: 'text-rose-600 dark:text-rose-400',
      iconBg: 'bg-rose-100 dark:bg-rose-900/50',
      detail: lastSync && creditCardDebt !== null
        ? `as of ${format(lastSync, 'MMM d, h:mm a')} • Used for visibility, not checking projections`
        : 'Combined card balance',
    },
  ]

  const projectionSummaryCards: SummaryCard[] = [
    {
      label: 'Low Balance Alert',
      value: thresholdBreach ? format(parseISO(thresholdBreach.date), 'MMM d') : 'No breach',
      icon: AlertTriangle,
      iconTone: 'text-orange-600 dark:text-orange-400',
      iconBg: 'bg-orange-100 dark:bg-orange-900/50',
      detail: thresholdBreach
        ? `${format(parseISO(thresholdBreach.date), 'EEEE, MMM d')} • First date below ${formatCurrency(settings?.balanceThreshold ?? 1000)}`
        : `Stays above ${formatCurrency(settings?.balanceThreshold ?? 1000)} • Alert threshold: ${formatCurrency(settings?.balanceThreshold ?? 1000)}`,
    },
    {
      label: 'Lowest Projected Balance',
      value: highLow.lowest ? formatCurrency(highLow.lowest.projected_balance) : formatCurrency(0),
      icon: TrendingDown,
      iconTone: 'text-rose-600 dark:text-rose-400',
      iconBg: 'bg-rose-100 dark:bg-rose-900/50',
      detail: highLow.lowest
        ? `${format(parseISO(highLow.lowest.proj_date), 'EEEE, MMM d')} • Minimum balance over the next ${projectionDays} days`
        : 'No projection yet',
    },
    {
      label: 'Highest Projected Balance',
      value: highLow.highest ? formatCurrency(highLow.highest.projected_balance) : formatCurrency(0),
      icon: TrendingUp,
      iconTone: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/50',
      detail: highLow.highest
        ? `${format(parseISO(highLow.highest.proj_date), 'EEEE, MMM d')} • Peak balance over the next ${projectionDays} days`
        : 'No projection yet',
    },
  ]

  const monthlySummaryCards: SummaryCard[] = [
    {
      label: 'Total Monthly Income',
      value: formatCurrency(monthlyTotals.income),
      icon: ArrowUpCircle,
      iconTone: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/50',
      detail: 'Expected recurring income from all included income sources',
    },
    {
      label: 'Total Monthly Bills',
      value: formatCurrency(monthlyTotals.bills),
      icon: ArrowDownCircle,
      iconTone: 'text-rose-600 dark:text-rose-400',
      iconBg: 'bg-rose-100 dark:bg-rose-900/50',
      detail: 'Expected recurring expenses from checking-impact bills and payments',
    },
    {
      label: 'Monthly Leftover',
      value: formatCurrency(monthlyTotals.leftover),
      icon: Calculator,
      iconTone: 'text-[color:var(--accent)]',
      iconBg: 'bg-[color:var(--accent-soft)]',
      detail: 'Remaining after bills and food/drinks',
    },
  ]

  const handleSort = (field: 'category' | 'monthly' | 'yearly') => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="surface-card flex items-center gap-3 px-6 py-5">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[color:var(--line)] border-t-[color:var(--accent)]" />
          <div>
            <p className="eyebrow mb-2">Loading</p>
            <p className="text-sm text-[color:var(--muted)]">Pulling your latest balances and projections.</p>
          </div>
        </div>
      </div>
    )
  }

  // ── UI ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Header */}
      <PageHeader
        eyebrow="Dashboard"
        title="Financial Dashboard"
        subtitle={refreshAccountsTimestamp ? formatTimestamp(refreshAccountsTimestamp) : 'Live account summary'}
        description="Keep checking, savings, debt, and monthly cash flow in one place while the current projection window highlights the next pressure point."
        helpSections={[
          {
            title: 'Quick Overview',
            items: [
              'Current account balances (checking, savings, credit)',
              'Projected high/low balances for next 7+ days',
              'Low balance alerts and threshold tracking',
              'Monthly cash flow and spending patterns',
              'Category averages and bills/income breakdown',
            ],
          },
        ]}
        stats={[
          { label: 'Checking', value: formatCurrency(checkingBalance ?? 0), tone: 'success' },
          { label: 'Next low point', value: thresholdBreach ? format(parseISO(thresholdBreach.date), 'MMM d') : 'Clear', tone: 'danger' },
          { label: 'Monthly leftover', value: formatCurrency(monthlyTotals.leftover), tone: 'success' },
          { label: 'Projection window', value: `${projectionDays} days`, tone: 'warning' },
        ]}
      />
      
      {/* Row 1: Account Balances */}
      <div>
        <h2 className="section-display mb-5 text-[2rem] text-[color:var(--text)]">Account Balances</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {accountSummaryCards.map((card) => {
            const Icon = card.icon
            return (
              <Card key={card.label}>
                <CardContent className="p-5">
                  <div className="stat-card flex items-start gap-4 p-4 sm:p-5">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${card.iconBg} ${card.iconTone}`}>
                      <Icon size={22} />
                    </div>
                    <div className="min-w-0">
                      <p className="eyebrow mb-2">{card.label}</p>
                      <p className="display-copy text-[2rem] leading-[1.12] text-[color:var(--text)]">{card.value}</p>
                      <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{card.detail}</p>
                      {card.supporting ? (
                        <p className="mt-1 text-sm leading-6 text-[color:var(--muted)]/85">{card.supporting}</p>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Row 2: Projected Balances */}
      <div>
        <h2 className="section-display mb-5 text-[2rem] text-[color:var(--text)]">Projected Balances</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {projectionSummaryCards.map((card) => {
            const Icon = card.icon
            return (
              <Card key={card.label}>
                <CardContent className="p-5">
                  <div className="stat-card flex items-start gap-4 p-4 sm:p-5">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${card.iconBg} ${card.iconTone}`}>
                      <Icon size={22} />
                    </div>
                    <div className="min-w-0">
                      <p className="eyebrow mb-2">{card.label}</p>
                      <p className="display-copy text-[2rem] leading-[1.12] text-[color:var(--text)]">{card.value}</p>
                      <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{card.detail}</p>
                      {card.supporting ? (
                        <p className="mt-1 text-sm leading-6 text-[color:var(--muted)]/85">{card.supporting}</p>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Row 3: Monthly Cash Flow */}
      <div>
        <h2 className="section-display mb-5 text-[2rem] text-[color:var(--text)]">Monthly Cash Flow</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {monthlySummaryCards.map((card) => {
            const Icon = card.icon
            return (
              <Card key={card.label}>
                <CardContent className="p-5">
                  <div className="stat-card flex items-start gap-4 p-4 sm:p-5">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${card.iconBg} ${card.iconTone}`}>
                      <Icon size={22} />
                    </div>
                    <div className="min-w-0">
                      <p className="eyebrow mb-2">{card.label}</p>
                      <p className="display-copy text-[2rem] leading-[1.12] text-[color:var(--text)]">{card.value}</p>
                      <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{card.detail}</p>
                      {card.supporting ? (
                        <p className="mt-1 text-sm leading-6 text-[color:var(--muted)]/85">{card.supporting}</p>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Savings Trend Chart */}
      {savingsBalance !== null && (
        <Card>
          <CardContent className="p-6">
            <h3 className="section-display text-[1.8rem] text-[color:var(--text)]">Savings Trend</h3>
            <p className="mb-4 text-sm leading-7 text-[color:var(--muted)]">
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
            <h3 className="section-display text-[1.8rem] text-[color:var(--text)]">Category Averages</h3>
            <div className="table-shell mt-4 overflow-x-auto">
              <table className="table-surface min-w-[400px]">
                <thead>
                  <tr className="border-b surface-divider">
                    <th 
                      className="px-4 py-4 text-left"
                    >
                      <button type="button" className="table-sort-button" data-active={sortField === 'category'} onClick={() => handleSort('category')}>
                        Category
                        <SortIndicator active={sortField === 'category'} direction={sortDirection} />
                      </button>
                    </th>
                    <th 
                      className="px-4 py-4 text-right"
                    >
                      <button type="button" className="table-sort-button ml-auto" data-active={sortField === 'monthly'} onClick={() => handleSort('monthly')}>
                        Monthly
                        <SortIndicator active={sortField === 'monthly'} direction={sortDirection} />
                      </button>
                    </th>
                    <th 
                      className="px-4 py-4 text-right"
                    >
                      <button type="button" className="table-sort-button ml-auto" data-active={sortField === 'yearly'} onClick={() => handleSort('yearly')}>
                        Yearly
                        <SortIndicator active={sortField === 'yearly'} direction={sortDirection} />
                      </button>
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
                      <tr key={category} className="border-b surface-divider">
                        <td className="px-4 py-4 capitalize text-[color:var(--text)]">{category}</td>
                        <td className="px-4 py-4 text-right text-[color:var(--text)]">
                          {formatCurrency(averages.monthly)}
                        </td>
                        <td className="px-4 py-4 text-right text-[color:var(--text)]">
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
            <h3 className="section-display text-[1.8rem] text-[color:var(--text)]">Bills/Income Summary</h3>
            <div className="table-shell mt-4 overflow-x-auto">
              <table className="table-surface min-w-[400px]">
                <thead>
                  <tr className="border-b surface-divider">
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Type</th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Bills</th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Income</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b surface-divider">
                    <td className="px-4 py-4 text-[color:var(--text)]">Daily</td>
                    <td className="px-4 py-4 text-right text-red-600 dark:text-red-400">
                      -{formatCurrency(billsSummary.daily.bills)}
                    </td>
                    <td className="px-4 py-4 text-right text-green-600 dark:text-green-400">
                      {formatCurrency(billsSummary.daily.income)}
                    </td>
                  </tr>
                  <tr className="border-b surface-divider">
                    <td className="px-4 py-4 text-[color:var(--text)]">Weekly</td>
                    <td className="px-4 py-4 text-right text-red-600 dark:text-red-400">
                      -{formatCurrency(billsSummary.weekly.bills)}
                    </td>
                    <td className="px-4 py-4 text-right text-green-600 dark:text-green-400">
                      {formatCurrency(billsSummary.weekly.income)}
                    </td>
                  </tr>
                  <tr className="border-b surface-divider">
                    <td className="px-4 py-4 text-[color:var(--text)]">Monthly</td>
                    <td className="px-4 py-4 text-right text-red-600 dark:text-red-400">
                      -{formatCurrency(billsSummary.monthly.bills)}
                    </td>
                    <td className="px-4 py-4 text-right text-green-600 dark:text-green-400">
                      {formatCurrency(billsSummary.monthly.income)}
                    </td>
                  </tr>
                  <tr className="border-b surface-divider">
                    <td className="px-4 py-4 text-[color:var(--text)]">Yearly</td>
                    <td className="px-4 py-4 text-right text-red-600 dark:text-red-400">
                      -{formatCurrency(billsSummary.yearly.bills)}
                    </td>
                    <td className="px-4 py-4 text-right text-green-600 dark:text-green-400">
                      {formatCurrency(billsSummary.yearly.income)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-4 text-[color:var(--text)]">One-Time</td>
                    <td className="px-4 py-4 text-right text-red-600 dark:text-red-400">
                      -{formatCurrency(billsSummary.oneTime.bills)}
                    </td>
                    <td className="px-4 py-4 text-right text-green-600 dark:text-green-400">
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
