//src/api/categories.ts

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
  where,
  Timestamp,
  getCountFromServer 
} from 'firebase/firestore';
import { db } from '../lib/firebaseConfig';

export interface Category {
  id: string;
  name: string;
  created_at: string;
  transaction_count?: number;
}

export async function getCategories(): Promise<Category[]> {
  try {
    console.log('Fetching categories...');
    
    const categoriesRef = collection(db, 'categories');
    const q = query(categoriesRef, orderBy('name'));
    const snapshot = await getDocs(q);
    
    const base = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        created_at: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        transaction_count: 0,
      } as Category;
    });

    // Compute counts in parallel using aggregate count
    const billsRef = collection(db, 'bills');
    const counted = await Promise.all(
      base.map(async (cat) => {
        try {
          const countSnap = await getCountFromServer(query(billsRef, where('category', '==', cat.name)));
          return { ...cat, transaction_count: countSnap.data().count } as Category;
        } catch (err) {
          console.warn('Count failed for category', cat.name, err);
          return cat; // leave count as 0 on failure
        }
      })
    );
    
    console.log('Returning categories:', counted);
    return counted;
  } catch (error) {
    console.error('Error fetching categories:', error);
    throw error;
  }
}

export async function createCategory(name: string): Promise<Category> {
  try {
    // Clean and validate the category name
    const cleanName = name.trim().toLowerCase();
    console.log('Creating category with name:', cleanName);
    
    if (!cleanName) {
      throw new Error('Category name cannot be empty');
    }
    
    // Check if category already exists
    const categoriesRef = collection(db, 'categories');
    const q = query(categoriesRef, where('name', '==', cleanName));
    const existingSnapshot = await getDocs(q);
    
    if (!existingSnapshot.empty) {
      throw new Error('Category already exists');
    }
    
    // Create new category
    const docRef = await addDoc(categoriesRef, {
      name: cleanName,
      createdAt: Timestamp.now(),
    });
    
    const newCategory: Category = {
      id: docRef.id,
      name: cleanName,
      created_at: new Date().toISOString(),
      transaction_count: 0,
    };
    
    console.log('Category created successfully:', newCategory);
    return newCategory;
  } catch (error) {
    console.error('Error creating category:', error);
    throw error;
  }
}

export async function updateCategory(id: string, name: string): Promise<Category> {
  try {
    // Clean and validate the category name
    const cleanName = name.trim().toLowerCase();
    
    if (!cleanName) {
      throw new Error('Category name cannot be empty');
    }
    
    // Check if category already exists (excluding current category)
    const categoriesRef = collection(db, 'categories');
    const q = query(categoriesRef, where('name', '==', cleanName));
    const existingSnapshot = await getDocs(q);
    
    const existingWithDifferentId = existingSnapshot.docs.find(doc => doc.id !== id);
    if (existingWithDifferentId) {
      throw new Error('Category already exists');
    }
    
    // Update category
    const categoryRef = doc(db, 'categories', id);
    await updateDoc(categoryRef, {
      name: cleanName,
    });
    
    // Get updated category
    const updatedDoc = await getDoc(categoryRef);
    if (!updatedDoc.exists()) {
      throw new Error('Category not found after update');
    }
    
    const data = updatedDoc.data();
    return {
      id: updatedDoc.id,
      name: data.name,
      created_at: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      transaction_count: 0,
    };
  } catch (error) {
    console.error('Error updating category:', error);
    throw error;
  }
}

export async function deleteCategory(id: string): Promise<void> {
  try {
    console.log('Attempting to delete category by ID:', id);
    
    // First, get the category
    const categoryRef = doc(db, 'categories', id);
    const categoryDoc = await getDoc(categoryRef);
    
    if (!categoryDoc.exists()) {
      throw new Error('Category not found');
    }
    
    const categoryName = categoryDoc.data().name;
    console.log('Found category to delete:', categoryName);
    
    // Check if any bills are using this category
    const billsRef = collection(db, 'bills');
    const billsQuery = query(billsRef, where('category', '==', categoryName));
    const billsSnapshot = await getDocs(billsQuery);
    
    console.log('Bills using category:', billsSnapshot.size);
    
    if (!billsSnapshot.empty) {
      const billNames = billsSnapshot.docs
        .slice(0, 3) // Get first 3 examples
        .map(doc => doc.data().name)
        .join(', ');
      throw new Error(`Cannot delete category: it is being used by ${billsSnapshot.size} transaction(s) including: ${billNames}`);
    }
    
    console.log('No bills using category, proceeding with delete...');
    
    // Delete the category
    await deleteDoc(categoryRef);
    console.log('Category deleted successfully');
  } catch (error) {
    console.error('Error deleting category:', error);
    throw error;
  }
}

export async function deleteCategoryWithBillsCheck(categoryName: string): Promise<void> {
  try {
    console.log('Attempting to delete category:', categoryName);
    
    // Find category by name
    const categoriesRef = collection(db, 'categories');
    const categoryQuery = query(categoriesRef, where('name', '==', categoryName));
    const categorySnapshot = await getDocs(categoryQuery);
    
    if (categorySnapshot.empty) {
      throw new Error('Category not found in database');
    }
    
    const categoryDoc = categorySnapshot.docs[0];
    
    // Check if any bills are using this category
    const billsRef = collection(db, 'bills');
    const billsQuery = query(billsRef, where('category', '==', categoryName));
    const billsSnapshot = await getDocs(billsQuery);
    
    console.log('Bills using category:', billsSnapshot.size);
    
    if (!billsSnapshot.empty) {
      const billNames = billsSnapshot.docs
        .slice(0, 3) // Get first 3 examples
        .map(doc => doc.data().name)
        .join(', ');
      throw new Error(`Cannot delete category: it is being used by ${billsSnapshot.size} transaction(s) including: ${billNames}`);
    }
    
    console.log('No bills using category, proceeding with delete...');
    
    // Delete the category
    await deleteDoc(categoryDoc.ref);
    console.log('Category deleted successfully');
  } catch (error) {
    console.error('Error deleting category:', error);
    throw error;
  }
}