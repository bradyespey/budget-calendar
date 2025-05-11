//src/types/index.ts

// ── Domain model types ───────────────────────────────────────────────────────
export interface Bill {
  id: string
  name: string
  category: string
  amount: number
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one-time'
  repeats_every: number
  start_date: string
  end_date?: string
  owner?: 'Both' | 'Brady' | 'Jenny'
  note?: string
}

export interface Account {
  id: string
  display_name: string
  last_balance: number
  last_synced: string
}

export interface Projection {
  proj_date: string
  projected_balance: number
  lowest: boolean
  highest: boolean
}

export interface User {
  id: string
  email: string
}

export interface Session {
  user: User | null
  isAuthenticated: boolean
}