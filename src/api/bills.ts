//src/api/bills.ts

import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy,
  writeBatch 
} from 'firebase/firestore';
import { db } from '../lib/firebaseConfig';
import { Bill } from '../types';

export async function getBills() {
  try {
    const billsRef = collection(db, 'bills');
    const snapshot = await getDocs(billsRef);
    
    return snapshot.docs.map(doc => {
      const d: any = doc.data();
      return {
        id: doc.id,
        name: d.name,
        category: d.category,
        amount: Number(d.amount ?? d.amount_cents ?? 0),
        frequency: d.frequency,
        repeats_every: d.repeatsEvery ?? d.repeats_every ?? 1,
        start_date: d.startDate ?? d.start_date,
        end_date: d.endDate ?? d.end_date,
        notes: d.notes,
        iconUrl: d.iconUrl,
        iconType: d.iconType,
        source: d.source,
        streamId: d.streamId,
        accountName: d.accountName,
        logoUrl: d.logoUrl,
      } as Bill;
    });
  } catch (error) {
    console.error('Error fetching bills:', error);
    throw error;
  }
}

export async function getBill(id: string) {
  try {
    const billRef = doc(db, 'bills', id);
    const billDoc = await getDoc(billRef);
    
    if (!billDoc.exists()) {
      throw new Error(`Bill with id ${id} not found`);
    }
    
    const d: any = billDoc.data();
    return {
      id: billDoc.id,
      name: d.name,
      category: d.category,
      amount: Number(d.amount ?? d.amount_cents ?? 0),
      frequency: d.frequency,
      repeats_every: d.repeatsEvery ?? d.repeats_every ?? 1,
      start_date: d.startDate ?? d.start_date,
      end_date: d.endDate ?? d.end_date,
      owner: d.owner,
      note: d.note,
      iconUrl: d.iconUrl,
      iconType: d.iconType,
    } as Bill;
  } catch (error) {
    console.error(`Error fetching bill ${id}:`, error);
    throw error;
  }
}

export async function createBill(bill: Omit<Bill, 'id'>) {
  try {
    const billsRef = collection(db, 'bills');
    const payload: any = {
      name: bill.name,
      category: bill.category,
      amount: bill.amount,
      frequency: bill.frequency,
      repeatsEvery: bill.repeats_every,
      startDate: bill.start_date,
      source: 'manual', // Mark as manual transaction
    };
    if (bill.end_date) payload.endDate = bill.end_date;
    if (bill.notes) payload.notes = bill.notes;
    if (bill.iconUrl) payload.iconUrl = bill.iconUrl;
    if (bill.iconType) payload.iconType = bill.iconType;

    const docRef = await addDoc(billsRef, payload);
    
    return {
      id: docRef.id,
      ...bill
    } as Bill;
  } catch (error) {
    console.error('Error creating bill:', error);
    throw error;
  }
}

export async function updateBill(id: string, updates: Partial<Omit<Bill, 'id'>>) {
  try {
    const billRef = doc(db, 'bills', id);
    
    const firestoreUpdates: any = {};
    if (updates.name !== undefined) firestoreUpdates.name = updates.name;
    if (updates.category !== undefined) firestoreUpdates.category = updates.category;
    if (updates.amount !== undefined) firestoreUpdates.amount = updates.amount;
    if (updates.frequency !== undefined) firestoreUpdates.frequency = updates.frequency;
    if (updates.repeats_every !== undefined) firestoreUpdates.repeatsEvery = updates.repeats_every;
    if (updates.start_date !== undefined) firestoreUpdates.startDate = updates.start_date;
    if (updates.end_date !== undefined) firestoreUpdates.endDate = updates.end_date;
    if (updates.notes !== undefined) firestoreUpdates.notes = updates.notes;
    if (updates.iconUrl !== undefined) firestoreUpdates.iconUrl = updates.iconUrl;
    if (updates.iconType !== undefined) firestoreUpdates.iconType = updates.iconType;
    
    await updateDoc(billRef, firestoreUpdates);
    
    return getBill(id);
  } catch (error) {
    console.error(`Error updating bill ${id}:`, error);
    throw error;
  }
}

export async function deleteBill(id: string) {
  try {
    const billRef = doc(db, 'bills', id);
    await deleteDoc(billRef);
    return true;
  } catch (error) {
    console.error(`Error deleting bill ${id}:`, error);
    throw error;
  }
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
  try {
    const batch = writeBatch(db);
    const billsRef = collection(db, 'bills');
    
    bills.forEach(bill => {
      const newBillRef = doc(billsRef);
      const payload: any = {
        name: bill.name,
        category: bill.category,
        amount: bill.amount,
        frequency: bill.frequency,
        repeatsEvery: bill.repeats_every,
        startDate: bill.start_date,
      };
      if (bill.end_date) payload.endDate = bill.end_date;
      if (bill.owner) payload.owner = bill.owner;
      if (bill.note) payload.note = bill.note;
      batch.set(newBillRef, payload);
    });
    
    await batch.commit();
    return true;
  } catch (error) {
    console.error('Error importing bills:', error);
    throw error;
  }
}