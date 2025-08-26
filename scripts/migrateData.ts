import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, writeBatch, Timestamp } from 'firebase/firestore';

// Initialize Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Firebase
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY!,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.VITE_FIREBASE_APP_ID!,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Type definitions based on Supabase schema
interface SupabaseAccount {
  id: string;
  display_name: string;
  last_balance: number;
  last_synced: string;
}

interface SupabaseBill {
  id: string;
  name: string;
  category: string;
  amount: number;
  frequency: string;
  repeats_every: number;
  start_date: string;
  end_date?: string;
  owner?: string;
  note?: string;
}

interface SupabaseCategory {
  id: string;
  name: string;
  created_at?: string;
}

interface SupabaseProjection {
  lowest?: boolean;
  highest?: boolean;
  proj_date?: string;
  projected_balance?: number;
  bills?: any;
}

interface SupabaseSettings {
  id: number;
  projection_days?: number;
  balance_threshold?: number;
  calendar_mode?: string;
  manual_balance_override?: number;
  last_projected_at?: string;
}

// Migration functions
export async function migrateAccounts() {
  console.log('🔄 Migrating accounts...');
  
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('*');
    
  if (error) {
    console.error('❌ Error fetching accounts:', error);
    throw error;
  }
  
  if (!accounts || accounts.length === 0) {
    console.log('⚠️ No accounts found to migrate');
    return;
  }

  const batch = writeBatch(db);
  
  accounts.forEach((account: SupabaseAccount) => {
    const docRef = doc(db, 'accounts', account.id);
    batch.set(docRef, {
      displayName: account.display_name,
      lastBalance: account.last_balance,
      lastSynced: Timestamp.fromDate(new Date(account.last_synced)),
    });
  });
  
  await batch.commit();
  console.log(`✅ Migrated ${accounts.length} accounts`);
}

export async function migrateBills() {
  console.log('🔄 Migrating bills...');
  
  const { data: bills, error } = await supabase
    .from('bills')
    .select('*');
    
  if (error) {
    console.error('❌ Error fetching bills:', error);
    throw error;
  }
  
  if (!bills || bills.length === 0) {
    console.log('⚠️ No bills found to migrate');
    return;
  }

  const batch = writeBatch(db);
  
  bills.forEach((bill: SupabaseBill) => {
    const docRef = doc(db, 'bills', bill.id);
    batch.set(docRef, {
      name: bill.name,
      category: bill.category,
      amount: bill.amount,
      frequency: bill.frequency,
      repeatsEvery: bill.repeats_every,
      startDate: bill.start_date,
      endDate: bill.end_date || null,
      owner: bill.owner || null,
      note: bill.note || null,
    });
  });
  
  await batch.commit();
  console.log(`✅ Migrated ${bills.length} bills`);
}

export async function migrateCategories() {
  console.log('🔄 Migrating categories...');
  
  const { data: categories, error } = await supabase
    .from('categories')
    .select('*');
    
  if (error) {
    console.error('❌ Error fetching categories:', error);
    throw error;
  }
  
  if (!categories || categories.length === 0) {
    console.log('⚠️ No categories found to migrate');
    return;
  }

  const batch = writeBatch(db);
  
  categories.forEach((category: SupabaseCategory) => {
    const docRef = doc(db, 'categories', category.id);
    batch.set(docRef, {
      name: category.name,
      createdAt: category.created_at 
        ? Timestamp.fromDate(new Date(category.created_at))
        : Timestamp.now(),
    });
  });
  
  await batch.commit();
  console.log(`✅ Migrated ${categories.length} categories`);
}

export async function migrateProjections() {
  console.log('🔄 Migrating projections...');
  
  const { data: projections, error } = await supabase
    .from('projections')
    .select('*');
    
  if (error) {
    console.error('❌ Error fetching projections:', error);
    throw error;
  }
  
  if (!projections || projections.length === 0) {
    console.log('⚠️ No projections found to migrate');
    return;
  }

  const batch = writeBatch(db);
  
  projections.forEach((projection: SupabaseProjection, index: number) => {
    // Use proj_date as doc ID, fallback to index if no date
    const docId = projection.proj_date || `projection_${index}`;
    const docRef = doc(db, 'projections', docId);
    
    batch.set(docRef, {
      lowest: projection.lowest || false,
      highest: projection.highest || false,
      projectedBalance: projection.projected_balance || 0,
      bills: projection.bills || null,
      projDate: projection.proj_date || null,
    });
  });
  
  await batch.commit();
  console.log(`✅ Migrated ${projections.length} projections`);
}

export async function migrateSettings() {
  console.log('🔄 Migrating settings...');
  
  const { data: settings, error } = await supabase
    .from('settings')
    .select('*')
    .limit(1);
    
  if (error) {
    console.error('❌ Error fetching settings:', error);
    throw error;
  }
  
  if (!settings || settings.length === 0) {
    console.log('⚠️ No settings found to migrate');
    return;
  }

  // Take the first settings record (should only be one)
  const setting = settings[0] as SupabaseSettings;
  
  const docRef = doc(db, 'settings', 'config');
  await setDoc(docRef, {
    projectionDays: setting.projection_days || 7,
    balanceThreshold: setting.balance_threshold || 1000,
    calendarMode: setting.calendar_mode || 'prod',
    manualBalanceOverride: setting.manual_balance_override || null,
    lastProjectedAt: setting.last_projected_at 
      ? Timestamp.fromDate(new Date(setting.last_projected_at))
      : null,
  });
  
  console.log('✅ Migrated settings configuration');
}

// Main migration function
async function runMigration() {
  console.log('🚀 Starting Supabase to Firebase migration...\n');
  
  try {
    // Run migrations in order
    await migrateAccounts();
    await migrateBills();
    await migrateCategories();
    await migrateSettings();
    await migrateProjections();
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Verify data in Firebase Console');
    console.log('2. Test Firebase queries');
    console.log('3. Update frontend to use Firebase');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Export for individual testing
export { runMigration };

// Run migration if this file is executed directly
runMigration().then(() => {
  console.log('Migration script completed');
  process.exit(0);
}).catch((error) => {
  console.error('Migration script failed:', error);
  process.exit(1);
});
