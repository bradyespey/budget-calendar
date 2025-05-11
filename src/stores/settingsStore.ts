//src/stores/settingsStore.ts

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Settings store interface ─────────────────────────────────────────────────
interface SettingsState {
  projectionDays: number
  setProjectionDays: (days: number) => void
}

// ── Persistent settings store ────────────────────────────────────────────────
export const useSettingsStore = create<SettingsState>()(
  persist(
    set => ({
      projectionDays: 30,
      setProjectionDays: days => set({ projectionDays: days })
    }),
    { name: 'settings-storage' }
  )
)