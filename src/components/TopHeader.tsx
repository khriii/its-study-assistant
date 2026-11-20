import React, { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AppWindow,
  Bot,
  Check,
  ChevronDown,
  Code,
  Download,
  FileText,
  FolderTree,
  GraduationCap,
  Keyboard,
  Layers,
  ListChecks,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  Terminal,
  Upload,
  User as UserIcon,
} from 'lucide-react';
import { WORKSPACE_WINDOWS } from '../constants/defaults';
import type { Subject, ThemeMode, WindowId } from '../types';

interface TopHeaderProps {
  user: User;
  subjects: Subject[];
  currentSubject: Subject | null;
  themeMode: ThemeMode;
  windowVisibility: Record<WindowId, boolean>;
  onSelectSubject: (id: string) => void;
  onOpenSubjectCustomize: (subject: Subject) => void;
  onOpenNewSubject: () => void;
  onOpenCommandPalette: () => void;
  onToggleWindow: (id: WindowId) => void;
  onRestoreDefaultWindows: () => void;
  onSetThemeMode: (mode: ThemeMode) => void;
  onOpenSettings: () => void;
  onOpenKeybindings: () => void;
  onExportBackup: () => void;
  onImportBackupFile: (file: File) => void;
  onLogout: () => void;
  onToggleMobileDrawer: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  user,
  subjects,
  currentSubject,
  themeMode,
  windowVisibility,
  onSelectSubject,
  onOpenSubjectCustomize,
  onOpenNewSubject,
  onOpenCommandPalette,
  onToggleWindow,
  onRestoreDefaultWindows,
  onSetThemeMode,
  onOpenSettings,
  onOpenKeybindings,
  onExportBackup,
  onImportBackupFile,
  onLogout,
  onToggleMobileDrawer,
}) => {
  const [openMenu, setOpenMenu] = useState<'subject' | 'windows' | 'profile' | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const activeWindowCount = WORKSPACE_WINDOWS.filter((w) => windowVisibility[w.id]).length;
  const isDefaultWindows =
    windowVisibility.sidebar &&
    windowVisibility['left-panel'] &&
    windowVisibility['right-panel'] &&
    !windowVisibility['pdf-viewer-panel'] &&
    !windowVisibility['flashcards-panel'] &&
    !windowVisibility['quiz-panel'];

  return (
    <header
      ref={headerRef}
      className="h-12 px-2.5 sm:px-3 bg-white dark:bg-vscode-sidebar border-b border-slate-200 dark:border-vscode-border flex items-center justify-between lg:grid lg:grid-cols-[1fr_auto_1fr] gap-2 flex-none z-30 select-none"
    >
      {/* Left: Mobile Drawer Button, Brand & Subject Selector */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 lg:justify-self-start">
        <button
          type="button"
          onClick={onToggleMobileDrawer}
          className="lg:hidden w-10 h-10 -ml-1 flex items-center justify-center rounded-lg text-slate-600 dark:text-vscode-text hover:bg-slate-100 dark:hover:bg-vscode-hover transition shrink-0 cursor-pointer"
          title="Apri Explorer Appunti"
          aria-label="Apri Explorer Appunti"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 flex-none">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-xs shrink-0"
            style={{ backgroundColor: 'var(--primary-600)' }}
          >
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="hidden md:flex flex-col leading-tight">
            <span className="font-bold text-sm tracking-tight text-slate-800 dark:text-vscode-textBright whitespace-nowrap">
              ITS Study Assistant
            </span>
            <span className="text-[10px] font-mono font-medium text-slate-400 dark:text-vscode-textMuted leading-none mt-0.5">
              v1.0.1
            </span>
          </div>
        </div>

        <div className="h-4 w-px bg-slate-200 dark:bg-vscode-borderLight hidden sm:block" />

        {/* Subject Dropdown */}
        <div className="relative min-w-0">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'subject' ? null : 'subject')}
            className="h-8 px-2.5 bg-slate-100 dark:bg-vscode-input hover:bg-slate-200 dark:hover:bg-vscode-hover border border-slate-200 dark:border-vscode-borderLight rounded-lg text-xs font-medium text-slate-700 dark:text-vscode-textBright flex items-center gap-2 transition min-w-0 cursor-pointer"
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-none"
              style={{ backgroundColor: currentSubject?.color || '#3b82f6' }}
            />
            <span className="truncate max-w-[115px] sm:max-w-[190px]">
              {currentSubject?.name || 'Seleziona Materia'}
            </span>
            <ChevronDown className="w-3 h-3 opacity-70 shrink-0" />
          </button>

          {openMenu === 'subject' && (
            <div className="absolute left-0 mt-1.5 w-72 bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-xl shadow-xl z-50 p-1.5">
              <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 dark:text-vscode-textMuted">
                Unità Didattiche / Materie
              </div>
              <div className="max-h-60 overflow-y-auto space-y-0.5 my-1">
                {subjects.map((sub) => {
                  const isSelected = sub.id === currentSubject?.id;
                  return (
                    <div
                      key={sub.id}
                      className={`group flex items-center gap-1 rounded-lg transition ${
                        isSelected
                          ? 'accent-selected-row'
                          : 'text-slate-700 dark:text-vscode-text hover:bg-slate-100 dark:hover:bg-vscode-hover'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSubject(sub.id);
                          setOpenMenu(null);
                        }}
                        className={`flex-1 min-w-0 text-left px-2.5 py-1.5 text-xs flex items-center justify-between gap-2 cursor-pointer ${
                          isSelected ? 'font-semibold' : ''
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-none"
                            style={{ backgroundColor: sub.color }}
                          />
                          <span className="truncate">{sub.name}</span>
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 accent-icon shrink-0" />}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenu(null);
                          onOpenSubjectCustomize(sub);
                        }}
                        className="w-7 h-7 mr-0.5 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-800 dark:hover:text-vscode-textBright hover:bg-black/5 dark:hover:bg-white/10 transition shrink-0 cursor-pointer"
                        title={`Modifica "${sub.name}" (nome, colore accento, istruzioni AI)`}
                        aria-label={`Modifica ${sub.name}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-slate-100 dark:border-vscode-border pt-1 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    onOpenNewSubject();
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-xs font-medium accent-text accent-hover-soft rounded-lg transition flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nuova Materia</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Center: Command Palette Trigger (independently centered on desktop) */}
      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="hidden lg:flex lg:justify-self-center items-center gap-3 px-3 py-1.5 bg-slate-100 dark:bg-vscode-input hover:bg-slate-200 dark:hover:bg-vscode-hover border border-slate-200 dark:border-vscode-borderLight rounded-lg text-xs text-slate-500 dark:text-vscode-textMuted transition w-60 justify-between cursor-pointer"
      >
        <span className="flex items-center gap-2 truncate">
          <Terminal className="w-3.5 h-3.5 shrink-0" />
          <span>Comandi rapidi...</span>
        </span>
        <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-border rounded">
          Ctrl+K
        </kbd>
      </button>

      {/* Right: Windows Dropdown & Profile Menu */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-none lg:justify-self-end">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-vscode-input border border-slate-200 dark:border-vscode-borderLight text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-hover transition cursor-pointer"
          title="Comandi rapidi (Ctrl+K)"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>

        {/* Desktop Windows Visibility Dropdown */}
        <div className="relative hidden lg:block">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'windows' ? null : 'windows')}
            className="h-8 px-2.5 bg-slate-100 dark:bg-vscode-input hover:bg-slate-200 dark:hover:bg-vscode-hover border border-slate-200 dark:border-vscode-borderLight rounded-lg text-xs font-medium text-slate-700 dark:text-vscode-textBright flex items-center gap-2 transition whitespace-nowrap cursor-pointer"
            title="Mostra o nascondi finestre nel layout"
          >
            <AppWindow className="w-3.5 h-3.5 accent-icon" />
            <span>Finestre</span>
            <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-vscode-textMuted">
              {activeWindowCount}/3
            </span>
            <ChevronDown className="w-3 h-3 opacity-70" />
          </button>

          {openMenu === 'windows' && (
            <div className="absolute right-0 mt-1.5 w-60 bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-xl shadow-xl z-50 p-1.5">
              <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-vscode-border mb-1 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-vscode-textMuted">
                  Finestre Layout
                </span>
                <span className="text-[11px] font-mono tabular-nums font-semibold accent-text">
                  {activeWindowCount}/3
                </span>
              </div>

              <div className="space-y-0.5 my-1">
                {WORKSPACE_WINDOWS.map((win) => {
                  const isOn = !!windowVisibility[win.id];
                  const iconColor = isOn ? win.colorClass : 'text-slate-400';
                  const WindowIcon =
                    win.id === 'sidebar'
                      ? FolderTree
                      : win.id === 'pdf-viewer-panel'
                        ? FileText
                        : win.id === 'left-panel'
                          ? Code
                          : win.id === 'flashcards-panel'
                            ? Layers
                            : win.id === 'quiz-panel'
                              ? ListChecks
                              : Bot;
                  return (
                    <button
                      key={win.id}
                      type="button"
                      onClick={() => onToggleWindow(win.id)}
                      className={`w-full text-left px-2.5 py-2 text-xs rounded-lg flex items-center justify-between transition cursor-pointer ${
                        isOn
                          ? 'accent-selected-row font-medium'
                          : 'text-slate-500 dark:text-vscode-textMuted hover:bg-slate-100 dark:hover:bg-vscode-hover'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span
                          style={
                            isOn
                              ? {
                                  backgroundColor: 'var(--primary-600)',
                                  borderColor: 'var(--primary-600)',
                                }
                              : undefined
                          }
                          className={`w-4 h-4 rounded flex items-center justify-center border transition ${
                            isOn
                              ? 'text-white'
                              : 'bg-white dark:bg-vscode-input border-slate-300 dark:border-vscode-borderLight text-transparent'
                          }`}
                        >
                          <Check className="w-2.5 h-2.5" />
                        </span>
                        <WindowIcon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />
                        <span className="font-mono text-[11px] font-semibold tracking-wider uppercase">
                          {win.label}
                        </span>
                      </span>
                      <span
                        className={`text-[10px] font-mono ${
                          isOn ? 'accent-text' : 'text-slate-400'
                        }`}
                      >
                        {isOn ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {!isDefaultWindows && (
                <div className="border-t border-slate-100 dark:border-vscode-border pt-1 mt-1">
                  <button
                    type="button"
                    onClick={onRestoreDefaultWindows}
                    className="w-full text-left px-2.5 py-1.5 text-xs font-medium accent-text accent-hover-soft rounded-lg transition flex items-center gap-2 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Ripristina layout base</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Profile & Preferences Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'profile' ? null : 'profile')}
            className="h-8 px-2 sm:px-2.5 bg-slate-100 dark:bg-vscode-input hover:bg-slate-200 dark:hover:bg-vscode-hover border border-slate-200 dark:border-vscode-borderLight rounded-lg text-xs font-medium text-slate-700 dark:text-vscode-textBright flex items-center gap-2 transition whitespace-nowrap cursor-pointer"
          >
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Studente'}
                referrerPolicy="no-referrer"
                className="w-5 h-5 rounded-full object-cover"
              />
            ) : (
              <div
                className="w-5 h-5 rounded-full text-white flex items-center justify-center"
                style={{ backgroundColor: 'var(--primary-600)' }}
              >
                <UserIcon className="w-3 h-3" />
              </div>
            )}
            <span className="hidden sm:inline max-w-[100px] truncate">
              {user.displayName?.split(' ')[0] || 'Studente'}
            </span>
            <ChevronDown className="w-3 h-3 opacity-70" />
          </button>

          {openMenu === 'profile' && (
            <div className="absolute right-0 mt-1.5 w-64 bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-xl shadow-xl z-50 p-1.5">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-vscode-border mb-1">
                <div className="text-xs font-semibold text-slate-800 dark:text-vscode-textBright truncate">
                  {user.displayName || 'Workspace Studente ITS'}
                </div>
                <div className="text-[11px] text-slate-400 dark:text-vscode-textMuted truncate">
                  {user.email || 'Sincronizzazione cloud attiva'}
                </div>
              </div>

              {/* Theme Switcher */}
              <div className="px-2.5 py-1.5">
                <div className="mb-1.5">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-vscode-textMuted">
                    Tema Interfaccia
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-vscode-input p-1 rounded-lg">
                  {(
                    [
                      { id: 'light', label: 'Chiaro', icon: <Sun className="w-3 h-3 text-amber-500" /> },
                      { id: 'dark', label: 'Scuro', icon: <Moon className="w-3 h-3 text-blue-400" /> },
                      { id: 'system', label: 'Auto', icon: <Monitor className="w-3 h-3" /> },
                    ] as const
                  ).map((item) => {
                    const active = themeMode === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSetThemeMode(item.id)}
                        className={`py-1 text-[11px] rounded transition flex items-center justify-center gap-1 cursor-pointer ${
                          active
                            ? 'bg-white dark:bg-vscode-sidebar accent-text font-semibold shadow-xs border border-slate-200 dark:border-vscode-borderLight'
                            : 'text-slate-600 dark:text-vscode-text hover:bg-white/60 dark:hover:bg-vscode-sidebar/60 border border-transparent'
                        }`}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-vscode-border my-1" />

              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  onOpenSettings();
                }}
                className="w-full text-left px-2.5 py-2 text-xs text-slate-700 dark:text-vscode-text hover:bg-slate-100 dark:hover:bg-vscode-hover rounded-lg transition flex items-center gap-2.5 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 accent-icon" />
                <span>Impostazioni &amp; Modello AI</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  onOpenKeybindings();
                }}
                className="w-full text-left px-2.5 py-2 text-xs text-slate-700 dark:text-vscode-text hover:bg-slate-100 dark:hover:bg-vscode-hover rounded-lg transition flex items-center gap-2.5 cursor-pointer"
              >
                <Keyboard className="w-3.5 h-3.5 text-purple-500" />
                <span>Scorciatoie da Tastiera</span>
              </button>

              <div className="border-t border-slate-100 dark:border-vscode-border my-1" />

              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  onExportBackup();
                }}
                className="w-full text-left px-2.5 py-2 text-xs text-slate-700 dark:text-vscode-text hover:bg-slate-100 dark:hover:bg-vscode-hover rounded-lg transition flex items-center gap-2.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-500" />
                <span>Esporta Backup Completo (.json)</span>
              </button>

              <label className="w-full text-left px-2.5 py-2 text-xs text-slate-700 dark:text-vscode-text hover:bg-slate-100 dark:hover:bg-vscode-hover rounded-lg transition flex items-center gap-2.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-amber-500" />
                <span>Importa Backup (.json)</span>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onImportBackupFile(f);
                    e.target.value = '';
                    setOpenMenu(null);
                  }}
                />
              </label>

              <div className="border-t border-slate-100 dark:border-vscode-border my-1" />

              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  onLogout();
                }}
                className="w-full text-left px-2.5 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition flex items-center gap-2.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Esci dall&apos;account</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
