//old/SettingsPage_old1.tsx

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
  getLastSyncTime,            // ← import this
} from '../api/accounts'
import { triggerManualRecalculation } from '../api/projections'
import { useBalance } from '../context/BalanceContext'
import { useSettingsStore } from '../stores/settingsStore'
import { supabase } from '../lib/supabase'

// Helper functions (add these at the top of your file)
function formatNumberWithCommas(num: number | string): string {
  if (num === null || num === undefined || num === "") return "";
  return Number(num).toLocaleString("en-US");
}

function formatCurrency(num: number | string): string {
  if (num === null || num === undefined || num === "") return "";
  return "$" + Number(num).toLocaleString("en-US");
}

export function SettingsPage() {
  const [busy, setBusy] = useState(false)
  const [lastAction, setLastAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { setBalance, setLastSync } = useBalance()
  const { projectionDays, balanceThreshold, setProjectionDays, setBalanceThreshold } = useSettingsStore()
  const [localProjectionDays, setLocalProjectionDays] = useState<number>(projectionDays)
  const [localBalanceThreshold, setLocalBalanceThreshold] = useState<number>(balanceThreshold)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [daysError, setDaysError] = useState<string | null>(null)

  // Load current settings from Supabase on mount
  useEffect(() => {
    async function fetchSettings() {
      const { data } = await supabase
        .from('settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      const daysToProject = data?.projection_days ?? 7; // <--- fallback to 7 if not found

      if (data) {
        setProjectionDays(data.projection_days)
        setBalanceThreshold(data.balance_threshold)
      }

      console.log('Using daysToProject:', daysToProject);
    }
    fetchSettings()
  }, [])

  useEffect(() => {
    setLocalProjectionDays(projectionDays);
    setLocalBalanceThreshold(balanceThreshold);
  }, [projectionDays, balanceThreshold]);

  // ── Refresh all accounts ──────────────────────────────────────────────
  async function handleRefreshAccounts() {
    setBusy(true); setError(null)
    try {
      await refreshAccountsViaFlask()
      setLastAction('Accounts refresh triggered.')
    } catch (e: any) {
      console.error(e)
      setError(`Error refreshing accounts: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  // ── Update Chase balance ──────────────────────────────────────────────
  async function handleUpdateBalance() {
    setBusy(true)
    setError(null)
    try {
      // fetch & persist via Edge Function
      const bal = await refreshChaseBalanceInDb()
      
      // now re‐fetch the true last_synced time from the DB
      const freshSync = await getLastSyncTime()
      if (freshSync) {
        setLastSync(freshSync)
      }

      // Update the balance in the UI
      await setBalance(bal)

      setLastAction(`Chase balance updated: $${bal.toLocaleString()}`)
    } catch (e: any) {
      console.error(e)
      setError(`Error updating balance: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  // ── Recalculate projections ──────────────────────────────────────────
  async function handleRecalculate() {
    setBusy(true); setError(null)
    try {
      await triggerManualRecalculation()
      setLastAction('Budget projections recalculated.')
    } catch (e: any) {
      console.error(e)
      setError('Error recalculating projections.')
    } finally {
      setBusy(false)
    }
  }

  // ── Sync Google Calendar ─────────────────────────────────────────────
  async function handleSyncCalendar() {
    setBusy(true); setError(null)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-calendar`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      )
      if (!res.ok) throw new Error('Calendar sync failed')
      setLastAction('Calendar sync completed.')
    } catch (e: any) {
      console.error(e)
      setError(`Error syncing calendar: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  // ── Import bills CSV ────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setError(null)
    try {
      await file.text()
      setLastAction('Bills imported from CSV.')
    } catch {
      setError('Error importing CSV. Check file format.')
    } finally {
      fileInputRef.current!.value = ''
      setBusy(false)
    }
  }

  // Save handler
  async function handleSave() {
    if (daysError) {
      setSaveMessage("Please fix errors before saving.");
      return;
    }
    setSaving(true);
    setSaveMessage('');
    const days = Number(localProjectionDays);
    const threshold = Number(localBalanceThreshold);

    const { error } = await supabase
      .from('settings')
      .update({ projection_days: days, balance_threshold: threshold })
      .eq('id', 1);

    if (!error) {
      setProjectionDays(days);
      setBalanceThreshold(threshold);
    }

    setSaving(false);
    setSaveMessage(error ? 'Error saving settings.' : 'Settings saved!');
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Last action / error messages */}
      {lastAction && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded">
          {lastAction}
        </div>
      )}
      {error && (
        <div className="text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Budget Projection Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Budget Projection Settings</CardTitle>
          <CardDescription>Configure how far ahead to project balances and set low balance alerts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="projectionDays" className="text-sm font-medium">
                Days to Project
              </label>
              <Input
                id="projectionDays"
                type="text"
                inputMode="numeric"
                value={formatNumberWithCommas(localProjectionDays)}
                onChange={e => {
                  const raw = e.target.value.replace(/,/g, "");
                  let value = raw === "" ? 1 : Number(raw);
                  if (value > 365) value = 365;
                  if (value < 1) value = 1;
                  setLocalProjectionDays(value);
                  setDaysError(null); // No error, since we always clamp
                }}
                className="w-full"
              />
              <p className="text-sm text-gray-500">
                How many days ahead to project balances (1-365)
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="balanceThreshold" className="text-sm font-medium">
                Low Balance Alert
              </label>
              <Input
                id="balanceThreshold"
                type="text"
                inputMode="numeric"
                value={formatCurrency(localBalanceThreshold)}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9]/g, "");
                  setLocalBalanceThreshold(raw === "" ? 0 : Number(raw));
                }}
                className="w-full"
              />
              <p className="text-sm text-gray-500">
                Alert when projected balance falls below this amount
              </p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-6 px-8 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded shadow disabled:opacity-50 disabled:cursor-not-allowed transition mx-auto block"
            style={{ maxWidth: 200 }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {saveMessage && <div>{saveMessage}</div>}
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
            <Button
              onClick={handleRefreshAccounts}
              disabled={busy}
              className="w-full"
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh Accounts
            </Button>
            <Button
              onClick={handleUpdateBalance}
              disabled={busy}
              className="w-full"
            >
              <Calculator className="mr-2 h-4 w-4" />
              Update Balance
            </Button>
            <Button
              onClick={handleRecalculate}
              disabled={busy}
              className="w-full"
            >
              <Calculator className="mr-2 h-4 w-4" />
              Budget Projection
            </Button>
            <Button
              onClick={handleSyncCalendar}
              disabled={busy}
              className="w-full"
            >
              <Calendar className="mr-2 h-4 w-4" />
              Sync Calendar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* CSV import */}
      <Card>
        <CardHeader>
          <CardTitle>Import Bills from CSV</CardTitle>
          <CardDescription>
            CSV columns: Name, Category, Amount, Frequency, Repeats Every, Start Date, End Date, Owner, Note.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            isLoading={busy}
            leftIcon={<Upload size={16} />}
          >
            Import CSV
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}