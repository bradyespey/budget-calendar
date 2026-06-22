//src/components/CategoryManagement.tsx

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Edit2, Trash2, Check, X, Plus } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { SectionInfoHeading } from './ui/SectionInfoHeading';
import { 
  getCategories, 
  createCategory, 
  updateCategory, 
  deleteCategory,
  Category 
} from '../api/categories';

interface CategoryManagementProps {
  showNotification: (message: string, type: 'success' | 'error') => void;
  sidePanel?: ReactNode;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function CategoryManagement({ showNotification, sidePanel }: CategoryManagementProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollToTop = () => {
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  };

  const fetchCategories = async () => {
    try {
      setLoading(true);

      const data = await getCategories();

      setCategories(data);
    } catch (error) {
      console.error('CategoryManagement: Error fetching categories:', error);

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
      showNotification('Failed to load categories, using defaults', 'error');
      scrollToTop();
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (category: Category) => {
    setEditingId(category.id);
    setEditingName(category.name);
    setError('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
    setError('');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editingName.trim()) {
      setError('Category name cannot be empty');
      return;
    }

    try {
      await updateCategory(editingId, editingName);
      await fetchCategories();
      setEditingId(null);
      setEditingName('');
      setError('');
      showNotification('Category updated successfully', 'success');
      scrollToTop();
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Failed to update category'));
    }
  };

  const handleDelete = async (category: Category) => {

    if (!window.confirm(`Are you sure you want to delete the category "${category.name}"? This action cannot be undone.`)) {
      return;
    }

    try {

      await deleteCategory(category.id);
      await fetchCategories();
      showNotification('Category deleted successfully', 'success');
      scrollToTop();
    } catch (error: unknown) {
      console.error('CategoryManagement: Delete failed with error:', error);
      showNotification(getErrorMessage(error, 'Failed to delete category'), 'error');
      scrollToTop();
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      setError('Category name cannot be empty');
      return;
    }

    try {
      await createCategory(newCategoryName);
      await fetchCategories();
      setIsAdding(false);
      setNewCategoryName('');
      setError('');
      showNotification('Category added successfully', 'success');
      scrollToTop();
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Failed to add category'));
    }
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setNewCategoryName('');
    setError('');
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Category Management - Manual Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={sidePanel ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]' : 'col-span-2'}>
      <Card>
        <CardHeader className="py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <SectionInfoHeading
                title="Manual Transaction Categories"
                items={[
                  'Manual-only categories are used for transactions created in Budget Calendar.',
                  'Recurring categories still sync from Monarch.',
                  'Categories can only be deleted when no transactions are using them.',
                ]}
              />
              <p className="mt-1 text-sm text-[color:var(--muted)]">
                Manual-only categories. Recurring categories still come from Monarch.
              </p>
            </div>
            {!isAdding && (
              <Button
                onClick={() => setIsAdding(true)}
                leftIcon={<Plus size={16} />}
                variant="outline"
                size="md"
                className="min-w-[116px] justify-center"
              >
                Add
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          {/* Add new category form */}
          {isAdding && (
            <div className="mb-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
              <h4 className="text-sm font-medium mb-3 text-gray-900 dark:text-gray-100">Add New Category</h4>
              <div className="flex gap-3 max-w-md">
                <Input
                  placeholder="Category name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  error={error}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCategory();
                    } else if (e.key === 'Escape') {
                      handleCancelAdd();
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  onClick={handleAddCategory}
                  leftIcon={<Check size={16} />}
                  size="sm"
                  variant="outline"
                  className="min-w-[92px] justify-center"
                >
                  Add
                </Button>
                <Button
                  onClick={handleCancelAdd}
                  variant="outline"
                  leftIcon={<X size={16} />}
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Categories table */}
          <div>
            {categories.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">
                  No categories found. Add one to get started.
                </p>
              </div>
            ) : (
            <div className="table-shell max-h-[430px] overflow-y-auto">
              {/* Table Header */}
              <div className="sticky top-0 z-10 hidden border-b surface-divider bg-[color:var(--surface-muted)] backdrop-blur-xl sm:block">
                <div className="grid grid-cols-12 gap-4 px-4 py-3">
                  <div className="col-span-5 text-left text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                    Category Name
                  </div>
                  <div className="col-span-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                    Usage
                  </div>
                  <div className="col-span-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                    Actions
                  </div>
                </div>
              </div>

              {/* Table Body */}
              <div className="divide-y surface-divider">
                {categories.map((category) => (
                  <div
                    key={category.id}
                    className="transition-colors duration-150 hover:bg-[color:var(--surface-hover)]"
                  >
                    {editingId === category.id ? (
                      // Edit mode
                      <div className="space-y-3 px-4 py-3 sm:grid sm:grid-cols-12 sm:gap-4 sm:space-y-0 sm:px-6">
                        <div className="sm:col-span-7 flex items-center">
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            error={error}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveEdit();
                              } else if (e.key === 'Escape') {
                                handleCancelEdit();
                              }
                            }}
                            className="w-full sm:max-w-xs"
                          />
                        </div>
                        <div className="sm:col-span-5 flex flex-wrap items-center justify-start gap-2 sm:justify-end">
                          <Button
                            onClick={handleSaveEdit}
                            leftIcon={<Check size={14} />}
                            size="sm"
                            className="min-w-[92px] justify-center"
                          >
                            Save
                          </Button>
                          <Button
                            onClick={handleCancelEdit}
                            variant="outline"
                            leftIcon={<X size={14} />}
                            size="sm"
                            className="min-w-[92px] justify-center"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // View mode
                      <div className="space-y-3 px-4 py-3 sm:grid sm:grid-cols-12 sm:gap-4 sm:space-y-0">
                        <div className="sm:col-span-5 flex items-center">
                          <span className="text-sm font-semibold capitalize text-[color:var(--text)]">
                            {category.name}
                          </span>
                        </div>
                        <div className="sm:col-span-3 flex items-center">
                          {typeof category.transaction_count === 'number' && (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                              category.transaction_count === 0 
                                ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                : 'bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
                            }`}>
                              {category.transaction_count === 0 
                                ? 'Unused' 
                                : `${category.transaction_count} transaction${category.transaction_count === 1 ? '' : 's'}`
                              }
                            </span>
                          )}
                        </div>
                        <div className="sm:col-span-4 flex flex-wrap items-center justify-start gap-2 sm:justify-end">
                          <Button
                            onClick={() => handleStartEdit(category)}
                            variant="outline"
                            size="sm"
                            leftIcon={<Edit2 size={14} />}
                            className="min-w-[82px] justify-center"
                          >
                            Edit
                          </Button>
                          <Button
                            onClick={() => handleDelete(category)}
                            variant="outline"
                            size="sm"
                            leftIcon={<Trash2 size={14} />}
                            className={`${
                              category.transaction_count === 0
                                ? 'text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900 border-red-200 dark:border-red-800'
                                : 'text-gray-400 cursor-not-allowed opacity-50'
                            } min-w-[82px] justify-center`}
                            disabled={category.transaction_count !== 0}
                            title={category.transaction_count !== 0 ? `Cannot delete: ${category.transaction_count} transaction(s) using this category` : 'Delete category'}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Table Footer */}
              <div className="border-t surface-divider bg-[color:var(--surface-muted)] px-4 py-3">
                <div className="text-sm text-[color:var(--muted)]">
                  {categories.length} categor{categories.length === 1 ? 'y' : 'ies'} total
                </div>
              </div>
            </div>
            )}
          </div>
        </CardContent>
      </Card>
      {sidePanel ? <div className="min-w-0">{sidePanel}</div> : null}
    </div>
  );
}
