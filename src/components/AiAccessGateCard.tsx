import React, { useState } from 'react';
import {
  Clock,
  Lock,
  Mail,
  RefreshCw,
  Send,
  ShieldAlert,
} from 'lucide-react';
import type { AiAccessRequestResult, AiAccessStatus } from '../types';

interface AiAccessGateCardProps {
  accessStatus: AiAccessStatus;
  onRequestAccess: (note?: string) => Promise<AiAccessRequestResult>;
  onRefreshStatus: () => Promise<void>;
  onToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  compact?: boolean;
}

export const AiAccessGateCard: React.FC<AiAccessGateCardProps> = ({
  accessStatus,
  onRequestAccess,
  onRefreshStatus,
  onToast,
  compact = false,
}) => {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastResult, setLastResult] = useState<AiAccessRequestResult | null>(null);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await onRequestAccess(note.trim());
      setLastResult(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore durante la richiesta.';
      onToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefreshStatus();
    } finally {
      setRefreshing(false);
    }
  };

  const mailtoUrl =
    lastResult && !lastResult.emailSent && lastResult.mailtoUrl ? lastResult.mailtoUrl : null;

  return (
    <div
      className={`bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-2xl shadow-xs ${
        compact ? 'p-3.5' : 'p-4'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-amber-500/12 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-none">
          {accessStatus.pending ? (
            <Clock className="w-4 h-4" />
          ) : accessStatus.rejected ? (
            <ShieldAlert className="w-4 h-4 text-red-500" />
          ) : (
            <Lock className="w-4 h-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-800 dark:text-vscode-textBright">
            {accessStatus.pending
              ? 'Richiesta in attesa di approvazione'
              : accessStatus.rejected
                ? 'Accesso AI non approvato'
                : 'Accesso AI protetto'}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-vscode-textMuted mt-1 leading-relaxed">
            {accessStatus.pending ? (
              <>
                La richiesta per <strong className="text-slate-700 dark:text-vscode-textBright">{accessStatus.email}</strong> è in attesa di conferma da parte di{' '}
                <strong className="text-slate-700 dark:text-vscode-textBright">{accessStatus.adminEmail}</strong>.
              </>
            ) : (
              <>
                Le funzioni Gemini AI utilizzano la quota protetta del server. Richiedi l&apos;abilitazione per{' '}
                <strong className="text-slate-700 dark:text-vscode-textBright">{accessStatus.email}</strong>.
              </>
            )}
          </p>
        </div>
      </div>

      {accessStatus.pending ? (
        <div className="mt-3 flex flex-col gap-2">
          {lastResult?.emailSent ? (
            <div className="text-[11px] px-2.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
              Email di richiesta inviata all&apos;amministratore! Riceverai l&apos;accesso appena approvata.
            </div>
          ) : mailtoUrl ? (
            <div className="text-[11px] px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-slate-700 dark:text-vscode-text space-y-2">
              <div>
                Richiesta salvata in app. L&apos;invio email automatico SMTP non è configurato sul server: puoi avvisare subito l&apos;amministratore via email.
              </div>
              <a
                href={mailtoUrl}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] transition"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Invia email manuale ad admin</span>
              </a>
            </div>
          ) : null}

          <button
            type="button"
            disabled={refreshing}
            onClick={() => void handleRefresh()}
            className="w-full py-2 px-3 rounded-lg bg-slate-100 dark:bg-vscode-input hover:bg-slate-200 dark:hover:bg-vscode-hover border border-slate-200 dark:border-vscode-borderLight text-xs font-medium text-slate-700 dark:text-vscode-textBright flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Verifica stato approvazione</span>
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void handleRequest(e)} className="mt-3 space-y-2">
          <input
            type="text"
            maxLength={240}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota opzionale (es. corso ITS / nome)..."
            className="w-full px-2.5 py-2 bg-slate-50 dark:bg-vscode-input border border-slate-200 dark:border-vscode-borderLight rounded-lg text-xs text-slate-800 dark:text-vscode-textBright focus:outline-none accent-focus"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 px-3 rounded-lg accent-btn text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{submitting ? 'Invio richiesta...' : 'Richiedi approvazione AI'}</span>
          </button>
        </form>
      )}
    </div>
  );
};
