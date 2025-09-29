import { Button } from './ui/Button'
import { Loader, Settings, RefreshCw, DollarSign, Database, TrendingUp, Calendar, Zap } from 'lucide-react'

interface QuickActionsProps {
  busy: boolean
  activeAction: string | null
  runAllStep: string | null
  calendarMode: 'dev' | 'prod'
  setCalendarMode: (mode: 'dev' | 'prod') => void
  showTimestamps: boolean
  toggleTimestamps: () => void
  functionTimestamps: Record<string, Date>
  formatTimestamp: (date?: Date) => string
  onRefreshAccounts: () => void
  onUpdateBalance: () => void
  onRefreshTransactions: () => void
  onRecalculate: () => void
  onSyncCalendar: () => void
  onAllActions: () => void
}

export function QuickActions({
  busy,
  activeAction,
  runAllStep,
  calendarMode,
  setCalendarMode,
  showTimestamps,
  toggleTimestamps,
  functionTimestamps,
  formatTimestamp,
  onRefreshAccounts,
  onUpdateBalance,
  onRefreshTransactions,
  onRecalculate,
  onSyncCalendar,
  onAllActions
}: QuickActionsProps) {
  return (
    <div className="flex flex-row items-center justify-between">
      <div>
        <h3 className="text-lg font-semibold">Quick Actions</h3>
        <p className="text-sm text-gray-600 dark:text-gray-200">Manual triggers for account updates and calculations.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          onClick={toggleTimestamps}
          className="px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg shadow-sm"
          variant="outline"
          title={showTimestamps ? "Hide technical info" : "Show technical info"}
          disabled={busy}
        >
          <Settings size={16} className={showTimestamps ? "text-blue-600 dark:text-blue-400" : ""} />
        </Button>
      </div>
    </div>
  )
}

interface QuickActionButtonsProps {
  busy: boolean
  activeAction: string | null
  runAllStep: string | null
  calendarMode: 'dev' | 'prod'
  setCalendarMode: (mode: 'dev' | 'prod') => void
  showTimestamps: boolean
  functionTimestamps: Record<string, Date>
  formatTimestamp: (date?: Date) => string
  onRefreshAccounts: () => void
  onUpdateBalance: () => void
  onRefreshTransactions: () => void
  onRecalculate: () => void
  onSyncCalendar: () => void
  onAllActions: () => void
}

export function QuickActionButtons({
  busy,
  activeAction,
  runAllStep,
  calendarMode,
  setCalendarMode,
  showTimestamps,
  functionTimestamps,
  formatTimestamp,
  onRefreshAccounts,
  onUpdateBalance,
  onRefreshTransactions,
  onRecalculate,
  onSyncCalendar,
  onAllActions
}: QuickActionButtonsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1">
        <Button className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-all" onClick={onRefreshAccounts} disabled={busy}>
          {busy && activeAction === 'refresh' ? <Loader className="animate-spin" size={18} /> : <RefreshCw size={18} />}
          Refresh Accounts
        </Button>
        <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Forces an accounts refresh in Monarch so latest bank balances can be obtained</p>
        {showTimestamps && (
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2">Last run: {formatTimestamp(functionTimestamps.refreshAccounts)}</p>
        )}
      </div>
      <div className="space-y-1">
        <Button className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-all" onClick={onUpdateBalance} disabled={busy}>
          {busy && activeAction === 'balance' ? <Loader className="animate-spin" size={18} /> : <DollarSign size={18} />}
          Update Balances
        </Button>
        <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Grabs the latest checking and savings balances from Monarch</p>
        {showTimestamps && (
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2">Last run: {formatTimestamp(functionTimestamps.updateBalance)}</p>
        )}
      </div>
      <div className="space-y-1">
        <Button className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-all" onClick={onRefreshTransactions} disabled={busy}>
          {busy && activeAction === 'transactions' ? <Loader className="animate-spin" size={18} /> : <Database size={18} />}
          Refresh Transactions
        </Button>
        <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Refreshes recurring transactions data from Monarch API with accurate amounts</p>
        {showTimestamps && (
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2">Last run: {formatTimestamp(functionTimestamps.refreshRecurringTransactions)}</p>
        )}
      </div>
      <div className="space-y-1">
        <Button className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-all" onClick={onRecalculate} disabled={busy}>
          {busy && activeAction === 'projection' ? <Loader className="animate-spin" size={18} /> : <TrendingUp size={18} />}
          Budget Projection
        </Button>
        <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Projects future budget in the Upcoming tab based on Budget Projection Settings</p>
        {showTimestamps && (
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2">Last run: {formatTimestamp(functionTimestamps.budgetProjection)}</p>
        )}
      </div>
      <div className="space-y-1">
        <Button className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-all" onClick={onSyncCalendar} disabled={busy}>
          {busy && activeAction === 'calendar' ? <Loader className="animate-spin" size={18} /> : <Calendar size={18} />}
          Sync Calendar
        </Button>
        <div className="px-2 space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="calendarMode"
                value="prod"
                checked={calendarMode === 'prod'}
                onChange={() => setCalendarMode('prod')}
                className="w-3 h-3"
              />
              <span className="text-gray-600 dark:text-gray-400">Main</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="calendarMode"
                value="dev"
                checked={calendarMode === 'dev'}
                onChange={() => setCalendarMode('dev')}
                className="w-3 h-3"
              />
              <span className="text-gray-600 dark:text-gray-400">Test</span>
            </label>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Syncs the budget projection with Google Calendar</p>
        </div>
        {showTimestamps && (
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2">Last run: {formatTimestamp(functionTimestamps.syncCalendar)}</p>
        )}
      </div>
      <div className="space-y-1">
        <Button className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-sm transition-all" onClick={onAllActions} disabled={busy}>
          {busy && activeAction === 'all' ? <Loader className="animate-spin" size={18} /> : <Zap size={18} />}
          {busy && activeAction === 'all' && runAllStep ? 'Running...' : 'Run All'}
        </Button>
        <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Runs all Quick Actions in sequence automatically</p>
        {showTimestamps && (
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2">Last run: {formatTimestamp(functionTimestamps.runAll)}</p>
        )}
      </div>
    </div>
  )
}
