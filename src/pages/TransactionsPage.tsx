//src/pages/TransactionsPage.tsx

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Layout } from '../components/Layout/Layout';
import { Plus, Pencil } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardTitle } from '../components/ui/Card';
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
    accountTypeFilter,
    setAccountTypeFilter,
    categoryFilter,
    setCategoryFilter,
    sourceFilter,
    setSourceFilter,
    sortField,
    sortDirection,
    filteredTransactions,
    uniqueFrequencies,
    uniqueAccounts,
    uniqueAccountTypes,
    uniqueCategories,
    resetFilters,
    handleSort,
    handleFilterClick
  } = useTransactionFilters(combinedTransactions);

  // Form state
  const [formMode, setFormMode] = useState<FormMode>('view');
  const [selectedTransaction, setSelectedTransaction] = useState<CombinedTransaction | null>(null);
  const [editMode, setEditMode] = useState(false);

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
        end_date: formData.end_date,
        notes: formData.notes,
        accountType: formData.accountType,
        iconUrl: formData.iconUrl,
        iconType: formData.iconType,
      };

      if (formMode === 'create') {
        try {
          await createTransaction(billData);
        } catch (e: any) {
          if (e.code === 'permission-denied' || e.message?.includes('permission-denied') || e.message?.includes('Missing or insufficient permissions')) {
            // Silently handle permission errors
          } else {
            throw e;
          }
        }
      } else if (formMode === 'edit' && selectedTransaction) {
        try {
          const billId = selectedTransaction.id.replace('manual-', '');
          await updateTransaction(billId, billData);
        } catch (e: any) {
          if (e.code === 'permission-denied' || e.message?.includes('permission-denied') || e.message?.includes('Missing or insufficient permissions')) {
            // Silently handle permission errors
          } else {
            throw e;
          }
        }
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
    if (!window.confirm(`Delete "${transaction.name}"? This cannot be undone.`)) return;
    
    try {
      try {
        await deleteTransaction(transaction);
      } catch (e: any) {
        if (e.code === 'permission-denied' || e.message?.includes('permission-denied') || e.message?.includes('Missing or insufficient permissions')) {
          // Silently handle permission errors
        } else {
          throw e;
        }
      }
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

  // Effects - Load data on mount only
  useEffect(() => {
    fetchData();
    loadTimestamp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        frequency: selectedTransaction.rawFrequency || 'monthly',
        repeats_every: selectedTransaction.repeats_every || 1,
        start_date: selectedTransaction.dueDate,
        end_date: selectedTransaction.end_date || '',
        notes: selectedTransaction.notes || '',
        iconUrl: selectedTransaction.iconUrl || '',
        iconType: selectedTransaction.iconType || null,
        accountType: selectedTransaction.accountType || 'Checking',
      };
      return billData;
    }
    return undefined;
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="surface-card px-6 py-5 text-sm text-[color:var(--muted)]">Loading transactions…</div>
      </div>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          eyebrow="Transactions"
          title="Transactions"
          subtitle={refreshTransactionsTimestamp ? formatTimestamp(refreshTransactionsTimestamp) : undefined}
          description="Keep recurring Monarch streams and manual bills in one compact workspace. Filters, sorting, edits, and review all stay tied to the same dataset."
          helpSections={[
            {
              title: 'Quick Tips',
              items: [
                'View recurring transactions (Monarch + Manual)',
                'Create and edit manual transactions',
                'Filter by frequency, account, category, or source',
              ],
            },
          ]}
          stats={[
            { label: 'Total', value: combinedTransactions.length.toString(), tone: 'accent' },
            { label: 'Visible', value: filteredTransactions.length.toString(), tone: 'success' },
            { label: 'Manual', value: combinedTransactions.filter(t => t.source === 'manual').length.toString(), tone: 'warning' },
            { label: 'Monarch', value: combinedTransactions.filter(t => t.source === 'monarch').length.toString(), tone: 'danger' },
            { label: 'Categories', value: categories.length.toString(), tone: 'violet' },
          ]}
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleRefresh} size="sm" variant="outline" isLoading={refreshing}>
                Refresh
              </Button>
              <Button onClick={handleCreateTransaction} size="sm">
                <Plus className="h-4 w-4" />
                Add Transaction
              </Button>
            </div>
          }
        />
              
        {error && (
          <div className="surface-panel border-[color:var(--danger-soft)] bg-[color:var(--danger-soft)] p-4">
            <p className="text-sm font-medium text-[color:var(--danger)]">{error}</p>
          </div>
        )}

        <Card className="overflow-hidden">
          <CardContent className="space-y-5 p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle>Recurring Dataset</CardTitle>
                <CardDescription>
                  Filters, sorting, and inline actions all stay attached to one shared surface so the list reads like a workspace instead of stacked utility cards.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => setEditMode((current) => !current)}
                  size="sm"
                  variant={editMode ? 'primary' : 'outline'}
                >
                  <Pencil className="h-4 w-4" />
                  {editMode ? 'Done Editing' : 'Edit Transactions'}
                </Button>
              </div>
            </div>

            <TransactionsFilters
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              frequencyFilter={frequencyFilter}
              setFrequencyFilter={setFrequencyFilter}
              accountFilter={accountFilter}
              setAccountFilter={setAccountFilter}
              accountTypeFilter={accountTypeFilter}
              setAccountTypeFilter={setAccountTypeFilter}
              categoryFilter={categoryFilter}
              setCategoryFilter={setCategoryFilter}
              sourceFilter={sourceFilter}
              setSourceFilter={setSourceFilter}
              uniqueFrequencies={uniqueFrequencies}
              uniqueAccounts={uniqueAccounts}
              uniqueAccountTypes={uniqueAccountTypes}
              uniqueCategories={uniqueCategories}
              resetFilters={resetFilters}
            />

            <TransactionsTable
              transactions={filteredTransactions}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              onEdit={handleEditTransaction}
              onDelete={handleDeleteTransaction}
              onFilterClick={handleFilterClick}
              editMode={editMode}
            />
          </CardContent>
        </Card>

        {/* Form Modal */}
        <TransactionForm
          mode={formMode}
          initialData={getInitialFormData()}
          onSubmit={handleSubmitForm}
          onCancel={() => {
            setFormMode('view');
            setSelectedTransaction(null);
          }}
        />
      </div>
    </Layout>
  );
}
