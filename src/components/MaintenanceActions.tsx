import { Button } from './ui/Button'
import { Loader } from 'lucide-react'

interface MaintenanceActionsProps {
  busy: boolean
  activeAction: string | null
  showTimestamps: boolean
  functionTimestamps: Record<string, Date>
  formatTimestamp: (date?: Date) => string
  backupInfo: any
  onValidateProjections: () => void
  onClearCalendars: () => void
  onGenerateIcons: () => void
  onResetAllIcons: () => void
  onBackupIcons: () => void
  onRestoreIcons: () => void
  onImportCSV: () => void
  onExportCSV: () => void
  onSampleCSV: () => void
}

export function MaintenanceActions({
  busy,
  activeAction,
  showTimestamps,
  functionTimestamps,
  formatTimestamp,
  backupInfo,
  onValidateProjections,
  onClearCalendars,
  onGenerateIcons,
  onResetAllIcons,
  onBackupIcons,
  onRestoreIcons,
  onImportCSV,
  onExportCSV,
  onSampleCSV
}: MaintenanceActionsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Button onClick={onValidateProjections} variant="outline" className="w-full" disabled={busy}>
            {busy && activeAction === 'validate' ? <Loader className="animate-spin" size={18} /> : '💾'} Validate Projections
          </Button>
          <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Ensures all Transactions match up with what's expected for the Upcoming page and shows missing bills that need to be fixed</p>
        </div>
        <div className="space-y-2">
          <Button onClick={onClearCalendars} variant="outline" className="w-full" disabled={busy}>
            {busy && activeAction === 'clear' ? <Loader className="animate-spin" size={18} /> : '🧹'} Clear Calendars
          </Button>
          <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Removes all budget calendar events from today onwards in both main and test calendars</p>
          {showTimestamps && (
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2">Last run: {formatTimestamp(functionTimestamps.clearCalendars)}</p>
          )}
        </div>
        <div className="space-y-2">
          <Button onClick={onGenerateIcons} variant="outline" className="w-full" disabled={busy}>
            {busy && activeAction === 'icons' ? <Loader className="animate-spin" size={18} /> : '🎨'} Generate Icons
          </Button>
          <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Generates icons for transactions using AI and brand mapping</p>
          {showTimestamps && (
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2">Last run: {formatTimestamp(functionTimestamps.generateTransactionIcons)}</p>
          )}
        </div>
        <div className="space-y-2">
          <Button onClick={onResetAllIcons} variant="outline" className="w-full" disabled={busy}>
            {busy && activeAction === 'reset-icons' ? <Loader className="animate-spin" size={18} /> : '🔄'} Reset All Icons
          </Button>
          <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Removes all generated and custom icons, keeps brand icons</p>
          {showTimestamps && (
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2">Last run: {formatTimestamp(functionTimestamps.resetAllTransactionIcons)}</p>
          )}
        </div>
        <div className="space-y-2">
          <Button onClick={onBackupIcons} variant="outline" className="w-full" disabled={busy}>
            {busy && activeAction === 'backup-icons' ? <Loader className="animate-spin" size={18} /> : '💾'} Backup Icons
          </Button>
          <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Saves all custom icons to Firebase storage</p>
          {showTimestamps && (
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2">Last run: {formatTimestamp(functionTimestamps.backupTransactionIcons)}</p>
          )}
        </div>
        <div className="space-y-2">
          <Button onClick={onRestoreIcons} variant="outline" className="w-full" disabled={busy || !backupInfo?.hasBackup}>
            {busy && activeAction === 'restore-icons' ? <Loader className="animate-spin" size={18} /> : '📥'} Restore Icons
          </Button>
          <p className="text-xs text-gray-500 dark:text-gray-400 px-2">
            {backupInfo?.hasBackup 
              ? `Restores ${backupInfo.backupCount} icons from ${backupInfo.timestamp ? new Date(backupInfo.timestamp).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'backup'}`
              : 'No backup available (backup first)'
            }
          </p>
          {showTimestamps && (
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2">Last run: {formatTimestamp(functionTimestamps.restoreTransactionIcons)}</p>
          )}
        </div>
        <div className="space-y-2">
          <Button onClick={onImportCSV} variant="outline" className="w-full" disabled={busy}>
            {busy && activeAction === 'import' ? <Loader className="animate-spin" size={18} /> : '📤'} Import CSV
          </Button>
          <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Upload bills from CSV file</p>
        </div>
        <div className="space-y-2">
          <Button onClick={onExportCSV} variant="outline" className="w-full" disabled={busy}>
            📥 Export CSV
          </Button>
          <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Download current bills data</p>
        </div>
        <div className="space-y-2">
          <Button onClick={onSampleCSV} variant="outline" className="w-full" disabled={busy}>
            📋 Sample CSV
          </Button>
          <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Download template with examples</p>
        </div>
    </div>
  )
}
