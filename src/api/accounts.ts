//src/api/accounts.ts

import { supabase } from "../lib/supabase";
import type { Account } from "../types";

// ── Supabase & external API config ───────────────────────────────────────
const FUNCTIONS_URL      = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL!;
const REFRESH_API_URL    = import.meta.env.VITE_REFRESH_ACCOUNTS_API_URL!;
const REFRESH_API_AUTH   = import.meta.env.VITE_REFRESH_ACCOUNTS_API_AUTH!;

// ── Supabase query functions ─────────────────────────────────────────────
export async function getAccounts(): Promise<Account[]> {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("display_name", { ascending: true });
  if (error) throw error;
  return data as Account[];
}

export async function getTotalBalance(): Promise<number> {
  const { data, error } = await supabase
    .from("accounts")
    .select("last_balance");
  if (error) throw error;
  return (data as { last_balance: number }[])
    .reduce((sum, a) => sum + a.last_balance, 0);
}

export async function getLastSyncTime(): Promise<Date | null> {
  const { data, error } = await supabase
    .from("accounts")
    .select("last_synced")
    .order("last_synced", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data.length ? new Date(data[0].last_synced) : null;
}

// ── Refresh accounts via Flask API ────────────────────────────────────────
export async function refreshAccountsViaFlask(): Promise<void> {
  const res = await fetch(REFRESH_API_URL, {
    method: "GET",
    headers: { Authorization: `Basic ${btoa(REFRESH_API_AUTH)}` },
  });
  if (res.status !== 202) {
    const txt = await res.text();
    throw new Error(`Flask refresh failed (${res.status}): ${txt}`);
  }
}

// ── Supabase Edge Functions ──────────────────────────────────────────────
export async function refreshChaseBalanceInDb(): Promise<number> {
  const { data, error } = await supabase.functions.invoke("chase-balance");
  if (error) throw error;
  const balance = (data as any).balance as number;

  const { error: dbError } = await supabase
    .from("accounts")
    .upsert(
      {
        id: "joint_checking",
        display_name: "Joint Checking",
        last_balance: balance,
        last_synced: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  if (dbError) throw dbError;

  return balance;
}

export async function getTransactionsReviewCount(): Promise<number> {
  const res = await fetch(`${FUNCTIONS_URL}/transactions-review`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Review count fetch failed: ${err}`);
  }
  const json = await res.json();
  return (json as { transactions_to_review: number }).transactions_to_review;
}