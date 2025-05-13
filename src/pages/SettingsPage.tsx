//src/pages/SettingsPage.tsx

import { useState, useRef } from 'react'
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
  CardFooter,
} from '../components/ui/Card'
import {
  refreshAccountsViaFlask,
  refreshChaseBalanceInDb,
  getLastSyncTime,            // ← import this
} from '../api/accounts'
import { triggerManualRecalculation } from '../api/projections'
import { useBalance } from '../context/BalanceContext'

export function SettingsPage() {
  const [busy, setBusy] = useState(false)
  const [lastAction, setLastAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { setBalance, setLastSync, refreshBalance } = useBalance()

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
    } catch {
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

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Force-run any nightly job on demand.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            onClick={handleRefreshAccounts}
            isLoading={busy}
            leftIcon={<RefreshCcw size={16} />}
          >
            Refresh Accounts
          </Button>
          <Button
            onClick={handleUpdateBalance}
            isLoading={busy}
            leftIcon={<Calculator size={16} />}
          >
            Update Balance
          </Button>
          <Button
            onClick={handleRecalculate}
            isLoading={busy}
            leftIcon={<Calculator size={16} />}
          >
            Recalculate
          </Button>
          <Button
            onClick={handleSyncCalendar}
            isLoading={busy}
            leftIcon={<Calendar size={16} />}
          >
            Sync Calendar
          </Button>
        </CardContent>
        <CardFooter className="border-t pt-4">
          <p className="text-sm text-gray-500">
            Nightly jobs still run at 02:00 UTC — these just trigger them now.
          </p>
        </CardFooter>
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