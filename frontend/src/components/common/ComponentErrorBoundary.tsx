import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    name?: string;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class ComponentErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error(`Uncaught error in ${this.props.name || 'component'}:`, error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-5 h-5" />
                        <span className="font-semibold">Component Error</span>
                    </div>
                    <p className="text-sm opacity-80">
                        {this.props.name ? `Error in ${this.props.name}: ` : ''}
                        {this.state.error?.message || 'Something went wrong'}
                    </p>
                </div>
            );
        }

        return this.props.children;
    }
}
