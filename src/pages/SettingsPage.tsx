//src/pages/SettingsPage.tsx

import { useState, useRef, useEffect } from 'react'
import {
  Calculator,
  RefreshCcw,
  Calendar,
  Upload,
  Download,
  Loader,
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
import { useBalance } from '../context/BalanceContext'
import { supabase } from '../lib/supabase'
import { useLocation } from 'react-router-dom'
import { importBillsFromCSV } from '../utils/importBills'
import { validateProjections } from '../utils/validateProjections'
import { format, parseISO } from 'date-fns'

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

  useEffect(() => {
    async function fetchSettings() {
      const { data } = await supabase
        .from('settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (data) {
        setLocalProjectionDays(data.projection_days ?? 30)
        setLocalBalanceThreshold(data.balance_threshold ?? 1000)
        setManualBalanceOverride(data.manual_balance_override?.toString() ?? '')
        setCalendarMode(data.calendar_mode ?? 'prod')
        setBalanceThresholdInput((data.balance_threshold ?? 1000).toString())
      } else {
        setBalanceThresholdInput('');
      }
    }
    fetchSettings()
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
      const { data: settings } = await supabase.from('settings').select('projection_days').eq('id', 1).maybeSingle();
      const days = settings?.projection_days || 30;
      const syncRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-calendar?env=${calendarMode}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!syncRes.ok) throw new Error('Calendar sync failed');
      const email = calendarMode === 'dev'
        ? 'baespey@gmail.com'
        : 'bradyjennytx@gmail.com';
      showNotification(`Calendar sync completed for ${email}.`, 'success');
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
    const { error } = await supabase
      .from('settings')
      .update({
        projection_days: Number(localProjectionDays),
        balance_threshold: Number(localBalanceThreshold),
        manual_balance_override: manualBalanceOverride === '' ? null : Number(manualBalanceOverride),
        calendar_mode: calendarMode,
      })
      .eq('id', 1);
    if (error) {
      showNotification('Error saving settings.', 'error');
    } else {
      showNotification('Settings saved!', 'success');
    }
    setBusy(false);
    setActiveAction(null);
  }

  async function saveSettings() {
    const { error } = await supabase
      .from('settings')
      .update({
        projection_days: Number(localProjectionDays),
        balance_threshold: Number(localBalanceThreshold),
        manual_balance_override: manualBalanceOverride === '' ? null : Number(manualBalanceOverride),
        calendar_mode: calendarMode,
      })
      .eq('id', 1);
    if (error) {
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
      const { data: settings } = await supabase.from('settings').select('projection_days').eq('id', 1).maybeSingle();
      const days = settings?.projection_days || 30;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clear-calendars?env=${calendarMode}&days=${days}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!res.ok) throw new Error('Clear calendars failed');
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
      } catch (e) {
        // ignore error
      }
      // 4. Budget Projection (must finish)
      setRunAllStep('Step 4/5: Running Budget Projection...');
      try {
        await saveSettings();
        await triggerManualRecalculation();
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
        const { data: settings } = await supabase.from('settings').select('projection_days').eq('id', 1).maybeSingle();
        const days = settings?.projection_days || 30;
        const syncRes = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-calendar?env=${calendarMode}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        if (!syncRes.ok) throw new Error('Calendar sync failed');
      } catch (e: any) {
        showNotification('Error syncing calendar: ' + (e.message || e), 'error');
        setBusy(false);
        setActiveAction(null);
        setRunAllStep(null);
        return;
      }
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
    if (runAllStep) return runAllStep;
    return 'Working...';
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto px-2 sm:px-4">
      {busy && (
        <div className="flex items-center justify-center mb-4">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mr-2"></div>
          <span className="text-blue-600 dark:text-blue-200 font-semibold">{getBusyMessage()}</span>
        </div>
      )}
      {/* Page header with Save button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 gap-2">
        <h1 className="text-2xl font-bold">Settings</h1>
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
                className="w-full max-w-xs"
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

      {/* Quick actions */}
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-200">Manual triggers for account updates and calculations.</CardDescription>
          </div>
          <Button
            onClick={handleAllActions}
            className="ml-2 px-4 py-2 text-base font-semibold shadow whitespace-nowrap min-w-[120px]"
            variant="primary"
            title="Run All"
            disabled={busy}
          >
            {busy && activeAction === 'all' ? <Loader className="animate-spin" size={18} /> : '🚀'} {busy && activeAction === 'all' && runAllStep ? 'Running...' : 'Run All'}
          </Button>
        </CardHeader>
        <CardContent>
          {/* Main Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            <Button className="w-full inline-flex items-center gap-2 px-4 py-2 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow" onClick={handleRefreshAccounts} disabled={busy}>
              {busy && activeAction === 'refresh' ? <Loader className="animate-spin" size={18} /> : <span role="img" aria-label="refresh">🔄</span>}
              Refresh Accounts
            </Button>
            <Button className="w-full inline-flex items-center gap-2 px-4 py-2 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow" onClick={handleUpdateBalance} disabled={busy}>
              {busy && activeAction === 'balance' ? <Loader className="animate-spin" size={18} /> : <span role="img" aria-label="balance">💰</span>}
              Update Balance
            </Button>
            <Button className="w-full inline-flex items-center gap-2 px-4 py-2 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow" onClick={handleRecalculate} disabled={busy}>
              {busy && activeAction === 'projection' ? <Loader className="animate-spin" size={18} /> : <span role="img" aria-label="projection">📊</span>}
              Budget Projection
            </Button>
            <Button className="w-full inline-flex items-center gap-2 px-4 py-2 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow" onClick={handleSyncCalendar} disabled={busy}>
              {busy && activeAction === 'calendar' ? <Loader className="animate-spin" size={18} /> : <span role="img" aria-label="calendar">📅</span>}
              Sync Calendar
            </Button>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 my-4" />
          {/* Maintenance Actions */}
          <div>
            <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-200 mb-2">Maintenance</h4>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={handleValidateProjections} variant="outline" className="w-full sm:w-auto" disabled={busy}>
                {busy && activeAction === 'validate' ? <Loader className="animate-spin" size={18} /> : '🧮'} Validate Projections
              </Button>
              <Button onClick={handleClearCalendars} variant="outline" className="w-full sm:w-auto" disabled={busy}>
                {busy && activeAction === 'clear' ? <Loader className="animate-spin" size={18} /> : '🧹'} Clear Calendars
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top row: Calendar Mode (left), (right column can be empty or another card) */}
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
              Import, export, or download a sample CSV of your bills.
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
                    const { data: bills } = await supabase
                      .from('bills')
                      .select('*')
                      .order('start_date', { ascending: true });
                    
                    if (!bills) return;
                    
                    const headers = ['Name', 'Category', 'Amount', 'Repeats Every', 'Frequency', 'Start Date', 'End Date', 'Owner', 'Note'];
                    const csvContent = [
                      headers.join(','),
                      ...bills.map(bill => [
                        `"${bill.name}"`,
                        `"${bill.category}"`,
                        bill.amount < 0 ? `-$${Math.abs(bill.amount).toFixed(2)}` : `$${bill.amount.toFixed(2)}`,
                        bill.repeats_every,
                        `"${bill.frequency}"`,
                        `"${format(parseISO(bill.start_date), 'M/d/yyyy')}"`,
                        bill.end_date ? `"${format(parseISO(bill.end_date), 'M/d/yyyy')}"` : '',
                        bill.owner ? `"${bill.owner}"` : '',
                        bill.note ? `"${bill.note}"` : ''
                      ].join(','))
                    ].join('\n');
                    
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `bills-export-${new Date().toISOString().split('T')[0]}.csv`;
                    link.click();
                  } catch (error) {
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
                  const headers = ['Name', 'Category', 'Amount', 'Repeats Every', 'Frequency', 'Start Date', 'End Date', 'Owner', 'Note'];
                  const sampleData = [
                    ['Rent', 'Housing', '-$2,000.00', '1', 'monthly', '1/1/2025', '', 'Both', 'Monthly rent payment'],
                    ['Paycheck', 'Paycheck', '$5,000.00', '2', 'weekly', '1/15/2025', '', 'Brady', 'Biweekly salary (every 2 weeks)'],
                    ['Netflix', 'Subscription', '-$15.99', '1', 'monthly', '1/1/2025', '', 'Both', 'Streaming service']
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