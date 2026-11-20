import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Download,
  FileCode2,
  FilePlus2,
  FileText,
  FolderPlus,
  Info,
  Keyboard,
  ListChecks,
  Palette,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import {
  AI_RESPONSE_LANGUAGE_OPTIONS,
  AI_RESPONSE_STYLE_OPTIONS,
  EDITOR_LINE_HEIGHT_OPTIONS,
  GEMINI_MODEL_OPTIONS,
  PRESET_ACCENT_COLORS,
  STUDY_DIFFICULTY_OPTIONS,
} from '../constants/defaults';
import { PresetColorPicker } from './PresetColorPicker';
import type {
  AiResponseLanguage,
  AiResponseStyle,
  GeminiModelId,
  StudyDifficulty,
  Subject,
  ToastItem,
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
}

interface SettingsModalProps {
  open: boolean;
  settings: WorkspaceSettingsValue;
  onClose: () => void;
  onSave: (next: WorkspaceSettingsValue) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  settings,
  onClose,
  onSave,
}) => {
  const [draft, setDraft] = useState<WorkspaceSettingsValue>(settings);

  useEffect(() => {
    if (open) {
      setDraft(settings);
    }
  }, [open, settings]);

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
              <span>
                La connessione a Gemini AI è gestita automaticamente dal server dell&apos;app: non è necessario inserire manualmente alcuna API key.
              </span>
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
          </div>
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
