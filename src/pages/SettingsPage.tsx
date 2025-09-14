//src/pages/SettingsPage.tsx

import { useState, useRef, useEffect } from 'react'
import {
  Calculator,
  RefreshCcw,
  Calendar,
  Upload,
  Download,
  Loader,
  Settings,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import {
  refreshAccountsViaFlask,
  refreshChaseBalanceInDb,
  getLastSyncTime,
} from '../api/accounts'
import { triggerManualRecalculation } from '../api/projections'
import { syncCalendar, getSettings, updateSettings, clearCalendars, getFunctionTimestamps, saveFunctionTimestamp } from '../api/firebase'
import { useBalance } from '../context/BalanceContext'
import { supabase } from '../lib/supabase'
import { useLocation } from 'react-router-dom'
import { importBillsFromCSV } from '../utils/importBills'
import { validateProjections } from '../utils/validateProjections'
import { CategoryManagement } from '../components/CategoryManagement'
import { format, parseISO } from 'date-fns'
import { getBills } from '../api/bills'
import { generateTransactionIcons, resetAllTransactionIcons, backupTransactionIcons, restoreTransactionIcons, getIconBackupInfo } from '../api/icons'

type CurrencyInputProps = React.ComponentProps<typeof Input> & {
  value: string;
  setValue: (val: string) => void;
};

function formatCurrencyInput(val: string) {
  if (!val) return '';
  const digits = val.replace(/\D/g, '');
  if (!digits) return '';
  return '$' + Number(digits).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function CurrencyInput({ value, setValue, ...props }: CurrencyInputProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '');
    setValue(raw);
  }

  const displayValue = formatCurrencyInput(value);

  return (
    <Input
      {...props}
      value={displayValue}
      onChange={handleChange}
    />
  );
}

export function SettingsPage() {
  const [busy, setBusy] = useState(false)
  const [backupInfo, setBackupInfo] = useState<{ hasBackup: boolean; backupCount?: number; timestamp?: string; message: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { setBalance, setLastSync } = useBalance()
  const [localProjectionDays, setLocalProjectionDays] = useState<number | null>(null)
  const [localBalanceThreshold, setLocalBalanceThreshold] = useState<number>(1000)
  const [saveMessage] = useState('')
  const [calendarMode, setCalendarMode] = useState<'dev' | 'prod'>('prod')
  const [manualBalanceOverride, setManualBalanceOverride] = useState<string>('')
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const location = useLocation()

  // State for focus
  const [balanceThresholdFocused, setBalanceThresholdFocused] = useState(false);
  const [manualOverrideFocused, setManualOverrideFocused] = useState(false);
  const [balanceThresholdInput, setBalanceThresholdInput] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [runAllStep, setRunAllStep] = useState<string | null>(null);

  // State for function last run timestamps
  const [functionTimestamps, setFunctionTimestamps] = useState<{
    refreshAccounts?: Date;
    updateBalance?: Date;
    budgetProjection?: Date;
    syncCalendar?: Date;
    clearCalendars?: Date;
    generateTransactionIcons?: Date;
    resetAllTransactionIcons?: Date;
    backupTransactionIcons?: Date;
    restoreTransactionIcons?: Date;
    runAll?: Date;
  }>({});

  // State for showing/hiding technical timestamps
  const [showTimestamps, setShowTimestamps] = useState<boolean>(false);

  // Function to load timestamps from Firestore
  async function loadFunctionTimestamps() {
    try {
      const timestamps = await getFunctionTimestamps();
      const typedTimestamps: typeof functionTimestamps = {};
      
      Object.entries(timestamps).forEach(([key, value]) => {
        typedTimestamps[key as keyof typeof functionTimestamps] = value;
      });
      
      setFunctionTimestamps(typedTimestamps);
    } catch (e) {
      console.error('Error loading function timestamps:', e);
    }
  }

  // Function to save timestamp for a specific function
  async function saveFunctionTimestampLocal(functionName: keyof typeof functionTimestamps) {
    const now = new Date();
    const newTimestamps = { ...functionTimestamps, [functionName]: now };
    setFunctionTimestamps(newTimestamps);
    
    // Save to Firestore
    try {
      await saveFunctionTimestamp(functionName);
    } catch (e) {
      console.error('Error saving function timestamp:', e);
    }
  }

  // Function to format timestamp for display
  function formatTimestamp(date?: Date): string {
    if (!date) return 'Never run';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Function to toggle timestamp visibility
  function toggleTimestamps() {
    const newState = !showTimestamps;
    setShowTimestamps(newState);
    localStorage.setItem('budgetShowTimestamps', JSON.stringify(newState));
  }

  useEffect(() => {
    async function fetchSettings() {
      try {
        const settings = await getSettings();
        setLocalProjectionDays(settings.projectionDays ?? 7)
        setLocalBalanceThreshold(settings.balanceThreshold ?? 1000)
        setManualBalanceOverride(settings.manualBalanceOverride?.toString() ?? '')
        setCalendarMode(settings.calendarMode ?? 'dev')
        setBalanceThresholdInput((settings.balanceThreshold ?? 1000).toString())
      } catch (error) {
        console.error('Error fetching settings:', error);
        // Set defaults if error
        setLocalProjectionDays(7);
        setLocalBalanceThreshold(1000);
        setCalendarMode('dev');
        setBalanceThresholdInput('1000');
      }
    }
    
    async function initializeData() {
      await fetchSettings();
      await loadFunctionTimestamps();
      
      // Load show timestamps preference from localStorage
      const showTimestampsStored = localStorage.getItem('showTimestamps') === 'true';
      setShowTimestamps(showTimestampsStored);
    }
    
    initializeData();
  }, [])

  // Keep balanceThresholdInput in sync with localBalanceThreshold when not focused
  useEffect(() => {
    if (!balanceThresholdFocused && balanceThresholdInput !== null) {
      setBalanceThresholdInput(localBalanceThreshold.toString());
    }
  }, [localBalanceThreshold, balanceThresholdFocused]);

  useEffect(() => {
    setNotification(null);
  }, [location.pathname]);

  async function handleRefreshAccounts() {
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    setBusy(true);
    setActiveAction('refresh');
    try {
      await saveSettings();
      await refreshAccountsViaFlask();
      await saveFunctionTimestampLocal('refreshAccounts');
      showNotification('Accounts refreshed.', 'success');
    } catch (e: any) {
      showNotification(`Error refreshing accounts: ${e.message}`, 'error');
    } finally {
      setBusy(false);
      setActiveAction(null);
    }
  }

  async function handleUpdateBalance() {
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    setBusy(true);
    setActiveAction('balance');
    try {
      await saveSettings();
      const bal = await refreshChaseBalanceInDb();
      const freshSync = await getLastSyncTime();
      if (freshSync) setLastSync(freshSync);
      await setBalance(bal);
      await saveFunctionTimestampLocal('updateBalance');
      showNotification(`Chase balance updated: $${bal.toLocaleString()}`, 'success');
    } catch (e: any) {
      showNotification(`Error updating balance: ${e.message}`, 'error');
    } finally {
      setBusy(false);
      setActiveAction(null);
    }
  }

  async function handleRecalculate() {
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    setBusy(true);
    setActiveAction('projection');
    try {
      await saveSettings();
      await triggerManualRecalculation();
      await saveFunctionTimestampLocal('budgetProjection');
      showNotification('Budget projections recalculated.', 'success');
    } catch (e: any) {
      showNotification('Error recalculating projections.', 'error');
    } finally {
      setBusy(false);
      setActiveAction(null);
    }
  }

  async function handleSyncCalendar() {
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    setBusy(true);
    setActiveAction('calendar');
    try {
      await saveSettings();
      
      // Call Firebase Cloud Function (it will recalculate projections internally)
      const result = await syncCalendar(calendarMode);
      
      await saveFunctionTimestampLocal('syncCalendar');
      
      const email = calendarMode === 'dev'
        ? 'baespey@gmail.com'
        : 'bradyjennytx@gmail.com';
      if (result.success) {
        showNotification(`Calendar sync completed for ${email}. Synced ${result.processedCount || 0} days.`, 'success');
      } else {
        showNotification(`Calendar sync failed: ${result.message}`, 'error');
      }
    } catch (e: any) {
      showNotification(`Error syncing calendar: ${e.message}`, 'error');
    } finally {
      setBusy(false);
      setActiveAction(null);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    setBusy(true);
    setActiveAction('import');
    const file = e.target.files?.[0]
    if (!file) {
      setBusy(false);
      setActiveAction(null);
      return;
    }
    try {
      const csvData = await file.text()
      const { total, imported } = await importBillsFromCSV(csvData)
      showNotification(`Successfully imported ${imported} of ${total} bills.`, 'success')
    } catch (error: any) {
      showNotification(`Error importing CSV: ${error.message}`, 'error')
    } finally {
      fileInputRef.current!.value = ''
      setBusy(false);
      setActiveAction(null);
    }
  }

  async function handleSave() {
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    setBusy(true);
    setActiveAction('save');
    try {
      await updateSettings({
        projectionDays: Number(localProjectionDays),
        balanceThreshold: Number(localBalanceThreshold),
        manualBalanceOverride: manualBalanceOverride === '' ? null : Number(manualBalanceOverride),
        calendarMode: calendarMode,
      });
      showNotification('Settings saved!', 'success');
    } catch (error) {
      console.error('Error saving settings:', error);
      showNotification('Error saving settings.', 'error');
    }
    setBusy(false);
    setActiveAction(null);
  }

  async function saveSettings() {
    try {
      await updateSettings({
        projectionDays: Number(localProjectionDays),
        balanceThreshold: Number(localBalanceThreshold),
        manualBalanceOverride: manualBalanceOverride === '' ? null : Number(manualBalanceOverride),
        calendarMode: calendarMode,
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      showNotification('Error saving settings.', 'error');
      throw error;
    }
  }

  function showNotification(message: string, type: 'success' | 'error' = 'success') {
    setNotification({ message, type });
  }

  async function handleClearCalendars() {
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    setBusy(true);
    setActiveAction('clear');
    try {
      await saveSettings();
      const result = await clearCalendars();
      await saveFunctionTimestampLocal('clearCalendars');
      const email = calendarMode === 'dev'
        ? 'baespey@gmail.com'
        : 'bradyjennytx@gmail.com';
      showNotification(`Calendars cleared for ${email}.`, 'success');
    } catch (e: any) {
      showNotification(`Error clearing calendars: ${e.message}`, 'error');
    } finally {
      setBusy(false);
      setActiveAction(null);
    }
  }

  async function handleValidateProjections() {
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    setBusy(true);
    setActiveAction('validate');
    try {
      await saveSettings();
      const result = await validateProjections();

      // Get unique missing bill names
      const missingNames = [
        ...new Set(result.missingInProjections.map(({ bill }) => bill.name))
      ];
      const expectedCount = result.summary.totalProjections + result.missingInProjections.length;
      const foundCount = result.summary.totalProjections;

      let message = `${foundCount}/${expectedCount} days found`;
      if (missingNames.length > 0) {
        message += `, ${missingNames.length} bill${missingNames.length > 1 ? 's' : ''} missing: ${missingNames.join(', ')}`;
      } else {
        message += `, no bills missing!`;
      }

      showNotification(message, 'success');
    } catch (e: any) {
      showNotification(`Error validating projections: ${e.message}`, 'error');
    } finally {
      setBusy(false);
      setActiveAction(null);
    }
  }

  async function handleGenerateIcons() {
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    setBusy(true);
    setActiveAction('icons');
    try {
      await saveSettings();
      const result = await generateTransactionIcons();
      await saveFunctionTimestampLocal('generateTransactionIcons');
      
      let message = `Icon generation completed: ${result.updatedCount} updated, ${result.skippedCount} skipped`;
      if (result.errorCount > 0) {
        message += `, ${result.errorCount} errors`;
      }
      
      showNotification(message, 'success');
    } catch (e: any) {
      showNotification(`Error generating icons: ${e.message}`, 'error');
    } finally {
      setBusy(false);
      setActiveAction(null);
    }
  }

  async function handleResetAllIcons() {
    if (!confirm('Reset all transaction icons? This will remove all generated and custom icons. Brand icons will still be detected automatically.')) {
      return;
    }
    
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    setBusy(true);
    setActiveAction('reset-icons');
    try {
      await saveSettings();
      const result = await resetAllTransactionIcons({ preserveCustom: false });
      await saveFunctionTimestampLocal('resetAllTransactionIcons');
      
      let message = `Icon reset completed: ${result.resetCount} reset, ${result.skippedCount} skipped`;
      if (result.errorCount > 0) {
        message += `, ${result.errorCount} errors`;
      }
      
      showNotification(message, 'success');
    } catch (e: any) {
      showNotification(`Error resetting icons: ${e.message}`, 'error');
    } finally {
      setBusy(false);
      setActiveAction(null);
    }
  }

  async function handleBackupIcons() {
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    setBusy(true);
    setActiveAction('backup-icons');
    try {
      await saveSettings();
      const result = await backupTransactionIcons();
      await saveFunctionTimestampLocal('backupTransactionIcons');
      
      // Update backup info
      setBackupInfo({
        hasBackup: true,
        backupCount: result.backupCount,
        timestamp: result.timestamp,
        message: `Last backup: ${result.backupCount} icons`
      });
      
      showNotification(`Backed up ${result.backupCount} icons to Firebase`, 'success');
    } catch (e: any) {
      showNotification(`Error backing up icons: ${e.message}`, 'error');
    } finally {
      setBusy(false);
      setActiveAction(null);
    }
  }

  async function handleRestoreIcons() {
    if (!backupInfo?.hasBackup) {
      showNotification('No backup available. Please backup icons first.', 'error');
      return;
    }

    if (!confirm(`Restore ${backupInfo.backupCount || 0} transaction icons from backup?`)) {
      return;
    }

    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    setBusy(true);
    setActiveAction('restore-icons');
    try {
      await saveSettings();
      const result = await restoreTransactionIcons();
      await saveFunctionTimestampLocal('restoreTransactionIcons');
      
      let message = `Icon restore completed: ${result.restoredCount} restored`;
      if (result.errorCount > 0) {
        message += `, ${result.errorCount} errors`;
      }
      
      showNotification(message, 'success');
    } catch (e: any) {
      showNotification(`Error restoring icons: ${e.message}`, 'error');
    } finally {
      setBusy(false);
      setActiveAction(null);
    }
  }

  // Load backup info on component mount
  useEffect(() => {
    const loadBackupInfo = async () => {
      try {
        const info = await getIconBackupInfo();
        setBackupInfo(info);
      } catch (error) {
        console.error('Error loading backup info:', error);
      }
    };
    
    loadBackupInfo();
    loadFunctionTimestamps();
    
    // Load timestamp toggle state
    const stored = localStorage.getItem('budgetShowTimestamps');
    if (stored) {
      setShowTimestamps(JSON.parse(stored));
    }
  }, []);

  async function handleAllActions() {
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    setBusy(true);
    setActiveAction('all');
    setRunAllStep('Step 1/5: Refreshing Accounts...');
    try {
      // 1. Refresh Accounts (ignore errors)
      try {
        await saveSettings();
        await refreshAccountsViaFlask();
        await saveFunctionTimestampLocal('refreshAccounts');
      } catch (e) {
        // ignore error
      }
      // 2. Wait 60 seconds
      setRunAllStep('Step 2/5: Waiting 60 seconds for account refresh...');
      await new Promise(res => setTimeout(res, 60000));
      // 3. Update Balance (ignore errors)
      setRunAllStep('Step 3/5: Updating Balance...');
      try {
        await saveSettings();
        const bal = await refreshChaseBalanceInDb();
        const freshSync = await getLastSyncTime();
        if (freshSync) setLastSync(freshSync);
        await setBalance(bal);
        await saveFunctionTimestampLocal('updateBalance');
      } catch (e) {
        // ignore error
      }
      // 4. Budget Projection (must finish)
      setRunAllStep('Step 4/5: Running Budget Projection...');
      try {
        await saveSettings();
        await triggerManualRecalculation();
        await saveFunctionTimestampLocal('budgetProjection');
      } catch (e: any) {
        showNotification('Error running Budget Projection: ' + (e.message || e), 'error');
        setBusy(false);
        setActiveAction(null);
        setRunAllStep(null);
        return;
      }
      // 5. Sync Calendar (must finish)
      setRunAllStep('Step 5/5: Syncing Calendar...');
      try {
        await saveSettings();
        
        // Call Firebase Cloud Function
        await syncCalendar(calendarMode);
        await saveFunctionTimestampLocal('syncCalendar');
      } catch (e: any) {
        showNotification('Error syncing calendar: ' + (e.message || e), 'error');
        setBusy(false);
        setActiveAction(null);
        setRunAllStep(null);
        return;
      }
      await saveFunctionTimestampLocal('runAll');
      showNotification('All actions completed successfully.', 'success');
    } catch (e: any) {
      showNotification('Error running all actions: ' + (e.message || e), 'error');
    } finally {
      setBusy(false);
      setActiveAction(null);
      setRunAllStep(null);
    }
  }

  // Helper to format as $X,XXX (no cents)
  function formatCurrencyNoCents(val: string | number) {
    if (val === "" || val === null || isNaN(Number(val))) return "";
    return "$" + Number(val).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  // Helper to get contextual feedback for busy state
  function getBusyMessage() {
    if (activeAction === 'refresh') return 'Refreshing Accounts...';
    if (activeAction === 'balance') return 'Updating Balance...';
    if (activeAction === 'projection') return 'Running Budget Projection...';
    if (activeAction === 'calendar') return 'Syncing Calendar...';
    if (activeAction === 'validate') return 'Validating Projections...';
    if (activeAction === 'clear') return 'Clearing Calendars...';
    if (activeAction === 'import') return 'Importing Bills from CSV...';
    if (activeAction === 'save') return 'Saving Settings...';
    if (activeAction === 'icons') return 'Generating Transaction Icons...';
    if (activeAction === 'reset-icons') return 'Resetting Transaction Icons...';
    if (activeAction === 'backup-icons') return 'Backing up Transaction Icons...';
    if (activeAction === 'restore-icons') return 'Restoring Transaction Icons...';
    if (runAllStep) return runAllStep;
    return 'Working...';
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto px-2 sm:px-4">
      {/* Page Description */}
      <div className="text-center space-y-2 py-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Settings
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
          Configure your budget settings, manage data, and run maintenance tasks. Update projection settings, refresh account data, and manage categories.
        </p>
      </div>
      
      {busy && (
        <div className="flex items-center justify-center mb-4">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mr-2"></div>
          <span className="text-blue-600 dark:text-blue-200 font-semibold">{getBusyMessage()}</span>
        </div>
      )}
      {/* Page header with Save button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 gap-2">
        <h2 className="text-2xl font-bold">Configuration</h2>
        <Button
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-4 py-2 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow min-w-[0] w-auto"
          disabled={busy}
        >
          {busy && activeAction === 'save' ? <Loader className="animate-spin" size={18} /> : <span role="img" aria-label="save">💾</span>}
          Save
        </Button>
      </div>
      {saveMessage && <div className="mb-2">{saveMessage}</div>}

      {notification && (
        <div
          className={`mb-4 p-4 rounded border-l-4 ${
            notification.type === 'success'
              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-900 dark:text-blue-100'
              : 'bg-red-50 dark:bg-red-900/20 border-red-500 text-red-900 dark:text-red-100'
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Quick actions */}
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-200">Manual triggers for account updates and calculations.</CardDescription>
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
            <div className="flex flex-col items-end">
              <Button
                onClick={handleAllActions}
                className="ml-2 px-4 py-2 text-base font-semibold shadow whitespace-nowrap min-w-[120px]"
                variant="primary"
                title="Run All"
                disabled={busy}
              >
                {busy && activeAction === 'all' ? <Loader className="animate-spin" size={18} /> : '🚀'} {busy && activeAction === 'all' && runAllStep ? 'Running...' : 'Run All'}
              </Button>
              {showTimestamps && (
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2 mt-1">Last run: {formatTimestamp(functionTimestamps.runAll)}</p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Main Actions */}
          <div className="space-y-4 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Button className="w-full inline-flex items-center gap-2 px-4 py-2 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow" onClick={handleRefreshAccounts} disabled={busy}>
                  {busy && activeAction === 'refresh' ? <Loader className="animate-spin" size={18} /> : <span role="img" aria-label="refresh">🔄</span>}
                  Refresh Accounts
                </Button>
                <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Forces an accounts refresh in Monarch so latest bank balances can be obtained</p>
                {showTimestamps && (
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2">Last run: {formatTimestamp(functionTimestamps.refreshAccounts)}</p>
                )}
              </div>
              <div className="space-y-1">
                <Button className="w-full inline-flex items-center gap-2 px-4 py-2 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow" onClick={handleUpdateBalance} disabled={busy}>
                  {busy && activeAction === 'balance' ? <Loader className="animate-spin" size={18} /> : <span role="img" aria-label="balance">💰</span>}
                  Update Balance
                </Button>
                <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Grabs the latest balance from Monarch</p>
                {showTimestamps && (
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2">Last run: {formatTimestamp(functionTimestamps.updateBalance)}</p>
                )}
              </div>
              <div className="space-y-1">
                <Button className="w-full inline-flex items-center gap-2 px-4 py-2 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow" onClick={handleRecalculate} disabled={busy}>
                  {busy && activeAction === 'projection' ? <Loader className="animate-spin" size={18} /> : <span role="img" aria-label="projection">📊</span>}
                  Budget Projection
                </Button>
                <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Projects future budget in the Upcoming tab based on Budget Projection Settings</p>
                {showTimestamps && (
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2">Last run: {formatTimestamp(functionTimestamps.budgetProjection)}</p>
                )}
              </div>
              <div className="space-y-1">
                <Button className="w-full inline-flex items-center gap-2 px-4 py-2 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow" onClick={handleSyncCalendar} disabled={busy}>
                  {busy && activeAction === 'calendar' ? <Loader className="animate-spin" size={18} /> : <span role="img" aria-label="calendar">📅</span>}
                  Sync Calendar
                </Button>
                <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Syncs the budget projection with Google Calendar</p>
                {showTimestamps && (
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2">Last run: {formatTimestamp(functionTimestamps.syncCalendar)}</p>
                )}
              </div>
            </div>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 my-4" />
          {/* Maintenance Actions */}
          <div>
            <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-200 mb-3">Maintenance</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
              <div className="space-y-2">
                <Button onClick={handleValidateProjections} variant="outline" className="w-full" disabled={busy}>
                  {busy && activeAction === 'validate' ? <Loader className="animate-spin" size={18} /> : '💾'} Validate Projections
                </Button>
                <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Ensures all Transactions match up with what's expected for the Upcoming page and shows missing bills that need to be fixed</p>
              </div>
              <div className="space-y-2">
                <Button onClick={handleClearCalendars} variant="outline" className="w-full" disabled={busy}>
                  {busy && activeAction === 'clear' ? <Loader className="animate-spin" size={18} /> : '🧹'} Clear Calendars
                </Button>
                <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Removes all budget calendar events from Google Calendar</p>
                {showTimestamps && (
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2">Last run: {formatTimestamp(functionTimestamps.clearCalendars)}</p>
                )}
              </div>
              <div className="space-y-2">
                <Button onClick={handleGenerateIcons} variant="outline" className="w-full" disabled={busy}>
                  {busy && activeAction === 'icons' ? <Loader className="animate-spin" size={18} /> : '🎨'} Generate Icons
                </Button>
                <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Generates icons for transactions using AI and brand mapping</p>
                {showTimestamps && (
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2">Last run: {formatTimestamp(functionTimestamps.generateTransactionIcons)}</p>
                )}
              </div>
              <div className="space-y-2">
                <Button onClick={handleResetAllIcons} variant="outline" className="w-full" disabled={busy}>
                  {busy && activeAction === 'reset-icons' ? <Loader className="animate-spin" size={18} /> : '🔄'} Reset All Icons
                </Button>
                <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Removes all generated and custom icons, keeps brand icons</p>
                {showTimestamps && (
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2">Last run: {formatTimestamp(functionTimestamps.resetAllTransactionIcons)}</p>
                )}
              </div>
              <div className="space-y-2">
                <Button onClick={handleBackupIcons} variant="outline" className="w-full" disabled={busy}>
                  {busy && activeAction === 'backup-icons' ? <Loader className="animate-spin" size={18} /> : '💾'} Backup Icons
                </Button>
                <p className="text-xs text-gray-500 dark:text-gray-400 px-2">Saves all custom icons to Firebase storage</p>
                {showTimestamps && (
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2">Last run: {formatTimestamp(functionTimestamps.backupTransactionIcons)}</p>
                )}
              </div>
              <div className="space-y-2">
                <Button onClick={handleRestoreIcons} variant="outline" className="w-full" disabled={busy || !backupInfo?.hasBackup}>
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
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Budget Projection Settings */}
      <Card className="w-full">
        <CardHeader className="!border-b-0">
          <CardTitle>Budget Projection Settings</CardTitle>
          <CardDescription className="text-gray-600 dark:text-gray-200">
            Configure how far ahead to project balances and set low balance alerts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label htmlFor="projectionDays" className="text-sm font-medium">
                Days to Project
              </label>
              <Input
                id="projectionDays"
                type="text"
                inputMode="numeric"
                value={localProjectionDays === null ? '' : localProjectionDays}
                onChange={e => {
                  let value = Number(e.target.value.replace(/,/g, ""));
                  if (value > 365) value = 365;
                  if (value < 1) value = 1;
                  setLocalProjectionDays(value);
                }}
                className="w-full max-w-xs"
                disabled={localProjectionDays === null}
              />
              <p className="text-sm text-gray-600 dark:text-gray-200">
                How many days ahead to project balances (1-365)
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="balanceThreshold" className="text-sm font-medium">
                Low Balance Alert
              </label>
              <CurrencyInput
                id="balanceThreshold"
                value={balanceThresholdInput === null ? '' : balanceThresholdInput}
                setValue={val => {
                  setBalanceThresholdInput(val);
                  setLocalBalanceThreshold(val === "" ? 0 : Number(val));
                }}
                className="w/full max-w-xs"
                disabled={balanceThresholdInput === null}
              />
              <p className="text-sm text-gray-600 dark:text-gray-200">
                Alert when projected balance falls below this amount
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="manualBalanceOverride" className="text-sm font-medium">
                Manual Balance Override
              </label>
              <div className="flex gap-2 items-center">
                <CurrencyInput
                  id="manualBalanceOverride"
                  value={manualBalanceOverride}
                  setValue={val => setManualBalanceOverride(val)}
                  className="w-full max-w-xs"
                  placeholder="Optional"
                />
                {manualBalanceOverride && (
                  <Button
                    type="button"
                    variant="outline"
                    className="text-xs px-2 py-1 h-auto"
                    onClick={async () => {
                      setManualBalanceOverride("");
                      await supabase
                        .from('settings')
                        .update({ manual_balance_override: null })
                        .eq('id', 1);
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-200">
                Override live balance for projections (optional)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Management Card - spans full width */}
      <CategoryManagement showNotification={showNotification} />

      {/* Top row: Calendar Mode (left), Import/Export Bills (right) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="flex flex-col h-full w-full">
          <CardHeader>
            <CardTitle>Calendar Mode</CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-200">
              Choose which Google Calendars to sync with.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="calendarMode"
                  value="prod"
                  checked={calendarMode === 'prod'}
                  onChange={() => setCalendarMode('prod')}
                />
                <span>
                  <span className="font-semibold">Main Calendars</span> <span className="text-xs text-gray-600 dark:text-gray-200">(bradyjennytx@gmail.com)</span>
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="calendarMode"
                  value="dev"
                  checked={calendarMode === 'dev'}
                  onChange={() => setCalendarMode('dev')}
                />
                <span>
                  <span className="font-semibold">Testing Calendars</span> <span className="text-xs text-gray-600 dark:text-gray-200">(baespey@gmail.com)</span>
                </span>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Import/Export Bills Card */}
        <Card className="import-bills-card w-full">
          <CardHeader>
            <CardTitle>Import/Export Bills</CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-200">
              📊 Upload bills from CSV or download your current data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mt-2">
              <Button
                onClick={() => fileInputRef.current?.click()}
                isLoading={busy && activeAction === 'import'}
                leftIcon={busy && activeAction === 'import' ? <Loader className="animate-spin" size={16} /> : <Upload size={16} />}
                disabled={busy}
                className="min-w-[140px]"
              >
                Import CSV
              </Button>
              <Button
                onClick={async () => {
                  try {
                    const bills = await getBills();
                    if (!bills) return;
                    
                    const headers = ['Name', 'Category', 'Amount', 'Repeats Every', 'Frequency', 'Start Date', 'End Date', 'Owner', 'Note', 'Monthly Cost', 'Yearly Cost'];

                    const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());
                    const freqLabel = (f: string) => {
                      if (f === 'daily') return 'Days';
                      if (f === 'weekly') return 'Weeks';
                      if (f === 'monthly') return 'Months';
                      if (f === 'yearly') return 'Years';
                      if (f === 'one-time') return 'One-time';
                      return f;
                    };
                    const currency = (n: number) => {
                      const abs = Math.abs(n);
                      const formatted = `$${abs.toFixed(2)}`;
                      return n < 0 ? `-$${abs.toFixed(2)}`.replace('--', '-') : formatted;
                    };
                    const calcMonthly = (amount: number, freq: string, repeatsEvery: number) => {
                      const r = repeatsEvery || 1;
                      switch (freq) {
                        case 'daily': return (amount * 30.44) / r;
                        case 'weekly': return (amount * 4.35) / r;
                        case 'monthly': return amount / r;
                        case 'yearly': return amount / (12 * r);
                        case 'one-time': return 0;
                        default: return amount / r;
                      }
                    };
                    const calcYearly = (amount: number, freq: string, repeatsEvery: number) => {
                      const r = repeatsEvery || 1;
                      switch (freq) {
                        case 'daily': return (amount * 365.25) / r;
                        case 'weekly': return (amount * 52.18) / r;
                        case 'monthly': return (amount * 12) / r;
                        case 'yearly': return amount / r;
                        case 'one-time': return 0;
                        default: return (amount * 12) / r;
                      }
                    };

                    const csvContent = [
                      headers.join(','),
                      ...bills.map(bill => {
                        const monthly = calcMonthly(bill.amount, bill.frequency, bill.repeats_every);
                        const yearly = calcYearly(bill.amount, bill.frequency, bill.repeats_every);
                        return [
                          `"${bill.name}"`,
                          `"${titleCase(bill.category)}"`,
                          bill.amount < 0 ? `-$${Math.abs(bill.amount).toFixed(2)}` : `$${bill.amount.toFixed(2)}`,
                          bill.repeats_every,
                          `"${freqLabel(bill.frequency)}"`,
                          `"${format(parseISO(bill.start_date), 'M/d/yyyy')}"`,
                          bill.end_date ? `"${format(parseISO(bill.end_date), 'M/d/yyyy')}"` : '',
                          bill.owner ? `"${bill.owner}"` : '',
                          bill.note ? `"${bill.note}"` : '',
                          bill.amount !== 0 ? currency(monthly) : '$0',
                          bill.amount !== 0 ? currency(yearly) : '$0'
                        ].join(',');
                      })
                    ].join('\n');
                    
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `bills-export-${new Date().toISOString().split('T')[0]}.csv`;
                    link.click();
                  } catch (error: any) {
                    showNotification('Error exporting bills: ' + error.message, 'error');
                  }
                }}
                leftIcon={<Download size={16} />}
                disabled={busy}
              >
                Export CSV
              </Button>
              <Button
                onClick={() => {
                  const headers = ['Name', 'Category', 'Amount', 'Repeats Every', 'Frequency', 'Start Date', 'End Date', 'Owner', 'Note', 'Monthly Cost', 'Yearly Cost'];
                  const sampleData = [
                    ['Test Rent Monthly', 'House', '-$1,000', '1', 'Months', '8/7/2025', '', 'Both', 'Monthly rent payment', '-$1,000', '-$12,000'],
                    ['Test Groceries Weekly', 'Food & Drinks', '-$50', '1', 'Weeks', '8/9/2025', '', 'Both', '', '-$217', '-$2,600'],
                    ['Test Credit Card', 'Credit Card', '-$500', '1', 'Months', '8/11/2025', '', 'Brady', '', '-$500', '-$6,000'],
                    ['Test Subscription Every 5 Days', 'Subscription', '-$20', '5', 'Days', '8/13/2025', '9/11/2025', 'Jenny', '', '-$122', '-$1,460'],
                    ['Test Gym Yearly', 'Fitness', '-$100', '1', 'Years', '8/15/2025', '', 'Brady', 'Once a year test', '-$8', '-$100']
                  ];
                  const csvContent = [
                    headers.join(','),
                    ...sampleData.map(row => row.map(cell => `"${cell}"`).join(','))
                  ].join('\n');
                  
                  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(blob);
                  link.download = 'bills-template.csv';
                  link.click();
                }}
                leftIcon={<Download size={16} />}
                disabled={busy}
                className="min-w-[140px]"
              >
                Sample CSV
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}