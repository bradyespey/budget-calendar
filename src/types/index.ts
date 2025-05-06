export interface Bill {
  id: string;
  name: string;
  category: string;
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one-time';
  repeats_every: number;
  start_date: string; // ISO date format
  end_date?: string; // ISO date format, optional
  owner?: 'Both' | 'Brady' | 'Jenny'; // optional
  note?: string; // optional
}

export interface Account {
  id: string; // Monarch account id
  display_name: string;
  last_balance: number;
  last_synced: string; // ISO date format
}

export interface Projection {
  proj_date: string; // ISO date format
  projected_balance: number;
  lowest: boolean;
  highest: boolean;
}

export interface User {
  id: string;
  email: string;
}

export interface Session {
  user: User | null;
  isAuthenticated: boolean;
}