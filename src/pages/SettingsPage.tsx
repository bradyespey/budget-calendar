//src/pages/SettingsPage.tsx

import { useState, useRef, useEffect } from 'react'
import {
  Calculator,
  RefreshCcw,
  Calendar,
  Upload,
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
    setBusy(true);
    try {
      await saveSettings();
      await refreshAccountsViaFlask();
      showNotification('Accounts refreshed.', 'success');
    } catch (e: any) {
      showNotification(`Error refreshing accounts: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateBalance() {
    setBusy(true);
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
    }
  }

  async function handleRecalculate() {
    setBusy(true);
    try {
      await saveSettings();
      await triggerManualRecalculation();
      showNotification('Budget projections recalculated.', 'success');
    } catch (e: any) {
      showNotification('Error recalculating projections.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncCalendar() {
    setBusy(true);
    try {
      await saveSettings();
      const { data: settings } = await supabase.from('settings').select('projection_days').eq('id', 1).maybeSingle();
      const days = settings?.projection_days || 30;
      const clearRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clear-calendars?env=${calendarMode}&days=${days}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!clearRes.ok) throw new Error('Clear calendars failed');
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
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true);
    try {
      await file.text()
    } catch {
      console.error('Error importing CSV. Check file format.')
    } finally {
      fileInputRef.current!.value = ''
      setBusy(false)
    }
  }

  async function handleSave() {
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
    setBusy(true);
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
    }
  }

  async function handleAllActions() {
    setBusy(true);
    try {
      await handleRefreshAccounts();
      await handleUpdateBalance();
      await handleRecalculate();
      await handleSyncCalendar();
      await handleClearCalendars();
      showNotification('All actions completed.', 'success');
    } catch (e: any) {
      showNotification(`Error running all actions: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  // Helper to format as $X,XXX (no cents)
  function formatCurrencyNoCents(val: string | number) {
    if (val === "" || val === null || isNaN(Number(val))) return "";
    return "$" + Number(val).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {busy && (
        <div className="flex items-center justify-center mb-4">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mr-2"></div>
          <span className="text-blue-600 dark:text-blue-200 font-semibold">Working...</span>
        </div>
      )}
      {/* Page header with Save button */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">Settings</h1>
        <button
          onClick={handleSave}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded shadow disabled:opacity-50 disabled:cursor-not-allowed transition"
          style={{ minWidth: 100 }}
        >
          Save
        </button>
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
      <Card>
        <CardHeader className="!border-b-0">
          <CardTitle>Budget Projection Settings</CardTitle>
          <CardDescription>
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
                className="w-full"
                disabled={localProjectionDays === null}
              />
              <p className="text-sm text-gray-500">
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
                className="w-full"
                disabled={balanceThresholdInput === null}
              />
              <p className="text-sm text-gray-500">
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
                  className="w-full"
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
              <p className="text-sm text-gray-500">
                Override live balance for projections (optional)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Manual triggers for account updates and calculations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button onClick={handleRefreshAccounts} disabled={busy} className="w-full">
              <RefreshCcw className="mr-2 h-4 w-4" /> Refresh Accounts
            </Button>
            <Button onClick={handleUpdateBalance} disabled={busy} className="w-full">
              <Calculator className="mr-2 h-4 w-4" /> Update Balance
            </Button>
            <Button onClick={handleRecalculate} disabled={busy} className="w-full">
              <Calculator className="mr-2 h-4 w-4" /> Budget Projection
            </Button>
            <Button onClick={handleSyncCalendar} disabled={busy} className="w-full">
              <Calendar className="mr-2 h-4 w-4" /> Sync Calendar
            </Button>
            <Button onClick={handleClearCalendars} disabled={busy} className="w-full">
              <Calendar className="mr-2 h-4 w-4" /> Clear Calendars
            </Button>
            <Button onClick={handleAllActions} disabled={busy} className="w-full">
              <RefreshCcw className="mr-2 h-4 w-4" /> Run All Actions
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Top row: Calendar Mode (left), (right column can be empty or another card) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="flex flex-col h-full">
          <CardHeader>
            <CardTitle>Calendar Mode</CardTitle>
            <CardDescription>
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
                  <span className="font-semibold">Main Calendars</span> <span className="text-xs text-gray-500">(bradyjennytx@gmail.com)</span>
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
                  <span className="font-semibold">Testing Calendars</span> <span className="text-xs text-gray-500">(baespey@gmail.com)</span>
                </span>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Import Bills from CSV Card */}
        <Card className="import-bills-card">
          <CardHeader className="import-bills-header">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Import Bills from CSV</CardTitle>
                <CardDescription>
                  CSV columns: Name, Category, Amount, Frequency, Repeats Every, Start Date, End Date, Owner, Note.
                </CardDescription>
              </div>
              <Button
                onClick={() => fileInputRef.current?.click()}
                isLoading={busy}
                leftIcon={<Upload size={16} />}
                className="ml-4"
              >
                Import CSV
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </CardHeader>
        </Card>
      </div>
    </div>
  )
}