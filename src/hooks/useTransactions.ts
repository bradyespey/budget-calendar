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
  note?: string;
  owner?: 'Both' | 'Brady' | 'Jenny';
  iconUrl?: string | null;
  iconType?: 'brand' | 'generated' | 'category' | 'custom' | null;
  // Monarch transaction fields
  merchantLogoUrl?: string;
  isEditable: boolean;
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
      
      const [billsData, monarchData, categoriesData] = await Promise.all([
        getBills(),
        getRecurringTransactions(),
        getCategories()
      ]);
      
      setBills(billsData);
      setMonarchTransactions(monarchData);
      setCategories(categoriesData);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Combine manual and Monarch transactions
  const combineTransactions = useCallback(() => {
    const combined: CombinedTransaction[] = [];

    // Add filtered manual bills (only Food & Drinks and Garner Security Deposit)
    bills.forEach(bill => {
      if (bill.category === 'food & drinks' || bill.name.toLowerCase().includes('garner security deposit')) {
        combined.push({
          id: `manual-${bill.id}`,
          name: bill.name,
          category: bill.category,
          amount: bill.amount,
          frequency: formatFrequency(bill.frequency, bill.repeats_every),
          dueDate: bill.start_date,
          account: '—', // Manual transactions don't have account info
          source: 'manual',
          note: bill.note,
          owner: bill.owner,
          iconUrl: bill.iconUrl,
          iconType: bill.iconType,
          isEditable: true
        });
      }
    });

    // Add Monarch recurring transactions
    monarchTransactions.forEach(transaction => {
      combined.push({
        id: `monarch-${transaction.streamId}`,
        name: transaction.merchantName,
        category: transaction.categoryName || 'other',
        amount: transaction.amount,
        frequency: capitalize(transaction.frequency),
        dueDate: transaction.dueDate,
        account: transaction.accountName || 'Unknown',
        source: 'monarch',
        merchantLogoUrl: transaction.merchantLogoUrl,
        isEditable: false
      });
    });

    setCombinedTransactions(combined);
  }, [bills, monarchTransactions]);

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
