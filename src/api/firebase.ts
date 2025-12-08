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
import { db, functions, auth } from '../lib/firebaseConfig';

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
  notes?: string | null;
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
  if (!auth.currentUser) {
    // In demo mode we rely on dedicated mock APIs instead of this helper
    // This function is unused by the public dashboard.
    return [];
  }
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
  if (!auth.currentUser) {
    // In demo mode, use the richer mock pipeline in src/api/bills.ts instead.
    return [];
  }
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
  if (!auth.currentUser) {
    // Demo mode uses src/api/categories.ts mock categories instead.
    return [];
  }
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
  if (!auth.currentUser) {
    // Demo mode uses src/api/projections.ts for rich mock projections.
    return [];
  }
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
  if (!auth.currentUser) {
    // For demo, show no raw Monarch streams; transactions are represented via MOCK_BILLS instead.
    return [];
  }
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
  if (!auth.currentUser) {
    // Demo defaults: generous projection window and mid-range threshold
    return {
      projectionDays: 30,
      balanceThreshold: 1000,
      calendarMode: 'prod',
      manualBalanceOverride: null,
      lastProjectedAt: null,
    };
  }
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
  if (!auth.currentUser) {
    const now = new Date();
    return {
      refreshAccounts: new Date(now.getTime() - 60 * 60 * 1000),
      refreshRecurringTransactions: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      budgetProjection: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      syncCalendar: new Date(now.getTime() - 4 * 60 * 60 * 1000),
    };
  }
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
  const response = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/budgetProjection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    throw new Error(`Failed to run budget projection: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

export async function clearCalendars(): Promise<any> {
  const response = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/clearCalendars', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    throw new Error(`Failed to clear calendars: ${response.status}`);
  }

  const result = await response.json();
  return result; // Return the result directly, not result.data
}


export async function syncCalendar(env: 'dev' | 'prod' = 'dev'): Promise<any> {
  const response = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/syncCalendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ env })
  });

  if (!response.ok) {
    throw new Error(`Failed to sync calendar: ${response.status}`);
  }

  const result = await response.json();
  return result; // Return the result directly, not result.data
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

// MONTHLY CASH FLOW API
export async function getMonthlyCashFlow(): Promise<any> {
  try {
    if (!auth.currentUser) {
      // Mock monthly cash flow that matches MOCK_BILLS and projections
      return {
        categories: {
          housing:   { monthly: 2500, yearly: 2500 * 12 },
          groceries: { monthly: 600,  yearly: 600 * 12 },
          entertainment: { monthly: 75, yearly: 75 * 12 },
          health: { monthly: 280, yearly: 280 * 12 },
          transportation: { monthly: 850, yearly: 850 * 12 },
        },
        summary: {
          oneTime: { bills: 0, income: 0 },
          daily:   { bills: 50, income: 0 },
          weekly:  { bills: 200, income: 0 },
          monthly: { bills: 4305, income: 7000 },
          yearly:  { bills: 4305 * 12, income: 7000 * 12 },
        },
        monthlyTotals: {
          income: 7000,
          bills: 4305,
          leftover: 7000 - 4305,
        },
      };
    }
    const monthlyCashFlowRef = doc(db, 'monthlyCashFlow', 'current');
    const monthlyCashFlowDoc = await getDoc(monthlyCashFlowRef);
    
    if (!monthlyCashFlowDoc.exists()) {
      return {
        categories: {},
        summary: {
          oneTime: { bills: 0, income: 0 },
          daily: { bills: 0, income: 0 },
          weekly: { bills: 0, income: 0 },
          monthly: { bills: 0, income: 0 },
          yearly: { bills: 0, income: 0 },
        },
        monthlyTotals: { income: 0, bills: 0, leftover: 0 }
      };
    }
    
    return monthlyCashFlowDoc.data();
  } catch (error) {
    console.error('Error fetching monthly cash flow:', error);
    throw error;
  }
}
