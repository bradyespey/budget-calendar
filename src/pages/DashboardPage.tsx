//src/pages/DashboardPage.tsx

import type { ComponentType } from 'react'
import { Suspense, lazy, useEffect, useState } from 'react'
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
import { getHighLowProjections, getProjections } from '../api/projections'
import { getBills } from '../api/bills'
import { getSavingsBalance, getSavingsHistory, getCreditCardDebt } from '../api/accounts'
import { Bill, Projection } from '../types'
import { format, parseISO } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { useBalance } from '../context/BalanceContext'
import { useAuth } from '../context/AuthContext'
import { getFunctionTimestamps, getSettings, getMonthlyCashFlow } from '../api/firebase'

const SavingsChart = lazy(async () => {
  const module = await import('../components/SavingsChart')
  return { default: module.SavingsChart }
})

const ProjectedBalanceChart = lazy(async () => {
  const module = await import('../components/ProjectedBalanceChart')
  return { default: module.ProjectedBalanceChart }
})

interface CategoryAverage {
  monthly: number
  yearly: number
  displayName: string
}

interface BillsIncome {
  bills: number
  income: number
}

interface BillsSummary {
  oneTime: BillsIncome
  daily: BillsIncome
  weekly: BillsIncome
  biweekly: BillsIncome
  semimonthly: BillsIncome
  monthly: BillsIncome
  yearly: BillsIncome
}

interface DashboardSettings {
  balanceThreshold?: number
  projectionDays?: number
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

function computeCategoryAverages(bills: Bill[]): Record<string, CategoryAverage> {
  const categories: Record<string, CategoryAverage> = {}
  for (const bill of bills) {
    const amount = Number(bill.amount) || 0
    const frequency = (bill.frequency || 'monthly') as string
    const repeatsEvery = Number(bill.repeats_every ?? 1) || 1
    const rawCategory = bill.category || 'Uncategorized'
    const category = rawCategory.toLowerCase()
    if (!categories[category]) categories[category] = { monthly: 0, yearly: 0, displayName: rawCategory }
    let monthly = 0
    let yearly = 0
    switch (frequency) {
      case 'daily':       monthly = (amount * 30.44) / repeatsEvery;  yearly = (amount * 365.25) / repeatsEvery; break
      case 'weekly':      monthly = (amount * 4.35)  / repeatsEvery;  yearly = (amount * 52.18)  / repeatsEvery; break
      case 'biweekly':    monthly = (amount * 26 / 12) / repeatsEvery; yearly = (amount * 26)     / repeatsEvery; break
      case 'semimonthly':
      case 'Semimonthly_mid_end':
      case 'semimonthly_mid_end': monthly = (amount * 2.0) / repeatsEvery; yearly = (amount * 24) / repeatsEvery; break
      case 'monthly':     monthly = amount / repeatsEvery;             yearly = (amount * 12)    / repeatsEvery; break
      case 'yearly':      monthly = amount / (12 * repeatsEvery);     yearly = amount / repeatsEvery; break
      case 'one-time':    break
      default: {
        const mMatch = frequency.match(/every_(\d+)_months/)
        const wMatch = frequency.match(/every_(\d+)_weeks/)
        if (mMatch) {
          const n = parseInt(mMatch[1])
          monthly = amount / (n * repeatsEvery)
          yearly  = (amount * 12) / (n * repeatsEvery)
        } else if (wMatch) {
          const n = parseInt(wMatch[1])
          monthly = (amount * 52.18) / (n * 12 * repeatsEvery)
          yearly  = (amount * 52.18) / (n * repeatsEvery)
        } else {
          monthly = amount / repeatsEvery
          yearly  = (amount * 12) / repeatsEvery
        }
      }
    }
    categories[category].monthly += monthly
    categories[category].yearly  += yearly
  }
  return categories
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
    biweekly: { bills: 0, income: 0 },
    semimonthly: { bills: 0, income: 0 },
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
  const [balanceProjections, setBalanceProjections] = useState<Projection[]>([])
  const [creditCardDebt, setCreditCardDebt] = useState<number | null>(null)
  const [projectionDays, setProjectionDays] = useState<number>(7)
  const [thresholdBreach, setThresholdBreach] = useState<{ date: string; balance: number } | null>(null)
  const [settings, setSettings] = useState<DashboardSettings | null>(null)

  const { balance: checkingBalance, lastSync } = useBalance()
  const { session } = useAuth()
  const navigate = useNavigate()

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
        const [billsData, highLowData, projections, savings, history, creditCards, settings, monthlyCashFlow] = await Promise.all([
          getBills(),
          getHighLowProjections(),
          getProjections(),
          getSavingsBalance(),
          getSavingsHistory(),
          getCreditCardDebt(),
          getSettings(),
          getMonthlyCashFlow(),
        ])
        setBills(billsData)
        setHighLow(highLowData)
        setBalanceProjections(projections)
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
        
        // Compute category averages client-side from all bills so every category is included
        setCategoryAverages(computeCategoryAverages(billsData))
        setBillsSummary(monthlyCashFlow.summary || {
          oneTime: { bills: 0, income: 0 },
          daily: { bills: 0, income: 0 },
          weekly: { bills: 0, income: 0 },
          biweekly: { bills: 0, income: 0 },
          semimonthly: { bills: 0, income: 0 },
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
          biweekly: { bills: 0, income: 0 },
          semimonthly: { bills: 0, income: 0 },
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

  const summarySections = [
    { title: 'Accounts', cards: accountSummaryCards },
    { title: 'Forecast', cards: projectionSummaryCards },
    { title: 'Monthly Flow', cards: monthlySummaryCards },
  ]

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
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        eyebrow="Dashboard"
        title="Overview"
        subtitle={refreshAccountsTimestamp ? formatTimestamp(refreshAccountsTimestamp) : 'Live account summary'}
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
      
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid gap-5 xl:grid-cols-3">
            {summarySections.map((section) => (
              <section key={section.title} className="min-w-0">
                <h2 className="section-display mb-3 text-[1.35rem] text-[color:var(--text)]">{section.title}</h2>
                <div className="grid gap-2">
                  {section.cards.map((card) => {
                    const Icon = card.icon
                    return (
                      <div
                        key={card.label}
                        className="flex min-w-0 items-start gap-3 rounded-[16px] border border-[color:var(--line)] bg-[color:var(--surface-muted)] p-3"
                      >
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ${card.iconBg} ${card.iconTone}`}>
                          <Icon size={19} />
                        </div>
                        <div className="min-w-0">
                          <p className="eyebrow mb-1 text-[0.64rem]">{card.label}</p>
                          <p className="display-copy text-[1.45rem] leading-tight text-[color:var(--text)]">{card.value}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--muted)]">{card.detail}</p>
                          {card.supporting ? (
                            <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{card.supporting}</p>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h3 className="section-display text-[1.45rem] text-[color:var(--text)]">Balance Projection</h3>
            <p className="text-xs text-[color:var(--muted)]">Projected checking balance from today through the forecast window.</p>
          </div>
          <Suspense
            fallback={
              <div className="flex h-[220px] items-center justify-center rounded-[16px] border border-[color:var(--line)] bg-[color:var(--surface-muted)] text-sm text-[color:var(--muted)]">
                Loading balance projection…
              </div>
            }
          >
            <ProjectedBalanceChart data={balanceProjections} />
          </Suspense>
        </CardContent>
      </Card>

      {/* Savings Trend Chart */}
      {savingsBalance !== null && (
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <h3 className="section-display text-[1.45rem] text-[color:var(--text)]">Savings Trend</h3>
              <p className="text-xs text-[color:var(--muted)]">Updates from balance refreshes and nightly automation.</p>
            </div>
            <Suspense
              fallback={
                <div className="flex h-[220px] items-center justify-center rounded-[16px] border border-[color:var(--line)] bg-[color:var(--surface-muted)] text-sm text-[color:var(--muted)]">
                  Loading savings trend…
                </div>
              }
            >
              <SavingsChart data={savingsHistory} />
            </Suspense>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Category Averages */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <h3 className="section-display text-[1.45rem] text-[color:var(--text)]">Category Averages</h3>
            <div className="table-shell mt-3 overflow-x-auto">
              <table className="table-surface min-w-[400px]">
                <thead>
                  <tr className="border-b surface-divider">
                    <th 
                      className="px-4 py-3 text-left"
                    >
                      <button type="button" className="table-sort-button" data-active={sortField === 'category'} onClick={() => handleSort('category')}>
                        Category
                        <SortIndicator active={sortField === 'category'} direction={sortDirection} />
                      </button>
                    </th>
                    <th 
                      className="px-4 py-3 text-right"
                    >
                      <button type="button" className="table-sort-button ml-auto" data-active={sortField === 'monthly'} onClick={() => handleSort('monthly')}>
                        Monthly
                        <SortIndicator active={sortField === 'monthly'} direction={sortDirection} />
                      </button>
                    </th>
                    <th 
                      className="px-4 py-3 text-right"
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
                      <tr
                        key={category}
                        className="border-b surface-divider cursor-pointer hover:bg-[color:var(--surface-muted)] transition-colors"
                        onClick={() => navigate('/transactions', { state: { category: averages.displayName } })}
                        title={`View ${averages.displayName} transactions`}
                      >
                        <td className="px-4 py-3 text-[color:var(--accent)] hover:underline">{averages.displayName}</td>
                        <td className="px-4 py-3 text-right text-[color:var(--text)]">
                          {formatCurrency(averages.monthly)}
                        </td>
                        <td className="px-4 py-3 text-right text-[color:var(--text)]">
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
          <CardContent className="p-4 sm:p-5">
            <h3 className="section-display text-[1.45rem] text-[color:var(--text)]">Bills/Income Summary</h3>
            <div className="table-shell mt-3 overflow-x-auto">
              <table className="table-surface min-w-[400px]">
                <thead>
                  <tr className="border-b surface-divider">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Type</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Bills</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Income</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b surface-divider">
                    <td className="px-4 py-3 text-[color:var(--text)]">Daily</td>
                    <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">
                      -{formatCurrency(billsSummary.daily.bills)}
                    </td>
                    <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">
                      {formatCurrency(billsSummary.daily.income)}
                    </td>
                  </tr>
                  <tr className="border-b surface-divider">
                    <td className="px-4 py-3 text-[color:var(--text)]">Weekly</td>
                    <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">
                      -{formatCurrency(billsSummary.weekly.bills)}
                    </td>
                    <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">
                      {formatCurrency(billsSummary.weekly.income)}
                    </td>
                  </tr>
                  <tr className="border-b surface-divider">
                    <td className="px-4 py-3 text-[color:var(--text)]">Biweekly</td>
                    <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">
                      -{formatCurrency((billsSummary.biweekly ?? { bills: 0 }).bills)}
                    </td>
                    <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">
                      {formatCurrency((billsSummary.biweekly ?? { income: 0 }).income)}
                    </td>
                  </tr>
                  <tr className="border-b surface-divider">
                    <td className="px-4 py-3 text-[color:var(--text)]">Semimonthly</td>
                    <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">
                      -{formatCurrency((billsSummary.semimonthly ?? { bills: 0 }).bills)}
                    </td>
                    <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">
                      {formatCurrency((billsSummary.semimonthly ?? { income: 0 }).income)}
                    </td>
                  </tr>
                  <tr className="border-b surface-divider">
                    <td className="px-4 py-3 text-[color:var(--text)]">Monthly</td>
                    <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">
                      -{formatCurrency(billsSummary.monthly.bills)}
                    </td>
                    <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">
                      {formatCurrency(billsSummary.monthly.income)}
                    </td>
                  </tr>
                  <tr className="border-b surface-divider">
                    <td className="px-4 py-3 text-[color:var(--text)]">Yearly</td>
                    <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">
                      -{formatCurrency(billsSummary.yearly.bills)}
                    </td>
                    <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">
                      {formatCurrency(billsSummary.yearly.income)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-[color:var(--text)]">One-Time</td>
                    <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">
                      -{formatCurrency(billsSummary.oneTime.bills)}
                    </td>
                    <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">
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
