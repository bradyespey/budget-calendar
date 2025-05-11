import React, { useState, useRef } from "react";
import { Calculator, RefreshCcw, Calendar, Upload } from "lucide-react";
import { Button } from "../components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/Card";
import { triggerManualRecalculation } from "../api/projections";
import {
  refreshAccountsViaFlask,
  refreshChaseBalanceInDb,
} from "../api/accounts";
import { useBalance } from "../context/BalanceContext";

export function SettingsPage() {
  const [busy, setBusy] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setBalance, setLastSync } = useBalance();

  // ── 🔄 Refresh ALL Accounts ─────────────────────────────
  const handleRefreshAccounts = async () => {
    setBusy(true);
    setError(null);
    try {
      await refreshAccountsViaFlask();
      setLastAction("🔄 Accounts refresh triggered.");
    } catch (e: any) {
      console.error(e);
      setError(`Error refreshing accounts: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  // ── 💰 Update Chase Balance ─────────────────────────────
  const handleUpdateBalance = async () => {
    setBusy(true);
    setError(null);
    try {
      const bal = await refreshChaseBalanceInDb();
      setBalance(bal);
      setLastSync(new Date());
      setLastAction(`💰 Chase balance updated: $${bal.toLocaleString()}`);
    } catch (e: any) {
      console.error(e);
      setError(`Error updating balance: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  // ── 📊 Recalculate Projections ─────────────────────────
  const handleRecalculate = async () => {
    setBusy(true);
    setError(null);
    try {
      await triggerManualRecalculation();
      setLastAction("📊 Budget projections recalculated.");
    } catch {
      setError("Error recalculating projections.");
    } finally {
      setBusy(false);
    }
  };

  // ── 📅 Sync Calendar ────────────────────────────────────
  const handleSyncCalendar = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-calendar`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
        },
      );
      if (!res.ok) throw new Error("Calendar sync failed");
      setLastAction("📅 Calendar sync completed.");
    } catch (e: any) {
      console.error(e);
      setError(`Error syncing calendar: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  // ── 📥 Import CSV ───────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      await f.text();
      setLastAction("📥 Bills imported from CSV.");
    } catch {
      setError("Error importing CSV. Check the file format.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Settings</h1>

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
          <p className="text-sm text-gray-500">
            Nightly jobs still run at 02:00 UTC — these just force them now.
          </p>
        </CardFooter>
      </Card>

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
            📥 Import CSV
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}