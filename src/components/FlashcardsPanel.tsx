import React, { useState } from 'react';
import { GripVertical, Layers, Loader2, RotateCw, Sparkles, Trash2 } from 'lucide-react';
import { stripHtml } from '../utils/exporters';
import type {
  AiResponseLanguage,
  Flashcard,
  GeminiModelId,
  Note,
  StudyDifficulty,
} from '../types';

interface FlashcardsPanelProps {
  activeNote: Note | null;
  subjectName: string;
  geminiModel: GeminiModelId;
  defaultFlashcardCount: number;
  studyDifficulty: StudyDifficulty;
  aiResponseLanguage: AiResponseLanguage;
  cards: Flashcard[];
  onAddCards: (noteId: string, subjectId: string, cards: { q: string; a: string }[]) => Promise<void>;
  onDeleteCard: (cardId: string) => void;
  onToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onHeaderDragStart?: (e: React.DragEvent) => void;
  onHeaderDragEnd?: () => void;
}

export const FlashcardsPanel: React.FC<FlashcardsPanelProps> = ({
  activeNote,
  subjectName,
  geminiModel,
  defaultFlashcardCount,
  studyDifficulty,
  aiResponseLanguage,
  cards,
  onAddCards,
  onDeleteCard,
  onToast,
  onHeaderDragStart,
  onHeaderDragEnd,
}) => {
  const [generating, setGenerating] = useState(false);
  const [flippedIds, setFlippedIds] = useState<Record<string, boolean>>({});

  const handleGenerate = async () => {
    const noteText = activeNote ? stripHtml(activeNote.content).trim() : '';
    if (!activeNote || !noteText) {
      onToast('Apri o scrivi una nota prima di generare le flashcard.', 'info');
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch('/api/ai/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: geminiModel,
          noteText,
          subjectName,
          count: defaultFlashcardCount,
          difficulty: studyDifficulty,
          responseLanguage: aiResponseLanguage,
        }),
      });
      const rawText = await res.text();
      let data: { cards?: { q: string; a: string }[]; error?: string } = {};
      if (rawText) {
        try {
          data = JSON.parse(rawText) as { cards?: { q: string; a: string }[]; error?: string };
        } catch {
          if (!res.ok) {
            throw new Error(
              res.status === 404
                ? 'Servizio AI non disponibile su questo host statico (/api/ai/flashcards).'
                : `Errore HTTP ${res.status}`,
            );
          }
          throw new Error('Risposta non valida dal server AI.');
        }
      }
      if (!res.ok) {
        throw new Error(data.error || `Errore HTTP ${res.status}`);
      }
      if (!Array.isArray(data.cards) || data.cards.length === 0) {
        throw new Error('Nessuna flashcard generata.');
      }

      await onAddCards(activeNote.id, activeNote.subjectId, data.cards);
      onToast(`${data.cards.length} Flashcard generate con successo!`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore generazione AI.';
      onToast(`Errore AI: ${msg}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-vscode-sidebar overflow-hidden">
      <div
        draggable
        onDragStart={onHeaderDragStart}
        onDragEnd={onHeaderDragEnd}
        className="window-header h-9 px-3 border-b border-slate-200 dark:border-vscode-border flex justify-between items-center bg-slate-200/80 dark:bg-vscode-border flex-none cursor-grab"
      >
        <span className="font-mono text-[11px] font-semibold tracking-wider text-slate-500 dark:text-vscode-textMuted uppercase flex items-center gap-1.5">
          <GripVertical className="w-3 h-3 text-slate-400" />
          <Layers className="w-3 h-3 text-emerald-500" />
          <span>Flashcards</span>
        </span>
      </div>

      <div className="p-2 border-b border-slate-200 dark:border-vscode-border bg-slate-100 dark:bg-vscode-tabInactive flex items-center justify-between flex-none">
        <span className="text-[11px] font-semibold text-slate-700 dark:text-vscode-textBright ml-1">
          Ripasso Attivo
        </span>
        <button
          type="button"
          disabled={generating}
          onClick={() => void handleGenerate()}
          className="px-2.5 py-1.5 bg-white dark:bg-vscode-input hover:bg-emerald-50 dark:hover:bg-vscode-hover text-slate-700 dark:text-vscode-text border border-slate-200 dark:border-vscode-borderLight rounded-lg text-[11px] font-medium flex items-center gap-1.5 whitespace-nowrap transition shadow-xs disabled:opacity-50 cursor-pointer"
          title="Genera Flashcards con AI"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          <span>Genera</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 bg-slate-200/50 dark:bg-[#141414]">
        {generating ? (
          <div className="flex flex-col items-center justify-center py-10 text-xs text-slate-500 dark:text-vscode-textMuted gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
            <span>Generazione flashcard con AI...</span>
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center text-xs text-slate-500 dark:text-vscode-textMuted mt-10 px-4 leading-relaxed">
            Nessuna flashcard per questa nota. Clicca su &ldquo;Genera&rdquo; per crearle con l&apos;AI.
          </div>
        ) : (
          cards.map((card, idx) => {
            const isFlipped = !!flippedIds[card.id];
            return (
              <div
                key={card.id}
                onClick={() =>
                  setFlippedIds((prev) => ({ ...prev, [card.id]: !prev[card.id] }))
                }
                className={`perspective-1000 cursor-pointer select-none group flex-none ${
                  isFlipped ? 'flipped' : ''
                }`}
                style={{ height: '154px' }}
              >
                <div className="flashcard-inner relative w-full h-full">
                  {/* Front */}
                  <div className="flashcard-front bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-400">
                      <span>DOMANDA #{idx + 1}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteCard(card.id);
                        }}
                        className="text-slate-400 hover:text-red-500 opacity-100 lg:opacity-0 group-hover:opacity-100 transition cursor-pointer"
                        title="Elimina carta"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="text-xs font-semibold text-slate-800 dark:text-vscode-textBright text-center overflow-y-auto my-1 px-1 leading-relaxed">
                      {card.question}
                    </div>
                    <div className="text-[10px] text-center accent-text flex items-center justify-center gap-1">
                      <RotateCw className="w-3 h-3" />
                      <span>Clicca per girare</span>
                    </div>
                  </div>

                  {/* Back */}
                  <div className="flashcard-back accent-soft-bg dark:bg-vscode-hover border border-[var(--primary-500)]/45 rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
                    <div className="text-[10px] font-mono accent-text">
                      RISPOSTA
                    </div>
                    <div className="text-xs text-slate-700 dark:text-vscode-text text-center overflow-y-auto my-1 px-1 leading-relaxed">
                      {card.answer}
                    </div>
                    <div className="text-[10px] text-center text-slate-400">
                      Clicca per tornare alla domanda
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
