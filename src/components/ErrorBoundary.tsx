import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    retryCount: 0,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = this.state.error?.message || 'An unexpected error occurred.';
      let isFirestoreError = false;

      try {
        const parsed = JSON.parse(errorMessage);
        if (parsed.error && parsed.operationType) {
          isFirestoreError = true;
          errorMessage = parsed.error;
        }
      } catch (e) {
        // Not a JSON error message
      }

      const canRetry = this.state.retryCount < 3;

      return (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-xl shadow-sm border border-zinc-200 max-w-md w-full text-center">
            <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-zinc-600" />
            </div>
            <h2 className="text-xl font-bold text-zinc-900 mb-2">Something went wrong</h2>
            <p className="text-sm text-zinc-600 mb-6">
              {isFirestoreError 
                ? "There was a problem communicating with the database. You might not have permission to perform this action."
                : "An unexpected error occurred in the application."}
            </p>
            <div className="bg-zinc-50 p-4 rounded-lg text-left overflow-auto max-h-48 border border-zinc-200 mb-6">
              <p className="text-xs font-mono text-zinc-800 break-all">
                {errorMessage}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {canRetry && (
                <button
                  onClick={() => {
                    (this as any).setState({
                      hasError: false,
                      error: null,
                      retryCount: this.state.retryCount + 1,
                    });
                  }}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium rounded-lg w-full transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>
              )}
              <button
                onClick={() => window.location.reload()}
                className={`px-4 py-2 text-sm font-medium rounded-lg w-full transition-colors ${
                  canRetry
                    ? 'bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-white'
                }`}
              >
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
