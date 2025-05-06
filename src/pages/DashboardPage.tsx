//src/pages/DashboardPage.tsx

import React, { useEffect, useState } from 'react';
import { Wallet, TrendingDown, TrendingUp, ArrowUpCircle, ArrowDownCircle, Calculator } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { getAccounts, getTotalBalance } from '../api/accounts';
import { getHighLowProjections } from '../api/projections';
import { getBills } from '../api/bills';
import { Account, Bill, Projection } from '../types';
import { format, parseISO } from 'date-fns';
import { useSettingsStore } from '../stores/settingsStore';

interface CategoryAverage {
  monthly: number;
  yearly: number;
}

interface BillsIncome {
  bills: number;
  income: number;
}

interface BillsSummary {
  oneTime: BillsIncome;
  daily: BillsIncome;
  weekly: BillsIncome;
  monthly: BillsIncome;
  yearly: BillsIncome;
}

export function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [highLow, setHighLow] = useState<{highest?: Projection; lowest?: Projection}>({});
  const [totalBalance, setTotalBalance] = useState(0);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [categoryAverages, setCategoryAverages] = useState<Record<string, CategoryAverage>>({});
  const [billsSummary, setBillsSummary] = useState<BillsSummary>({
    oneTime: { bills: 0, income: 0 },
    daily: { bills: 0, income: 0 },
    weekly: { bills: 0, income: 0 },
    monthly: { bills: 0, income: 0 },
    yearly: { bills: 0, income: 0 },
  });
  const [monthlyTotals, setMonthlyTotals] = useState({
    income: 0,
    bills: 0,
    leftover: 0
  });
  const [loading, setLoading] = useState(true);
  const { projectionDays } = useSettingsStore();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        const [accountsData, billsData, highLowData, balanceData] = await Promise.all([
          getAccounts(),
          getBills(),
          getHighLowProjections(),
          getTotalBalance()
        ]);
        
        setAccounts(accountsData);
        setBills(billsData);
        setHighLow(highLowData);
        setTotalBalance(balanceData);
        setLastSynced(accountsData[0]?.last_synced ? new Date(accountsData[0].last_synced) : null);
        
        calculateAverages(billsData);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [projectionDays]);

  const calculateAverages = (bills: Bill[]) => {
    const categories: Record<string, CategoryAverage> = {};
    const summary: BillsSummary = {
      oneTime: { bills: 0, income: 0 },
      daily: { bills: 0, income: 0 },
      weekly: { bills: 0, income: 0 },
      monthly: { bills: 0, income: 0 },
      yearly: { bills: 0, income: 0 },
    };
    
    let totalMonthlyIncome = 0;
    let totalMonthlyBills = 0;

    bills.forEach(bill => {
      // Initialize category if not exists
      if (!categories[bill.category]) {
        categories[bill.category] = { monthly: 0, yearly: 0 };
      }

      // Calculate monthly and yearly amounts based on frequency
      let monthlyAmount = 0;
      let yearlyAmount = 0;

      switch (bill.frequency) {
        case 'daily':
          monthlyAmount = bill.amount * 30.44 / bill.repeats_every;
          yearlyAmount = bill.amount * 365.25 / bill.repeats_every;
          summary.daily[bill.amount >= 0 ? 'income' : 'bills'] += Math.abs(bill.amount);
          break;
        case 'weekly':
          monthlyAmount = bill.amount * 4.35 / bill.repeats_every;
          yearlyAmount = bill.amount * 52.18 / bill.repeats_every;
          summary.weekly[bill.amount >= 0 ? 'income' : 'bills'] += Math.abs(bill.amount);
          break;
        case 'monthly':
          monthlyAmount = bill.amount / bill.repeats_every;
          yearlyAmount = (bill.amount * 12) / bill.repeats_every;
          summary.monthly[bill.amount >= 0 ? 'income' : 'bills'] += Math.abs(bill.amount);
          break;
        case 'yearly':
          monthlyAmount = bill.amount / (12 * bill.repeats_every);
          yearlyAmount = bill.amount / bill.repeats_every;
          summary.yearly[bill.amount >= 0 ? 'income' : 'bills'] += Math.abs(bill.amount);
          break;
        case 'one-time':
          summary.oneTime[bill.amount >= 0 ? 'income' : 'bills'] += Math.abs(bill.amount);
          break;
      }

      // Update category averages
      categories[bill.category].monthly += monthlyAmount;
      categories[bill.category].yearly += yearlyAmount;

      // Update monthly totals
      if (bill.amount >= 0) {
        totalMonthlyIncome += monthlyAmount;
      } else {
        totalMonthlyBills += Math.abs(monthlyAmount);
      }
    });

    setCategoryAverages(categories);
    setBillsSummary(summary);
    setMonthlyTotals({
      income: totalMonthlyIncome,
      bills: totalMonthlyBills,
      leftover: totalMonthlyIncome - totalMonthlyBills
    });
  };
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Current Balance */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 mr-4">
                <Wallet size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Current Balance</p>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalBalance)}</h3>
                {lastSynced && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    as of {format(lastSynced, 'MMM d, yyyy h:mm a')}
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
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Lowest Projected Balance</p>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {highLow.lowest ? formatCurrency(highLow.lowest.projected_balance) : '-'}
                </h3>
                {highLow.lowest && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    on {format(parseISO(highLow.lowest.proj_date), 'MMM d, yyyy')}
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
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Highest Projected Balance</p>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {highLow.highest ? formatCurrency(highLow.highest.projected_balance) : '-'}
                </h3>
                {highLow.highest && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    on {format(parseISO(highLow.highest.proj_date), 'MMM d, yyyy')}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Total Monthly Income */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 mr-4">
                <ArrowUpCircle size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Monthly Income</p>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(monthlyTotals.income)}</h3>
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
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Monthly Bills</p>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(monthlyTotals.bills)}</h3>
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
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Monthly Leftover</p>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(monthlyTotals.leftover)}</h3>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Averages */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4">Category Averages</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b dark:border-gray-700">
                    <th className="text-left py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">Category</th>
                    <th className="text-right py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">Monthly</th>
                    <th className="text-right py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">Yearly</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(categoryAverages)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([category, averages]) => (
                      <tr key={category} className="border-b dark:border-gray-700">
                        <td className="py-2 capitalize">{category}</td>
                        <td className="text-right">{formatCurrency(averages.monthly)}</td>
                        <td className="text-right">{formatCurrency(averages.yearly)}</td>
                      </tr>
                    ))
                  }
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
              <table className="w-full">
                <thead>
                  <tr className="border-b dark:border-gray-700">
                    <th className="text-left py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">Type</th>
                    <th className="text-right py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">Bills</th>
                    <th className="text-right py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">Income</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b dark:border-gray-700">
                    <td className="py-2">One-Time</td>
                    <td className="text-right text-red-600 dark:text-red-400">-{formatCurrency(billsSummary.oneTime.bills)}</td>
                    <td className="text-right text-green-600 dark:text-green-400">{formatCurrency(billsSummary.oneTime.income)}</td>
                  </tr>
                  <tr className="border-b dark:border-gray-700">
                    <td className="py-2">Daily</td>
                    <td className="text-right text-red-600 dark:text-red-400">-{formatCurrency(billsSummary.daily.bills)}</td>
                    <td className="text-right text-green-600 dark:text-green-400">{formatCurrency(billsSummary.daily.income)}</td>
                  </tr>
                  <tr className="border-b dark:border-gray-700">
                    <td className="py-2">Weekly</td>
                    <td className="text-right text-red-600 dark:text-red-400">-{formatCurrency(billsSummary.weekly.bills)}</td>
                    <td className="text-right text-green-600 dark:text-green-400">{formatCurrency(billsSummary.weekly.income)}</td>
                  </tr>
                  <tr className="border-b dark:border-gray-700">
                    <td className="py-2">Monthly</td>
                    <td className="text-right text-red-600 dark:text-red-400">-{formatCurrency(billsSummary.monthly.bills)}</td>
                    <td className="text-right text-green-600 dark:text-green-400">{formatCurrency(billsSummary.monthly.income)}</td>
                  </tr>
                  <tr>
                    <td className="py-2">Yearly</td>
                    <td className="text-right text-red-600 dark:text-red-400">-{formatCurrency(billsSummary.yearly.bills)}</td>
                    <td className="text-right text-green-600 dark:text-green-400">{formatCurrency(billsSummary.yearly.income)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}