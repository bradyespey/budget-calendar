//src/stores/settingsStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  projectionDays: number;
  setProjectionDays: (days: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      projectionDays: 30,
      setProjectionDays: (days) => set({ projectionDays: days }),
    }),
    {
      name: 'settings-storage',
    }
  )
);