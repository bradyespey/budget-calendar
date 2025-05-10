//src/api/accounts.ts

import { supabase } from '../lib/supabase';
import type { Account } from '../types';

const FN = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL!;

/**
 * Fetch all account records.
 */
export async function getAccounts(): Promise<Account[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .order('display_name', { ascending: true });
  if (error) throw error;
  return data as Account[];
}

/**
 * Sum up all last_balance fields across accounts.
 */
export async function getTotalBalance(): Promise<number> {
  const { data, error } = await supabase
    .from('accounts')
    .select('last_balance');
  if (error) throw error;
  return data.reduce((sum, a) => sum + a.last_balance, 0);
}

/**
 * Fetch the most recent last_synced timestamp.
 */
export async function getLastSyncTime(): Promise<Date | null> {
  const { data, error } = await supabase
    .from('accounts')
    .select('last_synced')
    .order('last_synced', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data.length > 0 ? new Date(data[0].last_synced) : null;
}

/* -------- refresh ALL Monarch accounts -------- */
export async function refreshAccounts(): Promise<void> {
  const { error } = await supabase.functions.invoke('refresh-accounts')
  if (error) throw error
}

/* -------- refresh Chase balance -------- */
export async function refreshChaseBalanceInDb(): Promise<number> {
  /* call Edge Function with the client helper – it attaches the right headers */
  const { data, error } = await supabase.functions.invoke('chase-balance')
  if (error) throw error

  const balance = (data as any).balance as number

  /* upsert into DB */
  const { error: dbErr } = await supabase
    .from('accounts')
    .upsert(
      {
        id:           'joint_checking',
        display_name: 'Joint Checking',
        last_balance: balance,
        last_synced:  new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
  if (dbErr) throw dbErr

  return balance
}

/**
 * Fetch count of transactions awaiting review.
 */
export async function getTransactionsReviewCount(): Promise<number> {
  const res = await fetch(`${FN}/transactions-review`, { method: 'GET' });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Review count fetch failed: ${err}`);
  }
  const { count } = await res.json();
  return count;
}