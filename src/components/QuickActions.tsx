import { Button } from './ui/Button'
import { Loader, RefreshCw, DollarSign, Database, TrendingUp, Calendar, Zap } from 'lucide-react'

interface QuickActionButtonsProps {
  busy: boolean
  activeAction: string | null
  runAllStep: string | null
  calendarMode: 'dev' | 'prod'
  setCalendarMode: (mode: 'dev' | 'prod') => void
  showTimestamps: boolean
  functionTimestamps: Record<string, Date | undefined>
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
  const actionButtonClass =
    'h-12 w-full justify-center rounded-[18px] border-[color:var(--line-strong)] bg-[color:var(--surface)] text-[color:var(--text)] shadow-none hover:bg-[color:var(--surface-hover)]'

  const actionMetaClass = 'px-2 text-xs leading-6 text-[color:var(--muted)]'

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1">
        <Button className={actionButtonClass} variant="outline" onClick={onRefreshAccounts} disabled={busy}>
          {busy && activeAction === 'refresh' ? <Loader className="animate-spin" size={18} /> : <RefreshCw size={18} />}
          Refresh Accounts
        </Button>
        <p className={actionMetaClass}>Forces an accounts refresh in Monarch so latest bank balances can be obtained</p>
        {showTimestamps && (
          <p className="px-2 text-xs font-medium text-[color:var(--accent)]">Last run: {formatTimestamp(functionTimestamps.refreshAccounts)}</p>
        )}
      </div>
      <div className="space-y-1">
        <Button className={actionButtonClass} variant="outline" onClick={onUpdateBalance} disabled={busy}>
          {busy && activeAction === 'balance' ? <Loader className="animate-spin" size={18} /> : <DollarSign size={18} />}
          Update Balances
        </Button>
        <p className={actionMetaClass}>Grabs the latest checking and savings balances from Monarch</p>
        {showTimestamps && (
          <p className="px-2 text-xs font-medium text-[color:var(--accent)]">Last run: {formatTimestamp(functionTimestamps.updateBalance)}</p>
        )}
      </div>
      <div className="space-y-1">
        <Button className={actionButtonClass} variant="outline" onClick={onRefreshTransactions} disabled={busy}>
          {busy && activeAction === 'transactions' ? <Loader className="animate-spin" size={18} /> : <Database size={18} />}
          Update Recurring Transactions
        </Button>
        <p className={actionMetaClass}>Refreshes recurring transactions data from Monarch API with accurate amounts</p>
        {showTimestamps && (
          <p className="px-2 text-xs font-medium text-[color:var(--accent)]">Last run: {formatTimestamp(functionTimestamps.refreshRecurringTransactions)}</p>
        )}
      </div>
      <div className="space-y-1">
        <Button className={actionButtonClass} variant="outline" onClick={onRecalculate} disabled={busy}>
          {busy && activeAction === 'projection' ? <Loader className="animate-spin" size={18} /> : <TrendingUp size={18} />}
          Budget Projection
        </Button>
        <p className={actionMetaClass}>Projects future budget in the Upcoming tab based on Budget Projection Settings</p>
        {showTimestamps && (
          <p className="px-2 text-xs font-medium text-[color:var(--accent)]">Last run: {formatTimestamp(functionTimestamps.budgetProjection)}</p>
        )}
      </div>
      <div className="space-y-1">
        <Button className={actionButtonClass} variant="outline" onClick={onSyncCalendar} disabled={busy}>
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
          <p className={actionMetaClass.replace('px-2 ', '')}>Syncs the budget projection with Google Calendar</p>
        </div>
        {showTimestamps && (
          <p className="px-2 text-xs font-medium text-[color:var(--accent)]">Last run: {formatTimestamp(functionTimestamps.syncCalendar)}</p>
        )}
      </div>
      <div className="space-y-1">
        <Button className={actionButtonClass} variant="outline" onClick={onAllActions} disabled={busy}>
          {busy && activeAction === 'all' ? <Loader className="animate-spin" size={18} /> : <Zap size={18} />}
          {busy && activeAction === 'all' && runAllStep ? 'Running...' : 'Run All'}
        </Button>
        <p className={actionMetaClass}>Runs all Quick Actions in sequence automatically</p>
        {showTimestamps && (
          <p className="px-2 text-xs font-medium text-[color:var(--accent)]">Last run: {formatTimestamp(functionTimestamps.runAll)}</p>
        )}
      </div>
    </div>
  )
}
