//src/components/TransactionsTable.tsx

import { Edit2, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { TransactionIcon } from './TransactionIcon';
import { CombinedTransaction } from '../hooks/useTransactions';
import { SortField, SortDirection } from '../hooks/useTransactionFilters';
import { formatCurrency, capitalize, shortenAccountName } from '../utils/transactionUtils';

interface TransactionsTableProps {
  transactions: CombinedTransaction[];
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  onEdit: (transaction: CombinedTransaction) => void;
  onDelete: (transaction: CombinedTransaction) => void;
  onFilterClick: (type: 'frequency' | 'account' | 'accountType' | 'category' | 'source', value: string) => void;
  editMode?: boolean;
}

function SortIndicator({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  if (!active) return <ArrowUpDown className="table-sort-icon h-3 w-3" />;
  return direction === 'asc'
    ? <ArrowUp className="table-sort-icon h-3 w-3" />
    : <ArrowDown className="table-sort-icon h-3 w-3" />;
}

function SortHeader({
  label,
  field,
  sortField,
  sortDirection,
  onSort,
  align = 'left',
}: {
  label: string;
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  align?: 'left' | 'right';
}) {
  const active = sortField === field;
  return (
    <button
      type="button"
      className={`table-sort-button ${align === 'right' ? 'ml-auto' : ''}`}
      data-active={active}
      onClick={() => onSort(field)}
    >
      {label}
      <SortIndicator active={active} direction={sortDirection} />
    </button>
  );
}

export function TransactionsTable({
  transactions,
  sortField,
  sortDirection,
  onSort,
  onEdit,
  onDelete,
  onFilterClick,
  editMode = false,
}: TransactionsTableProps) {
  return (
    <div className="table-shell overflow-hidden">
      <div className="max-h-[72vh] overflow-x-auto overflow-y-auto">
        <table className="table-surface min-w-[980px]">
          <thead className="sticky top-0 z-10 backdrop-blur-xl">
              <tr className="border-b surface-divider">
                <th 
                  className="px-4 py-3 text-left"
                >
                  <SortHeader label="Name" field="name" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
                </th>
                <th 
                  className="px-4 py-3 text-left"
                >
                  <SortHeader label="Date" field="dueDate" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                  End Date
                </th>
                <th 
                  className="px-4 py-3 text-left"
                >
                  <SortHeader label="Frequency" field="frequency" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
                </th>
                <th 
                  className="px-4 py-3 text-left"
                >
                  <SortHeader label="Account" field="account" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
                </th>
                <th 
                  className="px-4 py-3 text-left"
                >
                  <SortHeader label="Account Type" field="accountType" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
                </th>
                <th 
                  className="px-4 py-3 text-left"
                >
                  <SortHeader label="Category" field="category" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
                </th>
                <th 
                  className="px-4 py-3 text-left"
                >
                  <SortHeader label="Amount" field="amount" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
                </th>
                <th 
                  className="px-4 py-3 text-left"
                >
                  <SortHeader label="Source" field="source" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
                </th>
                <th className="px-4 py-3 text-left">
                  <SortHeader label="Notes" field="notes" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
                </th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr
                  key={transaction.id}
                  className="border-b transition hover:bg-[color:var(--surface-hover)] surface-divider"
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                      <TransactionIcon
                        transactionName={transaction.name}
                        category={transaction.category}
                        iconUrl={transaction.source === 'manual' ? transaction.iconUrl : transaction.merchantLogoUrl}
                        iconType={transaction.source === 'manual' ? transaction.iconType : 'brand'}
                        className="w-8 h-8"
                      />
                        <span className="truncate font-medium text-[color:var(--text)]">{transaction.name}</span>
                      </div>
                      {editMode && transaction.isEditable ? (
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onEdit(transaction)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--line-strong)] bg-[color:var(--surface)] text-[color:var(--muted)] transition hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]"
                            title="Edit transaction"
                            aria-label={`Edit ${transaction.name}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(transaction)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--danger-soft)] bg-[color:var(--danger-soft)] text-[color:var(--danger)] transition hover:bg-[color:var(--danger)] hover:text-white"
                            title="Delete transaction"
                            aria-label={`Delete ${transaction.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-sm text-[color:var(--text)]">
                    {transaction.dueDate ? format(parseISO(transaction.dueDate), 'MMM d') : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-sm text-[color:var(--muted)]">
                    {transaction.end_date ? format(parseISO(transaction.end_date), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-4">
                    <span 
                      className="pill-chip inline-flex cursor-pointer px-3 py-1.5 text-xs font-semibold transition"
                      onClick={() => onFilterClick('frequency', transaction.frequency)}
                      title={`Filter by ${transaction.frequency}`}
                    >
                      {transaction.frequency}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span 
                      className="cursor-pointer text-sm font-medium text-[color:var(--text)] transition hover:text-[color:var(--accent)]"
                      onClick={() => onFilterClick('account', transaction.account)}
                      title={`Filter by ${transaction.account}`}
                    >
                      {shortenAccountName(transaction.account)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-[color:var(--muted)]">
                    <span 
                      className="cursor-pointer transition hover:text-[color:var(--text)]"
                      onClick={() => onFilterClick('accountType', transaction.accountType || '')}
                      title={`Filter by ${transaction.accountType || 'Unknown'}`}
                    >
                      {transaction.accountType || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-[color:var(--muted)]">
                    <span 
                      className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 transition hover:bg-[color:var(--surface-muted)]"
                      onClick={() => onFilterClick('category', transaction.category)}
                      title={`Filter by ${transaction.category}`}
                    >
                      {transaction.categoryIcon && (
                        <span className="text-sm">{transaction.categoryIcon}</span>
                      )}
                      {capitalize(transaction.category)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={transaction.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                      {formatCurrency(Math.abs(transaction.amount))}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span 
                      className={`inline-flex cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity ${
                        transaction.source === 'manual' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                      }`}
                      onClick={() => onFilterClick('source', transaction.source)}
                      title={`Filter by ${transaction.source === 'manual' ? 'Manual' : 'Monarch'}`}
                    >
                      {transaction.source === 'manual' ? 'Manual' : 'Monarch'}
                    </span>
                  </td>
                  <td className="max-w-xs px-4 py-4 text-sm text-[color:var(--muted)]">
                    <div className="truncate" title={transaction.notes || ''}>
                      {transaction.notes || '—'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>
      
      {transactions.length === 0 && (
        <div className="px-6 py-12 text-center text-sm text-[color:var(--muted)]">
          No transactions match the current filters.
        </div>
      )}
    </div>
  );
}
