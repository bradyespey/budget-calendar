//src/types/database.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ── Database schema types ────────────────────────────────────────────────────
export interface Database {
  public: {
    Tables: {
      bills: {
        Row: {
          id: string
          name: string
          category: string
          amount: number
          frequency: string
          repeats_every: number
          start_date: string
          end_date: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          name: string
          category: string
          amount: number
          frequency: string
          repeats_every?: number
          start_date: string
          end_date?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          name?: string
          category?: string
          amount?: number
          frequency?: string
          repeats_every?: number
          start_date?: string
          end_date?: string | null
          notes?: string | null
        }
      }
      accounts: {
        Row: {
          id: string
          display_name: string
          last_balance: number
          last_synced: string
        }
        Insert: {
          id: string
          display_name: string
          last_balance: number
          last_synced: string
        }
        Update: {
          id?: string
          display_name?: string
          last_balance?: number
          last_synced?: string
        }
      }
      projections: {
        Row: {
          proj_date: string
          projected_balance: number
          lowest: boolean
          highest: boolean
        }
        Insert: {
          proj_date: string
          projected_balance: number
          lowest?: boolean
          highest?: boolean
        }
        Update: {
          proj_date?: string
          projected_balance?: number
          lowest?: boolean
          highest?: boolean
        }
      }
    }
  }
}