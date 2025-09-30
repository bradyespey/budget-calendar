//src/components/TransactionsTable.tsx

import { Edit2, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from './ui/Button';
import { Card, CardContent } from './ui/Card';
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
  onFilterClick: (type: 'frequency' | 'account' | 'category' | 'source', value: string) => void;
}

export function TransactionsTable({
  transactions,
  sortField,
  sortDirection,
  onSort,
  onEdit,
  onDelete,
  onFilterClick
}: TransactionsTableProps) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-[80vh]">
          <table className="w-full min-w-[900px]">
            <thead className="sticky top-0 z-50">
              <tr className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th 
                  className="text-left px-4 py-3 font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                  onClick={() => onSort('name')}
                >
                  Name {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="text-left px-4 py-3 font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                  onClick={() => onSort('dueDate')}
                >
                  Date {sortField === 'dueDate' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="text-left px-4 py-3 font-medium">
                  End Date
                </th>
                <th 
                  className="text-left px-4 py-3 font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                  onClick={() => onSort('frequency')}
                >
                  Frequency {sortField === 'frequency' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="text-left px-4 py-3 font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                  onClick={() => onSort('account')}
                >
                  Account {sortField === 'account' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="text-left px-4 py-3 font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                  onClick={() => onSort('accountType')}
                >
                  Account Type {sortField === 'accountType' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="text-left px-4 py-3 font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                  onClick={() => onSort('category')}
                >
                  Category {sortField === 'category' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="text-left px-4 py-3 font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                  onClick={() => onSort('amount')}
                >
                  Amount {sortField === 'amount' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="text-left px-4 py-3 font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                  onClick={() => onSort('source')}
                >
                  Source {sortField === 'source' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="text-left px-4 py-3 font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                  onClick={() => onSort('note')}
                >
                  Notes {sortField === 'note' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr
                  key={transaction.id}
                  className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <TransactionIcon
                        transactionName={transaction.name}
                        category={transaction.category}
                        iconUrl={transaction.source === 'manual' ? transaction.iconUrl : transaction.merchantLogoUrl}
                        iconType={transaction.source === 'manual' ? transaction.iconType : 'brand'}
                        className="w-8 h-8"
                      />
                      <span className="font-medium">{transaction.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {transaction.dueDate ? format(parseISO(transaction.dueDate), 'MMM d') : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">
                    {transaction.end_date ? format(parseISO(transaction.end_date), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span 
                      className="cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                      onClick={() => onFilterClick('frequency', transaction.frequency)}
                      title={`Filter by ${transaction.frequency}`}
                    >
                      {transaction.frequency}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span 
                      className="cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                      onClick={() => onFilterClick('account', transaction.account)}
                      title={`Filter by ${transaction.account}`}
                    >
                      {shortenAccountName(transaction.account)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    <span 
                      className="cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                      onClick={() => onFilterClick('accountType', transaction.accountType || '')}
                      title={`Filter by ${transaction.accountType || 'Unknown'}`}
                    >
                      {transaction.accountType || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    <span 
                      className="cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors flex items-center gap-1"
                      onClick={() => onFilterClick('category', transaction.category)}
                      title={`Filter by ${transaction.category}`}
                    >
                      {transaction.categoryIcon && (
                        <span className="text-sm">{transaction.categoryIcon}</span>
                      )}
                      {capitalize(transaction.category)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={transaction.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                      {formatCurrency(Math.abs(transaction.amount))}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span 
                      className={`px-2 py-1 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${
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
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-xs">
                    <div className="truncate" title={transaction.notes || ''}>
                      {transaction.notes || '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {transaction.isEditable && (
                      <div className="flex gap-2">
                        <Button
                          onClick={() => onEdit(transaction)}
                          size="sm"
                          variant="outline"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => onDelete(transaction)}
                          size="sm"
                          variant="destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {transactions.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No transactions found.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
