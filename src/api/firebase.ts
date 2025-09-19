import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  setDoc,
  query, 
  orderBy, 
  where,
  Timestamp,
  writeBatch 
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebaseConfig';

// Type definitions
export interface Account {
  id: string;
  displayName: string;
  lastBalance: number;
  lastSynced: Date;
}

export interface Bill {
  id?: string;
  name: string;
  category: string;
  amount: number;
  frequency: string;
  repeatsEvery: number;
  startDate: string;
  endDate?: string | null;
  owner?: string | null;
  note?: string | null;
}

export interface Category {
  id?: string;
  name: string;
  createdAt?: Date;
}

export interface Projection {
  id?: string;
  lowest: boolean;
  highest: boolean;
  projectedBalance: number;
  bills: any;
  projDate: string | null;
}

export interface Settings {
  projectionDays: number;
  balanceThreshold: number;
  calendarMode: string;
  manualBalanceOverride?: number | null;
  lastProjectedAt?: Date | null;
}

// Helper function to convert Firestore timestamp to Date
const timestampToDate = (timestamp: any): Date => {
  if (timestamp?.toDate) {
    return timestamp.toDate();
  }
  return new Date(timestamp);
};

// ACCOUNTS API
export async function getAccounts(): Promise<Account[]> {
  const accountsRef = collection(db, 'accounts');
  const snapshot = await getDocs(accountsRef);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    displayName: doc.data().displayName,
    lastBalance: doc.data().lastBalance,
    lastSynced: timestampToDate(doc.data().lastSynced),
  }));
}

export async function updateAccountBalance(accountId: string, balance: number): Promise<void> {
  const accountRef = doc(db, 'accounts', accountId);
  await updateDoc(accountRef, {
    lastBalance: balance,
    lastSynced: Timestamp.now(),
  });
}

// BILLS API
export async function getBills(): Promise<Bill[]> {
  const billsRef = collection(db, 'bills');
  const q = query(billsRef, orderBy('name'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    name: doc.data().name,
    category: doc.data().category,
    amount: doc.data().amount,
    frequency: doc.data().frequency,
    repeatsEvery: doc.data().repeatsEvery,
    startDate: doc.data().startDate,
    endDate: doc.data().endDate,
    owner: doc.data().owner,
    note: doc.data().note,
  }));
}

export async function addBill(bill: Omit<Bill, 'id'>): Promise<string> {
  const billsRef = collection(db, 'bills');
  const docRef = await addDoc(billsRef, bill);
  return docRef.id;
}

export async function updateBill(billId: string, updates: Partial<Bill>): Promise<void> {
  const billRef = doc(db, 'bills', billId);
  await updateDoc(billRef, updates);
}

export async function deleteBill(billId: string): Promise<void> {
  const billRef = doc(db, 'bills', billId);
  await deleteDoc(billRef);
}

// CATEGORIES API
export async function getCategories(): Promise<Category[]> {
  const categoriesRef = collection(db, 'categories');
  const q = query(categoriesRef, orderBy('name'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    name: doc.data().name,
    createdAt: timestampToDate(doc.data().createdAt),
  }));
}

export async function addCategory(category: Omit<Category, 'id' | 'createdAt'>): Promise<string> {
  const categoriesRef = collection(db, 'categories');
  const docRef = await addDoc(categoriesRef, {
    ...category,
    createdAt: Timestamp.now(),
  });
  return docRef.id;
}

export async function updateCategory(categoryId: string, updates: Partial<Category>): Promise<void> {
  const categoryRef = doc(db, 'categories', categoryId);
  await updateDoc(categoryRef, updates);
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const categoryRef = doc(db, 'categories', categoryId);
  await deleteDoc(categoryRef);
}

// PROJECTIONS API
export async function getProjections(): Promise<Projection[]> {
  const projectionsRef = collection(db, 'projections');
  const q = query(projectionsRef, orderBy('projDate'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    lowest: doc.data().lowest,
    highest: doc.data().highest,
    projectedBalance: doc.data().projectedBalance,
    bills: doc.data().bills,
    projDate: doc.data().projDate,
  }));
}

export async function upsertProjection(projection: Omit<Projection, 'id'>): Promise<void> {
  // Use projDate as document ID for easy querying
  const docId = projection.projDate || `projection_${Date.now()}`;
  const projectionRef = doc(db, 'projections', docId);
  
  await updateDoc(projectionRef, projection).catch(async () => {
    // If document doesn't exist, create it
    await updateDoc(projectionRef, projection);
  });
}

export async function clearProjections(): Promise<void> {
  const projectionsRef = collection(db, 'projections');
  const snapshot = await getDocs(projectionsRef);
  
  const batch = writeBatch(db);
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
}

// RECURRING TRANSACTIONS API
export interface RecurringTransaction {
  id?: string;
  streamId: string;
  merchantName: string;
  merchantLogoUrl?: string;
  frequency: string;
  amount: number;
  isApproximate?: boolean;
  dueDate: string;
  categoryId?: string;
  categoryName?: string;
  accountId?: string;
  accountName?: string;
  accountLogoUrl?: string;
  updatedAt?: Date;
}

export async function getRecurringTransactions(): Promise<RecurringTransaction[]> {
  const recurringRef = collection(db, 'recurringTransactions');
  const q = query(recurringRef, orderBy('merchantName'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    streamId: doc.data().streamId,
    merchantName: doc.data().merchantName,
    merchantLogoUrl: doc.data().logoUrl,
    frequency: doc.data().frequency,
    amount: doc.data().amount,
    isApproximate: doc.data().isApproximate,
    dueDate: doc.data().nextDueDate,
    categoryId: doc.data().categoryId,
    categoryName: doc.data().categoryName,
    accountId: doc.data().accountId,
    accountName: doc.data().accountName,
    accountLogoUrl: doc.data().accountLogoUrl,
    updatedAt: doc.data().updatedAt?.toDate(),
  }));
}

export async function refreshRecurringTransactions(): Promise<void> {
  // Call the main refresh function with accurate Monarch data
  const response = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/refreshTransactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  
  if (!response.ok) {
    throw new Error(`Failed to refresh recurring transactions: ${response.status}`);
  }
  
  const result = await response.json();
}

// SETTINGS API
export async function getSettings(): Promise<Settings> {
  const settingsRef = doc(db, 'settings', 'config');
  const snapshot = await getDoc(settingsRef);
  
  if (!snapshot.exists()) {
    // Return default settings if none exist
    return {
      projectionDays: 7,
      balanceThreshold: 1000,
      calendarMode: 'prod',
      manualBalanceOverride: null,
      lastProjectedAt: null,
    };
  }
  
  const data = snapshot.data();
  return {
    projectionDays: data.projectionDays,
    balanceThreshold: data.balanceThreshold,
    calendarMode: data.calendarMode,
    manualBalanceOverride: data.manualBalanceOverride,
    lastProjectedAt: data.lastProjectedAt ? timestampToDate(data.lastProjectedAt) : null,
  };
}

export async function updateSettings(updates: Partial<Settings>): Promise<void> {
  const settingsRef = doc(db, 'settings', 'config');
  
  // Convert Date to Timestamp if present
  const firestoreUpdates: any = { ...updates };
  if (updates.lastProjectedAt) {
    firestoreUpdates.lastProjectedAt = Timestamp.fromDate(updates.lastProjectedAt);
  }
  
  await updateDoc(settingsRef, firestoreUpdates);
}

// FUNCTION TIMESTAMPS API
export async function getFunctionTimestamps(): Promise<Record<string, Date>> {
  const timestampsRef = doc(db, 'admin', 'functionTimestamps');
  const timestampsDoc = await getDoc(timestampsRef);
  
  if (!timestampsDoc.exists()) {
    return {};
  }
  
  const data = timestampsDoc.data();
  const timestamps: Record<string, Date> = {};
  
  Object.entries(data).forEach(([key, value]) => {
    if (value && typeof value === 'object' && 'toDate' in value) {
      timestamps[key] = (value as Timestamp).toDate();
    }
  });
  
  return timestamps;
}

export async function saveFunctionTimestamp(functionName: string): Promise<void> {
  const timestampsRef = doc(db, 'admin', 'functionTimestamps');
  await setDoc(timestampsRef, {
    [functionName]: Timestamp.now()
  }, { merge: true });
}

// CLOUD FUNCTIONS API
export async function refreshAccounts(): Promise<any> {
  const refreshAccountsFunction = httpsCallable(functions, 'refreshAccounts');
  
  // Check for debug mode in environment
  const debugMode = import.meta.env.VITE_DEBUG_MODE === 'true';
  
  const result = await refreshAccountsFunction({ debugMode });
  return result.data;
}

export async function runBudgetProjection(): Promise<any> {
  const budgetProjectionFunction = httpsCallable(functions, 'budgetProjection');
  const result = await budgetProjectionFunction();
  return result.data;
}

export async function clearCalendars(): Promise<any> {
  const clearCalendarsFunction = httpsCallable(functions, 'clearCalendars');
  const result = await clearCalendarsFunction();
  return result.data;
}

export async function sendAlert(message: string): Promise<any> {
  const sendAlertFunction = httpsCallable(functions, 'sendAlert');
  const result = await sendAlertFunction({ message });
  return result.data;
}

export async function syncCalendar(env: 'dev' | 'prod' = 'dev'): Promise<any> {
  const syncCalendarFunction = httpsCallable(functions, 'syncCalendar');
  const result = await syncCalendarFunction({ env });
  return result.data;
}

// UTILITY FUNCTIONS
export async function importBills(bills: Omit<Bill, 'id'>[]): Promise<void> {
  const batch = writeBatch(db);
  const billsRef = collection(db, 'bills');
  
  bills.forEach(bill => {
    const newBillRef = doc(billsRef);
    batch.set(newBillRef, bill);
  });
  
  await batch.commit();
}

export async function validateProjections(): Promise<{ isValid: boolean; errors: string[] }> {
  try {
    const projections = await getProjections();
    
    const errors: string[] = [];
    
    // Add validation logic here
    projections.forEach(projection => {
      if (!projection.projDate) {
        errors.push(`Projection missing date`);
      }
      if (typeof projection.projectedBalance !== 'number') {
        errors.push(`Projection ${projection.projDate} has invalid balance`);
      }
    });
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  } catch (error) {
    return {
      isValid: false,
      errors: [`Validation failed: ${error}`],
    };
  }
}
