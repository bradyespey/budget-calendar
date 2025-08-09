//src/pages/UpcomingPage.tsx

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { format, parseISO } from 'date-fns';
import { getProjections } from '../api/projections';
import { Projection } from '../types';
import { ArrowDownRight, ArrowUpRight, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
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
  const location = useLocation();

  useEffect(() => {
    fetchUpcomingData();
    async function fetchLastProjected() {
      const { data } = await supabase
        .from('settings')
        .select('last_projected_at')
        .eq('id', 1)
        .maybeSingle();
      if (data?.last_projected_at) {
        setLastProjected(new Date(data.last_projected_at));
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
    <div className="space-y-8 px-4 max-w-3xl mx-auto">
      {/* Page Description */}
      <div className="text-center space-y-2 py-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Upcoming Bills
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
          Preview your upcoming bills and projected account balance for the next 30 days. These events automatically sync with your shared Google Calendar.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          📅 Each bill is added to your Google Calendar so you both can see when payments are due and plan accordingly.
        </p>
      </div>
      
      <div className="flex flex-col md:flex-row md:items-center md:justify-center gap-2 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white md:mr-8">
          {upcomingDays.length}-Day Projection
        </h2>
        {lastProjected && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <strong>Last projected:</strong> {format(lastProjected, "MMMM d, yyyy, h:mm a")}
            <span className="ml-2 text-xs">({formatDistanceToNow(lastProjected, { addSuffix: true })})</span>
          </div>
        )}
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