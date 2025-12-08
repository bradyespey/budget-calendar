//src/api/accounts.ts

import { 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from '../lib/firebaseConfig';
import type { Account } from "../types";
import { MOCK_ACCOUNTS } from './mockData';

// Helper function to convert Firestore timestamp to Date
const timestampToDate = (timestamp: any): Date => {
  if (timestamp?.toDate) {
    return timestamp.toDate();
  }
  return new Date(timestamp);
};

/**
 * Fetches all accounts from Firestore or returns mock accounts for demo mode
 * @returns Array of Account objects
 */
export async function getAccounts(): Promise<Account[]> {
  if (!auth.currentUser) {
    return MOCK_ACCOUNTS;
  }
  const accountsRef = collection(db, 'accounts');
  const q = query(accountsRef, orderBy('display_name'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    display_name: doc.data().displayName,
    last_balance: doc.data().lastBalance,
    last_synced: timestampToDate(doc.data().lastSynced).toISOString(),
  }));
}

/**
 * Fetches checking account balance from Firestore or returns mock balance for demo mode
 * @returns Checking account balance as number
 * @throws Error if checking account not found (authenticated mode only)
 */
export async function getCheckingBalance(): Promise<number> {
  if (!auth.currentUser) {
    return MOCK_ACCOUNTS.find(a => a.id === 'checking')?.last_balance || 0;
  }
  const accountRef = doc(db, 'accounts', 'checking');
  const accountDoc = await getDoc(accountRef);
  
  if (!accountDoc.exists()) {
    throw new Error('Checking account not found');
  }
  
  return accountDoc.data().lastBalance;
}

/**
 * Fetches savings account balance from Firestore or returns mock balance for demo mode
 * @returns Savings account balance as number, or null if account doesn't exist
 */
export async function getSavingsBalance(): Promise<number | null> {
  if (!auth.currentUser) {
    return MOCK_ACCOUNTS.find(a => a.id === 'savings')?.last_balance || 0;
  }
  const accountRef = doc(db, 'accounts', 'savings');
  const accountDoc = await getDoc(accountRef);
  
  if (!accountDoc.exists()) {
    return null;
  }
  
  return accountDoc.data().lastBalance;
}

/**
 * Fetches credit card debt balance from Firestore or returns mock balance for demo mode
 * @returns Credit card debt balance as number, or null if account doesn't exist
 */
export async function getCreditCardDebt(): Promise<number | null> {
  if (!auth.currentUser) {
    return MOCK_ACCOUNTS.find(a => a.id === 'creditCards')?.last_balance || 0;
  }
  const accountRef = doc(db, 'accounts', 'creditCards');
  const accountDoc = await getDoc(accountRef);
  
  if (!accountDoc.exists()) {
    return null;
  }
  
  return accountDoc.data().lastBalance;
}

/**
 * Fetches savings account balance history from Firestore or returns mock history for demo mode
 * @returns Array of balance history entries with balance and timestamp
 */
export async function getSavingsHistory(): Promise<Array<{ balance: number; timestamp: Date }>> {
  if (!auth.currentUser) {
    const savings = MOCK_ACCOUNTS.find(a => a.id === 'savings')?.last_balance || 0;
    // Generate fake history
    return Array.from({ length: 10 }).map((_, i) => ({
      balance: savings - (i * 100),
      timestamp: new Date(Date.now() - i * 86400000)
    })).reverse();
  }
  const historyRef = collection(db, 'savingsHistory');
  const q = query(historyRef, orderBy('timestamp', 'asc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    balance: doc.data().balance,
    timestamp: timestampToDate(doc.data().timestamp)
  }));
}

/**
 * Fetches last sync time for checking account or returns current date for demo mode
 * @returns Last sync timestamp as Date, or null if not available
 */
export async function getLastSyncTime(): Promise<Date | null> {
  if (!auth.currentUser) {
    return new Date();
  }
  const accountRef = doc(db, 'accounts', 'checking');
  const accountDoc = await getDoc(accountRef);
  
  if (!accountDoc.exists() || !accountDoc.data().lastSynced) {
    return null;
  }
  
  return timestampToDate(accountDoc.data().lastSynced);
}

/**
 * Triggers account refresh via Flask API through Firebase Cloud Function
 * @throws Error if refresh fails
 */
export async function refreshAccountsViaFlask(): Promise<void> {
  const response = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/refreshAccounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh accounts: ${response.status}`);
  }

  const result = await response.json();
  
  const data = result.data as { success: boolean; message: string };
  if (!data.success) {
    throw new Error(data.message || 'Account refresh failed');
  }
}

// ── Firebase Cloud Functions ──────────────────────────────────────────────
/**
 * 💰 Refresh account balances (Firebase Cloud Function)
 *    Now calls the function and returns persisted balances.
 */
export async function refreshBalancesInDb(): Promise<{ checking: number; savings?: number; creditCards?: number }> {
  const response = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/updateBalance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    throw new Error(`Failed to update balances: ${response.status}`);
  }

  const result = await response.json();
  return {
    checking: result.data.checking.balance,
    savings: result.data.savings?.balance,
    creditCards: result.data.creditCards?.balance
  };
}

/**
 * Legacy function name for backwards compatibility
 * Refreshes Chase checking balance in database
 * @returns Updated checking account balance
 */
export async function refreshChaseBalanceInDb(): Promise<number> {
  const balances = await refreshBalancesInDb();
  return balances.checking;
}
