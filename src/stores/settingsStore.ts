//src/stores/settingsStore.ts

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Settings store interface ─────────────────────────────────────────────────
interface SettingsState {
  projectionDays: number
  balanceThreshold: number
  setProjectionDays: (days: number) => void
  setBalanceThreshold: (amount: number) => void
}

// ── Persistent settings store ────────────────────────────────────────────────
export const useSettingsStore = create<SettingsState>()(
  persist(
    set => ({
      projectionDays: 7, // Default to 7 days
      balanceThreshold: 1000, // Default to $1,000
      setProjectionDays: days => set({ projectionDays: days }),
      setBalanceThreshold: amount => set({ balanceThreshold: amount })
    }),
    { name: 'settings-storage' }
  )
)