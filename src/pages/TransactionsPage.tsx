//src/pages/TransactionsPage.tsx

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Layout } from '../components/Layout/Layout';
import { Plus } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { TransactionsFilters } from '../components/TransactionsFilters';
import { TransactionsTable } from '../components/TransactionsTable';
import { TransactionForm, FormMode } from '../components/TransactionForm';
import { useTransactions, CombinedTransaction } from '../hooks/useTransactions';
import { useTransactionFilters } from '../hooks/useTransactionFilters';
import { getFunctionTimestamps } from '../api/firebase';

export function TransactionsPage() {
  const location = useLocation();
  const [refreshTransactionsTimestamp, setRefreshTransactionsTimestamp] = useState<Date | null>(null);
  
  // Custom hooks
  const {
    combinedTransactions,
    categories,
    loading,
    refreshing,
    error,
    setError,
    fetchData,
    combineTransactions,
    handleRefresh,
    createTransaction,
    updateTransaction,
    deleteTransaction
  } = useTransactions();

  const {
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
    filteredTransactions,
    uniqueFrequencies,
    uniqueAccounts,
    uniqueCategories,
    resetFilters,
    handleSort,
    handleFilterClick
  } = useTransactionFilters(combinedTransactions);

  // Form state
  const [formMode, setFormMode] = useState<FormMode>('view');
  const [selectedTransaction, setSelectedTransaction] = useState<CombinedTransaction | null>(null);

  // Form handlers
  const handleCreateTransaction = () => {
    setFormMode('create');
    setSelectedTransaction(null);
  };

  const handleEditTransaction = (transaction: CombinedTransaction) => {
    if (!transaction.isEditable) return;
    
    setFormMode('edit');
    setSelectedTransaction(transaction);
  };

  const handleSubmitForm = async (formData: any) => {
    try {
      const billData = {
        name: formData.name,
        category: formData.category,
        amount: formData.amount,
        frequency: formData.frequency,
        repeats_every: formData.repeats_every,
        start_date: formData.start_date,
        note: formData.note,
      };

      if (formMode === 'create') {
        await createTransaction(billData);
      } else if (formMode === 'edit' && selectedTransaction) {
        const billId = selectedTransaction.id.replace('manual-', '');
        await updateTransaction(billId, billData);
      }

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
      await deleteTransaction(transaction);
    } catch (err) {
      console.error('Error deleting transaction:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete transaction');
    }
  };

  // Load refresh transactions timestamp
  const loadTimestamp = async () => {
    try {
      const timestamps = await getFunctionTimestamps();
      if (timestamps.refreshRecurringTransactions) {
        setRefreshTransactionsTimestamp(timestamps.refreshRecurringTransactions);
      }
    } catch (err) {
      console.error('Error loading timestamp:', err);
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

  // Effects
  useEffect(() => {
    fetchData();
    loadTimestamp();
  }, [fetchData]);

  useEffect(() => {
    combineTransactions();
  }, [combineTransactions]);

  // Handle URL navigation
  useEffect(() => {
    if (location.state?.action === 'create') {
      handleCreateTransaction();
    }
  }, [location.state]);

  // Get initial form data for editing
  const getInitialFormData = () => {
    if (formMode === 'edit' && selectedTransaction) {
      // Find the original bill data
      const billData = {
        name: selectedTransaction.name,
        category: selectedTransaction.category,
        amount: selectedTransaction.amount,
        frequency: 'monthly', // Will need to derive from selectedTransaction
        repeats_every: 1,
        start_date: selectedTransaction.dueDate,
        note: selectedTransaction.note || '',
        owner: selectedTransaction.owner || 'Both' as const,
      };
      return billData;
    }
    return undefined;
  };

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
            {refreshTransactionsTimestamp && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {formatTimestamp(refreshTransactionsTimestamp)}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreateTransaction} size="sm">
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
        <TransactionsFilters
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          frequencyFilter={frequencyFilter}
          setFrequencyFilter={setFrequencyFilter}
          accountFilter={accountFilter}
          setAccountFilter={setAccountFilter}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          sourceFilter={sourceFilter}
          setSourceFilter={setSourceFilter}
          uniqueFrequencies={uniqueFrequencies}
          uniqueAccounts={uniqueAccounts}
          uniqueCategories={uniqueCategories}
          resetFilters={resetFilters}
        />

        {/* Transactions Table */}
        <TransactionsTable
          transactions={filteredTransactions}
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
          onEdit={handleEditTransaction}
          onDelete={handleDeleteTransaction}
          onFilterClick={handleFilterClick}
        />

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
        <TransactionForm
          mode={formMode}
          categories={categories}
          initialData={getInitialFormData()}
          onSubmit={handleSubmitForm}
          onCancel={() => setFormMode('view')}
        />
      </div>
    </Layout>
  );
}
