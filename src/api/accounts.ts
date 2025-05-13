//src/api/accounts.ts

import { supabase } from "../lib/supabase";
import type { Account } from "../types";

// ── Supabase & external API config ───────────────────────────────────────
const FUNCTIONS_URL    = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL!;
const ANON_KEY         = import.meta.env.VITE_SUPABASE_ANON_KEY!;

// ── Supabase query functions ─────────────────────────────────────────────
export async function getAccounts(): Promise<Account[]> {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("display_name", { ascending: true });
  if (error) throw error;
  return data as Account[];
}

export async function getCheckingBalance(): Promise<number> {
  const { data, error } = await supabase
    .from("accounts")
    .select("last_balance")
    .eq("id", "checking")
    .single();
  if (error) throw error;
  return data.last_balance;
}

export async function getLastSyncTime(): Promise<Date | null> {
  const { data, error } = await supabase
    .from("accounts")
    .select("last_synced")
    .eq("id", "checking")
    .single();
  if (error) throw error;
  return data && data.last_synced ? new Date(data.last_synced) : null;
}

// ── Refresh accounts via Flask API ────────────────────────────────────────
export async function refreshAccountsViaFlask(): Promise<void> {
  const res = await fetch(import.meta.env.VITE_REFRESH_ACCOUNTS_API_URL!, {
    method: "GET",
    headers: {
      Authorization: `Basic ${btoa(import.meta.env.VITE_REFRESH_ACCOUNTS_API_AUTH!)}`,
    },
  });
  if (res.status !== 202) {
    throw new Error(`Flask refresh failed (${res.status}): ${await res.text()}`);
  }
}

// ── Supabase Edge Functions ──────────────────────────────────────────────
/**
 * 💰 Refresh Chase balance only (Supabase Edge Function)
 *    Now calls the function with proper headers and returns persisted balance.
 */
export async function refreshChaseBalanceInDb(): Promise<number> {
  const res = await fetch(`${FUNCTIONS_URL}/chase-balance`, {
    method: "GET",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Chase balance function failed: ${err}`);
  }
  const { balance } = (await res.json()) as { balance: number };
  return balance;
}

export async function getTransactionsReviewCount(): Promise<number> {
  const res = await fetch(`${FUNCTIONS_URL}/transactions-review`, {
    method: "GET",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Review count fetch failed: ${err}`);
  }
  const { transactions_to_review } = (await res.json()) as {
    transactions_to_review: number;
  };
  return transactions_to_review;
}