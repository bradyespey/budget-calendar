//src/hooks/useTransactionFilters.ts

import { useState, useMemo } from 'react';
import { CombinedTransaction } from './useTransactions';

export type SortField = 'name' | 'dueDate' | 'frequency' | 'account' | 'category' | 'amount' | 'source';
export type SortDirection = 'asc' | 'desc';

export function useTransactionFilters(transactions: CombinedTransaction[]) {
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Filter and sort transactions
  const filteredTransactions = useMemo(() => {
    let filtered = transactions.filter(transaction => {
      const matchesSearch = transaction.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           transaction.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFrequency = !frequencyFilter || transaction.frequency.toLowerCase().includes(frequencyFilter.toLowerCase());
      const matchesAccount = !accountFilter || transaction.account.toLowerCase().includes(accountFilter.toLowerCase());
      const matchesCategory = !categoryFilter || transaction.category.toLowerCase().includes(categoryFilter.toLowerCase());
      const matchesSource = !sourceFilter || transaction.source === sourceFilter;

      return matchesSearch && matchesFrequency && matchesAccount && matchesCategory && matchesSource;
    });

    // Sort
    filtered.sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

      if (sortField === 'amount') {
        aValue = Math.abs(aValue);
        bValue = Math.abs(bValue);
      } else if (sortField === 'dueDate') {
        aValue = new Date(aValue);
        bValue = new Date(bValue);
      } else if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [transactions, searchTerm, frequencyFilter, accountFilter, categoryFilter, sourceFilter, sortField, sortDirection]);

  // Get unique values for filters
  const uniqueFrequencies = [...new Set(transactions.map(t => t.frequency))].sort();
  const uniqueAccounts = [...new Set(transactions.map(t => t.account).filter(a => a !== '—'))].sort();
  const uniqueCategories = [...new Set(transactions.map(t => t.category))].sort();

  // Reset filters
  const resetFilters = () => {
    setSearchTerm('');
    setFrequencyFilter('');
    setAccountFilter('');
    setCategoryFilter('');
    setSourceFilter('');
    setSortField('name');
    setSortDirection('asc');
  };

  // Handle sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Handle filter clicks
  const handleFilterClick = (type: 'frequency' | 'account' | 'category' | 'source', value: string) => {
    switch (type) {
      case 'frequency':
        setFrequencyFilter(value);
        break;
      case 'account':
        setAccountFilter(value);
        break;
      case 'category':
        setCategoryFilter(value);
        break;
      case 'source':
        setSourceFilter(value);
        break;
    }
  };

  return {
    // Filter states
    searchTerm,
    setSearchTerm,
    frequencyFilter,
    setFrequencyFilter,
    accountFilter,
    setAccountFilter,
    categoryFilter,
    setCategoryFilter,
    sourceFilter,
    setSourceFilter,
    sortField,
    sortDirection,
    
    // Computed values
    filteredTransactions,
    uniqueFrequencies,
    uniqueAccounts,
    uniqueCategories,
    
    // Actions
    resetFilters,
    handleSort,
    handleFilterClick
  };
}


