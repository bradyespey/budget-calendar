//src/pages/TransactionsPage.tsx

import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Check, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { getBills, createBill, updateBill, deleteBill } from '../api/bills';
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

const CATEGORY_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'cloud storage', label: 'Cloud Storage' },
  { value: 'counseling', label: 'Counseling' },
  { value: 'credit card', label: 'Credit Card' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'food & drinks', label: 'Food & Drinks' },
  { value: 'games', label: 'Games' },
  { value: 'golf', label: 'Golf' },
  { value: 'health', label: 'Health' },
  { value: 'house', label: 'House' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'job search', label: 'Job Search' },
  { value: 'mobile phone', label: 'Mobile Phone' },
  { value: 'other', label: 'Other' },
  { value: 'paycheck', label: 'Paycheck' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'travel', label: 'Travel' },
  { value: 'utilities', label: 'Utilities' },
];

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

// CurrencyInput component for dollar sign and formatting, with sign and color
function formatCurrencyInput(val: string, isIncome: boolean) {
  if (!val) return '';
  const digits = val.replace(/[^\d]/g, '');
  if (!digits) return '';
  const sign = isIncome ? '+' : '–';
  return sign + '$' + Number(digits).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function CurrencyInput({ value, setValue, isIncome, ...props }: { value: string, setValue: (val: string) => void, isIncome: boolean } & React.ComponentProps<typeof Input>) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^\d]/g, '');
    setValue(raw);
  }
  const displayValue = formatCurrencyInput(value, isIncome);
  return (
    <Input
      {...props}
      value={displayValue}
      onChange={handleChange}
      className={
        (props.className || '') +
        (isIncome ? ' text-green-600 dark:text-green-400' : ' text-red-600 dark:text-red-400')
      }
    />
  );
}

export function TransactionsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [filteredBills, setFilteredBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
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
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [transactionType, setTransactionType] = useState<'income' | 'expense'>('expense');

  useEffect(() => {
    fetchBills();
  }, []);

  useEffect(() => {
    filterAndSortBills();
  }, [bills, searchTerm, categoryFilter, ownerFilter, sortField, sortDirection]);

  useEffect(() => {
    // If editing or creating a paycheck, force type to income and disable toggle
    if (formData.category === 'paycheck') {
      setTransactionType('income');
    }
  }, [formData.category]);

  const resetFilters = () => {
    setSearchTerm('');
    setCategoryFilter('');
    setOwnerFilter('');
    setSortField('name');
    setSortDirection('asc');
  };

  const fetchBills = async () => {
    try {
      setLoading(true);
      const data = await getBills();
      setBills(data);
    } catch (error) {
      console.error('Error fetching bills:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortBills = () => {
    let filtered = [...bills];
    
    if (searchTerm) {
      filtered = filtered.filter(bill => 
        bill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bill.note?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (categoryFilter) {
      filtered = filtered.filter(bill => bill.category === categoryFilter);
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
      // Ensure amount is negative for expenses, positive for income
      const adjustedFormData = { ...formData };
      if (transactionType === 'expense') {
        adjustedFormData.amount = -Math.abs(formData.amount);
      } else {
        adjustedFormData.amount = Math.abs(formData.amount);
      }
      await createBill(adjustedFormData);
      await fetchBills();
      resetForm();
    } catch (error) {
      console.error('Error creating bill:', error);
    }
  };

  const handleUpdateBill = async () => {
    if (!editingId) return;
    try {
      // Ensure amount is negative for expenses, positive for income
      const adjustedFormData = { ...formData };
      if (transactionType === 'expense') {
        adjustedFormData.amount = -Math.abs(formData.amount);
      } else {
        adjustedFormData.amount = Math.abs(formData.amount);
      }
      await updateBill(editingId, adjustedFormData);
      await fetchBills();
      resetForm();
    } catch (error) {
      console.error('Error updating bill:', error);
    }
  };

  const handleDeleteBill = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this bill?')) return;
    
    try {
      await deleteBill(id);
      await fetchBills();
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
      amount: Math.abs(bill.amount), // Always display positive in form
      frequency: bill.frequency,
      repeats_every: bill.repeats_every,
      start_date: bill.start_date,
      end_date: bill.end_date,
      owner: bill.owner || 'Both',
      note: bill.note,
    });
    setTransactionType(bill.amount >= 0 ? 'income' : 'expense');
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

  const getSortIcon = (field: SortField) => {
    if (field !== sortField) return '↕️';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="space-y-8 px-4 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Transactions</h1>
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
              
              <Select
                label="Category"
                value={formData.category}
                options={CATEGORY_OPTIONS}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
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
                value={formData.amount === 0 ? '' : Math.abs(formData.amount).toString()}
                setValue={val => setFormData({ ...formData, amount: val === '' ? 0 : Number(val) })}
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
              />
              
              {formData.frequency !== 'one-time' && (
                <Input
                  label="End Date"
                  type="date"
                  value={formData.end_date || ''}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value || undefined })}
                  helperText="Optional, leave blank for ongoing"
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
            </div>
            
            <div className="mt-6 flex justify-end space-x-2">
              <Button variant="outline" onClick={resetForm} leftIcon={<X size={16} />}>
                Cancel
              </Button>
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
        <div className="flex flex-col sm:flex-row justify-center items-center gap-3">
          <div className="flex items-center gap-3">
            <Input
              className="w-48"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Select
              className="w-40"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={[
                { value: '', label: 'All Categories' },
                ...CATEGORY_OPTIONS
              ]}
            />
            <Select
              className="w-40"
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
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
                          {bill.name}
                          {bill.note && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{bill.note}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          <span className="inline-block px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700">
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
                          {bill.frequency === 'one-time'
                            ? 'One-time'
                            : bill.repeats_every === 1
                              ? `${capitalize(bill.frequency)}`
                              : `Every ${bill.repeats_every} ${pluralize(bill.frequency)}`
                          }
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
                          {bill.owner || 'Both'}
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
  );
}