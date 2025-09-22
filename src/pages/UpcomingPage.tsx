//src/pages/UpcomingPage.tsx

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { format, parseISO } from 'date-fns';
import { getProjections } from '../api/projections';
import { Projection } from '../types';
import { ArrowDownRight, ArrowUpRight, TrendingUp, TrendingDown } from 'lucide-react';
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
  }[];
  isHighest: boolean;
  isLowest: boolean;
}

export function UpcomingPage() {
  const [upcomingDays, setUpcomingDays] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastProjected, setLastProjected] = useState<Date | null>(null);
  const [budgetProjectionTimestamp, setBudgetProjectionTimestamp] = useState<Date | null>(null);
  const [syncCalendarTimestamp, setSyncCalendarTimestamp] = useState<Date | null>(null);
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
          category: bill.category
        })),
        isHighest: proj.highest,
        isLowest: proj.lowest
      };
    });
  };

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
    return day.balance - upcomingDays[index - 1].balance;
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
    <div className="space-y-6 px-4 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Upcoming Bills: {upcomingDays.length}-Day Projection
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Preview upcoming bills and projected balance with Google Calendar sync. Bills move to next business day on weekends/holidays, paychecks move to previous business day.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
          {budgetProjectionTimestamp && (
            <span>Projections: {formatTimestamp(budgetProjectionTimestamp)}</span>
          )}
          {syncCalendarTimestamp && (
            <span>Calendar Sync: {formatTimestamp(syncCalendarTimestamp)}</span>
          )}
        </div>
      </div>
      
      <div className="flex justify-center">
        <div className="w-full max-w-2xl space-y-4">
        {upcomingDays.map((day, index) => (
          <Card 
            key={day.date}
            className={`w-full transition-all border-l-4
              ${day.isHighest ? 'border-l-green-500' : ''}
              ${day.isLowest ? 'border-l-red-500' : ''}
              ${!day.isHighest && !day.isLowest ? 'border-l-transparent' : ''}
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
                    <li key={`${day.date}-${transaction.id}`} className="flex justify-between items-center py-1 px-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800">
                      <div className="flex items-center">
                        <span className={`w-2 h-2 rounded-full mr-2 ${
                          transaction.amount >= 0 ? 'bg-green-500' : 'bg-red-500'
                        }`}></span>
                        <span className="font-medium text-gray-900 dark:text-white">{transaction.name}</span>
                        <span className="ml-2 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-400">
                          {transaction.category}
                        </span>
                      </div>
                      <span className={`font-medium ${
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
    </div>
  );
}