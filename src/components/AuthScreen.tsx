import React from 'react';
import {
  BookOpen,
  GraduationCap,
  Layers,
  ListChecks,
  LogIn,
  Moon,
  Sparkles,
  Sun,
} from 'lucide-react';
import { APP_VERSION } from '../constants/defaults';
import type { ThemeMode } from '../types';

interface AuthScreenProps {
  onLogin: () => void;
  themeMode: ThemeMode;
  onSetThemeMode: (mode: ThemeMode) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onLogin,
  themeMode,
  onSetThemeMode,
}) => {
  const isDark =
    themeMode === 'dark' ||
    (themeMode === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-vscode-bg text-slate-800 dark:text-vscode-text transition-colors duration-200">
      <header className="h-14 px-6 border-b border-slate-200 dark:border-vscode-border bg-white dark:bg-vscode-sidebar flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 dark:bg-vscode-blue text-white flex items-center justify-center shadow-xs shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-vscode-textBright whitespace-nowrap">
              ITS Study Assistant
            </span>
            <span className="text-[10px] font-mono font-medium text-slate-400 dark:text-vscode-textMuted leading-none mt-0.5">
              {APP_VERSION}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onSetThemeMode(isDark ? 'light' : 'dark')}
          className="h-9 px-3 rounded-lg border border-slate-200 dark:border-vscode-borderLight bg-slate-100 dark:bg-vscode-input hover:bg-slate-200 dark:hover:bg-vscode-hover text-xs font-medium text-slate-700 dark:text-vscode-textBright flex items-center gap-2 transition cursor-pointer"
          aria-label="Cambia tema"
        >
          {isDark ? <Sun className="w-3.5 h-3.5 text-amber-500" /> : <Moon className="w-3.5 h-3.5 text-blue-500" />}
          <span>{isDark ? 'Chiaro' : 'Scuro'}</span>
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-2xl p-8 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-vscode-input border border-blue-100 dark:border-vscode-borderLight text-blue-600 dark:text-blue-400 flex items-center justify-center mb-5">
            <GraduationCap className="w-6 h-6" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-vscode-textBright mb-2 text-balance">
            Il tuo workspace di studio ITS, sincronizzato ovunque
          </h1>
          <p className="text-sm text-slate-600 dark:text-vscode-textMuted leading-relaxed mb-6">
            Organizza appunti rich-text con blocchi di codice, ripassa con flashcard e quiz a scelta multipla, visualizza slide PDF e chiedi aiuto al Tutor AI Gemini su qualsiasi dispositivo.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-7 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-vscode-bg border border-slate-200 dark:border-vscode-border flex items-start gap-2.5">
              <BookOpen className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-slate-800 dark:text-vscode-textBright">Appunti &amp; Codice</div>
                <div className="text-slate-500 dark:text-vscode-textMuted mt-0.5">Editor rich-text, tabelle, callout ed export MD/HTML/PDF</div>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-vscode-bg border border-slate-200 dark:border-vscode-border flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-slate-800 dark:text-vscode-textBright">Tutor AI Gemini</div>
                <div className="text-slate-500 dark:text-vscode-textMuted mt-0.5">Chat multimodale e spiegazioni contestuali sugli appunti</div>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-vscode-bg border border-slate-200 dark:border-vscode-border flex items-start gap-2.5">
              <Layers className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-slate-800 dark:text-vscode-textBright">Flashcard 3D</div>
                <div className="text-slate-500 dark:text-vscode-textMuted mt-0.5">Ripasso attivo generato automaticamente dalle tue note</div>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-vscode-bg border border-slate-200 dark:border-vscode-border flex items-start gap-2.5">
              <ListChecks className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-slate-800 dark:text-vscode-textBright">Quiz A/B/C/D</div>
                <div className="text-slate-500 dark:text-vscode-textMuted mt-0.5">Simulazioni con correzione immediata e storico svolti</div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogin}
            className="w-full h-11 rounded-xl bg-blue-600 dark:bg-vscode-blue hover:bg-blue-700 dark:hover:bg-vscode-blueHover text-white font-semibold text-sm flex items-center justify-center gap-2.5 transition shadow-xs cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>Accedi con Google</span>
          </button>

          <p className="text-[11px] text-center text-slate-400 dark:text-vscode-textMuted mt-4">
            I tuoi appunti, flashcard e quiz sono protetti e salvati nel tuo spazio cloud privato.
          </p>
        </div>
      </main>
    </div>
  );
};
