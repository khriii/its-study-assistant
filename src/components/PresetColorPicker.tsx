import React, { useEffect, useRef, useState } from 'react';
import { Ban, Check } from 'lucide-react';
import type { PresetColorOption } from '../constants/defaults';

interface PresetColorPickerProps {
  value?: string;
  presets: PresetColorOption[];
  onSelect: (color: string) => void;
  onReset?: () => void;
  resetLabel?: string;
  align?: 'left' | 'right';
  title?: string;
  trigger?: React.ReactNode;
  triggerClassName?: string;
  onOpenChange?: (open: boolean) => void;
}

function isLightHexColor(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.72;
}

export const PresetColorPicker: React.FC<PresetColorPickerProps> = ({
  value,
  presets,
  onSelect,
  onReset,
  resetLabel = 'Colore predefinito',
  align = 'left',
  title = 'Scegli colore',
  trigger,
  triggerClassName,
  onOpenChange,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        title={title}
        className={
          triggerClassName ||
          'w-9 h-9 rounded-lg border border-slate-200 dark:border-vscode-borderLight bg-white dark:bg-vscode-input hover:bg-slate-50 dark:hover:bg-vscode-hover flex items-center justify-center transition cursor-pointer shadow-xs'
        }
      >
        {trigger || (
          <span className="w-5 h-5 rounded-full border border-slate-300 dark:border-vscode-borderLight flex items-center justify-center">
            <span
              className="w-3.5 h-3.5 rounded-full"
              style={{ backgroundColor: value || presets[0]?.color || '#3b82f6' }}
            />
          </span>
        )}
      </button>

      {open && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } mt-1.5 p-2.5 bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-xl shadow-2xl z-[120] w-[184px]`}
        >
          <div className="grid grid-cols-4 gap-2">
            {presets.map((sw) => {
              const isSelected =
                value && value.toLowerCase() === sw.color.toLowerCase();
              const lightSwatch = isLightHexColor(sw.color);
              return (
                <button
                  key={sw.color}
                  type="button"
                  onClick={() => {
                    onSelect(sw.color);
                    setOpen(false);
                  }}
                  style={{ backgroundColor: sw.color }}
                  className={`w-7 h-7 rounded-full border transition hover:scale-110 flex items-center justify-center cursor-pointer ${
                    isSelected
                      ? 'ring-2 ring-[var(--primary-500)] ring-offset-2 ring-offset-white dark:ring-offset-vscode-sidebar border-slate-300 dark:border-white/70'
                      : 'border-slate-300 dark:border-white/20'
                  }`}
                  title={sw.label}
                  aria-label={sw.label}
                >
                  {isSelected && (
                    <Check
                      className={`w-3.5 h-3.5 ${
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

          {onReset && (
            <button
              type="button"
              onClick={() => {
                onReset();
                setOpen(false);
              }}
              className="mt-2.5 w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-vscode-borderLight hover:bg-slate-100 dark:hover:bg-vscode-hover text-[11px] font-medium text-slate-600 dark:text-vscode-text flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Ban className="w-3 h-3 text-slate-400" />
              <span>{resetLabel}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
