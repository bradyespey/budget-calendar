//src/types/index.ts

export type Frequency = string
export type IconType = 'brand' | 'generated' | 'category' | 'custom' | null

// ── Domain model types ───────────────────────────────────────────────────────
export interface Bill {
  id: string
  name: string
  category: string
  amount: number
  frequency: Frequency
  repeats_every: number
  start_date: string
  end_date?: string | null
  notes?: string | null
  note?: string | null
  owner?: string
  iconUrl?: string | null
  iconType?: IconType
  source?: 'manual' | 'monarch'
  streamId?: string
  accountName?: string
  logoUrl?: string | null
  isActive?: boolean
  // Enhanced fields from Monarch API
  merchantName?: string
  merchantId?: string
  categoryIcon?: string
  categoryGroup?: string
  categoryGroupId?: string
  accountType?: string
  accountSubtype?: string
  institutionName?: string
  institutionId?: string
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
  thresholdBreach?: boolean
  bills?: Bill[]
}

export interface Category {
  id: string
  name: string
  created_at: string
  transaction_count?: number
}

export interface User {
  id: string
  email: string
}

export interface Session {
  user: User | null
  isAuthenticated: boolean
}
