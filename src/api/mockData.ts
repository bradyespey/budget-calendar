// src/api/mockData.ts

import { Account, Bill, Category, Projection } from '../types';
import { addDays, format } from 'date-fns';

export const MOCK_ACCOUNTS: Account[] = [
  {
    id: 'checking',
    display_name: 'Chase Total Checking',
    last_balance: 5432.10,
    last_synced: new Date().toISOString(),
  },
  {
    id: 'savings',
    display_name: 'Ally High Yield Savings',
    last_balance: 12500.00,
    last_synced: new Date().toISOString(),
  },
  {
    id: 'creditCards',
    display_name: 'Chase Sapphire Reserve',
    last_balance: 1250.50,
    last_synced: new Date().toISOString(),
  },
  {
    id: 'amex',
    display_name: 'Amex Gold',
    last_balance: 450.25,
    last_synced: new Date().toISOString(),
  }
];

export const MOCK_BILLS: Bill[] = [
  {
    id: 'mock-1',
    name: 'Downtown Apartment',
    category: 'Housing',
    amount: -2500,
    frequency: 'monthly',
    repeats_every: 1,
    start_date: '2024-01-01',
    notes: 'Luxury high-rise unit',
    source: 'manual',
    accountName: 'Chase Total Checking',
    accountType: 'Checking',
    iconType: 'home',
    end_date: '',
  },
  {
    id: 'mock-2',
    name: 'Whole Foods Market',
    category: 'Groceries',
    amount: -150,
    frequency: 'weekly',
    repeats_every: 1,
    start_date: '2024-01-02',
    notes: 'Weekly grocery run',
    source: 'manual',
    accountName: 'Chase Sapphire Reserve',
    accountType: 'Credit Card',
    iconType: 'utensils',
    end_date: '',
  },
  {
    id: 'mock-3',
    name: 'Netflix Premium',
    category: 'Entertainment',
    amount: -23,
    frequency: 'monthly',
    repeats_every: 1,
    start_date: '2024-01-15',
    notes: 'Streaming subscription',
    source: 'manual',
    accountName: 'Chase Sapphire Reserve',
    accountType: 'Credit Card',
    iconType: 'monitor',
    end_date: '',
  },
  {
    id: 'mock-4',
    name: 'Equinox Gym',
    category: 'Health',
    amount: -280,
    frequency: 'monthly',
    repeats_every: 1,
    start_date: '2024-01-05',
    notes: 'Premium fitness membership',
    source: 'manual',
    accountName: 'Chase Total Checking',
    accountType: 'Checking',
    iconType: 'dumbbell',
    end_date: '',
  },
  {
    id: 'mock-5',
    name: 'Tesla Lease',
    category: 'Transportation',
    amount: -850,
    frequency: 'monthly',
    repeats_every: 1,
    start_date: '2024-01-20',
    notes: 'Model Y Performance',
    source: 'manual',
    accountName: 'Chase Total Checking',
    accountType: 'Checking',
    iconType: 'car',
    end_date: '2026-01-20',
  },
  {
    id: 'mock-6',
    name: 'Tech Salary',
    category: 'Income',
    amount: 3500,
    frequency: 'biweekly',
    repeats_every: 1,
    start_date: '2024-01-05',
    notes: 'Direct deposit',
    source: 'manual',
    accountName: 'Chase Total Checking',
    accountType: 'Checking',
    iconType: 'briefcase',
    end_date: '',
  },
  {
    id: 'mock-7',
    name: 'Spotify',
    category: 'Entertainment',
    amount: -11,
    frequency: 'monthly',
    repeats_every: 1,
    start_date: '2024-01-10',
    notes: 'Music streaming',
    source: 'manual',
    accountName: 'Chase Sapphire Reserve',
    accountType: 'Credit Card',
    iconType: 'music',
    end_date: '',
  },
  {
    id: 'mock-8',
    name: 'Factor Meals',
    category: 'Food',
    amount: -90,
    frequency: 'weekly',
    repeats_every: 1,
    start_date: '2024-01-03',
    notes: 'Meal delivery service',
    source: 'manual',
    accountName: 'Chase Sapphire Reserve',
    accountType: 'Credit Card',
    iconType: 'package',
    end_date: '',
  }
];

export const MOCK_CATEGORIES: Category[] = [
  { id: 'cat-1', name: 'Housing', created_at: new Date().toISOString(), transaction_count: 12 },
  { id: 'cat-2', name: 'Groceries', created_at: new Date().toISOString(), transaction_count: 45 },
  { id: 'cat-3', name: 'Entertainment', created_at: new Date().toISOString(), transaction_count: 8 },
  { id: 'cat-4', name: 'Health', created_at: new Date().toISOString(), transaction_count: 5 },
  { id: 'cat-5', name: 'Transportation', created_at: new Date().toISOString(), transaction_count: 3 },
  { id: 'cat-6', name: 'Utilities', created_at: new Date().toISOString(), transaction_count: 15 },
];

/**
 * Generates mock financial projections for demo mode
 * Simulates 90 days of balance projections based on mock bills and daily spending
 * @returns Array of Projection objects with projected balances and associated bills
 */
export const generateMockProjections = (): Projection[] => {
  const projections: Projection[] = [];
  let currentBalance = 5432.10;
  const today = new Date();

  for (let i = 0; i < 90; i++) {
    const date = addDays(today, i);
    const dateString = format(date, 'yyyy-MM-dd');
    
    // Simulate some daily fluctuations
    const dailySpend = Math.random() * 50; 
    currentBalance -= dailySpend;
    
    const todaysBills: Bill[] = [];

    // Simulate bills
    MOCK_BILLS.forEach(bill => {
      const startDate = new Date(bill.start_date);
      const dayOfMonth = startDate.getDate();
      const dayOfWeek = startDate.getDay(); // 0 = Sunday
      
      let shouldAdd = false;
      
      if (bill.frequency === 'monthly') {
        if (date.getDate() === dayOfMonth) shouldAdd = true;
      } else if (bill.frequency === 'weekly') {
        if (date.getDay() === dayOfWeek) shouldAdd = true;
      } else if (bill.frequency === 'biweekly') {
        // Simple biweekly simulation - every 14 days from start
        const diffTime = Math.abs(date.getTime() - startDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays % 14 === 0) shouldAdd = true;
      }

      if (shouldAdd) {
        currentBalance += bill.amount;
        todaysBills.push(bill);
      }
    });

    projections.push({
      proj_date: dateString,
      projected_balance: currentBalance,
      lowest: currentBalance - 100,
      highest: currentBalance + 100,
      bills: todaysBills
    });
  }
  return projections;
};

