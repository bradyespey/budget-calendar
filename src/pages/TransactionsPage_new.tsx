//src/pages/TransactionsPage.tsx

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Layout } from '../components/Layout/Layout';
import { Plus, Edit2, Trash2, RefreshCw, Copy, ImageIcon, RotateCcw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { CategorySelect } from '../components/ui/CategorySelect';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { TransactionIcon } from '../components/TransactionIcon';
import { updateTransactionIcon, resetTransactionIcon } from '../api/icons';
import { getBills, createBill, updateBill, deleteBill } from '../api/bills';
import { getCategories, Category } from '../api/categories';
import { getRecurringTransactions, RecurringTransaction, refreshRecurringTransactions } from '../api/firebase';
import { Bill } from '../types';
import { format, parseISO } from 'date-fns';
import { apiCache } from '../utils/apiCache';

type FormMode = 'create' | 'edit' | 'view';
type SortField = 'name' | 'dueDate' | 'frequency' | 'account' | 'category' | 'amount' | 'source';
type SortDirection = 'asc' | 'desc';

// Combined transaction interface
interface CombinedTransaction {
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

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'one-time', label: 'One-time' },
];

const OWNER_OPTIONS = [
  { value: 'Both', label: 'Both' },
  { value: 'Brady', label: 'Brady' },
  { value: 'Jenny', label: 'Jenny' },
];

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

export function TransactionsPage() {
  const location = useLocation();
  
  // State for combined data
  const [combinedTransactions, setCombinedTransactions] = useState<CombinedTransaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<CombinedTransaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [monarchTransactions, setMonarchTransactions] = useState<RecurringTransaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters and search
  const [searchTerm, setSearchTerm] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Form state
  const [formMode, setFormMode] = useState<FormMode>('view');
  const [selectedTransaction, setSelectedTransaction] = useState<CombinedTransaction | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    amount: 0,
    frequency: 'monthly',
    repeats_every: 1,
    start_date: '',
    note: '',
    owner: 'Both' as 'Both' | 'Brady' | 'Jenny',
  });

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

    // Add filtered manual bills (only Food & Drinks and one-time)
    bills.forEach(bill => {
      if (bill.category === 'food & drinks' || bill.frequency === 'one-time') {
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

  // Filter and sort transactions
  const filterAndSortTransactions = useMemo(() => {
    let filtered = combinedTransactions.filter(transaction => {
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
  }, [combinedTransactions, searchTerm, frequencyFilter, accountFilter, categoryFilter, sourceFilter, sortField, sortDirection]);

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

  // Form handlers
  const handleCreateTransaction = () => {
    setFormMode('create');
    setSelectedTransaction(null);
    setFormData({
      name: '',
      category: '',
      amount: 0,
      frequency: 'monthly',
      repeats_every: 1,
      start_date: new Date().toISOString().split('T')[0],
      note: '',
      owner: 'Both',
    });
  };

  const handleEditTransaction = (transaction: CombinedTransaction) => {
    if (!transaction.isEditable) return;
    
    setFormMode('edit');
    setSelectedTransaction(transaction);
    
    // Find the original bill
    const originalBill = bills.find(bill => `manual-${bill.id}` === transaction.id);
    if (originalBill) {
      setFormData({
        name: originalBill.name,
        category: originalBill.category,
        amount: originalBill.amount,
        frequency: originalBill.frequency,
        repeats_every: originalBill.repeats_every,
        start_date: originalBill.start_date,
        note: originalBill.note || '',
        owner: originalBill.owner,
      });
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const billData = {
        name: formData.name,
        category: formData.category,
        amount: formData.amount,
        frequency: formData.frequency,
        repeats_every: formData.repeats_every,
        start_date: formData.start_date,
        note: formData.note,
        owner: formData.owner,
      };

      if (formMode === 'create') {
        await createBill(billData);
      } else if (formMode === 'edit' && selectedTransaction) {
        const billId = selectedTransaction.id.replace('manual-', '');
        await updateBill(billId, billData);
      }

      await fetchData();
      setFormMode('view');
      setSelectedTransaction(null);
    } catch (err) {
      console.error('Error saving transaction:', err);
      setError(err instanceof Error ? err.message : 'Failed to save transaction');
    }
  };

  const handleDeleteTransaction = async (transaction: CombinedTransaction) => {
    if (!transaction.isEditable) return;
    
    try {
      const billId = transaction.id.replace('manual-', '');
      await deleteBill(billId);
      await fetchData();
    } catch (err) {
      console.error('Error deleting transaction:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete transaction');
    }
  };

  const handleUpdateIcon = async (transaction: CombinedTransaction, iconUrl: string, iconType: string) => {
    if (!transaction.isEditable) return;
    
    try {
      const billId = transaction.id.replace('manual-', '');
      await updateTransactionIcon(billId, iconUrl, iconType);
      await fetchData();
    } catch (err) {
      console.error('Error updating icon:', err);
      setError(err instanceof Error ? err.message : 'Failed to update icon');
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Effects
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    combineTransactions();
  }, [combineTransactions]);

  useEffect(() => {
    setFilteredTransactions(filterAndSortTransactions);
  }, [filterAndSortTransactions]);

  // Handle URL navigation
  useEffect(() => {
    if (location.state?.action === 'create') {
      handleCreateTransaction();
    }
  }, [location.state]);

  // Get unique values for filters
  const uniqueFrequencies = [...new Set(combinedTransactions.map(t => t.frequency))].sort();
  const uniqueAccounts = [...new Set(combinedTransactions.map(t => t.account).filter(a => a !== '—'))].sort();
  const uniqueCategories = [...new Set(combinedTransactions.map(t => t.category))].sort();

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading transactions...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Transactions
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage manual transactions and view Monarch recurring data
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh Data
            </Button>
            <Button onClick={handleCreateTransaction}>
              <Plus className="h-4 w-4 mr-2" />
              Add Transaction
            </Button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              <Input
                placeholder="Search transactions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Select
                value={frequencyFilter}
                onChange={(e) => setFrequencyFilter(e.target.value)}
              >
                <option value="">All Frequencies</option>
                {uniqueFrequencies.map(frequency => (
                  <option key={frequency} value={frequency}>{frequency}</option>
                ))}
              </Select>
              <Select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
              >
                <option value="">All Accounts</option>
                {uniqueAccounts.map(account => (
                  <option key={account} value={account}>{account}</option>
                ))}
              </Select>
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">All Categories</option>
                {uniqueCategories.map(category => (
                  <option key={category} value={category}>{capitalize(category)}</option>
                ))}
              </Select>
              <Select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <option value="">All Sources</option>
                <option value="manual">Manual</option>
                <option value="monarch">Monarch</option>
              </Select>
              <Button onClick={resetFilters} variant="outline" size="sm">
                Reset Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Transactions Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <th 
                      className="text-left p-4 font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                      onClick={() => handleSort('name')}
                    >
                      Name {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="text-left p-4 font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                      onClick={() => handleSort('dueDate')}
                    >
                      Next Due Date {sortField === 'dueDate' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="text-left p-4 font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                      onClick={() => handleSort('frequency')}
                    >
                      Frequency {sortField === 'frequency' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="text-left p-4 font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                      onClick={() => handleSort('account')}
                    >
                      Payment Account {sortField === 'account' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="text-left p-4 font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                      onClick={() => handleSort('category')}
                    >
                      Category {sortField === 'category' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="text-left p-4 font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                      onClick={() => handleSort('amount')}
                    >
                      Amount {sortField === 'amount' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="text-left p-4 font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                      onClick={() => handleSort('source')}
                    >
                      Source {sortField === 'source' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="text-left p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((transaction) => (
                    <tr
                      key={transaction.id}
                      className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <TransactionIcon
                            bill={transaction.source === 'manual' ? {
                              id: transaction.id.replace('manual-', ''),
                              iconUrl: transaction.iconUrl,
                              iconType: transaction.iconType,
                              name: transaction.name,
                              category: transaction.category
                            } : null}
                            merchantLogoUrl={transaction.merchantLogoUrl}
                            size="sm"
                            onIconUpdate={transaction.isEditable ? (iconUrl, iconType) => 
                              handleUpdateIcon(transaction, iconUrl, iconType) : undefined}
                          />
                          <span className="font-medium">{transaction.name}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        {format(parseISO(transaction.dueDate), 'MMM d, yyyy')}
                      </td>
                      <td className="p-4">{transaction.frequency}</td>
                      <td className="p-4">{transaction.account}</td>
                      <td className="p-4">{capitalize(transaction.category)}</td>
                      <td className="p-4">
                        <span className={transaction.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                          ${Math.abs(transaction.amount).toFixed(2)}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          transaction.source === 'manual' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                        }`}>
                          {transaction.source === 'manual' ? 'Manual' : 'Monarch'}
                        </span>
                      </td>
                      <td className="p-4">
                        {transaction.isEditable && (
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleEditTransaction(transaction)}
                              size="sm"
                              variant="outline"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              onClick={() => handleDeleteTransaction(transaction)}
                              size="sm"
                              variant="destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {filteredTransactions.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No transactions found.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {combinedTransactions.filter(t => t.source === 'monarch').length}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Monarch Transactions</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {combinedTransactions.filter(t => t.source === 'manual').length}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Manual Transactions</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {combinedTransactions.length}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Transactions</div>
            </CardContent>
          </Card>
        </div>

        {/* Form Modal */}
        {formMode !== 'view' && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>
                  {formMode === 'create' ? 'Add Transaction' : 'Edit Transaction'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitForm} className="space-y-4">
                  <Input
                    label="Name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                  
                  <CategorySelect
                    value={formData.category}
                    onChange={(value) => setFormData({ ...formData, category: value })}
                    categories={categories}
                    required
                  />
                  
                  <Input
                    label="Amount"
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                    required
                  />
                  
                  <Select
                    label="Frequency"
                    value={formData.frequency}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                    required
                  >
                    {FREQUENCY_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                  
                  {formData.frequency !== 'one-time' && (
                    <Input
                      label="Repeats Every"
                      type="number"
                      min="1"
                      value={formData.repeats_every}
                      onChange={(e) => setFormData({ ...formData, repeats_every: parseInt(e.target.value) || 1 })}
                      required
                    />
                  )}
                  
                  <Input
                    label="Start Date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    required
                  />
                  
                  <Select
                    label="Owner"
                    value={formData.owner}
                    onChange={(e) => setFormData({ ...formData, owner: e.target.value as 'Both' | 'Brady' | 'Jenny' })}
                    required
                  >
                    {OWNER_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                  
                  <Input
                    label="Note"
                    value={formData.note}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  />
                  
                  <div className="flex gap-2 pt-4">
                    <Button type="submit" className="flex-1">
                      {formMode === 'create' ? 'Create' : 'Update'}
                    </Button>
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={() => setFormMode('view')}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
