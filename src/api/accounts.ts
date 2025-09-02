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
  const refreshAccountsFunction = httpsCallable(functions, 'refreshAccounts');
  
  // Get debug mode from environment variable
  const debugMode = import.meta.env.VITE_DEBUG_MODE === 'true';
  
  const result = await refreshAccountsFunction({ debugMode });
  
  const data = result.data as { success: boolean; message: string };
  if (!data.success) {
    throw new Error(data.message || 'Account refresh failed');
  }
}

// ── Firebase Cloud Functions ──────────────────────────────────────────────
/**
 * 💰 Refresh Chase balance only (Firebase Cloud Function)
 *    Now calls the function and returns persisted balance.
 */
export async function refreshChaseBalanceInDb(): Promise<number> {
  const chaseBalanceFunction = httpsCallable(functions, 'chaseBalance');
  const result = await chaseBalanceFunction();
  
  const data = result.data as { balance: number };
  return data.balance;
}

export async function getTransactionsReviewCount(): Promise<number> {
  const transactionsReviewFunction = httpsCallable(functions, 'transactionsReview');
  const result = await transactionsReviewFunction();
  
  const data = result.data as { transactions_to_review: number };
  return data.transactions_to_review;
}