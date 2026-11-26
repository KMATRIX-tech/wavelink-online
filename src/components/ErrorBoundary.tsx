import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Waves, RefreshCw, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Always log the real, unfiltered error to the browser console
    console.error('[WaveLink ErrorBoundary Caught Error]:', error, errorInfo);

    // Non-blocking report to server logging endpoint if available
    try {
      fetch('/api/auth/log-failure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: `ErrorBoundary: ${error?.name || 'Error'}: ${error?.message || 'Unknown'}\nStack: ${error?.stack?.slice(0, 500) || ''}`,
          url: typeof window !== 'undefined' ? window.location.href : '',
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {
        // Non-blocking
      });
    } catch {
      // Non-blocking
    }
  }

  private handleReload = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleResetAndReload = (): void => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.clear();
        localStorage.removeItem('wavelink_last_active_tab');
        localStorage.removeItem('wavelink_last_chat_target');
      }
    } catch {
      // ignore storage access errors
    }
    this.handleReload();
  };

  private toggleDetails = (): void => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-[#F8FAFC] text-[#0F172A] p-4 sm:p-6 select-none font-sans safe-area-top safe-area-bottom">
          <div className="max-w-[26rem] w-full bg-white rounded-2xl shadow-xl border border-slate-200/80 p-6 sm:p-8 text-center flex flex-col items-center">
            {/* WaveLink Logo & Icon */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 mb-4 animate-pulse">
              <Waves size={36} />
            </div>

            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mb-2">
              WaveLink
            </h1>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold mb-4">
              <AlertTriangle size={14} className="text-amber-600 shrink-0" />
              <span>Something went wrong</span>
            </div>

            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              This page had a hiccup while loading. Tap Try again below to open it fresh.
            </p>

            <div className="w-full space-y-2.5">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full min-h-[2.75rem] py-3 px-4 bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                <RefreshCw size={16} />
                <span>Try again</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetAndReload}
                className="w-full min-h-[2.75rem] py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-all active:scale-[0.98] cursor-pointer text-xs flex items-center justify-center gap-1.5"
              >
                <RefreshCw size={14} />
                <span>Reset</span>
              </button>
            </div>
          </div>

          <p className="mt-6 text-xs text-slate-400 font-medium">
            WaveLink
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
