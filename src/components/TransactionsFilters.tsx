//src/components/TransactionsFilters.tsx

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
  return (
    <div className="flex justify-center">
      <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-2">
        <Input
          className="w-full sm:w-80"
          placeholder="Search transactions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Select
          className="w-full sm:w-40"
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
          className="w-full sm:w-40"
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
          className="w-full sm:w-40"
          value={accountTypeFilter}
          onChange={(e) => setAccountTypeFilter(e.target.value)}
          options={[
            { value: '', label: 'All Account Types' },
            ...(uniqueAccountTypes?.map(accountType => ({
              value: accountType,
              label: capitalize(accountType)
            })) || [])
          ]}
        />
        <Select
          className="w-full sm:w-40"
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
          className="w-full sm:w-40"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          options={[
            { value: '', label: 'All Sources' },
            { value: 'manual', label: 'Manual' },
            { value: 'monarch', label: 'Monarch' }
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
  );
}


