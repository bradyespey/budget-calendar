//old/stores/settingsStore.ts

// ── ZUSTAND SETTINGS STORE (PERSISTED) ─────────────────────────────────────
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// This store provides persistent settings for projectionDays and balanceThreshold.
// If you are not using this for global state, consider removing it. (Flagged for review)

// ── Settings store interface ────────────────────────────────────────────────
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