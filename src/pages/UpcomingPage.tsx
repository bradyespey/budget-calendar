//src/pages/UpcomingPage.tsx

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { format, parseISO } from 'date-fns';
import { getProjections } from '../api/projections';
import { Projection } from '../types';
import { ArrowDownRight, ArrowUpRight, TrendingUp, TrendingDown, Search, X } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { getSettings, getFunctionTimestamps } from '../api/firebase';
import { formatDistanceToNow } from 'date-fns';
import { useLocation } from 'react-router-dom';
import { formatInTimeZone } from 'date-fns-tz';

interface DayData {
  date: string;
  balance: number;
  transactions: {
    id: string;
    name: string;
    amount: number;
    category: string;
    accountType?: string;
    source?: string;
    isActive?: boolean;
  }[];
  isHighest: boolean;
  isLowest: boolean;
}

// Helper function to determine if a transaction affects balance calculations
const affectsBalance = (transaction: DayData['transactions'][0]): boolean => {
  // Skip inactive bills (past credit card payments, etc.)
  if (transaction.isActive === false) return false;
  
  // Skip bills from credit card accounts (they're already in the CC payment)
  // This applies to both manual and Monarch transactions
  if (transaction.accountType === 'Credit Card') return false;
  
  // Credit card payment transactions affect balance (they hit checking)
  if (transaction.category && transaction.category.toLowerCase().includes('credit card payment')) return true;
  
  // Everything else affects balance (manual budgets, checking account bills, income, etc.)
  return true;
};

export function UpcomingPage() {
  const [upcomingDays, setUpcomingDays] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastProjected, setLastProjected] = useState<Date | null>(null);
  const [budgetProjectionTimestamp, setBudgetProjectionTimestamp] = useState<Date | null>(null);
  const [syncCalendarTimestamp, setSyncCalendarTimestamp] = useState<Date | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const location = useLocation();

  // Load function timestamps
  const loadTimestamps = async () => {
    try {
      const timestamps = await getFunctionTimestamps();
      if (timestamps.budgetProjection) {
        setBudgetProjectionTimestamp(timestamps.budgetProjection);
      }
      if (timestamps.syncCalendar) {
        setSyncCalendarTimestamp(timestamps.syncCalendar);
      }
    } catch (err) {
      console.error('Error loading timestamps:', err);
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

  useEffect(() => {
    fetchUpcomingData();
    loadTimestamps();
    async function fetchLastProjected() {
      try {
        const settings = await getSettings();
        if (settings?.lastProjectedAt) {
          setLastProjected(settings.lastProjectedAt);
        }
      } catch (error) {
        console.error('Error fetching last projected time:', error);
      }
    }
    fetchLastProjected();
  }, [location.pathname]);

  const fetchUpcomingData = async () => {
    try {
      setLoading(true);
      
      // We only need projections now since they contain the bills
      const projections = await getProjections();
      
      // Process the data to create a day-by-day view
      const days = processDayData(projections);
      setUpcomingDays(days);
    } catch (error) {
      console.error('Error fetching upcoming data:', error);
    } finally {
      setLoading(false);
    }
  };

  const processDayData = (projections: Projection[]): DayData[] => {
    // Create the day data objects directly from projections
    return projections.map(proj => {
      return {
        date: proj.proj_date,
        balance: proj.projected_balance,
        transactions: (proj.bills || []).map(bill => ({
          id: bill.id,
          name: bill.name,
          amount: bill.amount,
          category: bill.category,
          accountType: bill.accountType,
          source: bill.source,
          isActive: bill.isActive
        })),
        isHighest: proj.highest,
        isLowest: proj.lowest
      };
    });
  };

  // Filter and search logic
  const filteredDays = useMemo(() => {
    if (!searchTerm.trim()) {
      return upcomingDays;
    }

    const searchLower = searchTerm.toLowerCase();
    return upcomingDays
      .map(day => ({
        ...day,
        transactions: day.transactions.filter(transaction =>
          transaction.name.toLowerCase().includes(searchLower) ||
          transaction.category.toLowerCase().includes(searchLower)
        )
      }))
      .filter(day => day.transactions.length > 0);
  }, [upcomingDays, searchTerm]);

  // Calculate total occurrences of search term
  const totalOccurrences = useMemo(() => {
    if (!searchTerm.trim()) return 0;
    
    const searchLower = searchTerm.toLowerCase();
    return upcomingDays.reduce((total, day) => {
      return total + day.transactions.filter(transaction =>
        transaction.name.toLowerCase().includes(searchLower) ||
        transaction.category.toLowerCase().includes(searchLower)
      ).length;
    }, 0);
  }, [upcomingDays, searchTerm]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(Math.round(amount));
  };

  const getBalanceChange = (day: DayData, index: number): number => {
    if (index === 0) return 0;
    // Calculate the change in balance (negative means money went out, positive means money came in)
    return day.balance - filteredDays[index - 1].balance;
  };

  const formatDate = (dateStr: string) => {
    return formatInTimeZone(parseISO(dateStr), 'America/Chicago', 'EEEE, MMMM d');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <PageHeader
        title={`Upcoming Bills: ${searchTerm ? `${filteredDays.length} of ${upcomingDays.length}` : upcomingDays.length}-Day Projection`}
        subtitle={
          [
            budgetProjectionTimestamp && `Projections: ${formatTimestamp(budgetProjectionTimestamp)}`,
            syncCalendarTimestamp && `Calendar Sync: ${formatTimestamp(syncCalendarTimestamp)}`
          ].filter(Boolean).join(' • ')
        }
        helpSections={[
          {
            title: 'Display',
            items: [
              'All transactions appear here (for awareness/cancellation)',
              'Credit card charges, payments, utilities, income, etc.',
            ],
          },
          {
            title: 'Balance Calculation',
            items: [
              'Recurring bills that hit checking directly (utilities, rent)',
              'Credit card payments (one-time bills, auto-update with Monarch)',
              'Manual budgets (food, custom estimates)',
              'Income (paychecks, deposits)',
            ],
          },
          {
            title: 'Excluded from Balance',
            items: [
              'Individual credit card charges (prevents double-counting)',
            ],
          },
          {
            title: 'Date Adjustments',
            items: [
              'Bills move to next business day on weekends/holidays',
              'Paychecks move to previous business day',
            ],
          },
        ]}
      />

      {/* Search Filter */}
      <Card>
        <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              type="text"
              placeholder="Search transactions or categories (e.g., Factor, Netflix, Paycheck, Food & Drinks)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {searchTerm && (
            <div className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
              {totalOccurrences} occurrence{totalOccurrences !== 1 ? 's' : ''} found
            </div>
          )}
        </div>
        {searchTerm && (
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Showing {filteredDays.length} day{filteredDays.length !== 1 ? 's' : ''} with matching transactions
          </div>
        )}
        </CardContent>
      </Card>
      
      <div className="space-y-5">
        {filteredDays.map((day, index) => (
          <Card 
            key={day.date}
            className={`w-full border-l-4
              ${day.isHighest ? 'border-l-green-500 bg-green-50/30 dark:bg-green-900/10' : ''}
              ${day.isLowest ? 'border-l-red-500 bg-red-50/30 dark:bg-red-900/10' : ''}
              ${!day.isHighest && !day.isLowest ? 'border-l-blue-500/20' : ''}
            `}
          >
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center">
                  <span className="text-lg font-bold">
                    {formatDate(day.date)}
                  </span>
                  {day.isHighest && (
                    <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      <TrendingUp size={14} className="mr-1" /> Highest
                    </span>
                  )}
                  {day.isLowest && (
                    <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                      <TrendingDown size={14} className="mr-1" /> Lowest
                    </span>
                  )}
                </CardTitle>
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-900 dark:text-white">
                    {formatCurrency(day.balance)}
                  </div>
                  {index > 0 && (
                    <div className={`flex items-center text-sm ${
                      getBalanceChange(day, index) >= 0 
                        ? 'text-green-600 dark:text-green-400' 
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      {getBalanceChange(day, index) >= 0 ? (
                        <>
                          <ArrowUpRight size={14} className="mr-1" />
                          +{formatCurrency(getBalanceChange(day, index))}
                        </>
                      ) : (
                        <>
                          <ArrowDownRight size={14} className="mr-1" />
                          {formatCurrency(getBalanceChange(day, index))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {day.transactions.length > 0 ? (
                <ul className="space-y-2">
                  {day.transactions.map(transaction => (
                    <li key={`${day.date}-${transaction.id}`} className="flex justify-between items-start gap-3 py-1 px-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800">
                      <div className="flex items-center flex-wrap gap-2 min-w-0 flex-1">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          transaction.amount >= 0 ? 'bg-green-500' : 'bg-red-500'
                        }`}></span>
                        <span className="font-medium text-gray-900 dark:text-white break-words">{transaction.name}</span>
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {transaction.category}
                        </span>
                        {!affectsBalance(transaction) && (
                          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-xs text-blue-600 dark:text-blue-400 whitespace-nowrap">
                            Excluded
                          </span>
                        )}
                      </div>
                      <span className={`font-medium whitespace-nowrap flex-shrink-0 ${
                        transaction.amount >= 0 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {formatCurrency(transaction.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-sm">No transactions on this day.</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}