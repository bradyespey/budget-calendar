import { supabase } from '../lib/supabase';
import { Account } from '../types';

export async function getAccounts() {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .order('display_name', { ascending: true });
    
  if (error) {
    console.error('Error fetching accounts:', error);
    throw error;
  }
  
  return data as Account[];
}

export async function getTotalBalance() {
  const { data, error } = await supabase
    .from('accounts')
    .select('last_balance');
    
  if (error) {
    console.error('Error fetching total balance:', error);
    throw error;
  }
  
  return data.reduce((sum, account) => sum + account.last_balance, 0);
}

export async function getLastSyncTime() {
  const { data, error } = await supabase
    .from('accounts')
    .select('last_synced')
    .order('last_synced', { ascending: false })
    .limit(1);
    
  if (error) {
    console.error('Error fetching last sync time:', error);
    throw error;
  }
  
  return data.length > 0 ? new Date(data[0].last_synced) : null;
}

export async function refreshAccounts() {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refresh-accounts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to refresh accounts');
  }

  return response.json();
}

export async function getChaseBalance() {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-chase-balance`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get Chase balance');
  }

  return response.json();
}