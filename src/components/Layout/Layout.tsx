//src/components/Layout/Layout.tsx

import { ReactNode } from 'react';
import { Navbar } from './Navbar';

interface LayoutProps {
  children: ReactNode;
  onTransactionsClick?: () => void;
}

export function Layout({ children, onTransactionsClick }: LayoutProps) {
  return (
    <div className="min-h-screen overflow-x-clip text-[color:var(--text)] transition-colors duration-150">
      <div className="mx-auto flex min-h-screen max-w-[1880px] flex-col gap-4 px-3 py-4 sm:px-4 lg:flex-row lg:gap-5 lg:px-5 lg:py-5">
        <Navbar onTransactionsClick={onTransactionsClick} />
        <main className="min-w-0 w-full flex-1">
          <div className="surface-card min-h-full p-4 sm:p-5 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
