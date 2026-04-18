import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Log to external service if needed
    if (import.meta.env.PROD) {
      // Could send to Sentry, LogRocket, etc.
      console.error('Production error:', error.message, errorInfo);
    }
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="surface-card max-w-md p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--danger-soft)] text-[color:var(--danger)]">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="mt-5">
              <h3 className="display-copy text-[2rem] text-[color:var(--text)]">
                Something went wrong
              </h3>
              <p className="mt-3 text-sm leading-7 text-[color:var(--muted)]">
                The application hit an unexpected error. Refresh the page to reset the current workspace state.
              </p>
              <div className="mt-4">
                <button
                  onClick={() => window.location.reload()}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-transparent bg-[color:var(--accent)] px-5 text-sm font-semibold text-white transition hover:bg-[color:var(--accent-strong)]"
                >
                  Refresh Page
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
