import React, { Component, ErrorInfo, ReactNode } from 'react';
import { useTranslation } from 'next-i18next';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleRefresh = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-6 bg-[#030014] rounded-2xl border border-white/10 m-4">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>

            <h2 className="text-2xl font-bold text-white mb-2 font-display">
              Updating Network Data... ⌛
            </h2>

            <p className="text-gray-400 mb-8">
              We encountered a temporary glitch while syncing with the TON Blockchain. The system is auto-healing.
            </p>

            <button
              onClick={this.handleRefresh}
              className="px-6 py-3 bg-gradient-to-r from-gold-400 to-gold-600 hover:from-gold-500 hover:to-gold-700 text-black font-bold rounded-xl transition-all flex items-center gap-2 mx-auto"
            >
              <RefreshCw className="w-5 h-5" />
              Reload Dashboard
            </button>

            <div className="mt-8 p-4 bg-white/5 rounded-lg text-left">
              <p className="text-xs text-gray-500 font-mono break-all">
                Error: {this.state.error?.message || 'Unknown error'}
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
