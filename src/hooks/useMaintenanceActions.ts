import { validateProjections } from '../utils/validateProjections'
import { resetAllTransactionIcons, backupTransactionIcons, restoreTransactionIcons } from '../api/icons'
import { clearCalendars } from '../api/firebase'
import { importBillsFromCSV } from '../utils/importBills'
import { exportBillsToCSV, downloadSampleCSV } from '../utils/csvExport'

interface UseMaintenanceActionsProps {
  isDemo?: boolean
  setBusy: (busy: boolean) => void
  showNotification: (message: string, type?: 'success' | 'error') => void
  saveFunctionTimestamp: (functionName: string) => Promise<void>
  saveSettings: () => Promise<void>
  setActiveAction: (action: string | null) => void
  backupInfo: { hasBackup: boolean; backupCount?: number; timestamp?: string; message: string } | null
  setBackupInfo: (info: { hasBackup: boolean; backupCount?: number; timestamp?: string; message: string } | null) => void
  fileInputRef: React.RefObject<HTMLInputElement>
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function useMaintenanceActions({
  isDemo,
  setBusy,
  showNotification,
  saveFunctionTimestamp,
  saveSettings,
  setActiveAction,
  backupInfo,
  setBackupInfo,
  fileInputRef
}: UseMaintenanceActionsProps) {

  const scrollToTop = () => setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0)

  const handleValidateProjections = async () => {
    if (isDemo) { showNotification('Projections validated. No issues found.', 'success'); return; }
    scrollToTop()
    setBusy(true)
    setActiveAction('validate')
    try {
      await saveSettings()
      const result = await validateProjections()

      const missingNames = [...new Set(result.missingInProjections.map(({ bill }) => bill.name))]
      const expectedCount = result.summary.totalProjections + result.missingInProjections.length
      const foundCount = result.summary.totalProjections

      let message = `${foundCount}/${expectedCount} days found`
      if (missingNames.length > 0) {
        message += `, ${missingNames.length} bill${missingNames.length > 1 ? 's' : ''} missing: ${missingNames.join(', ')}`
      } else {
        message += `, no bills missing!`
      }

      showNotification(message, 'success')
    } catch (e: unknown) {
      showNotification(`Error validating projections: ${getErrorMessage(e, 'Validation failed')}`, 'error')
    } finally {
      setBusy(false)
      setActiveAction(null)
    }
  }

  const handleClearCalendars = async () => {
    if (isDemo) { showNotification('Calendars cleared.', 'success'); return; }
    scrollToTop()
    setBusy(true)
    setActiveAction('clear')
    try {
      await saveSettings()
      const result = await clearCalendars()
      await saveFunctionTimestamp('clearCalendars')
      showNotification(result.message || 'Calendars cleared.', 'success')
    } catch (e: unknown) {
      showNotification(`Error clearing calendars: ${getErrorMessage(e, 'Calendar clear failed')}`, 'error')
    } finally {
      setBusy(false)
      setActiveAction(null)
    }
  }

  const handleResetAllIcons = async () => {
    if (isDemo) { showNotification('Icons reset.', 'success'); return; }
    if (!confirm('Reset all transaction icons? This will remove all generated and custom icons. Brand icons will still be detected automatically.')) {
      return
    }
    
    scrollToTop()
    setBusy(true)
    setActiveAction('reset-icons')
    try {
      await saveSettings()
      const result = await resetAllTransactionIcons({ preserveCustom: false })
      await saveFunctionTimestamp('resetAllTransactionIcons')
      
      let message = `Icon reset completed: ${result.resetCount} reset, ${result.skippedCount} skipped`
      if (result.errorCount > 0) {
        message += `, ${result.errorCount} errors`
      }
      
      showNotification(message, 'success')
    } catch (e: unknown) {
      showNotification(`Error resetting icons: ${getErrorMessage(e, 'Icon reset failed')}`, 'error')
    } finally {
      setBusy(false)
      setActiveAction(null)
    }
  }

  const handleBackupIcons = async () => {
    if (isDemo) { showNotification('Icons backed up.', 'success'); return; }
    scrollToTop()
    setBusy(true)
    setActiveAction('backup-icons')
    try {
      await saveSettings()
      const result = await backupTransactionIcons()
      await saveFunctionTimestamp('backupTransactionIcons')
      
      setBackupInfo({
        hasBackup: true,
        backupCount: result.backupCount,
        timestamp: result.timestamp,
        message: `Last backup: ${result.backupCount} icons`
      })
      
      showNotification(`Backed up ${result.backupCount} icons to Firebase`, 'success')
    } catch (e: unknown) {
      showNotification(`Error backing up icons: ${getErrorMessage(e, 'Icon backup failed')}`, 'error')
    } finally {
      setBusy(false)
      setActiveAction(null)
    }
  }

  const handleRestoreIcons = async () => {
    if (isDemo) { showNotification('Icons restored.', 'success'); return; }
    if (!backupInfo?.hasBackup) {
      showNotification('No backup available. Please backup icons first.', 'error')
      return
    }

    if (!confirm(`Restore ${backupInfo.backupCount || 0} transaction icons from backup?`)) {
      return
    }

    scrollToTop()
    setBusy(true)
    setActiveAction('restore-icons')
    try {
      await saveSettings()
      const result = await restoreTransactionIcons()
      await saveFunctionTimestamp('restoreTransactionIcons')
      
      let message = `Icon restore completed: ${result.restoredCount} restored`
      if (result.errorCount > 0) {
        message += `, ${result.errorCount} errors`
      }
      
      showNotification(message, 'success')
    } catch (e: unknown) {
      showNotification(`Error restoring icons: ${getErrorMessage(e, 'Icon restore failed')}`, 'error')
    } finally {
      setBusy(false)
      setActiveAction(null)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isDemo) { showNotification('Bills imported.', 'success'); return; }
    scrollToTop()
    setBusy(true)
    setActiveAction('import')
    const file = e.target.files?.[0]
    if (!file) {
      setBusy(false)
      setActiveAction(null)
      return
    }
    try {
      const csvData = await file.text()
      const { total, imported } = await importBillsFromCSV(csvData)
      showNotification(`Successfully imported ${imported} of ${total} bills.`, 'success')
    } catch (error: unknown) {
      showNotification(`Error importing CSV: ${getErrorMessage(error, 'CSV import failed')}`, 'error')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
      setBusy(false)
      setActiveAction(null)
    }
  }

  const handleExportCSV = async () => {
    if (isDemo) { showNotification('CSV exported.', 'success'); return; }
    try {
      await exportBillsToCSV()
    } catch (error: unknown) {
      showNotification(`Error exporting bills: ${getErrorMessage(error, 'CSV export failed')}`, 'error')
    }
  }

  const handleSampleCSV = () => {
    downloadSampleCSV()
  }

  return {
    handleValidateProjections,
    handleClearCalendars,
    handleResetAllIcons,
    handleBackupIcons,
    handleRestoreIcons,
    handleFileChange,
    handleExportCSV,
    handleSampleCSV
  }
}
