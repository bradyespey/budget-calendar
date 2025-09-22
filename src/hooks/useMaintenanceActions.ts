import { useState } from 'react'
import { validateProjections } from '../utils/validateProjections'
import { generateTransactionIcons, resetAllTransactionIcons, backupTransactionIcons, restoreTransactionIcons } from '../api/icons'
import { clearCalendars } from '../api/firebase'
import { importBillsFromCSV } from '../utils/importBills'
import { exportBillsToCSV, downloadSampleCSV } from '../utils/csvExport'

type MaintenanceAction = 'validate' | 'clear' | 'icons' | 'reset-icons' | 'backup-icons' | 'restore-icons' | 'import'

interface UseMaintenanceActionsProps {
  busy: boolean
  setBusy: (busy: boolean) => void
  showNotification: (message: string, type?: 'success' | 'error') => void
  saveFunctionTimestamp: (functionName: string) => Promise<void>
  saveSettings: () => Promise<void>
  activeAction: string | null
  setActiveAction: (action: string | null) => void
  backupInfo: any
  setBackupInfo: (info: any) => void
  fileInputRef: React.RefObject<HTMLInputElement>
}

export function useMaintenanceActions({
  busy,
  setBusy,
  showNotification,
  saveFunctionTimestamp,
  saveSettings,
  activeAction,
  setActiveAction,
  backupInfo,
  setBackupInfo,
  fileInputRef
}: UseMaintenanceActionsProps) {

  const scrollToTop = () => setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0)

  const handleValidateProjections = async () => {
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
    } catch (e: any) {
      showNotification(`Error validating projections: ${e.message}`, 'error')
    } finally {
      setBusy(false)
      setActiveAction(null)
    }
  }

  const handleClearCalendars = async () => {
    scrollToTop()
    setBusy(true)
    setActiveAction('clear')
    try {
      await saveSettings()
      await clearCalendars()
      await saveFunctionTimestamp('clearCalendars')
      showNotification('Calendars cleared for both main and test calendars.', 'success')
    } catch (e: any) {
      showNotification(`Error clearing calendars: ${e.message}`, 'error')
    } finally {
      setBusy(false)
      setActiveAction(null)
    }
  }

  const handleGenerateIcons = async () => {
    scrollToTop()
    setBusy(true)
    setActiveAction('icons')
    try {
      await saveSettings()
      const result = await generateTransactionIcons()
      await saveFunctionTimestamp('generateTransactionIcons')
      
      let message = `Icon generation completed: ${result.updatedCount} updated, ${result.skippedCount} skipped`
      if (result.errorCount > 0) {
        message += `, ${result.errorCount} errors`
      }
      
      showNotification(message, 'success')
    } catch (e: any) {
      showNotification(`Error generating icons: ${e.message}`, 'error')
    } finally {
      setBusy(false)
      setActiveAction(null)
    }
  }

  const handleResetAllIcons = async () => {
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
    } catch (e: any) {
      showNotification(`Error resetting icons: ${e.message}`, 'error')
    } finally {
      setBusy(false)
      setActiveAction(null)
    }
  }

  const handleBackupIcons = async () => {
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
    } catch (e: any) {
      showNotification(`Error backing up icons: ${e.message}`, 'error')
    } finally {
      setBusy(false)
      setActiveAction(null)
    }
  }

  const handleRestoreIcons = async () => {
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
    } catch (e: any) {
      showNotification(`Error restoring icons: ${e.message}`, 'error')
    } finally {
      setBusy(false)
      setActiveAction(null)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    } catch (error: any) {
      showNotification(`Error importing CSV: ${error.message}`, 'error')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
      setBusy(false)
      setActiveAction(null)
    }
  }

  const handleExportCSV = async () => {
    try {
      await exportBillsToCSV()
    } catch (error: any) {
      showNotification('Error exporting bills: ' + error.message, 'error')
    }
  }

  const handleSampleCSV = () => {
    downloadSampleCSV()
  }

  return {
    handleValidateProjections,
    handleClearCalendars,
    handleGenerateIcons,
    handleResetAllIcons,
    handleBackupIcons,
    handleRestoreIcons,
    handleFileChange,
    handleExportCSV,
    handleSampleCSV
  }
}
