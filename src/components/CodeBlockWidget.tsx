import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Palette, RotateCcw, Trash2, Wand2 } from 'lucide-react';
import { CODE_LANGUAGES, PRESET_CODE_COLORS } from '../constants/defaults';
import {
  CODE_COLOR_PARTS,
  formatCodeSnippet,
  tokenizeCode,
  type CodeColorScheme,
  type CodeLanguage,
  type CodeTokenPart,
} from '../utils/codeSyntax';

interface CodeBlockWidgetProps {
  id: string;
  code: string;
  language: CodeLanguage;
  colorScheme: CodeColorScheme;
  onChange: (id: string, nextCode: string, nextLanguage: CodeLanguage) => void;
  onChangeColorScheme: (next: CodeColorScheme) => void;
  onResetColorScheme: () => void;
  onDelete: (id: string) => void;
  onFocusCodeBlock: () => void;
  onToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const CodeBlockWidget: React.FC<CodeBlockWidgetProps> = ({
  id,
  code,
  language,
  colorScheme,
  onChange,
  onChangeColorScheme,
  onResetColorScheme,
  onDelete,
  onFocusCodeBlock,
  onToast,
}) => {
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [activeColorPart, setActiveColorPart] = useState<CodeTokenPart>('keyword');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const colorPopoverRef = useRef<HTMLDivElement>(null);
  const langPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!colorMenuOpen && !langMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (colorPopoverRef.current && !colorPopoverRef.current.contains(e.target as Node)) {
        setColorMenuOpen(false);
      }
      if (langPopoverRef.current && !langPopoverRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [colorMenuOpen, langMenuOpen]);

  const tokens = useMemo(() => tokenizeCode(code, language), [code, language]);

  const languageLabel =
    CODE_LANGUAGES.find((l) => l.id === language)?.label || language.toUpperCase();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const next = code.slice(0, start) + '  ' + code.slice(end);
      onChange(id, next, language);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = start + 2;
          textareaRef.current.selectionEnd = start + 2;
        }
      });
    }
  };

  const handleFormatCode = () => {
    const formatted = formatCodeSnippet(code, language);
    if (formatted !== code) {
      onChange(id, formatted, language);
      onToast(`Codice ${languageLabel} formattato.`, 'success');
    } else {
      onToast('Codice già formattato.', 'info');
    }
  };

  const isLightHexColor = (hex: string) => {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return false;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.72;
  };

  return (
    <div
      contentEditable={false}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="group relative my-3 font-sans rounded-xl border border-slate-200 dark:border-vscode-borderLight bg-[#1e1e1e] text-[#e4e4e7] shadow-xs select-none overflow-visible"
    >
      {/* Top Bar: Language dropdown button left (always visible) + Editor-style hover controls right */}
      <div className="flex items-center justify-between gap-2 px-2.5 py-1 border-b border-slate-200 dark:border-vscode-border bg-slate-100 dark:bg-vscode-sidebar rounded-t-xl">
        <div ref={langPopoverRef} className="relative flex items-center">
          <button
            type="button"
            onClick={() => {
              setLangMenuOpen((prev) => !prev);
              setColorMenuOpen(false);
            }}
            aria-label="Linguaggio di programmazione"
            title="Cambia linguaggio di programmazione"
            className={`h-7 px-2 rounded inline-flex items-center justify-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-wider transition cursor-pointer ${
              langMenuOpen
                ? 'accent-toolbar-active'
                : 'text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-borderLight'
            }`}
          >
            <span>{languageLabel}</span>
            <ChevronDown className="w-3 h-3 opacity-75" />
          </button>

          {langMenuOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-44 max-h-60 overflow-y-auto bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-xl shadow-2xl z-[120] p-1 space-y-0.5">
              {CODE_LANGUAGES.map((langOpt) => {
                const isSelected = langOpt.id === language;
                return (
                  <button
                    key={langOpt.id}
                    type="button"
                    onClick={() => {
                      onChange(id, code, langOpt.id);
                      setLangMenuOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg font-mono text-[11px] font-semibold uppercase tracking-wider flex items-center justify-between transition cursor-pointer ${
                      isSelected
                        ? 'accent-selected-row'
                        : 'text-slate-700 dark:text-vscode-text hover:bg-slate-100 dark:hover:bg-vscode-hover'
                    }`}
                  >
                    <span>{langOpt.label}</span>
                    {isSelected && <Check className="w-3 h-3 accent-icon shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div
          className={`flex items-center gap-1 transition-opacity duration-150 ${
            colorMenuOpen || langMenuOpen
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
          }`}
        >
          {/* Format Code */}
          <button
            type="button"
            onClick={handleFormatCode}
            className="h-7 px-2 rounded text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-borderLight text-xs font-medium inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
            title="Formatta codice"
          >
            <Wand2 className="w-3.5 h-3.5 accent-icon" />
            <span className="hidden sm:inline">Formatta</span>
          </button>

          {/* Code Syntax Colors Settings (Palette icon matching topbar) */}
          <div ref={colorPopoverRef} className="relative flex items-center">
            <button
              type="button"
              onClick={() => {
                setColorMenuOpen((prev) => !prev);
                setLangMenuOpen(false);
              }}
              className={`w-7 h-7 rounded inline-flex items-center justify-center transition cursor-pointer ${
                colorMenuOpen
                  ? 'accent-toolbar-active'
                  : 'text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-borderLight'
              }`}
              title="Colori sintassi codice"
              aria-label="Colori sintassi codice"
            >
              <Palette className="w-3.5 h-3.5" />
            </button>

            {colorMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-72 font-sans bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-xl shadow-2xl z-[120] p-3 text-slate-800 dark:text-vscode-text">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-vscode-border">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-vscode-textMuted">
                    Colori Sintassi
                  </span>
                  <button
                    type="button"
                    onClick={onResetColorScheme}
                    className="text-[11px] text-slate-500 dark:text-vscode-textMuted accent-hover-text inline-flex items-center gap-1 cursor-pointer transition"
                    title="Ripristina colori predefiniti"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                </div>

                {/* List of all code parts */}
                <div className="space-y-1 max-h-44 overflow-y-auto pr-0.5 mb-2.5">
                  {CODE_COLOR_PARTS.map(({ part, label }) => {
                    const isSelectedPart = activeColorPart === part;
                    return (
                      <button
                        key={part}
                        type="button"
                        onClick={() => setActiveColorPart(part)}
                        className={`w-full px-2 py-1 rounded-lg flex items-center justify-between text-xs transition cursor-pointer ${
                          isSelectedPart
                            ? 'accent-selected-row font-medium'
                            : 'hover:bg-slate-100 dark:hover:bg-vscode-hover'
                        }`}
                      >
                        <span className="truncate">{label}</span>
                        <span className="w-4 h-4 rounded-full border border-slate-300 dark:border-vscode-borderLight flex items-center justify-center shrink-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: colorScheme[part] }}
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Preset colors grid (no color wheel) */}
                <div className="pt-2 border-t border-slate-100 dark:border-vscode-border">
                  <div className="text-[11px] text-slate-500 dark:text-vscode-textMuted mb-1.5">
                    Colore per:{' '}
                    <strong className="text-slate-700 dark:text-vscode-textBright font-semibold">
                      {CODE_COLOR_PARTS.find((p) => p.part === activeColorPart)?.label}
                    </strong>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {PRESET_CODE_COLORS.map((sw) => {
                      const isCurrent =
                        colorScheme[activeColorPart].toLowerCase() === sw.color.toLowerCase();
                      const lightSwatch = isLightHexColor(sw.color);
                      return (
                        <button
                          key={sw.color}
                          type="button"
                          onClick={() =>
                            onChangeColorScheme({
                              ...colorScheme,
                              [activeColorPart]: sw.color,
                            })
                          }
                          style={{ backgroundColor: sw.color }}
                          className={`w-6 h-6 rounded-full border transition hover:scale-110 flex items-center justify-center cursor-pointer ${
                            isCurrent
                              ? 'ring-2 ring-[var(--primary-500)] ring-offset-1 ring-offset-white dark:ring-offset-vscode-sidebar border-slate-300 dark:border-white/70'
                              : 'border-black/20 dark:border-white/20'
                          }`}
                          title={sw.label}
                          aria-label={sw.label}
                        >
                          {isCurrent && (
                            <Check
                              className={`w-3 h-3 ${
                                lightSwatch
                                  ? 'text-slate-900'
                                  : 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)]'
                              }`}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Delete Block */}
          <button
            type="button"
            onClick={() => onDelete(id)}
            className="w-7 h-7 rounded text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-borderLight hover:text-red-500 dark:hover:text-red-400 flex items-center justify-center transition cursor-pointer"
            title="Elimina blocco codice"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Syntax-Highlighted Code Editor Overlay */}
      <div className="relative overflow-hidden rounded-b-xl bg-[#1e1e1e]">
        <pre
          aria-hidden="true"
          className="its-code-layer m-0 p-3.5 font-mono text-[13px] leading-[1.6] whitespace-pre-wrap break-words min-h-[76px] pointer-events-none select-none"
        >
          {tokens.map((tok, i) => (
            <span
              key={i}
              style={
                tok.part === 'plain'
                  ? undefined
                  : { color: colorScheme[tok.part] }
              }
            >
              {tok.text}
            </span>
          ))}
          {code.endsWith('\n') || code.length === 0 ? ' ' : ''}
        </pre>

        <textarea
          ref={textareaRef}
          value={code}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          onFocus={onFocusCodeBlock}
          onChange={(e) => onChange(id, e.target.value, language)}
          onKeyDown={handleKeyDown}
          onPaste={(e) => e.stopPropagation()}
          onCopy={(e) => e.stopPropagation()}
          onCut={(e) => e.stopPropagation()}
          placeholder="// Scrivi il tuo codice qui..."
          className="its-code-textarea absolute inset-0 w-full h-full m-0 p-3.5 font-mono text-[13px] leading-[1.6] whitespace-pre-wrap break-words bg-transparent text-transparent caret-white resize-none overflow-hidden focus:outline-none select-text"
        />
      </div>
    </div>
  );
};
