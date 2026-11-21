import React, { useEffect, useState } from 'react';
import {
  GripVertical,
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
  PanelTop,
  RotateCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  AiApiError,
  getAiEndpoint,
  getFirebaseAuthHeaders,
  parseAiJsonResponse,
} from '../utils/aiApi';
import { stripHtml } from '../utils/exporters';
import { AiAccessGateCard } from './AiAccessGateCard';
import type {
  AiAccessRequestResult,
  AiAccessStatus,
  AiResponseLanguage,
  Flashcard,
  GeminiModelId,
  Note,
  PanelWindowActions,
  StudyDifficulty,
} from '../types';

interface FlashcardsPanelProps extends PanelWindowActions {
  activeNote: Note | null;
  subjectName: string;
  geminiModel: GeminiModelId;
  defaultFlashcardCount: number;
  studyDifficulty: StudyDifficulty;
  aiResponseLanguage: AiResponseLanguage;
  cards: Flashcard[];
  aiAccessStatus: AiAccessStatus | null;
  onRequestAiAccess: (note?: string) => Promise<AiAccessRequestResult>;
  onRefreshAiAccess: () => Promise<void>;
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
  aiAccessStatus,
  onRequestAiAccess,
  onRefreshAiAccess,
  onAddCards,
  onDeleteCard,
  onToast,
  onHeaderDragStart,
  onHeaderDragEnd,
  hideWindowHeader = false,
  iconOnlyHeader = false,
  isMaximized = false,
  onToggleMaximize,
  onClosePanel,
  onSwitchToTabs,
}) => {
  const [cardCount, setCardCount] = useState<number>(defaultFlashcardCount);
  const [generating, setGenerating] = useState(false);
  const [flippedIds, setFlippedIds] = useState<Record<string, boolean>>({});
  const isAiBlocked = Boolean(aiAccessStatus && !aiAccessStatus.authorized);

  useEffect(() => {
    setCardCount(defaultFlashcardCount);
  }, [defaultFlashcardCount]);

  const handleGenerate = async () => {
    if (isAiBlocked) {
      onToast('Richiedi prima l\'approvazione per usare Gemini AI.', 'info');
      return;
    }
    const noteText = activeNote ? stripHtml(activeNote.content).trim() : '';
    if (!activeNote || !noteText) {
      onToast('Apri o scrivi una nota prima di generare le flashcard.', 'info');
      return;
    }

    const clampedCount = Math.max(1, Math.min(10, Math.round(cardCount || defaultFlashcardCount || 6)));
    setCardCount(clampedCount);
    setGenerating(true);
    try {
      const headers = await getFirebaseAuthHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch(getAiEndpoint('/api/ai/flashcards'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: geminiModel,
          noteText,
          subjectName,
          count: clampedCount,
          difficulty: studyDifficulty,
          responseLanguage: aiResponseLanguage,
        }),
      });
      const data = await parseAiJsonResponse<{
        cards?: { q: string; a: string }[];
        error?: string;
        code?: string;
      }>(res, '/api/ai/flashcards');
      if (!Array.isArray(data.cards) || data.cards.length === 0) {
        throw new Error('Nessuna flashcard generata.');
      }

      await onAddCards(activeNote.id, activeNote.subjectId, data.cards);
      onToast(`${data.cards.length} Flashcard generate con successo!`, 'success');
    } catch (err: unknown) {
      if (err instanceof AiApiError && (err.status === 403 || err.code === 'AI_ACCESS_REQUIRED')) {
        void onRefreshAiAccess();
      }
      const msg = err instanceof Error ? err.message : 'Errore generazione AI.';
      onToast(`Errore AI: ${msg}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-vscode-sidebar overflow-hidden">
      {!hideWindowHeader && (
        <div
          draggable
          onDragStart={onHeaderDragStart}
          onDragEnd={onHeaderDragEnd}
          className="window-header h-9 px-3 border-b border-slate-200 dark:border-vscode-border flex justify-between items-center bg-slate-200/80 dark:bg-vscode-border flex-none cursor-grab"
        >
          <span
            title="Flashcards"
            className="font-mono text-[11px] font-semibold tracking-wider text-slate-500 dark:text-vscode-textMuted uppercase flex items-center gap-1.5 min-w-0"
          >
            <GripVertical className="w-3 h-3 text-slate-400 shrink-0" />
            <Layers className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            {!iconOnlyHeader && <span className="truncate">Flashcards</span>}
          </span>
          <div
            className="flex items-center gap-0.5 shrink-0"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {onSwitchToTabs && !isMaximized && (
              <button
                type="button"
                draggable={false}
                onClick={onSwitchToTabs}
                className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
                title="Raggruppa in schede compatte"
              >
                <PanelTop className="w-3.5 h-3.5" />
              </button>
            )}
            {onToggleMaximize && (
              <button
                type="button"
                draggable={false}
                onClick={onToggleMaximize}
                className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
                title={isMaximized ? 'Ripristina finestra (Esc)' : 'Massimizza finestra'}
              >
                {isMaximized ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
            )}
            {onClosePanel && !isMaximized && (
              <button
                type="button"
                draggable={false}
                onClick={onClosePanel}
                className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
                title="Chiudi pannello"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="p-2 border-b border-slate-200 dark:border-vscode-border bg-slate-100 dark:bg-vscode-tabInactive flex items-center justify-between gap-1.5 flex-none">
        <span className="text-[11px] font-semibold text-slate-700 dark:text-vscode-textBright ml-1 truncate">
          Ripasso Attivo
          {cards.length > 0 && (
            <span className="ml-1 text-[10px] font-mono tabular-nums text-slate-500 dark:text-vscode-textMuted">
              · {cards.length}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1 flex-none">
          <input
            type="number"
            min={1}
            max={10}
            value={cardCount}
            onChange={(e) => setCardCount(Number(e.target.value))}
            className="w-11 px-1.5 py-1 bg-white dark:bg-vscode-input text-slate-700 dark:text-vscode-textBright border border-slate-200 dark:border-vscode-borderLight rounded-lg text-[11px] font-mono tabular-nums text-center focus:outline-none accent-focus"
            title="Numero di flashcard da generare (1-10)"
          />
          <button
            type="button"
            disabled={generating || isAiBlocked}
            onClick={() => void handleGenerate()}
            className="px-2.5 py-1.5 bg-white dark:bg-vscode-input hover:bg-emerald-50 dark:hover:bg-vscode-hover text-slate-700 dark:text-vscode-text border border-slate-200 dark:border-vscode-borderLight rounded-lg text-[11px] font-medium flex items-center gap-1.5 whitespace-nowrap transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title="Genera Flashcards con AI"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Genera</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 bg-slate-200/50 dark:bg-[#141414]">
        {isAiBlocked && aiAccessStatus && (
          <AiAccessGateCard
            accessStatus={aiAccessStatus}
            onRequestAccess={onRequestAiAccess}
            onRefreshStatus={onRefreshAiAccess}
            onToast={onToast}
            compact
          />
        )}
        {generating ? (
          <div className="flex flex-col items-center justify-center py-10 text-xs text-slate-500 dark:text-vscode-textMuted gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
            <span>
              Generazione di {cardCount} {cardCount === 1 ? 'flashcard' : 'flashcard'} con AI...
            </span>
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center text-xs text-slate-500 dark:text-vscode-textMuted mt-6 px-4 leading-relaxed">
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
