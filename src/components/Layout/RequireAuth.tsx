//src/components/Layout/RequireAuth.tsx

import { useAuth } from '../../context/AuthContext';

interface RequireAuthProps {
  children: React.ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="surface-card flex items-center gap-3 px-6 py-5">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[color:var(--line)] border-t-[color:var(--accent)]" />
          <div>
            <p className="eyebrow mb-2">Loading</p>
            <p className="text-sm text-[color:var(--muted)]">Preparing your budget workspace.</p>
          </div>
        </div>
      </div>
    );
  }

  // Allow access even if not authenticated (Demo Mode)
  return <>{children}</>;
}
