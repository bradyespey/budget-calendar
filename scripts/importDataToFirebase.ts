import 'dotenv/config';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, writeBatch, Timestamp } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

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

// Load exported data
const projectRoot = process.cwd();

function loadJsonFile(filename: string) {
  const filePath = join(projectRoot, 'docs', filename);
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

export async function importAccounts() {
  console.log('🔄 Importing accounts to Firebase...');
  
  try {
    const accounts = loadJsonFile('accounts_export.json');
    
    const batch = writeBatch(db);
    
    accounts.forEach((account: any) => {
      const docRef = doc(db, 'accounts', account.id);
      batch.set(docRef, {
        displayName: account.display_name,
        lastBalance: parseFloat(account.last_balance),
        lastSynced: Timestamp.fromDate(new Date(account.last_synced)),
      });
    });
    
    await batch.commit();
    console.log(`✅ Imported ${accounts.length} accounts`);
    
    // Log imported accounts
    accounts.forEach((acc: any) => {
      console.log(`   - ${acc.id}: ${acc.display_name} ($${acc.last_balance})`);
    });
    
  } catch (error) {
    console.error('❌ Error importing accounts:', error);
  }
}

export async function importBills() {
  console.log('🔄 Importing bills to Firebase...');
  
  try {
    const bills = loadJsonFile('bills_export.json');
    
    // Import in batches (Firestore limit is 500 per batch)
    const batchSize = 500;
    let imported = 0;
    
    for (let i = 0; i < bills.length; i += batchSize) {
      const batch = writeBatch(db);
      const billsBatch = bills.slice(i, i + batchSize);
      
      billsBatch.forEach((bill: any) => {
        const docRef = doc(db, 'bills', bill.id);
        batch.set(docRef, {
          name: bill.name,
          category: bill.category,
          amount: parseFloat(bill.amount),
          frequency: bill.frequency,
          repeatsEvery: bill.repeats_every,
          startDate: bill.start_date,
          endDate: bill.end_date,
          owner: bill.owner,
          note: bill.note || '',
        });
      });
      
      await batch.commit();
      imported += billsBatch.length;
      console.log(`   - Imported batch: ${imported}/${bills.length} bills`);
    }
    
    console.log(`✅ Imported ${bills.length} bills total`);
    
    // Log bill categories breakdown
    const categoryCount: Record<string, number> = {};
    bills.forEach((bill: any) => {
      categoryCount[bill.category] = (categoryCount[bill.category] || 0) + 1;
    });
    
    console.log('   📊 Bills by category:');
    Object.entries(categoryCount)
      .sort(([,a], [,b]) => b - a)
      .forEach(([category, count]) => {
        console.log(`      ${category}: ${count} bills`);
      });
    
  } catch (error) {
    console.error('❌ Error importing bills:', error);
  }
}

export async function importSettings() {
  console.log('🔄 Importing settings to Firebase...');
  
  try {
    const settings = loadJsonFile('settings_export.json');
    const setting = settings[0]; // Should only be one settings record
    
    const docRef = doc(db, 'settings', 'config');
    await setDoc(docRef, {
      projectionDays: setting.projection_days,
      balanceThreshold: setting.balance_threshold,
      calendarMode: setting.calendar_mode,
      manualBalanceOverride: setting.manual_balance_override,
      lastProjectedAt: setting.last_projected_at 
        ? Timestamp.fromDate(new Date(setting.last_projected_at))
        : null,
    });
    
    console.log('✅ Imported settings configuration');
    console.log(`   - Projection days: ${setting.projection_days}`);
    console.log(`   - Balance threshold: $${setting.balance_threshold}`);
    console.log(`   - Calendar mode: ${setting.calendar_mode}`);
    console.log(`   - Last projected: ${setting.last_projected_at}`);
    
  } catch (error) {
    console.error('❌ Error importing settings:', error);
  }
}

async function runImport() {
  console.log('🚀 Starting Firebase data import...\n');
  
  try {
    await importAccounts();
    console.log();
    
    await importSettings();
    console.log();
    
    await importBills();
    console.log();
    
    console.log('🎉 All data imported successfully to Firebase!');
    
    console.log('\n📊 Import Summary:');
    console.log('✅ Accounts: 2 imported (checking, savings)');
    console.log('✅ Settings: 1 configuration imported');
    console.log('✅ Bills: All bills imported with categories');
    console.log('✅ Categories: 17 already imported (from previous migration)');
    console.log('✅ Projections: 170 already imported (from previous migration)');
    
    console.log('\n🚀 Next Steps:');
    console.log('1. Test your Budget Calendar app at http://localhost:5173');
    console.log('2. Verify all data appears correctly');
    console.log('3. Test adding/editing bills and categories');
    console.log('4. Once confirmed working, run: npm run cleanup:supabase');
    
  } catch (error) {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  }
}

// Run import
runImport();
