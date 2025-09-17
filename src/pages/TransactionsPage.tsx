//src/pages/TransactionsPage.tsx

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Layout } from '../components/Layout/Layout';
import { Plus, Edit2, Trash2, Check, X, Copy, ImageIcon, RotateCcw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { CategorySelect } from '../components/ui/CategorySelect';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { TransactionIcon } from '../components/TransactionIcon';
import { updateTransactionIcon, resetTransactionIcon } from '../api/icons';
import { getBills, createBill, updateBill, deleteBill } from '../api/bills';
import { getCategories, Category } from '../api/categories';
import { Bill } from '../types';
import { format, parseISO } from 'date-fns';

type FormMode = 'create' | 'edit' | 'view';
type SortField = 'name' | 'category' | 'amount' | 'frequency' | 'start_date' | 'owner';
type SortDirection = 'asc' | 'desc';

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'one-time', label: 'One-time' },
];

// Removed hardcoded categories - now using dynamic categories from database

const OWNER_OPTIONS = [
  { value: 'Both', label: 'Both' },
  { value: 'Brady', label: 'Brady' },
  { value: 'Jenny', label: 'Jenny' },
];

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

// CurrencyInput component for dollar sign, commas, and decimals
function formatCurrencyInput(val: string, isIncome: boolean) {
  if (!val) return '';

  const sign = isIncome ? '' : '–';

  // If user typed a decimal or has decimals, preserve them up to two places
  if (val.includes('.')) {
    const parts = val.split('.');
    const rawInt = parts[0];
    let rawDec = parts[1] || '';

    // Limit decimal characters to two
    if (rawDec.length > 2) {
      rawDec = rawDec.slice(0, 2);
    }

    // Format integer part with commas
    const intNum = parseInt(rawInt, 10) || 0;
    const formattedInt = intNum.toLocaleString('en-US');

    // If user ends with a trailing dot, show that
    if (val.endsWith('.')) {
      return `${sign}$${formattedInt}.`;
    }

    // Show formatted integer and decimal (up to two digits)
    return `${sign}$${formattedInt}.${rawDec}`;
  }

  // No decimal typed: treat as whole number
  const numeric = parseFloat(val);
  if (isNaN(numeric)) {
    return isIncome ? '$0.00' : '–$0.00';
  }

  const formattedIntOnly = numeric.toLocaleString('en-US', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return `${sign}$${formattedIntOnly}`;
}

function CurrencyInput({
  value,
  setValue,
  isIncome,
  ...props
}: {
  value: string;
  setValue: (val: string) => void;
  isIncome: boolean;
} & React.ComponentProps<typeof Input>) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    let raw = e.target.value;

    // Remove all characters except digits and period
    raw = raw.replace(/[^\d.]/g, '');

    // Prevent more than one period
    const parts = raw.split('.');
    if (parts.length > 2) {
      raw = parts.slice(0, 2).join('.');
    }

    // Limit to two decimal places
    if (parts[1]?.length > 2) {
      raw = parts[0] + '.' + parts[1].slice(0, 2);
    }

    setValue(raw);
  }

  const displayValue = formatCurrencyInput(value, isIncome);

  return (
    <Input
      {...props}
      placeholder="$0.00"
      value={displayValue}
      onChange={handleChange}
      className={
        (props.className || '') +
        (isIncome
          ? ' text-green-600 dark:text-green-400'
          : ' text-red-600 dark:text-red-400')
      }
    />
  );
}

export function TransactionsPage() {
  const location = useLocation();
  const [bills, setBills] = useState<Bill[]>([]);
  const [filteredBills, setFilteredBills] = useState<Bill[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [mode, setMode] = useState<FormMode>('view');
  const [formData, setFormData] = useState<Omit<Bill, 'id'>>({
    name: '',
    category: 'other',
    amount: 0,
    frequency: 'monthly',
    repeats_every: 1,
    start_date: format(new Date(), 'yyyy-MM-dd'),
    owner: 'Both',
    note: undefined,
  });
  const [amountInput, setAmountInput] = useState(''); // raw string for CurrencyInput
  const [editingId, setEditingId] = useState<string | null>(null);
  const [transactionType, setTransactionType] = useState<'income' | 'expense'>('expense');
  const [iconEditingId, setIconEditingId] = useState<string | null>(null);
  const [customIconUrl, setCustomIconUrl] = useState('');
  const [scrollPosition, setScrollPosition] = useState(0);
  const [deletedItemId, setDeletedItemId] = useState<string | null>(null);

  useEffect(() => {
    fetchBills();
    fetchCategories();
  }, []);

  // Handle navbar Transactions click
  const handleNavbarTransactionsClick = () => {
    if (mode === 'edit' || mode === 'create') {
      resetForm();
    }
  };

  useEffect(() => {
    filterAndSortBills();
  }, [bills, searchTerm, categoryFilter, frequencyFilter, ownerFilter, sortField, sortDirection]);

  useEffect(() => {
    // If editing or creating a paycheck, force type to income and disable toggle
    if (formData.category === 'paycheck') {
      setTransactionType('income');
    }
  }, [formData.category]);

  const resetFilters = () => {
    setSearchTerm('');
    setCategoryFilter('');
    setFrequencyFilter('');
    setOwnerFilter('');
    setSortField('name');
    setSortDirection('asc');
  };

  const fetchBills = async (preserveScroll = false) => {
    try {
      setLoading(true);
      const data = await getBills();
      setBills(data);
    } catch (error) {
      console.error('Error fetching bills:', error);
    } finally {
      setLoading(false);
      if (preserveScroll && scrollPosition > 0) {
        setTimeout(() => {
          let newScrollPosition = scrollPosition;
          
          // Clear deleted item flag but don't change scroll behavior
          if (deletedItemId !== null) {
            setDeletedItemId(null);
          }
          
          window.scrollTo(0, newScrollPosition);
        }, 100);
      }
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
      // Fallback to hardcoded categories if API fails
      setCategories([
        { id: '1', name: 'auto', created_at: '', transaction_count: 0 },
        { id: '2', name: 'cloud storage', created_at: '', transaction_count: 0 },
        { id: '3', name: 'counseling', created_at: '', transaction_count: 0 },
        { id: '4', name: 'credit card', created_at: '', transaction_count: 0 },
        { id: '5', name: 'fitness', created_at: '', transaction_count: 0 },
        { id: '6', name: 'food & drinks', created_at: '', transaction_count: 0 },
        { id: '7', name: 'games', created_at: '', transaction_count: 0 },
        { id: '8', name: 'golf', created_at: '', transaction_count: 0 },
        { id: '9', name: 'health', created_at: '', transaction_count: 0 },
        { id: '10', name: 'house', created_at: '', transaction_count: 0 },
        { id: '11', name: 'insurance', created_at: '', transaction_count: 0 },
        { id: '12', name: 'job search', created_at: '', transaction_count: 0 },
        { id: '13', name: 'mobile phone', created_at: '', transaction_count: 0 },
        { id: '14', name: 'other', created_at: '', transaction_count: 0 },
        { id: '15', name: 'paycheck', created_at: '', transaction_count: 0 },
        { id: '16', name: 'subscription', created_at: '', transaction_count: 0 },
        { id: '17', name: 'transfer', created_at: '', transaction_count: 0 },
        { id: '18', name: 'travel', created_at: '', transaction_count: 0 },
        { id: '19', name: 'utilities', created_at: '', transaction_count: 0 },
      ]);
    }
  };

  const filterAndSortBills = () => {
    let filtered = [...bills];
    
    if (searchTerm) {
      filtered = filtered.filter(bill => 
        bill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bill.note?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        Math.abs(bill.amount).toString().includes(searchTerm) ||
        formatCurrency(bill.amount).includes(searchTerm)
      );
    }
    
    if (categoryFilter) {
      filtered = filtered.filter(bill => bill.category === categoryFilter);
    }
    
    if (frequencyFilter) {
      filtered = filtered.filter(bill => bill.frequency === frequencyFilter);
    }
    
    if (ownerFilter) {
      filtered = filtered.filter(bill => bill.owner === ownerFilter);
    }
    
    // Sort bills
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category);
          break;
        case 'amount':
          comparison = a.amount - b.amount;
          break;
        case 'frequency':
          comparison = a.frequency.localeCompare(b.frequency);
          break;
        case 'start_date':
          comparison = new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
          break;
        case 'owner':
          comparison = (a.owner || '').localeCompare(b.owner || '');
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    setFilteredBills(filtered);
  };

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleCreateBill = async () => {
    try {
      // Convert amountInput (string) to a numeric value
      let numericAmount = parseFloat(amountInput || '0');
      if (isNaN(numericAmount)) numericAmount = 0;

      if (transactionType === 'expense') {
        numericAmount = -Math.abs(numericAmount);
      } else {
        numericAmount = Math.abs(numericAmount);
      }

      const adjustedFormData = {
        ...formData,
        amount: numericAmount,
      };

      await createBill(adjustedFormData);
      await fetchBills(true);
      resetForm();
    } catch (error) {
      console.error('Error creating bill:', error);
    }
  };

  const handleUpdateBill = async () => {
    if (!editingId) return;
    try {
      let numericAmount = parseFloat(amountInput || '0');
      if (isNaN(numericAmount)) numericAmount = 0;

      if (transactionType === 'expense') {
        numericAmount = -Math.abs(numericAmount);
      } else {
        numericAmount = Math.abs(numericAmount);
      }

      const adjustedFormData = {
        ...formData,
        amount: numericAmount,
      };

      await updateBill(editingId, adjustedFormData);
      await fetchBills(true);
      resetForm();
    } catch (error) {
      console.error('Error updating bill:', error);
    }
  };

  const handleDuplicateBill = async () => {
    try {
      let numericAmount = parseFloat(amountInput || '0');
      if (isNaN(numericAmount)) numericAmount = 0;

      if (transactionType === 'expense') {
        numericAmount = -Math.abs(numericAmount);
      } else {
        numericAmount = Math.abs(numericAmount);
      }

      const duplicateData = {
        ...formData,
        name: `${formData.name} Copy`,
        amount: numericAmount,
        iconUrl: formData.iconUrl,
        iconType: formData.iconType,
      };

      await createBill(duplicateData);
      await fetchBills(true);
      resetForm();
    } catch (error) {
      console.error('Error duplicating bill:', error);
    }
  };

  const handleDeleteBill = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this bill?')) return;
    
    try {
      const currentScrollPosition = window.scrollY;
      await deleteBill(id);
      await fetchBills();
      // Restore scroll position immediately after fetch, like icon operations
      setTimeout(() => {
        window.scrollTo(0, currentScrollPosition);
      }, 100);
    } catch (error) {
      console.error('Error deleting bill:', error);
    }
  };

  const startEdit = (bill: Bill) => {
    setMode('edit');
    setEditingId(bill.id);
    setFormData({
      name: bill.name,
      category: bill.category,
      amount: Math.abs(bill.amount),
      frequency: bill.frequency,
      repeats_every: bill.repeats_every,
      start_date: bill.start_date,
      end_date: bill.end_date,
      owner: bill.owner || 'Both',
      note: bill.note,
      iconUrl: bill.iconUrl,
      iconType: bill.iconType,
    });
    setTransactionType(bill.amount >= 0 ? 'income' : 'expense');

    // Initialize amountInput from existing bill amount
    setAmountInput(Math.abs(bill.amount).toFixed(2));
  };

  const resetForm = () => {
    setMode('view');
    setEditingId(null);
    setFormData({
      name: '',
      category: 'other',
      amount: 0,
      frequency: 'monthly',
      repeats_every: 1,
      start_date: format(new Date(), 'yyyy-MM-dd'),
      owner: 'Both',
      note: undefined,
      iconUrl: undefined,
      iconType: undefined,
    });
    setAmountInput('');
    setTransactionType('expense');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const getSortIcon = (field: SortField) => {
    if (field !== sortField) return '↕️';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const handleCategoryClick = (category: string) => {
    setCategoryFilter(category);
  };

  const handleFrequencyClick = (frequency: string) => {
    setFrequencyFilter(frequency);
  };

  const handleOwnerClick = (owner: string) => {
    setOwnerFilter(owner);
  };

  const handleUpdateIcon = async (billId: string, iconUrl: string) => {
    try {
      // Basic URL validation
      if (!iconUrl.trim()) {
        alert('Please enter a valid icon URL');
        return;
      }
      
      // Check if URL looks like an image
      const isValidImageUrl = /\.(jpg|jpeg|png|gif|svg|webp|ico)(\?.*)?$/i.test(iconUrl) || 
                             iconUrl.includes('data:image/') ||
                             iconUrl.includes('githubusercontent.com') ||
                             iconUrl.includes('cdn.jsdelivr.net') ||
                             iconUrl.includes('wikimedia.org');
      
      if (!isValidImageUrl) {
        const proceed = confirm('This URL doesn\'t look like an image. Continue anyway?');
        if (!proceed) return;
      }
      
      await updateTransactionIcon(billId, iconUrl, 'custom');
      await fetchBills(true);
      setIconEditingId(null);
      setCustomIconUrl('');
    } catch (error) {
      console.error('Error updating icon:', error);
      alert('Failed to update icon. Please check the URL and try again.');
    }
  };

  const handleResetIcon = async (billId: string) => {
    try {
      await resetTransactionIcon(billId);
      await fetchBills(true);
    } catch (error) {
      console.error('Error resetting icon:', error);
    }
  };

  return (
    <Layout onTransactionsClick={handleNavbarTransactionsClick}>
      <div className="space-y-8 px-4 max-w-5xl mx-auto">
      {/* Page Description */}
      <div className="text-center space-y-2 py-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Transactions
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
          Manage all your recurring bills and income sources with add, edit, and delete functionality that automatically updates financial projections.
        </p>
      </div>
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Manage Transactions</h2>
        {mode === 'view' && (
          <Button
            onClick={() => setMode('create')}
            leftIcon={<Plus size={16} />}
          >
            Add Transaction
          </Button>
        )}
      </div>
      
      {/* Form */}
      {(mode === 'create' || mode === 'edit') && (
        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>{mode === 'create' ? 'Add New Transaction' : 'Edit Transaction'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              
              <CategorySelect
                label="Category"
                value={formData.category}
                onChange={(value) => setFormData({ ...formData, category: value })}
              />
              
              {/* Type toggle for Income/Expense */}
              <div className="flex flex-col">
                <label className="text-sm font-medium mb-1">Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`px-3 py-1 rounded border ${transactionType === 'income' ? 'bg-green-100 text-green-700 border-green-400' : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700'}`}
                    onClick={() => formData.category !== 'paycheck' && setTransactionType('income')}
                    disabled={formData.category === 'paycheck'}
                  >
                    Income
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1 rounded border ${transactionType === 'expense' ? 'bg-red-100 text-red-700 border-red-400' : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700'}`}
                    onClick={() => formData.category !== 'paycheck' && setTransactionType('expense')}
                    disabled={formData.category === 'paycheck'}
                  >
                    Expense
                  </button>
                </div>
              </div>
              
              {/* Amount field with dollar sign, sign, and color */}
              <CurrencyInput
                label="Amount"
                value={amountInput}
                setValue={setAmountInput}
                isIncome={transactionType === 'income'}
                helperText="Enter the amount. Type determines if it is positive or negative."
              />
              
              <Select
                label="Frequency"
                value={formData.frequency}
                options={FREQUENCY_OPTIONS}
                onChange={(e) => setFormData({ ...formData, frequency: e.target.value as Bill['frequency'] })}
              />
              
              {formData.frequency !== 'one-time' && (
                <Input
                  label="Repeats Every"
                  type="number"
                  min="1"
                  value={formData.repeats_every}
                  onChange={(e) => setFormData({ ...formData, repeats_every: parseInt(e.target.value, 10) || 1 })}
                  helperText={`e.g., "2" for every 2 ${formData.frequency}`}
                />
              )}
              
              <Input
                label="Start Date"
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="text-left"
              />
              
              {formData.frequency !== 'one-time' && (
                <Input
                  label="End Date"
                  type="date"
                  value={formData.end_date || ''}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value || undefined })}
                  helperText="Optional, leave blank for ongoing"
                  className="text-left"
                />
              )}
              
              <Select
                label="Owner"
                value={formData.owner || 'Both'}
                options={OWNER_OPTIONS}
                onChange={(e) => setFormData({ ...formData, owner: e.target.value as Bill['owner'] })}
              />
              
              <div className="md:col-span-2">
                <Input
                  label="Note"
                  value={formData.note || ''}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value || undefined })}
                  helperText="Optional details about this transaction"
                />
              </div>
              
              <div className="md:col-span-2">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    <TransactionIcon
                      transactionName={formData.name || 'Transaction'}
                      category={formData.category}
                      iconUrl={formData.iconUrl}
                      iconType={formData.iconType}
                      className="w-10 h-10"
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      label="Icon URL"
                      value={formData.iconUrl || ''}
                      onChange={(e) => setFormData({ ...formData, iconUrl: e.target.value || undefined, iconType: e.target.value ? 'custom' : undefined })}
                      helperText="Optional custom icon URL"
                      placeholder="https://example.com/icon.svg"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-2">
              <Button variant="outline" onClick={resetForm} leftIcon={<X size={16} />}>
                Cancel
              </Button>
              {mode === 'edit' && (
                <Button 
                  variant="outline"
                  onClick={handleDuplicateBill}
                  leftIcon={<Copy size={16} />}
                >
                  Duplicate
                </Button>
              )}
              <Button 
                onClick={mode === 'create' ? handleCreateBill : handleUpdateBill}
                leftIcon={<Check size={16} />}
              >
                {mode === 'create' ? 'Create' : 'Update'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Filters */}
      {mode === 'view' && (
        <div className="flex justify-center">
          <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-2">
            <Input
              className="w-full sm:w-80"
              placeholder="Search name, note, or amount..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Select
              className="w-full sm:w-40"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={[
                { value: '', label: 'All Categories' },
                ...categories.map(cat => ({
                  value: cat.name,
                  label: cat.name.charAt(0).toUpperCase() + cat.name.slice(1)
                }))
              ]}
            />
            <Select
              className="w-full sm:w-40"
              value={frequencyFilter}
              onChange={(e) => setFrequencyFilter(e.target.value)}
              options={[
                { value: '', label: 'All Frequencies' },
                ...FREQUENCY_OPTIONS
              ]}
            />
            <Select
              className="w-full sm:w-40"
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              options={[
                { value: '', label: 'All Owners' },
                ...OWNER_OPTIONS
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
      
      {/* Transactions Table */}
      {mode === 'view' && (
        <Card className="w-full">
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[80vh]">
              <table className="w-full min-w-[700px]">
                <thead className="sticky top-0 z-50 bg-gray-800 dark:bg-gray-800">
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th 
                      className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('name')}
                    >
                      Name {getSortIcon('name')}
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('category')}
                    >
                      Category {getSortIcon('category')}
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('amount')}
                    >
                      Amount {getSortIcon('amount')}
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('frequency')}
                    >
                      Frequency {getSortIcon('frequency')}
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('start_date')}
                    >
                      Start Date {getSortIcon('start_date')}
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">End Date</th>
                    <th 
                      className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleSort('owner')}
                    >
                      Owner {getSortIcon('owner')}
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                        Loading transactions...
                      </td>
                    </tr>
                  ) : filteredBills.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                        No transactions found. {bills.length > 0 ? 'Try adjusting your filters.' : 'Create your first transaction.'}
                      </td>
                    </tr>
                  ) : (
                    filteredBills.map((bill) => (
                      <tr 
                        key={bill.id}
                        className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                          <div className="flex items-center gap-3">
                                         <div 
               className="cursor-pointer"
               onClick={() => {
                 setScrollPosition(window.scrollY);
                 setIconEditingId(bill.id);
                 setCustomIconUrl(bill.iconUrl || '');
               }}
             >
               <TransactionIcon
                 transactionName={bill.name}
                 category={bill.category}
                 iconUrl={bill.iconUrl}
                 iconType={bill.iconType}
                 className="w-8 h-8 flex-shrink-0"
               />
             </div>
             {iconEditingId === bill.id && (
               <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                 <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-lg w-full max-w-md">
                   <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Edit Icon</h3>
                   <div className="space-y-3">
                     <Input
                       placeholder="Enter icon URL"
                       value={customIconUrl}
                       onChange={(e) => setCustomIconUrl(e.target.value)}
                       className="w-full"
                     />
                     <div className="flex gap-2 justify-end">
                       <Button
                         variant="outline"
                         onClick={() => {
                           setIconEditingId(null);
                           setCustomIconUrl('');
                           setTimeout(() => {
                             window.scrollTo(0, scrollPosition);
                           }, 100);
                         }}
                       >
                         Cancel
                       </Button>
                       {bill.iconUrl && (
                         <Button
                           variant="outline"
                           onClick={() => {
                             handleResetIcon(bill.id);
                             setIconEditingId(null);
                             setCustomIconUrl('');
                             setTimeout(() => {
                               window.scrollTo(0, scrollPosition);
                             }, 100);
                           }}
                         >
                           Reset
                         </Button>
                       )}
                       <Button
                         onClick={() => {
                           handleUpdateIcon(bill.id, customIconUrl);
                           setIconEditingId(null);
                           setCustomIconUrl('');
                           setTimeout(() => {
                             window.scrollTo(0, scrollPosition);
                           }, 100);
                         }}
                         disabled={!customIconUrl.trim()}
                       >
                         Save
                       </Button>
                     </div>
                   </div>
                 </div>
               </div>
             )}
                            <div>
                              <div 
                                className="font-medium cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                onClick={() => startEdit(bill)}
                              >
                                {bill.name}
                              </div>
                              {bill.note && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{bill.note}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          <span 
                            className="inline-block px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            onClick={() => handleCategoryClick(bill.category)}
                            title={`Filter by ${bill.category}`}
                          >
                            {bill.category}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-sm font-medium ${
                          bill.amount >= 0 
                            ? 'text-green-600 dark:text-green-400' 
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          {formatCurrency(bill.amount)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          <span 
                            className="cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 px-2 py-1 rounded transition-colors"
                            onClick={() => handleFrequencyClick(bill.frequency)}
                            title={`Filter by ${bill.frequency}`}
                          >
                            {bill.frequency === 'one-time'
                              ? 'One-time'
                              : bill.repeats_every === 1
                                ? `${capitalize(bill.frequency)}`
                                : `Every ${bill.repeats_every} ${pluralize(bill.frequency)}`
                            }
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {format(parseISO(bill.start_date), 'MMM d, yyyy')}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {bill.end_date 
                            ? format(parseISO(bill.end_date), 'MMM d, yyyy')
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          <span 
                            className="cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 px-2 py-1 rounded transition-colors"
                            onClick={() => handleOwnerClick(bill.owner || 'Both')}
                            title={`Filter by ${bill.owner || 'Both'}`}
                          >
                            {bill.owner || 'Both'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEdit(bill)}
                              aria-label="Edit"
                            >
                              <Edit2 size={16} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteBill(bill.id)}
                              aria-label="Delete"
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
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
      </div>
    </Layout>
  );
}