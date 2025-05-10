//src/pages/SettingsPage.tsx

import React, { useState, useRef } from 'react';
import { Calculator, RefreshCcw, Calendar, Upload } from 'lucide-react';
import { Button } from '../components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/Card';
import { triggerManualRecalculation } from '../api/projections';
import { refreshChaseBalanceInDb, refreshAccounts } from '../api/accounts';
import { useBalance } from '../context/BalanceContext';

export function SettingsPage() {
  const [busy, setBusy] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setBalance, setLastSync } = useBalance();

  const handleRefreshAccounts = async () => {
    try {
      setBusy(true);
      setError(null);
      await refreshAccounts();
      setLastAction('🔄 Accounts refresh triggered.');
    } catch (err: any) {
      console.error(err);
      setError(`Error refreshing accounts: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateBalance = async () => {
    try {
      setBusy(true);
      setError(null);

      const balance = await refreshChaseBalanceInDb();
      setBalance(balance);
      setLastSync(new Date());

      setLastAction(`💰 Chase balance updated: $${balance.toLocaleString()}`);
    } catch (err: any) {
      console.error(err);
      setError(`Error updating balance: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRecalculate = async () => {
    try {
      setBusy(true);
      setError(null);
      await triggerManualRecalculation();
      setLastAction('📊 Budget projections recalculated.');
    } catch (err: any) {
      console.error(err);
      setError('Error recalculating projections. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleSyncCalendar = async () => {
    try {
      setBusy(true);
      setError(null);
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-calendar`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!res.ok) throw new Error('Failed to sync calendar');
      setLastAction('📅 Calendar sync completed.');
    } catch (err: any) {
      console.error(err);
      setError('Error syncing calendar. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setBusy(true);
      setError(null);
      const text = await file.text();
      console.log('Imported CSV:', text);
      setLastAction('📥 Bills imported from CSV.');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      console.error(err);
      setError('Error importing CSV. Check the file format and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        Settings
      </h1>

      {lastAction && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded-md">
          {lastAction}
        </div>
      )}
      {error && <div className="text-red-600 dark:text-red-400">{error}</div>}

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Force‐run any of your nightly processes on demand.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleRefreshAccounts}
            isLoading={busy}
            leftIcon={<RefreshCcw size={16} />}
          >
            🔄 Refresh Accounts
          </Button>
          <Button
            onClick={handleUpdateBalance}
            isLoading={busy}
            leftIcon={<Calculator size={16} />}
          >
            💰 Update Balance
          </Button>
          <Button
            onClick={handleRecalculate}
            isLoading={busy}
            leftIcon={<Calculator size={16} />}
          >
            📊 Recalculate
          </Button>
          <Button
            onClick={handleSyncCalendar}
            isLoading={busy}
            leftIcon={<Calendar size={16} />}
          >
            📅 Sync Calendar
          </Button>
        </CardContent>
        <CardFooter className="border-t pt-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nightly jobs still run at 02:00 UTC — these just force them now.
          </p>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import Bills from CSV</CardTitle>
          <CardDescription>
            CSV must have columns: Name, Category, Amount, Frequency, Repeats
            Every, Start Date, End Date (optional), Owner, Note (optional).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            isLoading={busy}
            leftIcon={<Upload size={16} />}
          >
            📥 Import CSV
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}