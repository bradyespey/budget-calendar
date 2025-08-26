import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;

console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key exists:', !!supabaseKey);

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAccess() {
  console.log('\n🔍 Testing Supabase table access...\n');

  // Test accounts
  console.log('Testing accounts table...');
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('*');
  console.log('Accounts result:', { count: accounts?.length || 0, error: accountsError });
  if (accounts?.length) {
    console.log('Sample account:', accounts[0]);
  }

  // Test bills
  console.log('\nTesting bills table...');
  const { data: bills, error: billsError } = await supabase
    .from('bills')
    .select('*');
  console.log('Bills result:', { count: bills?.length || 0, error: billsError });
  if (bills?.length) {
    console.log('Sample bill:', bills[0]);
  }

  // Test settings
  console.log('\nTesting settings table...');
  const { data: settings, error: settingsError } = await supabase
    .from('settings')
    .select('*');
  console.log('Settings result:', { count: settings?.length || 0, error: settingsError });
  if (settings?.length) {
    console.log('Sample setting:', settings[0]);
  }

  // Test categories (this worked)
  console.log('\nTesting categories table...');
  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .select('*');
  console.log('Categories result:', { count: categories?.length || 0, error: categoriesError });
}

testAccess().catch(console.error);
