//src/components/TransactionForm.tsx

import { useState } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { CategorySelect } from './ui/CategorySelect';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Category } from '../api/categories';
import { FREQUENCY_OPTIONS, OWNER_OPTIONS } from '../utils/transactionUtils';

export type FormMode = 'create' | 'edit' | 'view';

interface TransactionFormProps {
  mode: FormMode;
  categories: Category[];
  initialData?: {
    name: string;
    category: string;
    amount: number;
    frequency: string;
    repeats_every: number;
    start_date: string;
    note: string;
    owner: 'Both' | 'Brady' | 'Jenny';
  };
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
}

export function TransactionForm({ mode, categories, initialData, onSubmit, onCancel }: TransactionFormProps) {
  const [formData, setFormData] = useState(initialData || {
    name: '',
    category: '',
    amount: 0,
    frequency: 'monthly',
    repeats_every: 1,
    start_date: new Date().toISOString().split('T')[0],
    note: '',
    owner: 'Both' as 'Both' | 'Brady' | 'Jenny',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      await onSubmit(formData);
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
            {mode === 'create' ? 'Add Transaction' : 'Edit Transaction'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            
            <CategorySelect
              value={formData.category}
              onChange={(value) => setFormData({ ...formData, category: value })}
              categories={categories || []}
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
              options={FREQUENCY_OPTIONS}
              required
            />
            
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
              options={OWNER_OPTIONS}
              required
            />
            
            <Input
              label="Note"
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
            />
            
            <div className="flex gap-2 pt-4">
              <Button type="submit" className="flex-1" disabled={isSubmitting}>
                {mode === 'create' ? 'Create' : 'Update'}
              </Button>
              <Button 
                type="button"
                variant="outline"
                onClick={onCancel}
                className="flex-1"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}


