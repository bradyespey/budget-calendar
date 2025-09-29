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
import { db, functions } from '../lib/firebaseConfig';
import type { Account } from "../types";

// Helper function to convert Firestore timestamp to Date
const timestampToDate = (timestamp: any): Date => {
  if (timestamp?.toDate) {
    return timestamp.toDate();
  }
  return new Date(timestamp);
};

// ── Firebase query functions ─────────────────────────────────────────────
export async function getAccounts(): Promise<Account[]> {
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

export async function getCheckingBalance(): Promise<number> {
  const accountRef = doc(db, 'accounts', 'checking');
  const accountDoc = await getDoc(accountRef);
  
  if (!accountDoc.exists()) {
    throw new Error('Checking account not found');
  }
  
  return accountDoc.data().lastBalance;
}

export async function getSavingsBalance(): Promise<number | null> {
  const accountRef = doc(db, 'accounts', 'savings');
  const accountDoc = await getDoc(accountRef);
  
  if (!accountDoc.exists()) {
    return null;
  }
  
  return accountDoc.data().lastBalance;
}

export async function getSavingsHistory(): Promise<Array<{ balance: number; timestamp: Date }>> {
  const historyRef = collection(db, 'savingsHistory');
  const q = query(historyRef, orderBy('timestamp', 'asc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    balance: doc.data().balance,
    timestamp: timestampToDate(doc.data().timestamp)
  }));
}

export async function getLastSyncTime(): Promise<Date | null> {
  const accountRef = doc(db, 'accounts', 'checking');
  const accountDoc = await getDoc(accountRef);
  
  if (!accountDoc.exists() || !accountDoc.data().lastSynced) {
    return null;
  }
  
  return timestampToDate(accountDoc.data().lastSynced);
}

// ── Refresh accounts via Firebase Cloud Function ────────────────────────────────────────
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
export async function refreshBalancesInDb(): Promise<{ checking: number; savings?: number }> {
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
    savings: result.data.savings?.balance
  };
}

// Legacy function name for backwards compatibility
export async function refreshChaseBalanceInDb(): Promise<number> {
  const balances = await refreshBalancesInDb();
  return balances.checking;
}
