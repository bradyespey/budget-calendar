//src/context/BalanceContext.tsx

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { getLastSyncTime, getCheckingBalance } from '../api/accounts';

interface BalanceContextType {
  balance:   number | null;
  lastSync:  Date   | null;
  setBalance:   (b: number) => void;
  setLastSync:  (d: Date)   => void;
  refreshBalance: () => Promise<void>;
}

const BalanceContext = createContext<BalanceContextType>({
  balance:   null,
  lastSync:  null,
  setBalance:  () => {},
  setLastSync: () => {},
  refreshBalance: async () => {},
});

export function BalanceProvider({ children }: { children: ReactNode }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // ── Load balance from DB ─────────────────────────────────
  async function loadBalance() {
    try {
      const [b, t] = await Promise.all([
        getCheckingBalance(),
        getLastSyncTime(),
      ]);
      setBalance(b);
      setLastSync(t);
    } catch (e) {
      console.error('BalanceContext init failed', e);
    }
  }

  // ── on mount, seed from the DB ─────────────────────────────────
  useEffect(() => {
    loadBalance();
  }, []);

  return (
    <BalanceContext.Provider
      value={{ 
        balance, 
        lastSync, 
        setBalance, 
        setLastSync,
        refreshBalance: loadBalance 
      }}
    >
      {children}
    </BalanceContext.Provider>
  );
}

export const useBalance = () => useContext(BalanceContext);