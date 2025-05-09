//src/context/BalanceContext.tsx

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { getLastSyncTime, getTotalBalance } from '../api/accounts'

interface BalanceContextType {
  balance: number | null
  lastSync: Date | null
  setBalance: (b: number) => void
  setLastSync: (d: Date) => void
}

const BalanceContext = createContext<BalanceContextType>({
  balance: null,
  lastSync: null,
  setBalance: () => {},
  setLastSync: () => {},
})

export function BalanceProvider({ children }: { children: ReactNode }) {
  const [balance, setBalance] = useState<number | null>(null)
  const [lastSync, setLastSync] = useState<Date | null>(null)

  // on mount, seed from the DB
  useEffect(() => {
    async function load() {
      try {
        const [b, t] = await Promise.all([
          getTotalBalance(),
          getLastSyncTime(),
        ])
        setBalance(b)
        setLastSync(t)
      } catch (e) {
        console.error('BalanceContext init failed', e)
      }
    }
    load()
  }, [])

  return (
    <BalanceContext.Provider value={{ balance, lastSync, setBalance, setLastSync }}>
      {children}
    </BalanceContext.Provider>
  )
}

export const useBalance = () => useContext(BalanceContext)