//src/api/accounts.ts

import { supabase } from '../lib/supabase'
import type { Account } from '../types'

const FN = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL!

export async function getAccounts(): Promise<Account[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .order('display_name', { ascending: true })
  if (error) {
    console.error('Error fetching accounts:', error)
    throw error
  }
  return data as Account[]
}

export async function getTotalBalance(): Promise<number> {
  const { data, error } = await supabase
    .from('accounts')
    .select('last_balance')
  if (error) {
    console.error('Error fetching total balance:', error)
    throw error
  }
  return data.reduce((sum, a) => sum + a.last_balance, 0)
}

export async function getLastSyncTime(): Promise<Date | null> {
  const { data, error } = await supabase
    .from('accounts')
    .select('last_synced')
    .order('last_synced', { ascending: false })
    .limit(1)
  if (error) {
    console.error('Error fetching last sync time:', error)
    throw error
  }
  return data.length > 0 ? new Date(data[0].last_synced) : null
}

export async function refreshAccounts(): Promise<{ success: boolean }> {
  const res = await fetch(`${FN}/refresh-accounts`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Refresh failed: ${err}`)
  }
  return res.json()
}

/**
 * Calls your Supabase Edge Function to get the latest Chase balance
 * (using Monarch under the hood).
 */
export async function getChaseBalance(): Promise<number> {
  const res = await fetch(`${FN}/chase-balance`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`fetch chase-balance failed: ${err}`)
  }
  const { balance } = await res.json()
  return balance
}

export async function getTransactionsReviewCount(): Promise<number> {
  const res = await fetch(`${FN}/transactions-review`, { method: 'GET' })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Review count fetch failed: ${err}`)
  }
  const { count } = await res.json()
  return count
}