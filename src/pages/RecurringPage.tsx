//src/pages/RecurringPage.tsx

import { useEffect, useState, useMemo, useCallback } from 'react';
import { RefreshCw, Check, X, AlertTriangle, Plus } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card, CardContent } from '../components/ui/Card';
import { format, parseISO } from 'date-fns';
import { getBills } from '../api/bills';
import { Bill } from '../types';
import { apiCache } from '../utils/apiCache';
import { usePerformanceMonitor } from '../hooks/usePerformanceMonitor';

type SortField = 'status' | 'monarchName' | 'appName' | 'nameMatch' | 'monarchAmount' | 'appAmount' | 'amountMatch' | 'monarchFrequency' | 'appFrequency' | 'frequencyMatch' | 'monarchDueDate' | 'appDueDate' | 'dateMatch' | 'account';
type SortDirection = 'asc' | 'desc';

interface RecurringTransaction {
  stream: {
    id: string;
    frequency: string;
    amount: number;
    isApproximate: boolean;
    merchant: {
      id: string;
      name: string;
      logoUrl?: string;
    };
  };
  date: string;
  isPast: boolean;
  transactionId?: string;
  amount: number;
  amountDiff?: number;
  category: {
    id: string;
    name: string;
  };
  account: {
    id: string;
    displayName: string;
    logoUrl?: string;
  };
}

interface RecurringTransactionData {
  success: boolean;
  count: number;
  transactions: RecurringTransaction[];
  dateRange: {
    startDate: string;
    endDate: string;
  };
  timestamp: string;
}

interface ComparisonResult {
  transaction: RecurringTransaction;
  matchingBill?: Bill;
  nameMatch: boolean;
  amountMatch: boolean;
  frequencyMatch: boolean;
  dateMatch: boolean;
  amountDifference?: number;
  status: 'perfect' | 'partial' | 'missing';
}

// Helper functions for frequency grammar
function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function pluralize(frequency: string) {
  if (frequency === 'daily') return 'days';
  if (frequency === 'weekly') return 'weeks';
  if (frequency === 'monthly') return 'months';
  if (frequency === 'yearly') return 'years';
  return frequency;
}

export function RecurringPage() {
  // Performance monitoring
  const { renderCount, resetMetrics } = usePerformanceMonitor('RecurringPage');
  
  const [recurringData, setRecurringData] = useState<RecurringTransactionData | null>(null);
  const [comparisonResults, setComparisonResults] = useState<ComparisonResult[]>([]);
  const [filteredResults, setFilteredResults] = useState<ComparisonResult[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [nameMatchFilter, setNameMatchFilter] = useState('');
  const [amountMatchFilter, setAmountMatchFilter] = useState('');
  const [frequencyMatchFilter, setFrequencyMatchFilter] = useState('');
  const [dateMatchFilter, setDateMatchFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('monarchName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  useEffect(() => {
    fetchRecurringTransactions();
    fetchBills();
  }, []);

  useEffect(() => {
    if (recurringData && bills.length > 0) {
      performComparison();
    }
  }, [recurringData, bills]);

  // Debounced search term to prevent excessive filtering
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchRecurringTransactions = useCallback(async () => {
    // Check cache first
    const cacheKey = 'monarch-recurring-streams';
    const cachedData = apiCache.get(cacheKey);
    if (cachedData) {
      setRecurringData(cachedData);
      setLastFetch(new Date());
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/monarchRecurringStreams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Transform streams data to match the expected format
      const transformedResult = {
        ...result,
        transactions: result.streams?.map((stream: any) => ({
          stream: stream,
          date: stream.dueDate || null,
          isPast: false,
          transactionId: null,
          amount: stream.amount,
          amountDiff: 0,
          category: stream.category,
          account: stream.account
        })) || []
      };
      
      // Cache the result for 5 minutes
      apiCache.set(cacheKey, transformedResult, 5 * 60 * 1000);
      setRecurringData(transformedResult);
      setLastFetch(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBills = useCallback(async () => {
    // Check cache first
    const cacheKey = 'bills';
    const cachedData = apiCache.get(cacheKey);
    if (cachedData) {
      setBills(cachedData);
      return;
    }

    try {
      const data = await getBills();
      // Cache bills for 10 minutes
      apiCache.set(cacheKey, data, 10 * 60 * 1000);
      setBills(data);
    } catch (error) {
      console.error('Error fetching bills:', error);
    }
  }, []);

  const filterAndSortResults = useCallback(() => {
    if (comparisonResults.length === 0) {
      setFilteredResults([]);
      return;
    }

    let filtered = [...comparisonResults];
    
    if (debouncedSearchTerm) {
      const lowerSearchTerm = debouncedSearchTerm.toLowerCase();
      filtered = filtered.filter(result => 
        result.transaction.stream.merchant?.name?.toLowerCase().includes(lowerSearchTerm) ||
        result.transaction.category?.name?.toLowerCase().includes(lowerSearchTerm) ||
        result.transaction.account?.displayName?.toLowerCase().includes(lowerSearchTerm) ||
        result.matchingBill?.name?.toLowerCase().includes(lowerSearchTerm) ||
        Math.abs(result.transaction.amount).toString().includes(debouncedSearchTerm) ||
        formatCurrency(result.transaction.amount).includes(debouncedSearchTerm)
      );
    }
    
    if (statusFilter) {
      filtered = filtered.filter(result => result.status === statusFilter);
    }
    
    if (accountFilter) {
      filtered = filtered.filter(result => result.transaction.account?.displayName === accountFilter);
    }

    if (nameMatchFilter) {
      if (nameMatchFilter === 'match') {
        filtered = filtered.filter(result => result.nameMatch);
      } else if (nameMatchFilter === 'no-match') {
        filtered = filtered.filter(result => !result.nameMatch);
      }
    }

    if (amountMatchFilter) {
      if (amountMatchFilter === 'match') {
        filtered = filtered.filter(result => result.amountMatch);
      } else if (amountMatchFilter === 'no-match') {
        filtered = filtered.filter(result => !result.amountMatch);
      }
    }

    if (frequencyMatchFilter) {
      if (frequencyMatchFilter === 'match') {
        filtered = filtered.filter(result => result.frequencyMatch);
      } else if (frequencyMatchFilter === 'no-match') {
        filtered = filtered.filter(result => !result.frequencyMatch);
      }
    }

    if (dateMatchFilter) {
      if (dateMatchFilter === 'match') {
        filtered = filtered.filter(result => result.dateMatch);
      } else if (dateMatchFilter === 'no-match') {
        filtered = filtered.filter(result => !result.dateMatch);
      }
    }
    
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'monarchName':
          comparison = (a.transaction.stream.merchant?.name || '').localeCompare(b.transaction.stream.merchant?.name || '');
          break;
        case 'appName':
          comparison = (a.matchingBill?.name || '').localeCompare(b.matchingBill?.name || '');
          break;
        case 'nameMatch':
          comparison = Number(b.nameMatch) - Number(a.nameMatch);
          break;
        case 'monarchAmount':
          comparison = a.transaction.amount - b.transaction.amount;
          break;
        case 'appAmount':
          comparison = (a.matchingBill?.amount || 0) - (b.matchingBill?.amount || 0);
          break;
        case 'amountMatch':
          comparison = Number(b.amountMatch) - Number(a.amountMatch);
          break;
        case 'monarchFrequency':
          comparison = (a.transaction.stream.frequency || '').localeCompare(b.transaction.stream.frequency || '');
          break;
        case 'appFrequency':
          comparison = (a.matchingBill?.frequency || '').localeCompare(b.matchingBill?.frequency || '');
          break;
        case 'frequencyMatch':
          comparison = Number(b.frequencyMatch) - Number(a.frequencyMatch);
          break;
        case 'monarchDueDate':
          comparison = new Date(a.transaction.date || 0).getTime() - new Date(b.transaction.date || 0).getTime();
          break;
        case 'appDueDate':
          comparison = new Date(a.matchingBill?.start_date || 0).getTime() - new Date(b.matchingBill?.start_date || 0).getTime();
          break;
        case 'dateMatch':
          comparison = Number(b.dateMatch) - Number(a.dateMatch);
          break;
        case 'account':
          comparison = (a.transaction.account?.displayName || '').localeCompare(b.transaction.account?.displayName || '');
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    setFilteredResults(filtered);
  }, [comparisonResults, debouncedSearchTerm, statusFilter, accountFilter, nameMatchFilter, amountMatchFilter, frequencyMatchFilter, dateMatchFilter, sortField, sortDirection]);

  useEffect(() => {
    if (comparisonResults.length > 0) {
      filterAndSortResults();
    }
  }, [comparisonResults, debouncedSearchTerm, statusFilter, accountFilter, nameMatchFilter, amountMatchFilter, frequencyMatchFilter, dateMatchFilter, sortField, sortDirection, filterAndSortResults]);

  const normalizeName = (name: string) => {
    return name.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  };

  const normalizeFrequency = (frequency: string, repeatsEvery?: number) => {
    const freq = frequency.toLowerCase();
    
    // Handle repeats_every logic for Bills
    if (repeatsEvery && repeatsEvery > 1) {
      if (freq === 'monthly' && repeatsEvery === 3) return 'quarterly';
      if (freq === 'monthly' && repeatsEvery === 6) return 'semiannually';
      if (freq === 'weekly' && repeatsEvery === 2) return 'biweekly';
      if (freq === 'yearly' && repeatsEvery === 2) return 'biannually';
    }
    
    // Handle standard frequencies
    if (freq === 'monthly') return 'monthly';
    if (freq === 'weekly') return 'weekly';
    if (freq === 'daily') return 'daily';
    if (freq === 'yearly') return 'yearly';
    if (freq === 'biweekly') return 'biweekly';
    if (freq === 'semimonthly_mid_end') return 'semimonthly';
    if (freq === 'quarterly') return 'quarterly';
    return freq;
  };

  const compareDates = (monarchDate: string, billDate: string, frequency: string) => {
    try {
      if (!monarchDate || !billDate) return false;
      
      // Parse dates more reliably to avoid timezone issues
      const monarch = new Date(monarchDate + 'T00:00:00');
      const bill = new Date(billDate + 'T00:00:00');
      
      // Check if dates are valid
      if (isNaN(monarch.getTime()) || isNaN(bill.getTime())) return false;
      
      const monarchDay = monarch.getDate();
      const billDay = bill.getDate();
      const monarchDayOfWeek = monarch.getDay(); // 0=Sunday, 1=Monday, etc.
      const billDayOfWeek = bill.getDay();
      
      const normalizedFreq = normalizeFrequency(frequency);
      
      switch (normalizedFreq) {
        case 'yearly':
          // For yearly: exact day and month (year doesn't matter)
          return monarchDay === billDay && monarch.getMonth() === bill.getMonth();
          
        case 'monthly':
        case 'quarterly':
        case 'semimonthly':
          // For monthly/quarterly/semimonthly: exact day (month doesn't matter)
          return monarchDay === billDay;
          
        case 'weekly':
        case 'biweekly':
          // For weekly/biweekly: same day of week
          return monarchDayOfWeek === billDayOfWeek;
          
        case 'daily':
          // For daily: always matches since it's every day
          return true;
          
        default:
          // Default to day comparison for unknown frequencies
          return monarchDay === billDay;
      }
    } catch (error) {
      return false;
    }
  };

  const performComparison = useCallback(() => {
    if (!recurringData || bills.length === 0) return;

    const results: ComparisonResult[] = [];

    // Pre-normalize all bill names for better performance
    const normalizedBills = bills.map(bill => ({
      ...bill,
      normalizedName: normalizeName(bill.name)
    }));

    recurringData.transactions.forEach(transaction => {
      const normalizedTransactionName = normalizeName(transaction.stream.merchant?.name || '');
      const transactionAmount = Math.abs(transaction.amount);
      const transactionFreq = normalizeFrequency(transaction.stream.frequency);

      // Find potential matches by name using pre-normalized data
      const nameMatches = normalizedBills.filter(bill => {
        return bill.normalizedName === normalizedTransactionName ||
               bill.normalizedName.includes(normalizedTransactionName) ||
               normalizedTransactionName.includes(bill.normalizedName);
      });

      let bestMatch: Bill | undefined;
      let nameMatch = false;
      let amountMatch = false;
      let frequencyMatch = false;
      let dateMatch = false;

      if (nameMatches.length > 0) {
        bestMatch = nameMatches.find(bill => {
          const billAmount = Math.abs(bill.amount);
          const billFreq = normalizeFrequency(bill.frequency, bill.repeats_every);
          const amountDiff = Math.abs(billAmount - transactionAmount);
          const amountTolerance = 0;
          
          return amountDiff <= amountTolerance && billFreq === transactionFreq;
        }) || nameMatches[0];

        nameMatch = true;
        const billAmount = Math.abs(bestMatch.amount);
        const billFreq = normalizeFrequency(bestMatch.frequency, bestMatch.repeats_every);
        const amountDiff = Math.abs(billAmount - transactionAmount);
        const amountTolerance = 0;
        
        amountMatch = amountDiff <= amountTolerance;
        frequencyMatch = billFreq === transactionFreq;
        dateMatch = bestMatch.start_date ? compareDates(transaction.date, bestMatch.start_date, transaction.stream.frequency) : false;
      }

      const status: 'perfect' | 'partial' | 'missing' = 
        bestMatch 
          ? (nameMatch && amountMatch && frequencyMatch && dateMatch ? 'perfect' : 'partial')
          : 'missing';

      results.push({
        transaction,
        matchingBill: bestMatch,
        nameMatch,
        amountMatch,
        frequencyMatch,
        dateMatch,
        amountDifference: bestMatch ? Math.abs(bestMatch.amount) - transactionAmount : undefined,
        status
      });
    });

    setComparisonResults(results);
  }, [recurringData, bills]);

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setAccountFilter('');
    setNameMatchFilter('');
    setAmountMatchFilter('');
    setFrequencyMatchFilter('');
    setDateMatchFilter('');
    setSortField('monarchName');
    setSortDirection('asc');
  };

  const handleRefresh = useCallback(async () => {
    // Clear cache and refetch data
    apiCache.delete('monarch-recurring-streams');
    apiCache.delete('bills');
    resetMetrics();
    await fetchRecurringTransactions();
    await fetchBills();
  }, [fetchRecurringTransactions, fetchBills, resetMetrics]);


  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }, []);

  const getSortIcon = useCallback((field: SortField) => {
    if (field !== sortField) return '';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  }, [sortField, sortDirection]);

  // Memoized unique accounts for filter dropdown
  const uniqueAccounts = useMemo(() => {
    const accounts = new Set<string>();
    comparisonResults.forEach(result => {
      if (result.transaction.account?.displayName) {
        accounts.add(result.transaction.account.displayName);
      }
    });
    return Array.from(accounts).sort();
  }, [comparisonResults]);

  const getStatusIcon = (result: ComparisonResult) => {
    switch (result.status) {
      case 'perfect':
        return <Check className="w-4 h-4 text-green-600" />;
      case 'partial':
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      case 'missing':
        return <Plus className="w-4 h-4 text-red-600" />;
    }
  };

  const getMatchIcon = (isMatch: boolean) => {
    return isMatch 
      ? <Check className="w-4 h-4 text-green-600" />
      : <X className="w-4 h-4 text-red-600" />;
  };

  const formatFrequencyDisplay = (bill: Bill) => {
    if (bill.frequency === 'one-time') {
      return 'One-time';
    }
    if (bill.repeats_every === 1) {
      return capitalize(bill.frequency);
    }
    return `Every ${bill.repeats_every} ${pluralize(bill.frequency)}`;
  };


  return (
    <div className="space-y-8 px-4 max-w-6xl mx-auto">
        {/* Page Description */}
        <div className="text-center space-y-2 py-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Recurring Transactions Comparison
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
          Compare Monarch Money recurring transactions with your manual bills. Shows what matches, what's different, and what's missing.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Comparison Results
          {comparisonResults.length > 0 && (
            <span className="text-lg font-normal text-gray-500 dark:text-gray-400 ml-2">
              ({comparisonResults.length} transactions analyzed)
            </span>
          )}
        </h2>
            <Button
              onClick={handleRefresh}
              disabled={loading}
              leftIcon={<RefreshCw className={loading ? 'animate-spin' : ''} size={16} />}
            >
              Refresh Data
            </Button>
        </div>

        {lastFetch && (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Last updated: {lastFetch.toLocaleString()}
          </p>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <h3 className="text-red-800 dark:text-red-400 font-medium">Error</h3>
            <p className="text-red-700 dark:text-red-300 mt-1">{error}</p>
          </div>
        )}

        {loading && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              <span className="text-blue-800 dark:text-blue-400">Loading recurring transactions...</span>
            </div>
          </div>
        )}
        
        {/* Filters */}
      {comparisonResults.length > 0 && (
          <div className="flex justify-center">
            <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-2">
              <Input
                className="w-full sm:w-80"
                placeholder="Search name, category, or amount..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Select
                className="w-full sm:w-40"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
                options={[
                { value: '', label: 'All Status' },
                { value: 'perfect', label: 'Perfect Match' },
                { value: 'partial', label: 'Partial Match' },
                { value: 'missing', label: 'Missing in Bills' }
                ]}
              />
              <Select
                className="w-full sm:w-40"
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                options={[
                  { value: '', label: 'All Accounts' },
                  ...uniqueAccounts.map(account => ({
                    value: account,
                    label: account
                  }))
                ]}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={resetFilters}
              >
                Reset
              </Button>
            </div>
          </div>
        )}
        
      {/* Comparison Table */}
      {comparisonResults.length > 0 && (
          <Card className="w-full">
            <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[80vh]">
              <table className="w-full min-w-[1600px]">
                <thead className="sticky top-0 z-50 bg-gray-800 dark:bg-gray-800">
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th 
                        className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('status')}
                    >
                      Status{getSortIcon('status')}
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('monarchName')}
                    >
                      Monarch Name{getSortIcon('monarchName')}
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('appName')}
                    >
                      App Name{getSortIcon('appName')}
                    </th>
                    <th 
                      className="px-4 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('nameMatch')}
                    >
                      Name ✓{getSortIcon('nameMatch')}
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('monarchAmount')}
                    >
                      Monarch Amount{getSortIcon('monarchAmount')}
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('appAmount')}
                    >
                      App Amount{getSortIcon('appAmount')}
                    </th>
                    <th 
                      className="px-4 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('amountMatch')}
                    >
                      Amount ✓{getSortIcon('amountMatch')}
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('monarchFrequency')}
                    >
                      Monarch Frequency{getSortIcon('monarchFrequency')}
                      </th>
                      <th 
                        className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('appFrequency')}
                    >
                      App Frequency{getSortIcon('appFrequency')}
                    </th>
                    <th 
                      className="px-4 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('frequencyMatch')}
                    >
                      Frequency ✓{getSortIcon('frequencyMatch')}
                      </th>
                      <th 
                        className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('monarchDueDate')}
                      >
                      Monarch Due Date{getSortIcon('monarchDueDate')}
                      </th>
                      <th 
                        className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('appDueDate')}
                    >
                      App Due Date{getSortIcon('appDueDate')}
                    </th>
                    <th 
                      className="px-4 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('dateMatch')}
                    >
                      Due Date ✓{getSortIcon('dateMatch')}
                      </th>
                      <th 
                        className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('account')}
                      >
                      Account{getSortIcon('account')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                      <td colSpan={14} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                          Loading transactions...
                        </td>
                      </tr>
                  ) : filteredResults.length === 0 ? (
                      <tr>
                      <td colSpan={14} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                        No transactions found. {comparisonResults.length > 0 ? 'Try adjusting your filters.' : 'Loading comparison data...'}
                        </td>
                      </tr>
                    ) : (
                    filteredResults.map((result, index) => (
                      <tr 
                        key={`${result.transaction.stream.id}-${index}`}
                        className={`border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                          result.status === 'perfect' ? 'bg-green-50 dark:bg-green-900/10' :
                          result.status === 'partial' ? 'bg-yellow-50 dark:bg-yellow-900/10' :
                          'bg-red-50 dark:bg-red-900/10'
                        }`}
                      >
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center space-x-2">
                            {getStatusIcon(result)}
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              result.status === 'perfect' ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' :
                              result.status === 'partial' ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300' :
                              'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                            }`}>
                              {result.status === 'perfect' ? 'Perfect' : 
                               result.status === 'partial' ? 'Partial' : 'Missing'}
                            </span>
                          </div>
                        </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                            <div className="flex items-center gap-3">
                            {result.transaction.stream.merchant?.logoUrl && (
                              <img 
                                src={result.transaction.stream.merchant.logoUrl} 
                                alt={result.transaction.stream.merchant?.name || 'Merchant'}
                                className="w-6 h-6 rounded object-cover flex-shrink-0"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              )}
                              <div>
                                <div className="font-medium">
                                {result.transaction.stream.merchant?.name || 'Unknown Merchant'}
                                </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {result.transaction.category?.name || 'Unknown Category'}
                              </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {result.matchingBill?.name || '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {result.matchingBill ? getMatchIcon(result.nameMatch) : '—'}
                          </td>
                        <td className="px-4 py-3 text-sm">
                          <div className={`font-medium ${
                            result.transaction.amount >= 0 
                              ? 'text-green-600 dark:text-green-400' 
                              : 'text-red-600 dark:text-red-400'
                          }`}>
                            {formatCurrency(result.transaction.amount)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {result.matchingBill ? formatCurrency(result.matchingBill.amount) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {result.matchingBill ? getMatchIcon(result.amountMatch) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {capitalize(result.transaction.stream.frequency)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {result.matchingBill ? formatFrequencyDisplay(result.matchingBill) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {result.matchingBill ? getMatchIcon(result.frequencyMatch) : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {result.transaction.date ? format(parseISO(result.transaction.date), 'MMM d, yyyy') : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {result.matchingBill && result.matchingBill.start_date ? 
                            format(parseISO(result.matchingBill.start_date), 'MMM d, yyyy') : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {result.matchingBill ? getMatchIcon(result.dateMatch) : '—'}
                          </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {result.transaction.account?.displayName || 'Unknown Account'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

      {/* Summary */}
      {comparisonResults.length > 0 && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Comparison Summary
            </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div className="text-green-600 dark:text-green-400">
              <strong>Perfect Matches:</strong> {comparisonResults.filter(r => r.status === 'perfect').length}
              </div>
            <div className="text-yellow-600 dark:text-yellow-400">
              <strong>Partial Matches:</strong> {comparisonResults.filter(r => r.status === 'partial').length}
              </div>
            <div className="text-red-600 dark:text-red-400">
              <strong>Missing in Bills:</strong> {comparisonResults.filter(r => r.status === 'missing').length}
              </div>
            <div className="text-gray-700 dark:text-gray-300">
              <strong>Total Analyzed:</strong> {comparisonResults.length}
            </div>
          </div>
          </div>
        )}
    </div>
  );
}