import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  FileCode2,
  FilePlus2,
  FileText,
  FolderPlus,
  Info,
  Keyboard,
  LayoutGrid,
  ListChecks,
  Loader2,
  Mail,
  Palette,
  PanelLeftClose,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  AI_RESPONSE_LANGUAGE_OPTIONS,
  AI_RESPONSE_STYLE_OPTIONS,
  EDITOR_LINE_HEIGHT_OPTIONS,
  GEMINI_MODEL_OPTIONS,
  LAYOUT_PRESETS,
  PRESET_ACCENT_COLORS,
  STUDY_DIFFICULTY_OPTIONS,
  WINDOW_HEADER_LABEL_OPTIONS,
} from '../constants/defaults';
import {
  decideAiAccessApi,
  fetchAdminAiAccessOverview,
  isStaticHostWithoutAiBackend,
  sendAdminTestEmailApi,
} from '../utils/aiApi';
import { PresetColorPicker } from './PresetColorPicker';
import type {
  AiAccessStatus,
  AiAdminAccessOverview,
  AiResponseLanguage,
  AiResponseStyle,
  GeminiModelId,
  LayoutPresetId,
  StudyDifficulty,
  Subject,
  ToastItem,
  WindowHeaderLabelMode,
} from '../types';

/* 1. Settings Modal (AI Model, Response Style & Language, Flashcard/Quiz Generator, Editor Preferences) */
export interface WorkspaceSettingsValue {
  geminiModel: GeminiModelId;
  aiResponseStyle: AiResponseStyle;
  aiResponseLanguage: AiResponseLanguage;
  defaultFlashcardCount: number;
  defaultQuizCount: number;
  studyDifficulty: StudyDifficulty;
  autoShowQuizExplanations: boolean;
  editorFontSize: number;
  editorLineHeight: number;
  windowHeaderLabelMode: WindowHeaderLabelMode;
}

interface SettingsModalProps {
  open: boolean;
  settings: WorkspaceSettingsValue;
  aiAccessStatus: AiAccessStatus | null;
  isAiAdmin: boolean;
  onToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onClose: () => void;
  onSave: (next: WorkspaceSettingsValue) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  settings,
  aiAccessStatus,
  isAiAdmin,
  onToast,
  onClose,
  onSave,
}) => {
  const [draft, setDraft] = useState<WorkspaceSettingsValue>(settings);
  const [adminOverview, setAdminOverview] = useState<AiAdminAccessOverview | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [decidingEmail, setDecidingEmail] = useState<string | null>(null);
  const [manualEmail, setManualEmail] = useState('');
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [testEmailFeedback, setTestEmailFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const showAdminSection = isAiAdmin || Boolean(aiAccessStatus?.isAdmin);

  const loadAdminOverview = useCallback(async () => {
    if (!showAdminSection) return;
    setAdminLoading(true);
    try {
      const data = await fetchAdminAiAccessOverview();
      setAdminOverview(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Impossibile caricare gli accessi AI.';
      onToast(msg, 'error');
    } finally {
      setAdminLoading(false);
    }
  }, [showAdminSection, onToast]);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setTestEmailFeedback(null);
      if (showAdminSection) {
        void loadAdminOverview();
      } else {
        setAdminOverview(null);
      }
    }
  }, [open, settings, showAdminSection, loadAdminOverview]);

  const handleSendTestEmail = async () => {
    if (testEmailLoading) return;
    setTestEmailLoading(true);
    setTestEmailFeedback(null);
    try {
      const res = await sendAdminTestEmailApi();
      const msg = `Email di test inviata a ${res.to}! Controlla la casella Gmail (anche Spam).`;
      setTestEmailFeedback({ ok: true, message: msg });
      onToast(msg, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore invio test email SMTP.';
      setTestEmailFeedback({ ok: false, message: msg });
      onToast(msg, 'error');
    } finally {
      setTestEmailLoading(false);
    }
  };

  const handleDecision = async (email: string, decision: 'approve' | 'reject' | 'revoke') => {
    setDecidingEmail(email);
    try {
      const updated = await decideAiAccessApi(email, decision);
      setAdminOverview(updated);
      if (decision === 'approve') {
        onToast(`Accesso AI approvato per ${email}.`, 'success');
      } else if (decision === 'reject') {
        onToast(`Richiesta rifiutata per ${email}.`, 'info');
      } else {
        onToast(`Accesso AI revocato per ${email}.`, 'info');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore aggiornamento accesso.';
      onToast(msg, 'error');
    } finally {
      setDecidingEmail(null);
    }
  };

  const handleAddManualEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualEmail.trim().toLowerCase();
    if (!cleaned || !cleaned.includes('@')) {
      onToast('Inserisci un indirizzo email Google valido.', 'info');
      return;
    }
    await handleDecision(cleaned, 'approve');
    setManualEmail('');
  };

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-2xl w-full max-w-lg max-h-[86vh] flex flex-col shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-vscode-border flex justify-between items-center flex-none">
          <h3 className="font-semibold text-sm text-slate-800 dark:text-vscode-textBright flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 accent-icon" />
            <span>Impostazioni &amp; Modello AI</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Highlighted Pending Approvals Banner at top for Admin */}
          {showAdminSection && adminOverview && adminOverview.pendingRequests.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    Richieste di accesso AI in attesa ({adminOverview.pendingRequests.length})
                  </span>
                </div>
                <button
                  type="button"
                  disabled={adminLoading}
                  onClick={() => void loadAdminOverview()}
                  className="text-[11px] text-amber-700 dark:text-amber-300 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${adminLoading ? 'animate-spin' : ''}`} />
                  <span>Aggiorna</span>
                </button>
              </div>
              <div className="space-y-2">
                {adminOverview.pendingRequests.map((reqItem) => {
                  const busy = decidingEmail === reqItem.email;
                  return (
                    <div
                      key={`top_${reqItem.email}`}
                      className="p-2.5 rounded-xl bg-white dark:bg-vscode-sidebar border border-amber-500/30 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-800 dark:text-vscode-textBright truncate">
                          {reqItem.displayName || reqItem.email}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-vscode-textMuted truncate">
                          {reqItem.email}
                        </div>
                        {reqItem.note && (
                          <div className="text-[11px] text-slate-600 dark:text-vscode-text mt-1">
                            &ldquo;{reqItem.note}&rdquo;
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-none">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDecision(reqItem.email, 'approve')}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          <span>Approva</span>
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDecision(reqItem.email, 'reject')}
                          className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                          <span>Rifiuta</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 1: AI Model & Response Style */}
          <div className="space-y-3">
            <div className="text-[11px] font-mono font-semibold uppercase tracking-wider accent-text">
              Modello &amp; Stile Risposte AI
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-vscode-textMuted mb-1.5">
                Modello Gemini Predefinito
              </label>
              <select
                value={draft.geminiModel}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    geminiModel: e.target.value as GeminiModelId,
                  }))
                }
                className="w-full px-3 py-2 bg-slate-50 dark:bg-vscode-input border border-slate-200 dark:border-vscode-borderLight rounded-lg text-xs text-slate-800 dark:text-vscode-textBright focus:outline-none accent-focus"
              >
                {GEMINI_MODEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-vscode-textMuted mb-1.5">
                Stile e Lunghezza Risposte
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {AI_RESPONSE_STYLE_OPTIONS.map((opt) => {
                  const active = draft.aiResponseStyle === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, aiResponseStyle: opt.value }))
                      }
                      className={`px-2.5 py-2 rounded-lg border text-left transition cursor-pointer ${
                        active
                          ? 'accent-soft-bg border-[var(--primary-500)] text-slate-900 dark:text-vscode-textBright'
                          : 'bg-slate-50 dark:bg-vscode-input border-slate-200 dark:border-vscode-borderLight text-slate-600 dark:text-vscode-text hover:bg-slate-100 dark:hover:bg-vscode-hover'
                      }`}
                    >
                      <div className={`text-xs font-semibold ${active ? 'accent-text' : ''}`}>
                        {opt.label}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-vscode-textMuted leading-tight mt-0.5">
                        {opt.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-vscode-textMuted mb-1.5">
                Lingua Predefinita Risposte
              </label>
              <div className="grid grid-cols-2 gap-1.5 bg-slate-100 dark:bg-vscode-input p-1 rounded-lg">
                {AI_RESPONSE_LANGUAGE_OPTIONS.map((lang) => {
                  const active = draft.aiResponseLanguage === lang.value;
                  return (
                    <button
                      key={lang.value}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, aiResponseLanguage: lang.value }))
                      }
                      className={`py-1.5 text-xs rounded-md transition cursor-pointer ${
                        active
                          ? 'bg-white dark:bg-vscode-sidebar accent-text font-semibold shadow-xs border border-slate-200 dark:border-vscode-borderLight'
                          : 'text-slate-600 dark:text-vscode-text hover:bg-white/60 dark:hover:bg-vscode-sidebar/60 border border-transparent'
                      }`}
                    >
                      {lang.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-vscode-bg border border-slate-200 dark:border-vscode-border flex items-start gap-2.5 text-[11px] text-slate-600 dark:text-vscode-textMuted leading-relaxed">
              <Cpu className="w-3.5 h-3.5 accent-icon shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div>
                  {isStaticHostWithoutAiBackend()
                    ? 'Stai usando la versione statica su GitHub Pages: appunti, PDF e sincronizzazione Firebase funzionano, mentre le chiamate Gemini AI vengono eseguite solo tramite il server Node (/api/ai/*) in AI Studio o su un backend collegato con VITE_AI_API_URL (nessuna API key viene inserita nel browser).'
                    : "La connessione a Gemini AI è gestita dal server dell'app con accesso controllato per account Google: non è necessario inserire manualmente alcuna API key."}
                </div>
                {aiAccessStatus && (
                  <div className="font-medium text-slate-700 dark:text-vscode-textBright">
                    Stato account:{' '}
                    {aiAccessStatus.authorized ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Autorizzato ({aiAccessStatus.rateLimitPerMin} req/min)
                      </span>
                    ) : aiAccessStatus.pending ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        In attesa di approvazione ({aiAccessStatus.adminEmail})
                      </span>
                    ) : (
                      <span className="text-red-500">
                        Approvazione richiesta ({aiAccessStatus.adminEmail})
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-vscode-border" />

          {/* Section 2: Flashcard & Quiz Generator Settings */}
          <div className="space-y-3">
            <div className="text-[11px] font-mono font-semibold uppercase tracking-wider accent-text">
              Generatore Flashcards &amp; Quiz
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-vscode-textMuted mb-1.5">
                  Flashcards per Nota (3–10)
                </label>
                <input
                  type="number"
                  min={3}
                  max={10}
                  value={draft.defaultFlashcardCount}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      defaultFlashcardCount: Math.max(
                        3,
                        Math.min(10, Number(e.target.value) || 3),
                      ),
                    }))
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-vscode-input border border-slate-200 dark:border-vscode-borderLight rounded-lg text-xs font-mono tabular-nums text-slate-800 dark:text-vscode-textBright focus:outline-none accent-focus"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-vscode-textMuted mb-1.5">
                  Domande Quiz Default (1–20)
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={draft.defaultQuizCount}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      defaultQuizCount: Math.max(
                        1,
                        Math.min(20, Number(e.target.value) || 1),
                      ),
                    }))
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-vscode-input border border-slate-200 dark:border-vscode-borderLight rounded-lg text-xs font-mono tabular-nums text-slate-800 dark:text-vscode-textBright focus:outline-none accent-focus"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-vscode-textMuted mb-1.5">
                Livello di Difficoltà
              </label>
              <div className="grid grid-cols-3 gap-1.5 bg-slate-100 dark:bg-vscode-input p-1 rounded-lg">
                {STUDY_DIFFICULTY_OPTIONS.map((diff) => {
                  const active = draft.studyDifficulty === diff.value;
                  return (
                    <button
                      key={diff.value}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, studyDifficulty: diff.value }))
                      }
                      className={`py-1.5 text-xs rounded-md transition cursor-pointer ${
                        active
                          ? 'bg-white dark:bg-vscode-sidebar accent-text font-semibold shadow-xs border border-slate-200 dark:border-vscode-borderLight'
                          : 'text-slate-600 dark:text-vscode-text hover:bg-white/60 dark:hover:bg-vscode-sidebar/60 border border-transparent'
                      }`}
                    >
                      {diff.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-vscode-bg border border-slate-200 dark:border-vscode-border cursor-pointer">
              <div>
                <div className="text-xs font-semibold text-slate-800 dark:text-vscode-textBright">
                  Spiegazioni automatiche nei Quiz
                </div>
                <div className="text-[11px] text-slate-500 dark:text-vscode-textMuted">
                  Mostra subito feedback e spiegazione dopo ogni risposta selezionata
                </div>
              </div>
              <input
                type="checkbox"
                checked={draft.autoShowQuizExplanations}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    autoShowQuizExplanations: e.target.checked,
                  }))
                }
                className="w-4 h-4 accent-[var(--primary-600)] rounded cursor-pointer shrink-0"
              />
            </label>
          </div>

          <div className="border-t border-slate-200 dark:border-vscode-border" />

          {/* Section 3: Editor Preferences */}
          <div className="space-y-3">
            <div className="text-[11px] font-mono font-semibold uppercase tracking-wider accent-text">
              Preferenze Editor
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-vscode-textMuted">
                  Dimensione Testo Note (titoli scalati in proporzione)
                </label>
                <span className="text-xs font-mono font-semibold tabular-nums accent-text">
                  {draft.editorFontSize}px
                </span>
              </div>
              <input
                type="range"
                min={13}
                max={18}
                step={1}
                value={draft.editorFontSize}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, editorFontSize: Number(e.target.value) }))
                }
                className="w-full accent-[var(--primary-600)] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-0.5">
                <span>13px</span>
                <span>14px</span>
                <span>15px</span>
                <span>16px</span>
                <span>17px</span>
                <span>18px</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-vscode-textMuted mb-1.5">
                Interlinea
              </label>
              <div className="grid grid-cols-3 gap-1.5 bg-slate-100 dark:bg-vscode-input p-1 rounded-lg">
                {EDITOR_LINE_HEIGHT_OPTIONS.map((lh) => {
                  const active = Math.abs(draft.editorLineHeight - lh.value) < 0.05;
                  return (
                    <button
                      key={lh.value}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, editorLineHeight: lh.value }))
                      }
                      className={`py-1.5 text-[11px] rounded-md transition cursor-pointer ${
                        active
                          ? 'bg-white dark:bg-vscode-sidebar accent-text font-semibold shadow-xs border border-slate-200 dark:border-vscode-borderLight'
                          : 'text-slate-600 dark:text-vscode-text hover:bg-white/60 dark:hover:bg-vscode-sidebar/60 border border-transparent'
                      }`}
                    >
                      {lh.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live Typography Preview */}
            <div
              className="p-3 rounded-xl bg-slate-50 dark:bg-vscode-bg border border-slate-200 dark:border-vscode-border text-slate-800 dark:text-vscode-textBright"
              style={{
                fontSize: `${draft.editorFontSize}px`,
                lineHeight: draft.editorLineHeight,
              }}
            >
              <div style={{ fontSize: '1.38em', fontWeight: 700, lineHeight: 1.25 }}>
                Anteprima Titolo
              </div>
              <div className="text-slate-600 dark:text-vscode-text mt-1">
                Testo di esempio dell&apos;editor a {draft.editorFontSize}px con interlinea{' '}
                {draft.editorLineHeight}.
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-vscode-textMuted mb-1.5">
                Nomi Finestre &amp; Contenitori
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {WINDOW_HEADER_LABEL_OPTIONS.map((opt) => {
                  const active = draft.windowHeaderLabelMode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          windowHeaderLabelMode: opt.value,
                        }))
                      }
                      className={`px-2.5 py-2 rounded-lg border text-left transition cursor-pointer ${
                        active
                          ? 'accent-soft-bg border-[var(--primary-500)] text-slate-900 dark:text-vscode-textBright'
                          : 'bg-slate-50 dark:bg-vscode-input border-slate-200 dark:border-vscode-borderLight text-slate-600 dark:text-vscode-text hover:bg-slate-100 dark:hover:bg-vscode-hover'
                      }`}
                    >
                      <div className={`text-[11px] font-semibold ${active ? 'accent-text' : ''}`}>
                        {opt.label}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-vscode-textMuted leading-tight mt-0.5">
                        {opt.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 4: Admin AI Access Management */}
          {showAdminSection && (
            <>
              <div className="border-t border-slate-200 dark:border-vscode-border" />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-mono font-semibold uppercase tracking-wider accent-text flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Gestione Accessi AI (Admin)</span>
                  </div>
                  <button
                    type="button"
                    disabled={adminLoading}
                    onClick={() => void loadAdminOverview()}
                    className="text-[11px] text-slate-500 hover:text-slate-800 dark:text-vscode-textMuted dark:hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${adminLoading ? 'animate-spin' : ''}`} />
                    <span>Aggiorna</span>
                  </button>
                </div>

                {adminLoading && !adminOverview ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-vscode-textMuted py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Caricamento richieste di accesso...</span>
                  </div>
                ) : adminOverview ? (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-vscode-bg border border-slate-200 dark:border-vscode-border text-[11px] text-slate-600 dark:text-vscode-textMuted space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 accent-icon shrink-0" />
                          <span>
                            Notifiche SMTP:{' '}
                            <strong
                              className={
                                adminOverview.smtpConfigured
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }
                            >
                              {adminOverview.smtpConfigured ? 'Attive' : 'Non configurate'}
                            </strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono tabular-nums text-[10px]">
                            Limite: {adminOverview.rateLimitPerMin} req/min
                          </span>
                          <button
                            type="button"
                            disabled={testEmailLoading || !adminOverview.smtpConfigured}
                            onClick={() => void handleSendTestEmail()}
                            className="px-2.5 py-1 rounded-lg bg-white dark:bg-vscode-input hover:bg-slate-100 dark:hover:bg-vscode-hover border border-slate-200 dark:border-vscode-borderLight text-[11px] font-semibold text-slate-700 dark:text-vscode-textBright flex items-center gap-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            title={
                              adminOverview.smtpConfigured
                                ? `Invia email di prova a ${adminOverview.adminEmail}`
                                : 'Configura prima SMTP_USER e SMTP_PASS nei Secrets di AI Studio'
                            }
                          >
                            {testEmailLoading ? (
                              <Loader2 className="w-3 h-3 animate-spin accent-icon" />
                            ) : (
                              <Send className="w-3 h-3 accent-icon" />
                            )}
                            <span>Invia email di test</span>
                          </button>
                        </div>
                      </div>

                      {testEmailFeedback && (
                        <div
                          className={`p-2 rounded-lg border text-[11px] leading-relaxed ${
                            testEmailFeedback.ok
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                              : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
                          }`}
                        >
                          {testEmailFeedback.message}
                        </div>
                      )}

                      {!adminOverview.smtpConfigured && (
                        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-slate-700 dark:text-vscode-text leading-relaxed space-y-1">
                          <div className="font-semibold text-amber-800 dark:text-amber-300">
                            Checklist AI Studio Secrets per notifiche email a {adminOverview.adminEmail}:
                          </div>
                          <div>
                            1. <code>SMTP_USER</code> = tuo indirizzo Gmail (es. <code>{adminOverview.adminEmail}</code>)
                          </div>
                          <div>
                            2. <code>SMTP_PASS</code> = App Password Gmail a 16 caratteri (Account Google → Sicurezza → Password per le app)
                          </div>
                          <div>
                            3. <code>APPROVAL_TOKEN_SECRET</code> = stringa casuale lunga per firmare i link
                          </div>
                          <div>
                            4. <code>APP_URL</code> = URL condiviso dell&apos;app (senza slash finale) per link diretti &amp; sync Cloud Firestore
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Pending Requests */}
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-slate-700 dark:text-vscode-textBright">
                        Richieste in attesa ({adminOverview.pendingRequests.length})
                      </div>
                      {adminOverview.pendingRequests.length === 0 ? (
                        <div className="text-[11px] text-slate-500 dark:text-vscode-textMuted italic">
                          Nessuna richiesta in sospeso.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {adminOverview.pendingRequests.map((reqItem) => {
                            const busy = decidingEmail === reqItem.email;
                            return (
                              <div
                                key={reqItem.email}
                                className="p-2.5 rounded-xl bg-slate-50 dark:bg-vscode-bg border border-slate-200 dark:border-vscode-border flex items-start justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-slate-800 dark:text-vscode-textBright truncate">
                                    {reqItem.displayName || reqItem.email}
                                  </div>
                                  <div className="text-[11px] font-mono text-slate-500 dark:text-vscode-textMuted truncate">
                                    {reqItem.email}
                                  </div>
                                  {reqItem.note && (
                                    <div className="text-[11px] text-slate-600 dark:text-vscode-text mt-1">
                                      &ldquo;{reqItem.note}&rdquo;
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 flex-none">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void handleDecision(reqItem.email, 'approve')}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Approva</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void handleDecision(reqItem.email, 'reject')}
                                    className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                                  >
                                    <X className="w-3 h-3" />
                                    <span>Rifiuta</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Manual pre-approve */}
                    <form onSubmit={(e) => void handleAddManualEmail(e)} className="flex gap-1.5">
                      <input
                        type="email"
                        value={manualEmail}
                        onChange={(e) => setManualEmail(e.target.value)}
                        placeholder="Autorizza subito un'email Google..."
                        className="flex-1 px-2.5 py-1.5 bg-slate-50 dark:bg-vscode-input border border-slate-200 dark:border-vscode-borderLight rounded-lg text-xs text-slate-800 dark:text-vscode-textBright focus:outline-none accent-focus"
                      />
                      <button
                        type="submit"
                        disabled={decidingEmail !== null || !manualEmail.trim()}
                        className="px-3 py-1.5 rounded-lg accent-btn text-xs font-semibold flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Aggiungi</span>
                      </button>
                    </form>

                    {/* Authorized emails list */}
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-slate-700 dark:text-vscode-textBright">
                        Utenti autorizzati
                      </div>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        <div className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-vscode-bg border border-slate-200 dark:border-vscode-border flex items-center justify-between text-[11px]">
                          <span className="font-mono text-slate-700 dark:text-vscode-textBright truncate">
                            {adminOverview.adminEmail}
                          </span>
                          <span className="text-[10px] font-semibold accent-text">Admin</span>
                        </div>
                        {adminOverview.envAllowedEmails.map((email) => (
                          <div
                            key={`env_${email}`}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-vscode-bg border border-slate-200 dark:border-vscode-border flex items-center justify-between text-[11px]"
                          >
                            <span className="font-mono text-slate-700 dark:text-vscode-textBright truncate">
                              {email}
                            </span>
                            <span className="text-[10px] text-slate-400">da Secrets</span>
                          </div>
                        ))}
                        {adminOverview.approvedEmails
                          .filter(
                            (email) =>
                              email !== adminOverview.adminEmail &&
                              !adminOverview.envAllowedEmails.includes(email),
                          )
                          .map((email) => (
                            <div
                              key={email}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-vscode-bg border border-slate-200 dark:border-vscode-border flex items-center justify-between gap-2 text-[11px]"
                            >
                              <span className="font-mono text-slate-700 dark:text-vscode-textBright truncate">
                                {email}
                              </span>
                              <button
                                type="button"
                                disabled={decidingEmail === email}
                                onClick={() => void handleDecision(email, 'revoke')}
                                className="text-[11px] text-red-500 hover:underline font-medium shrink-0 cursor-pointer"
                              >
                                Revoca
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>

                    {adminOverview.suggestedAllowedEnv && (
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-vscode-bg border border-slate-200 dark:border-vscode-border space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-semibold text-slate-700 dark:text-vscode-textBright">
                            Backup per Secret <code>ALLOWED_USER_EMAILS</code>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(adminOverview.suggestedAllowedEnv);
                              onToast('Valore ALLOWED_USER_EMAILS copiato negli appunti.', 'success');
                            }}
                            className="text-[11px] accent-text hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copia</span>
                          </button>
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 dark:text-vscode-textMuted break-all">
                          {adminOverview.suggestedAllowedEnv}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 bg-slate-50 dark:bg-vscode-bg border-t border-slate-200 dark:border-vscode-border flex justify-end gap-2 flex-none">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-hover rounded-lg transition cursor-pointer"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="px-4 py-2 text-xs font-semibold accent-btn rounded-lg transition shadow-xs cursor-pointer"
          >
            Salva
          </button>
        </div>
      </div>
    </div>
  );
};

/* 2. Subject Customize Modal */
interface SubjectCustomizeModalProps {
  open: boolean;
  subject: Subject | null;
  canDelete: boolean;
  onClose: () => void;
  onSave: (subjectId: string, name: string, color: string, systemPrompt: string) => Promise<void>;
  onDeleteRequest: (subject: Subject) => void;
}

export const SubjectCustomizeModal: React.FC<SubjectCustomizeModalProps> = ({
  open,
  subject,
  canDelete,
  onClose,
  onSave,
  onDeleteRequest,
}) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [prompt, setPrompt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && subject) {
      setName(subject.name);
      setColor(subject.color || '#3b82f6');
      setPrompt(subject.systemPrompt || '');
    }
  }, [open, subject]);

  if (!open || !subject) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave(subject.id, name.trim(), color, prompt.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
    >
      <form
        onSubmit={(e) => void handleSave(e)}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-vscode-border flex justify-between items-center">
          <h3 className="font-semibold text-sm text-slate-800 dark:text-vscode-textBright flex items-center gap-2">
            <Palette className="w-4 h-4 accent-icon" />
            <span>Personalizza Materia</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-600 dark:text-vscode-textMuted uppercase tracking-wider mb-1.5">
                Nome Materia
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-50 dark:bg-vscode-input border border-slate-200 dark:border-vscode-borderLight rounded-lg text-sm text-slate-800 dark:text-vscode-textBright focus:outline-none accent-focus"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-vscode-textMuted uppercase tracking-wider mb-1.5">
                Accento
              </label>
              <PresetColorPicker
                value={color}
                presets={PRESET_ACCENT_COLORS}
                onSelect={setColor}
                align="right"
                title="Scegli colore accento materia"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-vscode-textMuted uppercase tracking-wider mb-1.5">
              Istruzioni Tutor AI (System Prompt)
            </label>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Es. Sei un docente ITS esperto di reti..."
              className="w-full px-3 py-2 bg-slate-50 dark:bg-vscode-input border border-slate-200 dark:border-vscode-borderLight rounded-lg text-xs text-slate-800 dark:text-vscode-textBright focus:outline-none accent-focus resize-none leading-relaxed"
            />
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50 dark:bg-vscode-bg border-t border-slate-200 dark:border-vscode-border flex justify-between items-center">
          {canDelete ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onDeleteRequest(subject);
              }}
              className="px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Elimina Materia</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-hover rounded-lg transition cursor-pointer"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-4 py-2 text-xs font-semibold accent-btn rounded-lg transition shadow-xs disabled:opacity-50 cursor-pointer"
            >
              Salva Modifiche
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

/* 3. New Subject Modal */
interface NewSubjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, color: string, systemPrompt: string) => Promise<void>;
}

export const NewSubjectModal: React.FC<NewSubjectModalProps> = ({
  open,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setColor('#3b82f6');
      setSystemPrompt('');
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      await onCreate(name.trim(), color, systemPrompt.trim());
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-vscode-border flex justify-between items-center">
          <h3 className="font-semibold text-sm text-slate-800 dark:text-vscode-textBright flex items-center gap-2">
            <Plus className="w-4 h-4 accent-icon" />
            <span>Nuova Unità Didattica</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-600 dark:text-vscode-textMuted uppercase tracking-wider mb-1.5">
                Nome Materia
              </label>
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Es. Basi di Dati, Reti, Cloud..."
                required
                className="w-full px-3 py-2 bg-slate-50 dark:bg-vscode-input border border-slate-200 dark:border-vscode-borderLight rounded-lg text-sm text-slate-800 dark:text-vscode-textBright focus:outline-none accent-focus"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-vscode-textMuted uppercase tracking-wider mb-1.5">
                Colore
              </label>
              <PresetColorPicker
                value={color}
                presets={PRESET_ACCENT_COLORS}
                onSelect={setColor}
                align="right"
                title="Scegli colore materia"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-vscode-textMuted uppercase tracking-wider mb-1.5">
              Istruzioni Tutor AI (System Prompt)
            </label>
            <textarea
              rows={3}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Es. Sei un docente ITS esperto di reti e protocolli TCP/IP. Rispondi con esempi pratici..."
              className="w-full px-3 py-2 bg-slate-50 dark:bg-vscode-input border border-slate-200 dark:border-vscode-borderLight rounded-lg text-xs text-slate-800 dark:text-vscode-textBright focus:outline-none accent-focus resize-none leading-relaxed"
            />
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50 dark:bg-vscode-bg border-t border-slate-200 dark:border-vscode-border flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-hover rounded-lg transition cursor-pointer"
          >
            Annulla
          </button>
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="px-4 py-2 text-xs font-semibold accent-btn rounded-lg transition shadow-xs disabled:opacity-50 cursor-pointer"
          >
            Crea Materia
          </button>
        </div>
      </form>
    </div>
  );
};

/* 4. Ask AI About Selection Modal */
interface AskAiSelectionModalProps {
  open: boolean;
  selectedText: string;
  onClose: () => void;
  onSubmit: (question: string, selectedText: string) => void;
}

export const AskAiSelectionModal: React.FC<AskAiSelectionModalProps> = ({
  open,
  selectedText,
  onClose,
  onSubmit,
}) => {
  const [question, setQuestion] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuestion('');
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    onSubmit(question.trim(), selectedText);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-vscode-border flex justify-between items-center">
          <h3 className="font-semibold text-sm text-slate-800 dark:text-vscode-textBright flex items-center gap-2">
            <Sparkles className="w-4 h-4 accent-icon" />
            <span>Chiedi al Tutor AI sul testo</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-3 accent-soft-bg border border-[var(--primary-500)]/30 dark:border-vscode-borderLight rounded-xl text-xs italic text-slate-600 dark:text-vscode-textMuted max-h-28 overflow-y-auto leading-relaxed">
            &ldquo;{selectedText}&rdquo;
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-vscode-textMuted uppercase tracking-wider mb-1.5">
              La tua domanda
            </label>
            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Es. Fammi un esempio pratico, oppure traduci..."
              required
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-vscode-input border border-slate-200 dark:border-vscode-borderLight rounded-lg text-sm text-slate-800 dark:text-vscode-textBright focus:outline-none accent-focus"
            />
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50 dark:bg-vscode-bg border-t border-slate-200 dark:border-vscode-border flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-hover rounded-lg transition cursor-pointer"
          >
            Annulla
          </button>
          <button
            type="submit"
            disabled={!question.trim()}
            className="px-4 py-2 text-xs font-semibold accent-btn rounded-lg transition shadow-xs disabled:opacity-50 cursor-pointer"
          >
            Invia all&apos;AI Chat
          </button>
        </div>
      </form>
    </div>
  );
};

/* 5. Reusable Italian Confirmation Dialog */
interface ConfirmDialogModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmDialogModal: React.FC<ConfirmDialogModalProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Elimina',
  onCancel,
  onConfirm,
}) => {
  if (!open) return null;

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[60] flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-vscode-border flex justify-between items-center">
          <h3 className="font-semibold text-sm text-slate-800 dark:text-vscode-textBright flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-500" />
            <span>{title}</span>
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 text-xs text-slate-600 dark:text-vscode-text leading-relaxed">
          {message}
        </div>

        <div className="px-5 py-3 bg-slate-50 dark:bg-vscode-bg border-t border-slate-200 dark:border-vscode-border flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-hover rounded-lg transition cursor-pointer"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className="px-4 py-2 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition shadow-xs cursor-pointer"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/* 6. Keybindings Modal */
interface KeybindingsModalProps {
  open: boolean;
  onClose: () => void;
}

export const KeybindingsModal: React.FC<KeybindingsModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  const shortcuts = [
    { label: 'Nuova Nota nella materia attiva', keys: 'Alt + N' },
    { label: 'Cerca nella nota attiva', keys: 'Ctrl + F' },
    { label: 'Command Palette rapida', keys: 'Ctrl + K' },
    { label: 'Command Palette alternativa', keys: 'Ctrl + Shift + P' },
    { label: 'Filtro materie in Command Palette', keys: '>u' },
    { label: 'Ripristina finestra massimizzata / Chiudi finestre', keys: 'Esc' },
  ];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-vscode-border flex justify-between items-center">
          <h3 className="font-semibold text-sm text-slate-800 dark:text-vscode-textBright flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-purple-500" />
            <span>Scorciatoie da Tastiera</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-2.5">
          {shortcuts.map((s) => (
            <div
              key={s.label}
              className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 dark:bg-vscode-bg border border-slate-200 dark:border-vscode-border text-xs"
            >
              <span className="text-slate-700 dark:text-vscode-text">{s.label}</span>
              <kbd className="px-2 py-0.5 rounded bg-white dark:bg-vscode-input border border-slate-200 dark:border-vscode-borderLight font-mono text-[11px] font-semibold text-slate-800 dark:text-vscode-textBright">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 bg-slate-50 dark:bg-vscode-bg border-t border-slate-200 dark:border-vscode-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold accent-btn rounded-lg transition cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};

/* 7. Command Palette Modal (Ctrl+K / >u Subject Filter) */
interface CommandItem {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  run: () => void;
}

interface CommandPaletteModalProps {
  open: boolean;
  subjects: Subject[];
  hasActiveNote: boolean;
  onClose: () => void;
  onCreateNote: () => void;
  onCreateFolder: () => void;
  onNewSubject: () => void;
  onSearchInNote: () => void;
  onExportPDF: () => void;
  onExportMD: () => void;
  onExportHTML: () => void;
  onAiSummarize: () => void;
  onCreateQuiz: () => void;
  onOpenSettings: () => void;
  onSelectSubject: (subjectId: string) => void;
  onApplyLayoutPreset: (presetId: LayoutPresetId) => void;
  onToggleCollapseExplorer: () => void;
  onRestoreDefaultLayout: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  open,
  subjects,
  hasActiveNote,
  onClose,
  onCreateNote,
  onCreateFolder,
  onNewSubject,
  onSearchInNote,
  onExportPDF,
  onExportMD,
  onExportHTML,
  onAiSummarize,
  onCreateQuiz,
  onOpenSettings,
  onSelectSubject,
  onApplyLayoutPreset,
  onToggleCollapseExplorer,
  onRestoreDefaultLayout,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const items: CommandItem[] = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed.toLowerCase().startsWith('>u')) {
      const filter = trimmed.slice(2).trim().toLowerCase();
      return subjects
        .filter((s) => s.name.toLowerCase().includes(filter))
        .map((s) => ({
          id: `sub_${s.id}`,
          label: `Passa alla materia: ${s.name}`,
          hint: 'Materia',
          icon: (
            <span
              className="w-3 h-3 rounded-full inline-block shrink-0"
              style={{ backgroundColor: s.color }}
            />
          ),
          run: () => onSelectSubject(s.id),
        }));
    }

    const base: CommandItem[] = [
      {
        id: 'new_note',
        label: 'Crea Nuova Nota',
        hint: 'Alt + N',
        icon: <FilePlus2 className="w-3.5 h-3.5 text-blue-500" />,
        run: onCreateNote,
      },
      {
        id: 'new_folder',
        label: 'Crea Nuova Cartella',
        hint: 'Explorer',
        icon: <FolderPlus className="w-3.5 h-3.5 text-amber-500" />,
        run: onCreateFolder,
      },
      {
        id: 'new_subject',
        label: 'Crea Nuova Materia',
        hint: 'Workspace',
        icon: <Plus className="w-3.5 h-3.5 text-emerald-500" />,
        run: onNewSubject,
      },
      ...(hasActiveNote
        ? [
            {
              id: 'search_note',
              label: 'Cerca nella Nota Attiva',
              hint: 'Ctrl + F',
              icon: <Search className="w-3.5 h-3.5 text-slate-500" />,
              run: onSearchInNote,
            },
            {
              id: 'ai_summarize',
              label: 'AI: Riassumi Nota Attiva',
              hint: 'Tutor AI',
              icon: <Sparkles className="w-3.5 h-3.5 text-purple-500" />,
              run: onAiSummarize,
            },
            {
              id: 'ai_quiz',
              label: 'AI: Crea Quiz dalla Nota Attiva',
              hint: 'Quiz',
              icon: <ListChecks className="w-3.5 h-3.5 text-indigo-500" />,
              run: onCreateQuiz,
            },
            {
              id: 'exp_pdf',
              label: 'Esporta Nota in PDF / Stampa',
              hint: 'Export',
              icon: <FileText className="w-3.5 h-3.5 text-red-500" />,
              run: onExportPDF,
            },
            {
              id: 'exp_md',
              label: 'Esporta Nota in Markdown (.md)',
              hint: 'Export',
              icon: <FileCode2 className="w-3.5 h-3.5 text-blue-500" />,
              run: onExportMD,
            },
            {
              id: 'exp_html',
              label: 'Esporta Nota in HTML (.html)',
              hint: 'Export',
              icon: <Download className="w-3.5 h-3.5 text-amber-500" />,
              run: onExportHTML,
            },
          ]
        : []),
      {
        id: 'settings',
        label: 'Apri Impostazioni Modello AI',
        hint: 'Preferenze',
        icon: <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />,
        run: onOpenSettings,
      },
      ...LAYOUT_PRESETS.map((preset) => ({
        id: `preset_${preset.id}`,
        label: `Layout: ${preset.label} (${preset.description})`,
        hint: 'Layout',
        icon: <LayoutGrid className="w-3.5 h-3.5 accent-icon" />,
        run: () => onApplyLayoutPreset(preset.id),
      })),
      {
        id: 'toggle_explorer',
        label: 'Comprimi / Espandi Explorer',
        hint: 'Layout',
        icon: <PanelLeftClose className="w-3.5 h-3.5 text-amber-500" />,
        run: onToggleCollapseExplorer,
      },
      {
        id: 'restore_layout',
        label: 'Ripristina Layout Predefinito',
        hint: 'Layout',
        icon: <RotateCcw className="w-3.5 h-3.5 text-slate-500" />,
        run: onRestoreDefaultLayout,
      },
      ...subjects.map((s) => ({
        id: `switch_${s.id}`,
        label: `Cambia materia → ${s.name}`,
        hint: '>u',
        icon: (
          <span
            className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
            style={{ backgroundColor: s.color }}
          />
        ),
        run: () => onSelectSubject(s.id),
      })),
    ];

    const lower = trimmed.toLowerCase();
    if (!lower) return base;
    return base.filter(
      (item) =>
        item.label.toLowerCase().includes(lower) ||
        item.hint.toLowerCase().includes(lower),
    );
  }, [
    query,
    subjects,
    hasActiveNote,
    onCreateNote,
    onCreateFolder,
    onNewSubject,
    onSearchInNote,
    onExportPDF,
    onExportMD,
    onExportHTML,
    onAiSummarize,
    onCreateQuiz,
    onOpenSettings,
    onSelectSubject,
    onApplyLayoutPreset,
    onToggleCollapseExplorer,
    onRestoreDefaultLayout,
  ]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  const executeItem = (item: CommandItem | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-start justify-center pt-[14vh] p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-3.5 py-3 border-b border-slate-200 dark:border-vscode-border flex items-center gap-2.5">
          <Terminal className="w-4 h-4 accent-icon shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => (items.length ? (prev + 1) % items.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) =>
                  items.length ? (prev - 1 + items.length) % items.length : 0,
                );
              } else if (e.key === 'Enter') {
                e.preventDefault();
                executeItem(items[selectedIndex]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="Cerca comando o scrivi '>u' per cambiare materia..."
            className="flex-1 bg-transparent text-sm text-slate-800 dark:text-vscode-textBright focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto p-1.5 space-y-0.5">
          {items.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 dark:text-vscode-textMuted">
              Nessun comando trovato.
            </div>
          ) : (
            items.map((item, idx) => {
              const active = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => executeItem(item)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between gap-2 transition cursor-pointer ${
                    active
                      ? 'accent-selected-row font-medium'
                      : 'text-slate-700 dark:text-vscode-text hover:bg-slate-100 dark:hover:bg-vscode-hover'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 dark:text-vscode-textMuted shrink-0">
                    {item.hint}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

/* 8. Toast Notification Container */
export const ToastContainer: React.FC<{ toasts: ToastItem[] }> = ({ toasts }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-16 lg:bottom-4 right-4 z-[80] flex flex-col gap-2 pointer-events-none max-w-xs sm:max-w-sm">
      {toasts.map((t) => {
        const icon =
          t.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : t.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          ) : (
            <Info className="w-4 h-4 accent-icon shrink-0" />
          );
        return (
          <div
            key={t.id}
            className="pointer-events-auto bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-xl px-3.5 py-2.5 shadow-xl flex items-center gap-2.5 text-xs text-slate-800 dark:text-vscode-textBright"
          >
            {icon}
            <span className="leading-snug">{t.message}</span>
          </div>
        );
      })}
    </div>
  );
};
