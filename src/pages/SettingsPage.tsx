//src/pages/SettingsPage.tsx

import { useState, useRef, useEffect } from 'react'
import { Loader, Settings, Save, AlertTriangle, Sun, Moon, Monitor } from 'lucide-react'
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
import { syncCalendar, getSettings, updateSettings, getFunctionTimestamps, saveFunctionTimestamp } from '../api/firebase'
import { getHighLowProjections } from '../api/projections'
import { format, parseISO } from 'date-fns'
import { useBalance } from '../context/BalanceContext'
import { useTheme } from '../components/ThemeProvider'
import { useLocation } from 'react-router-dom'
import { CategoryManagement } from '../components/CategoryManagement'
import { getIconBackupInfo } from '../api/icons'
import { QuickActionButtons } from '../components/QuickActions'
import { MaintenanceActions } from '../components/MaintenanceActions'
import { useMaintenanceActions } from '../hooks/useMaintenanceActions'

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
  const { theme, setTheme } = useTheme()
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
  const [thresholdBreach, setThresholdBreach] = useState<{ date: string; balance: number } | null>(null);

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
    storeRecurringTransactions?: Date;
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

  // Initialize maintenance actions hook
  const maintenanceActions = useMaintenanceActions({
    busy,
    setBusy,
    showNotification,
    saveFunctionTimestamp: saveFunctionTimestampLocal,
    saveSettings,
    activeAction,
    setActiveAction,
    backupInfo,
    setBackupInfo,
    fileInputRef
  })

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
      showNotification(`All account balances updated successfully`, 'success');
    } catch (e: any) {
      showNotification(`Error updating account balances: ${e.message}`, 'error');
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
        const totalEvents = (result.eventsCreated || 0) + (result.eventsUpdated || 0) + (result.eventsDeleted || 0);
        showNotification(`Calendar sync completed for ${email}. Created ${result.eventsCreated || 0}, updated ${result.eventsUpdated || 0}, deleted ${result.eventsDeleted || 0} events.`, 'success');
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

  async function handleRefreshTransactions() {
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    setBusy(true);
    setActiveAction('transactions');
    try {
      await saveSettings();
      
      // Call the main refresh function with accurate Monarch data
      const response = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/refreshTransactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      if (!response.ok) {
        throw new Error(`Failed to refresh transactions: ${response.status}`);
      }
      
      const result = await response.json();
      
      await saveFunctionTimestampLocal('refreshRecurringTransactions');
      
      showNotification(`Transactions refreshed. Stored ${result.count} transactions.`, 'success');
    } catch (e: any) {
      showNotification(`Error refreshing transactions: ${e.message}`, 'error');
    } finally {
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
    setRunAllStep('Step 1/7: Refreshing Accounts...');
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
      setRunAllStep('Step 2/7: Waiting 60 seconds for account refresh...');
      await new Promise(res => setTimeout(res, 60000));
      // 3. Update Balance (ignore errors)
      setRunAllStep('Step 3/7: Updating Balance...');
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
      // 4. Refresh Transactions (ignore errors)
      setRunAllStep('Step 4/7: Refreshing Transactions...');
      try {
        await saveSettings();
        const response = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/refreshTransactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        if (response.ok) {
          await saveFunctionTimestampLocal('refreshRecurringTransactions');
        }
      } catch (e) {
        // ignore error
      }
      // 5. Budget Projection (must finish)
      setRunAllStep('Step 5/7: Running Budget Projection...');
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
      // 6. Sync Calendar (must finish)
      setRunAllStep('Step 6/7: Syncing Calendar...');
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
      // 6. Refresh Recurring Transactions (ignore errors)
      setRunAllStep('Step 7/7: Final cleanup...');
      try {
        // Legacy cleanup - can be removed in future update
        // const storeRecurring = httpsCallable(functions, 'storeRecurringTransactions');
        // await storeRecurring({});
        // await saveFunctionTimestampLocal('storeRecurringTransactions');
      } catch (e) {
        // ignore error - this is optional
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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Settings
        </h1>
      </div>
      
      {busy && (
        <div className="flex items-center justify-center mb-4">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mr-2"></div>
          <span className="text-blue-600 dark:text-blue-200 font-semibold">{getBusyMessage()}</span>
        </div>
      )}
      {/* Save button inline with description */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-6">
        <div>
          <p className="text-gray-600 dark:text-gray-400">
            Configure your budget settings, manage data, and run maintenance tasks. Update projection settings, refresh account data, and manage categories.
          </p>
        </div>
        <Button
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-6 py-2 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow min-w-[100px] w-auto"
          disabled={busy}
        >
          {busy && activeAction === 'save' ? <Loader className="animate-spin" size={18} /> : <Save size={18} />}
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
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <QuickActionButtons
              busy={busy}
              activeAction={activeAction}
              runAllStep={runAllStep}
              calendarMode={calendarMode}
              setCalendarMode={setCalendarMode}
              showTimestamps={showTimestamps}
              functionTimestamps={functionTimestamps}
              formatTimestamp={formatTimestamp}
              onRefreshAccounts={handleRefreshAccounts}
              onUpdateBalance={handleUpdateBalance}
              onRefreshTransactions={handleRefreshTransactions}
              onRecalculate={handleRecalculate}
              onSyncCalendar={handleSyncCalendar}
              onAllActions={handleAllActions}
            />
            
          </div>
        </CardContent>
      </Card>

      {/* Budget Projection Settings */}
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Budget Projection Settings</CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-200">
              Configure how far ahead to project balances and set low balance alerts.
            </CardDescription>
          </div>
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
                      await updateSettings({ manualBalanceOverride: null });
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

      {/* Maintenance Actions */}
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Maintenance Actions</CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-200">
              Data management, validation, and maintenance tools for your budget system.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <MaintenanceActions
            busy={busy}
            activeAction={activeAction}
            showTimestamps={showTimestamps}
            functionTimestamps={functionTimestamps}
            formatTimestamp={formatTimestamp}
            backupInfo={backupInfo}
            onValidateProjections={maintenanceActions.handleValidateProjections}
            onClearCalendars={maintenanceActions.handleClearCalendars}
            onGenerateIcons={maintenanceActions.handleGenerateIcons}
            onResetAllIcons={maintenanceActions.handleResetAllIcons}
            onBackupIcons={maintenanceActions.handleBackupIcons}
            onRestoreIcons={maintenanceActions.handleRestoreIcons}
            onImportCSV={() => fileInputRef.current?.click()}
            onExportCSV={maintenanceActions.handleExportCSV}
            onSampleCSV={maintenanceActions.handleSampleCSV}
          />
        </CardContent>
      </Card>

      {/* Category Management Card - spans full width */}
      <CategoryManagement showNotification={showNotification} />
      
      {/* Theme Settings */}
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Theme Settings</CardTitle>
          <CardDescription>
            Choose your preferred appearance theme for the application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4">
            <Button
              variant={theme === 'light' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme('light')}
            >
              <Sun className="mr-2 h-4 w-4" />
              Light
            </Button>
            <Button
              variant={theme === 'dark' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme('dark')}
            >
              <Moon className="mr-2 h-4 w-4" />
              Dark
            </Button>
            <Button
              variant={theme === 'system' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme('system')}
            >
              <Monitor className="mr-2 h-4 w-4" />
              System
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Hidden file input for CSV import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={maintenanceActions.handleFileChange}
        className="hidden"
      />
    </div>
  )
}