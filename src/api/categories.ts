//src/api/categories.ts

import { supabase } from '../lib/supabase';

export interface Category {
  id: string;
  name: string;
  created_at: string;
  transaction_count?: number;
}

export async function getCategories(): Promise<Category[]> {
  console.log('Fetching categories with transaction counts...');
  
  // Get categories with transaction counts using a raw SQL query
  const { data, error } = await supabase.rpc('get_categories_with_counts');
  
  if (error) {
    console.error('Error fetching categories with counts, falling back to simple query:', error);
    
    // Fallback to simple category fetch without counts
    const { data: simpleData, error: simpleError } = await supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true });
      
    if (simpleError) {
      console.error('Error fetching categories:', simpleError);
      throw simpleError;
    }
    
    console.log('Returning categories without counts:', simpleData || []);
    return (simpleData || []).map(cat => ({ ...cat, transaction_count: 0 }));
  }
  
  console.log('Categories with counts result:', data);
  return data || [];
}

export async function createCategory(name: string): Promise<Category> {
  // Clean and validate the category name
  const cleanName = name.trim().toLowerCase();
  console.log('Creating category with name:', cleanName);
  
  if (!cleanName) {
    throw new Error('Category name cannot be empty');
  }
  
  const { data, error } = await supabase
    .from('categories')
    .insert([{ name: cleanName }])
    .select()
    .single();
    
  console.log('Create category result - data:', data, 'error:', error);
    
  if (error) {
    // Handle unique constraint error
    if (error.code === '23505') {
      throw new Error('Category already exists');
    }
    console.error('Error creating category:', error);
    throw error;
  }
  
  console.log('Category created successfully:', data);
  return data;
}

export async function updateCategory(id: string, name: string): Promise<Category> {
  // Clean and validate the category name
  const cleanName = name.trim().toLowerCase();
  
  if (!cleanName) {
    throw new Error('Category name cannot be empty');
  }
  
  const { data, error } = await supabase
    .from('categories')
    .update({ name: cleanName })
    .eq('id', id)
    .select()
    .single();
    
  if (error) {
    // Handle unique constraint error
    if (error.code === '23505') {
      throw new Error('Category already exists');
    }
    console.error('Error updating category:', error);
    throw error;
  }
  
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  console.log('Attempting to delete category by ID:', id);
  
  // First, get the category name by ID
  const { data: category, error: categoryError } = await supabase
    .from('categories')
    .select('name')
    .eq('id', id)
    .single();
    
  if (categoryError) {
    console.error('Error fetching category:', categoryError);
    throw new Error('Category not found');
  }
  
  if (!category) {
    throw new Error('Category not found');
  }
  
  console.log('Found category to delete:', category.name);
  
  // Check if any bills are using this category (by name)
  const { data: billsUsingCategory, error: billsError } = await supabase
    .from('bills')
    .select('id, name')
    .eq('category', category.name)
    .limit(3); // Get a few examples
    
  if (billsError) {
    console.error('Error checking bills for category:', billsError);
    throw billsError;
  }
  
  console.log('Bills using category:', billsUsingCategory);
  
  if (billsUsingCategory && billsUsingCategory.length > 0) {
    const billNames = billsUsingCategory.map(b => b.name).join(', ');
    throw new Error(`Cannot delete category: it is being used by ${billsUsingCategory.length} transaction(s) including: ${billNames}`);
  }
  
  console.log('No bills using category, proceeding with delete...');
  
  // Delete the category by ID
  const { error, count } = await supabase
    .from('categories')
    .delete({ count: 'exact' })
    .eq('id', id);
    
  console.log('Delete result - error:', error, 'count:', count);
    
  if (error) {
    console.error('Error deleting category:', error);
    throw error;
  }
  
  if (count === 0) {
    console.warn('No rows were deleted - category may not exist in database');
    throw new Error('Category not found in database');
  }
  
  console.log('Category deleted successfully, rows affected:', count);
}

export async function deleteCategoryWithBillsCheck(categoryName: string): Promise<void> {
  console.log('Attempting to delete category:', categoryName);
  
  // First check if any bills are using this category
  const { data: billsUsingCategory, error: billsError } = await supabase
    .from('bills')
    .select('id, name')
    .eq('category', categoryName)
    .limit(3); // Get a few examples
    
  if (billsError) {
    console.error('Error checking bills for category:', billsError);
    throw billsError;
  }
  
  console.log('Bills using category:', billsUsingCategory);
  
  if (billsUsingCategory && billsUsingCategory.length > 0) {
    const billNames = billsUsingCategory.map(b => b.name).join(', ');
    throw new Error(`Cannot delete category: it is being used by ${billsUsingCategory.length} transaction(s) including: ${billNames}`);
  }
  
  console.log('No bills using category, proceeding with delete...');
  
  const { error, count } = await supabase
    .from('categories')
    .delete({ count: 'exact' })
    .eq('name', categoryName);
    
  console.log('Delete result - error:', error, 'count:', count);
    
  if (error) {
    console.error('Error deleting category:', error);
    throw error;
  }
  
  if (count === 0) {
    console.warn('No rows were deleted - category may not exist in database');
    throw new Error('Category not found in database');
  }
  
  console.log('Category deleted successfully, rows affected:', count);
}