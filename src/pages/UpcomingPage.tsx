//src/pages/UpcomingPage.tsx

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { format, parseISO, isSameDay } from 'date-fns';
import { getProjections } from '../api/projections';
import { getBills } from '../api/bills';
import { Bill, Projection } from '../types';
import { ArrowDownRight, ArrowUpRight, TrendingUp, TrendingDown } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';

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
  const { projectionDays } = useSettingsStore();
  const [lastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    fetchUpcomingData();
  }, [projectionDays, lastUpdate]);

  const fetchUpcomingData = async () => {
    try {
      setLoading(true);
      
      // Fetch projections and bills in parallel
      const [projections, bills] = await Promise.all([
        getProjections(projectionDays),
        getBills()
      ]);
      
      // Process the data to create a day-by-day view
      const days = processDayData(projections, bills);
      setUpcomingDays(days);
    } catch (error) {
      console.error('Error fetching upcoming data:', error);
    } finally {
      setLoading(false);
    }
  };

  const processDayData = (projections: Projection[], bills: Bill[]): DayData[] => {
    // Create a map of date -> bill transactions
    const dateTransactionsMap: Record<string, {id: string; name: string; amount: number; category: string}[]> = {};
    
    // Process bills to find which ones occur on which dates in the next 30 days
    bills.forEach(bill => {
      const startDate = parseISO(bill.start_date);
      
      // Skip bills that haven't started yet or have ended
      if (bill.end_date && parseISO(bill.end_date) < new Date()) {
        return;
      }
      
      // Find occurrences in the next 30 days based on frequency
      projections.forEach(proj => {
        const projDate = parseISO(proj.proj_date);
        
        // Simple calculation to check if a bill occurs on a given date
        // Note: This is a simplified approach and doesn't handle all cases perfectly
        let occurs = false;
        const daysSinceStart = Math.floor((projDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (isSameDay(projDate, startDate)) {
          occurs = true;
        } else if (bill.frequency === 'daily') {
          occurs = daysSinceStart % bill.repeats_every === 0;
        } else if (bill.frequency === 'weekly') {
          occurs = daysSinceStart % (7 * bill.repeats_every) === 0;
        } else if (bill.frequency === 'monthly') {
          occurs = projDate.getDate() === startDate.getDate() && 
                  (projDate.getMonth() - startDate.getMonth() + 
                  (projDate.getFullYear() - startDate.getFullYear()) * 12) % bill.repeats_every === 0;
        } else if (bill.frequency === 'yearly') {
          occurs = projDate.getDate() === startDate.getDate() && 
                  projDate.getMonth() === startDate.getMonth() && 
                  (projDate.getFullYear() - startDate.getFullYear()) % bill.repeats_every === 0;
        }
        
        if (occurs) {
          const dateKey = proj.proj_date;
          if (!dateTransactionsMap[dateKey]) {
            dateTransactionsMap[dateKey] = [];
          }
          
          dateTransactionsMap[dateKey].push({
            id: bill.id,
            name: bill.name,
            amount: bill.amount,
            category: bill.category
          });
        }
      });
    });
    
    // Create the day data objects
    return projections.map(proj => {
      return {
        date: proj.proj_date,
        balance: proj.projected_balance,
        transactions: dateTransactionsMap[proj.proj_date] || [],
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        {projectionDays}-Day Projection
      </h1>
      
      <div className="flex justify-center">
        <div className="w-full max-w-2xl space-y-4">
          {upcomingDays.map((day, index) => (
            <Card 
              key={day.date}
              className={`
                transition-all border-l-4
                ${day.isHighest ? 'border-l-green-500' : ''}
                ${day.isLowest ? 'border-l-red-500' : ''}
                ${!day.isHighest && !day.isLowest ? 'border-l-transparent' : ''}
              `}
            >
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center">
                    <span className="text-lg font-bold">
                      {format(parseISO(day.date), 'EEEE, MMMM d')}
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