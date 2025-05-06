//src/api/bills.ts

import { supabase } from '../lib/supabase';
import { Bill } from '../types';

export async function getBills() {
  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .order('start_date', { ascending: true });
    
  if (error) {
    console.error('Error fetching bills:', error);
    throw error;
  }
  
  return data as Bill[];
}

export async function getBill(id: string) {
  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .eq('id', id)
    .single();
    
  if (error) {
    console.error(`Error fetching bill ${id}:`, error);
    throw error;
  }
  
  return data as Bill;
}

export async function createBill(bill: Omit<Bill, 'id'>) {
  const { data, error } = await supabase
    .from('bills')
    .insert(bill)
    .select()
    .single();
    
  if (error) {
    console.error('Error creating bill:', error);
    throw error;
  }
  
  return data as Bill;
}

export async function updateBill(id: string, updates: Partial<Omit<Bill, 'id'>>) {
  const { data, error } = await supabase
    .from('bills')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
    
  if (error) {
    console.error(`Error updating bill ${id}:`, error);
    throw error;
  }
  
  return data as Bill;
}

export async function deleteBill(id: string) {
  const { error } = await supabase
    .from('bills')
    .delete()
    .eq('id', id);
    
  if (error) {
    console.error(`Error deleting bill ${id}:`, error);
    throw error;
  }
  
  return true;
}

// Import bills from CSV data
export async function importBills(bills: Array<{
  name: string;
  category: string;
  amount: number;
  repeats_every: number;
  frequency: string;
  start_date: string;
  end_date?: string;
  owner?: string;
  note?: string;
}>) {
  const { error } = await supabase
    .from('bills')
    .insert(bills);

  if (error) {
    console.error('Error importing bills:', error);
    throw error;
  }

  return true;
}