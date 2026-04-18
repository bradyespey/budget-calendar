//src/components/TransactionsFilters.tsx

import { Search, X } from 'lucide-react';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Button } from './ui/Button';
import { capitalize } from '../utils/transactionUtils';

interface TransactionsFiltersProps {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  frequencyFilter: string;
  setFrequencyFilter: (value: string) => void;
  accountFilter: string;
  setAccountFilter: (value: string) => void;
  accountTypeFilter: string;
  setAccountTypeFilter: (value: string) => void;
  categoryFilter: string;
  setCategoryFilter: (value: string) => void;
  sourceFilter: string;
  setSourceFilter: (value: string) => void;
  uniqueFrequencies: string[];
  uniqueAccounts: string[];
  uniqueAccountTypes: string[];
  uniqueCategories: string[];
  resetFilters: () => void;
}

export function TransactionsFilters({
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
  uniqueFrequencies,
  uniqueAccounts,
  uniqueAccountTypes,
  uniqueCategories,
  resetFilters
}: TransactionsFiltersProps) {
  const activeFilters = [
    searchTerm && `Search: ${searchTerm}`,
    frequencyFilter && `Frequency: ${frequencyFilter}`,
    accountFilter && `Account: ${accountFilter}`,
    accountTypeFilter && `Type: ${accountTypeFilter}`,
    categoryFilter && `Category: ${categoryFilter}`,
    sourceFilter && `Source: ${sourceFilter}`,
  ].filter(Boolean) as string[]

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.68fr)_minmax(0,0.68fr)_minmax(0,0.58fr)_minmax(0,0.72fr)_minmax(0,0.5fr)]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" />
          <Input
            className="pl-11 pr-11"
            placeholder="Search merchant, category, or notes"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search transactions"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[color:var(--muted)] transition hover:text-[color:var(--text)]"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select
          value={frequencyFilter}
          onChange={(e) => setFrequencyFilter(e.target.value)}
          options={[
            { value: '', label: 'All Frequencies' },
            ...(uniqueFrequencies?.map(frequency => ({
              value: frequency,
              label: frequency
            })) || [])
          ]}
        />
        <Select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          options={[
            { value: '', label: 'All Accounts' },
            ...(uniqueAccounts?.map(account => ({
              value: account,
              label: account
            })) || [])
          ]}
        />
        <Select
          value={accountTypeFilter}
          onChange={(e) => setAccountTypeFilter(e.target.value)}
          options={[
            { value: '', label: 'All Types' },
            ...(uniqueAccountTypes?.map(accountType => ({
              value: accountType,
              label: capitalize(accountType)
            })) || [])
          ]}
        />
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          options={[
            { value: '', label: 'All Categories' },
            ...(uniqueCategories?.map(category => ({
              value: category,
              label: capitalize(category)
            })) || [])
          ]}
        />
        <Select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          options={[
            { value: '', label: 'All Sources' },
            { value: 'manual', label: 'Manual' },
            { value: 'monarch', label: 'Monarch' }
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {activeFilters.map((filter) => (
          <span key={filter} className="pill-chip px-3 py-1.5 text-xs font-semibold">
            {filter}
          </span>
        ))}
        {activeFilters.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={resetFilters}
            className="ml-auto"
          >
            Reset filters
          </Button>
        )}
      </div>
    </div>
  );
}
