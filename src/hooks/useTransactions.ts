//src/hooks/useTransactions.ts

import { useState, useCallback, useMemo } from 'react';
import { getBills, createBill, updateBill, deleteBill } from '../api/bills';
import { getCategories, Category } from '../api/categories';
import { getRecurringTransactions, RecurringTransaction, refreshRecurringTransactions } from '../api/firebase';
import { updateTransactionIcon } from '../api/icons';
import { Bill } from '../types';

// Combined transaction interface
export interface CombinedTransaction {
  id: string;
  name: string;
  category: string;
  amount: number;
  frequency: string;
  dueDate: string;
  account: string;
  source: 'manual' | 'monarch';
  // Manual transaction fields
  notes?: string;
  iconUrl?: string | null;
  iconType?: 'brand' | 'generated' | 'category' | 'custom' | null;
  // Monarch transaction fields
  merchantLogoUrl?: string;
  merchantName?: string;
  categoryIcon?: string;
  categoryGroup?: string;
  accountType?: string;
  accountSubtype?: string;
  institutionName?: string;
  isEditable: boolean;
  // Raw data for editing
  rawFrequency?: string;
  repeats_every?: number;
}

// Helper functions
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

function formatFrequency(frequency: string, repeatsEvery: number = 1): string {
  if (frequency === 'one-time') return 'One-time';
  
  // Map Monarch frequency values to better display names
  const frequencyMap: { [key: string]: string } = {
    'Semimonthly_mid_end': 'Twice a month (15th & last day)',
    'semimonthly_mid_end': 'Twice a month (15th & last day)',
    'semimonthly': 'Twice a month',
    'biweekly': 'Every 2 weeks',
    'bi-monthly': 'Every 2 months'
  };
  
  // Check if we have a mapped frequency
  const mappedFrequency = frequencyMap[frequency.toLowerCase()];
  if (mappedFrequency) {
    return mappedFrequency;
  }
  
  if (repeatsEvery === 1) {
    return capitalize(frequency);
  } else {
    return `Every ${repeatsEvery} ${pluralize(frequency)}`;
  }
}

export function useTransactions() {
  const [combinedTransactions, setCombinedTransactions] = useState<CombinedTransaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [monarchTransactions, setMonarchTransactions] = useState<RecurringTransaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [billsData, categoriesData] = await Promise.all([
        getBills(),
        getCategories()
      ]);
      
      setBills(billsData);
      setMonarchTransactions([]); // No longer using separate monarch collection
      setCategories(categoriesData);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Combine manual and Monarch transactions (now all from bills collection)
  const combineTransactions = useCallback(() => {
    const combined: CombinedTransaction[] = [];

    // Add all bills (both manual and Monarch sources)
    bills.forEach(bill => {
        combined.push({
          id: bill.id,
          name: bill.name,
          category: bill.category,
          amount: bill.amount,
          frequency: formatFrequency(bill.frequency, bill.repeats_every || 1),
          dueDate: bill.start_date,
          account: bill.source === 'monarch' ? (bill.accountName || 'Unknown') : '—',
          source: bill.source || 'manual',
          notes: bill.notes,
          iconUrl: bill.iconUrl,
          iconType: bill.iconType,
          merchantLogoUrl: bill.logoUrl,
          merchantName: bill.merchantName,
          categoryIcon: bill.categoryIcon,
          categoryGroup: bill.categoryGroup,
          accountType: bill.accountType,
          accountSubtype: bill.accountSubtype,
          institutionName: bill.institutionName,
          isEditable: bill.source !== 'monarch',
          rawFrequency: bill.frequency,
          repeats_every: bill.repeats_every || 1
        });
    });

    setCombinedTransactions(combined);
  }, [bills]);

  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshRecurringTransactions();
      await fetchData();
    } catch (err) {
      console.error('Error refreshing data:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  };

  // Transaction operations
  const createTransaction = async (billData: Omit<Bill, 'id'>) => {
    await createBill(billData);
    await fetchData();
  };

  const updateTransaction = async (billId: string, billData: Omit<Bill, 'id'>) => {
    await updateBill(billId, billData);
    await fetchData();
  };

  const deleteTransaction = async (transaction: CombinedTransaction) => {
    if (!transaction.isEditable) return;
    
    const billId = transaction.id.replace('manual-', '');
    await deleteBill(billId);
    await fetchData();
  };

  const updateTransactionIconHandler = async (transaction: CombinedTransaction, iconUrl: string, iconType: string) => {
    if (!transaction.isEditable) return;
    
    const billId = transaction.id.replace('manual-', '');
    await updateTransactionIcon(billId, iconUrl, iconType);
    await fetchData();
  };

  return {
    // Data
    combinedTransactions,
    bills,
    categories,
    loading,
    refreshing,
    error,
    setError,
    
    // Operations
    fetchData,
    combineTransactions,
    handleRefresh,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    updateTransactionIconHandler
  };
}
