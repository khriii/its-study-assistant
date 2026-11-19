import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Errore imprevisto dell’applicazione.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught error:', error, info);
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    let parsedDetails: string | null = null;
    try {
      const parsed = JSON.parse(this.state.message);
      if (parsed && typeof parsed.error === 'string') {
        parsedDetails = `${parsed.error} (${parsed.operationType || 'operazione'} su ${parsed.path || 'risorsa'})`;
      }
    } catch {
      parsedDetails = null;
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-vscode-bg text-slate-800 dark:text-vscode-text">
        <div className="w-full max-w-md bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-2xl p-6 shadow-sm text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center justify-center text-red-600 dark:text-red-400 mx-auto mb-4">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-vscode-textBright mb-2">
            Si è verificato un problema di sincronizzazione
          </h2>
          <p className="text-xs text-slate-500 dark:text-vscode-textMuted leading-relaxed mb-5 break-words">
            {parsedDetails || this.state.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 dark:bg-vscode-blue hover:bg-blue-700 text-white text-xs font-semibold transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Ricarica Workspace</span>
          </button>
        </div>
      </div>
    );
  }
}
