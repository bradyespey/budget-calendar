//src/components/ui/CategorySelect.tsx

import { useState, useEffect } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { Select } from './Select';
import { Input } from './Input';
import { Button } from './Button';
import { getCategories, createCategory, Category } from '../../api/categories';

interface CategorySelectProps {
  label?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  helperText?: string;
}

export function CategorySelect({ 
  label, 
  name,
  value, 
  onChange, 
  error, 
  helperText 
}: CategorySelectProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [addingError, setAddingError] = useState('');

  useEffect(() => {
    fetchCategories();
  }, []);

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

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      setAddingError('Category name cannot be empty');
      return;
    }

    // Check if category already exists
    const existingCategory = categories.find(cat => 
      cat.name.toLowerCase() === newCategoryName.toLowerCase()
    );
    if (existingCategory) {
      setAddingError('Category already exists');
      return;
    }

    setIsLoading(true);
    setAddingError('');

    try {
      const newCategory = await createCategory(newCategoryName.trim());
      setCategories([...categories, newCategory]);
      onChange(newCategory.name);
      setNewCategoryName('');
      setIsAddingNew(false);
    } catch (error: any) {
      setAddingError(error.message || 'Failed to create category');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelAdd = () => {
    setIsAddingNew(false);
    setNewCategoryName('');
    setAddingError('');
  };

  const categoryOptions = categories.map(cat => ({
    value: cat.name,
    label: cat.name.charAt(0).toUpperCase() + cat.name.slice(1)
  }));

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = e.target.value;
    if (selectedValue === '__ADD_NEW__') {
      setIsAddingNew(true);
      // Reset the select value to prevent the "__ADD_NEW__" from being selected
      setTimeout(() => {
        e.target.value = value || '';
      }, 0);
    } else {
      onChange(selectedValue);
    }
  };

  if (isAddingNew) {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {label}
          </label>
        )}
        <div className="space-y-2">
          <Input
            placeholder="Enter new category name"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            error={addingError}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCategory();
              } else if (e.key === 'Escape') {
                handleCancelAdd();
              }
            }}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleAddCategory}
              disabled={isLoading}
              leftIcon={<Check size={14} />}
            >
              {isLoading ? 'Adding...' : 'Add'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancelAdd}
              leftIcon={<X size={14} />}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Select
      name={name}
      label={label}
      value={value}
      onChange={handleSelectChange}
      error={error}
      helperText={helperText}
      options={[
        { value: '', label: 'Select a category...' },
        ...categoryOptions,
        { value: '__ADD_NEW__', label: '+ Add New Category' }
      ]}
    />
  );
}