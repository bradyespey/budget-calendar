//src/components/Layout/Layout.tsx

import { ReactNode } from 'react';
import { Navbar } from './Navbar';

interface LayoutProps {
  children: ReactNode;
  onTransactionsClick?: () => void;
}

export function Layout({ children, onTransactionsClick }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-150">
      {/* Navbar with theme toggle */}
      <Navbar onTransactionsClick={onTransactionsClick} />
      {/* Main content area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}