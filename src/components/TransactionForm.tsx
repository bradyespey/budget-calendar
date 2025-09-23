//src/components/TransactionForm.tsx

import { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { CategorySelect } from './ui/CategorySelect';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { FREQUENCY_OPTIONS } from '../utils/transactionUtils';

export type FormMode = 'create' | 'edit' | 'view';

interface TransactionFormProps {
  mode: FormMode;
  initialData?: {
    name: string;
    category: string;
    amount: number;
    frequency: string;
    repeats_every: number | string;
    start_date: string;
    notes: string;
  };
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
}

export function TransactionForm({ mode, initialData, onSubmit, onCancel }: TransactionFormProps) {
  // Get current date in CST timezone
  const getCSTDate = () => {
    const now = new Date();
    // Use Intl.DateTimeFormat to get the date in America/Chicago timezone
    const cstDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);
    return cstDate; // Returns YYYY-MM-DD format
  };

  const [formData, setFormData] = useState(initialData || {
    name: '',
    category: '',
    amount: 0,
    frequency: 'monthly',
    repeats_every: 1,
    start_date: getCSTDate(),
    notes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transactionType, setTransactionType] = useState<'debit' | 'credit'>(
    initialData && initialData.amount >= 0 ? 'credit' : 'debit'
  );

  // Update form data when initialData changes (for editing)
  useEffect(() => {
    if (initialData && mode === 'edit') {
      setFormData(initialData);
      setTransactionType(initialData.amount >= 0 ? 'credit' : 'debit');
    }
  }, [initialData, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.name.trim()) {
      const merchantInput = e.currentTarget.querySelector('input[name="merchant"]') as HTMLInputElement;
      if (merchantInput) {
        merchantInput.setCustomValidity('Merchant name is required');
        merchantInput.reportValidity();
      }
      return;
    }
    if (!formData.category.trim()) {
      const categorySelect = e.currentTarget.querySelector('select[name="category"]') as HTMLSelectElement;
      if (categorySelect) {
        categorySelect.setCustomValidity('Category is required');
        categorySelect.reportValidity();
      }
      return;
    }
    if (!formData.amount || formData.amount <= 0) {
      const amountInput = e.currentTarget.querySelector('input[name="amount"]') as HTMLInputElement;
      if (amountInput) {
        amountInput.setCustomValidity('Amount must be greater than 0');
        amountInput.reportValidity();
      }
      return;
    }
    if (!formData.start_date) {
      const dateInput = e.currentTarget.querySelector('input[name="date"]') as HTMLInputElement;
      if (dateInput) {
        dateInput.setCustomValidity('Date is required');
        dateInput.reportValidity();
      }
      return;
    }
    if (!formData.frequency) {
      const frequencySelect = e.currentTarget.querySelector('select[name="frequency"]') as HTMLSelectElement;
      if (frequencySelect) {
        frequencySelect.setCustomValidity('Frequency is required');
        frequencySelect.reportValidity();
      }
      return;
    }
    if (formData.frequency !== 'one-time' && (!formData.repeats_every || formData.repeats_every === '' || formData.repeats_every <= 0)) {
      const repeatsInput = e.currentTarget.querySelector('input[name="repeats_every"]') as HTMLInputElement;
      if (repeatsInput) {
        repeatsInput.setCustomValidity('Repeats Every must be greater than 0');
        repeatsInput.reportValidity();
      }
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const finalAmount = transactionType === 'debit' ? -Math.abs(formData.amount) : Math.abs(formData.amount);
      const submitData = {
        ...formData,
        amount: finalAmount,
        repeats_every: typeof formData.repeats_every === 'string' ? parseInt(formData.repeats_every) || 1 : formData.repeats_every
      };
      await onSubmit(submitData);
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (mode === 'view') return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {mode === 'create' ? 'Add transaction' : 'Edit transaction'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Debit/Credit Toggle */}
            <div className="flex gap-2">
              <button
                type="button"
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md border-2 transition-colors ${
                  transactionType === 'debit' 
                    ? 'bg-red-600 text-white border-red-500 shadow-lg' 
                    : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                }`}
                onClick={() => setTransactionType('debit')}
              >
                ⊖ DEBIT
              </button>
              <button
                type="button"
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md border-2 transition-colors ${
                  transactionType === 'credit' 
                    ? 'bg-green-600 text-white border-green-500 shadow-lg' 
                    : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                }`}
                onClick={() => setTransactionType('credit')}
              >
                ⊕ CREDIT
              </button>
            </div>
            
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Amount
              </label>
              <div className="relative">
                <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400 pointer-events-none">
                  {transactionType === 'debit' ? '-$' : '$'}
                </span>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={Math.abs(formData.amount) || ''}
                  onChange={(e) => {
                    const numValue = parseFloat(e.target.value) || 0;
                    setFormData(prev => ({ ...prev, amount: numValue }));
                  }}
                  required
                  placeholder="0.00"
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white py-2 pl-6 pr-3 shadow-sm transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <Input
              name="merchant"
              label="Merchant"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
              placeholder="Add name..."
            />
            
            <Input
              name="date"
              label="Date"
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
              required
            />
            
            <CategorySelect
              name="category"
              label="Category"
              value={formData.category}
              onChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
              required
            />
            
            <Select
              name="frequency"
              label="Frequency"
              value={formData.frequency}
              onChange={(e) => setFormData(prev => ({ ...prev, frequency: e.target.value }))}
              options={FREQUENCY_OPTIONS}
              required
            />
            
            {formData.frequency !== 'one-time' && (
              <Input
                name="repeats_every"
                label="Repeats Every"
                type="number"
                min="1"
                value={formData.repeats_every}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    setFormData(prev => ({ ...prev, repeats_every: '' }));
                  } else {
                    const numValue = parseInt(value);
                    if (!isNaN(numValue) && numValue > 0) {
                      setFormData(prev => ({ ...prev, repeats_every: numValue }));
                    }
                  }
                }}
                required
              />
            )}
            
            <Input
              label="Notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Add a note..."
            />
            
            <div className="flex gap-2 pt-4">
              <Button 
                type="button"
                variant="outline"
                onClick={onCancel}
                className="flex-1"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isSubmitting}>
                {mode === 'create' ? 'Add transaction' : 'Update transaction'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}


