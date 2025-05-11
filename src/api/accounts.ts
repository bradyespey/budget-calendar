//src/api/accounts.ts

import { supabase } from "../lib/supabase";
import type { Account } from "../types";

const FN   = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL!;
const API  = import.meta.env.VITE_REFRESH_ACCOUNTS_API_URL!;
const CREDS = import.meta.env.VITE_REFRESH_ACCOUNTS_API_AUTH!;  // "user:pass"

/**
 * Fetch all account records.
 */
export async function getAccounts(): Promise<Account[]> {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("display_name", { ascending: true });
  if (error) throw error;
  return data as Account[];
}

/**
 * Sum up all last_balance fields.
 */
export async function getTotalBalance(): Promise<number> {
  const { data, error } = await supabase
    .from("accounts")
    .select("last_balance");
  if (error) throw error;
  return data.reduce((sum, a) => sum + a.last_balance, 0);
}

/**
 * Fetch the most recent last_synced timestamp.
 */
export async function getLastSyncTime(): Promise<Date | null> {
  const { data, error } = await supabase
    .from("accounts")
    .select("last_synced")
    .order("last_synced", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data.length ? new Date(data[0].last_synced) : null;
}

/**
 * 🔄 Refresh ALL Monarch accounts via your Flask server
 */
export async function refreshAccountsViaFlask(): Promise<void> {
  const res = await fetch(API, {
    method : "GET",
    headers: { Authorization: `Basic ${btoa(CREDS)}` },
  });
  if (res.status !== 202) {                         // ⟵ was 200
    throw new Error(`Flask refresh failed (${res.status}): ${await res.text()}`);
  }
}

/**
 * 💰 Refresh Chase balance only (Supabase Edge Function)
 */
export async function refreshChaseBalanceInDb(): Promise<number> {
  const { data, error } = await supabase.functions.invoke("chase-balance");
  if (error) throw error;
  const balance = (data as any).balance as number;

  const { error: dbErr } = await supabase
    .from("accounts")
    .upsert(
      {
        id: "joint_checking",
        display_name: "Joint Checking",
        last_balance: balance,
        last_synced: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  if (dbErr) throw dbErr;

  return balance;
}

/**
 * 🔢 Transactions-to-review count (Supabase Edge Function)
 */
export async function getTransactionsReviewCount(): Promise<number> {
  const res = await fetch(`${FN}/transactions-review`, { method: "GET" });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Review count fetch failed: ${err}`);
  }
  const json = await res.json();
  return (json as any).transactions_to_review as number;
}