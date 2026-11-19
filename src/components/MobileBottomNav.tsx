import React from 'react';
import { Bot, Code, FileText, Layers, ListChecks } from 'lucide-react';
import type { MobilePanelId } from '../types';

interface MobileBottomNavProps {
  activePanel: MobilePanelId;
  onSelectPanel: (panel: MobilePanelId) => void;
}

const MOBILE_TABS: {
  id: MobilePanelId;
  label: string;
  icon: React.FC<{ className?: string }>;
  activeClass: string;
}[] = [
  {
    id: 'left-panel',
    label: 'Editor',
    icon: Code,
    activeClass: 'accent-text',
  },
  {
    id: 'pdf-viewer-panel',
    label: 'Slide',
    icon: FileText,
    activeClass: 'text-red-500 dark:text-red-400',
  },
  {
    id: 'flashcards-panel',
    label: 'Card',
    icon: Layers,
    activeClass: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    id: 'quiz-panel',
    label: 'Quiz',
    icon: ListChecks,
    activeClass: 'text-indigo-600 dark:text-indigo-400',
  },
  {
    id: 'right-panel',
    label: 'AI Chat',
    icon: Bot,
    activeClass: 'text-purple-600 dark:text-purple-400',
  },
];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activePanel,
  onSelectPanel,
}) => {
  return (
    <nav
      aria-label="Navigazione pannelli"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-white/95 dark:bg-vscode-sidebar/95 backdrop-blur-md border-t border-slate-200 dark:border-vscode-border grid grid-cols-5"
    >
      {MOBILE_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activePanel === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectPanel(tab.id)}
            className={`min-h-[44px] h-full flex flex-col items-center justify-center gap-0.5 text-[11px] transition cursor-pointer ${
              isActive
                ? `${tab.activeClass} font-semibold bg-slate-100/80 dark:bg-vscode-hover`
                : 'text-slate-500 dark:text-vscode-textMuted hover:text-slate-800 dark:hover:text-vscode-textBright font-medium'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="leading-none font-mono">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
