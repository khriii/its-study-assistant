import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Clock,
  Flag,
  GripVertical,
  Info,
  ListChecks,
  Loader2,
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
  GeminiModelId,
  Note,
  Quiz,
  QuizQuestion,
  StudyDifficulty,
} from '../types';

interface QuizPanelProps {
  activeNote: Note | null;
  subjectName: string;
  geminiModel: GeminiModelId;
  defaultQuizCount: number;
  studyDifficulty: StudyDifficulty;
  aiResponseLanguage: AiResponseLanguage;
  autoShowQuizExplanations: boolean;
  activeQuiz: Quiz | null;
  quizHistory: Quiz[];
  generateTriggerToken: number;
  aiAccessStatus: AiAccessStatus | null;
  onRequestAiAccess: (note?: string) => Promise<AiAccessRequestResult>;
  onRefreshAiAccess: () => Promise<void>;
  onCreateQuiz: (note: Note, questions: QuizQuestion[]) => Promise<void>;
  onSelectAnswer: (quiz: Quiz, qIndex: number, optionIndex: number) => void;
  onSubmitQuiz: (quiz: Quiz) => Promise<void>;
  onCloneQuiz: (quiz: Quiz) => Promise<void>;
  onDeleteQuiz: (quizId: string) => void;
  onToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onHeaderDragStart?: (e: React.DragEvent) => void;
  onHeaderDragEnd?: () => void;
}

const LETTERS = ['A', 'B', 'C', 'D'];

export const QuizPanel: React.FC<QuizPanelProps> = ({
  activeNote,
  subjectName,
  geminiModel,
  defaultQuizCount,
  studyDifficulty,
  aiResponseLanguage,
  autoShowQuizExplanations,
  activeQuiz,
  quizHistory,
  generateTriggerToken,
  aiAccessStatus,
  onRequestAiAccess,
  onRefreshAiAccess,
  onCreateQuiz,
  onSelectAnswer,
  onSubmitQuiz,
  onCloneQuiz,
  onDeleteQuiz,
  onToast,
  onHeaderDragStart,
  onHeaderDragEnd,
}) => {
  const [viewMode, setViewMode] = useState<'active' | 'history'>('active');
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState<number>(defaultQuizCount);
  const [generating, setGenerating] = useState(false);
  const isAiBlocked = Boolean(aiAccessStatus && !aiAccessStatus.authorized);

  useEffect(() => {
    setQuestionCount(defaultQuizCount);
  }, [defaultQuizCount]);

  useEffect(() => {
    setSelectedHistoryId(null);
  }, [activeNote?.id]);

  const handleGenerateQuiz = async () => {
    if (isAiBlocked) {
      onToast('Richiedi prima l\'approvazione per usare Gemini AI.', 'info');
      return;
    }
    const noteText = activeNote ? stripHtml(activeNote.content).trim() : '';
    if (!activeNote || !noteText) {
      onToast('Apri o scrivi una nota prima di generare un quiz.', 'info');
      return;
    }

    const clampedCount = Math.max(1, Math.min(20, Math.round(questionCount || defaultQuizCount || 5)));
    setQuestionCount(clampedCount);
    setViewMode('active');
    setSelectedHistoryId(null);
    setGenerating(true);

    try {
      const headers = await getFirebaseAuthHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch(getAiEndpoint('/api/ai/quiz'), {
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
        questions?: QuizQuestion[];
        error?: string;
        code?: string;
      }>(res, '/api/ai/quiz');
      if (!Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error('Formato domande non valido.');
      }

      await onCreateQuiz(activeNote, data.questions);
      onToast(`Quiz creato con ${data.questions.length} domande!`, 'success');
    } catch (err: unknown) {
      if (err instanceof AiApiError && (err.status === 403 || err.code === 'AI_ACCESS_REQUIRED')) {
        void onRefreshAiAccess();
      }
      const msg = err instanceof Error ? err.message : 'Errore creazione quiz.';
      onToast(`Errore creazione quiz: ${msg}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    if (generateTriggerToken > 0) {
      void handleGenerateQuiz();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateTriggerToken]);

  const formatTimestamp = (ts: unknown): string => {
    if (!ts) return 'Recente';
    if (typeof ts === 'object' && ts !== null && 'toDate' in ts) {
      const date = (ts as { toDate: () => Date }).toDate();
      return date.toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return 'Recente';
  };

  const renderQuizQuestions = (quiz: Quiz, isReadOnlyReview: boolean) => {
    const isSubmitted = isReadOnlyReview || quiz.status === 'completed';
    const answeredCount = quiz.questions.filter(
      (_, i) => typeof quiz.userAnswers[String(i)] === 'number',
    ).length;

    const score = isSubmitted
      ? quiz.questions.reduce(
          (acc, q, idx) => acc + (quiz.userAnswers[String(idx)] === q.correctIndex ? 1 : 0),
          0,
        )
      : 0;
    const pct = quiz.questions.length > 0 ? Math.round((score / quiz.questions.length) * 100) : 0;

    return (
      <div className="flex flex-col gap-3">
        {isSubmitted && (
          <div className="bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-xl p-3 shadow-xs flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Risultato Verifica
              </div>
              <div className="text-sm font-bold text-slate-800 dark:text-vscode-textBright mt-0.5 tabular-nums">
                {score} su {quiz.questions.length} corrette{' '}
                <span className="text-xs font-normal text-slate-500">({pct}%)</span>
              </div>
            </div>
            {!isReadOnlyReview && (
              <button
                type="button"
                onClick={() => void onCloneQuiz(quiz)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-vscode-input hover:bg-slate-200 dark:hover:bg-vscode-hover text-[11px] font-medium text-slate-700 dark:text-vscode-textBright transition flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCw className="w-3 h-3" />
                <span>Ripeti</span>
              </button>
            )}
          </div>
        )}

        {quiz.questions.map((q, qIdx) => {
          const userChoice = quiz.userAnswers[String(qIdx)];
          const hasChoice = typeof userChoice === 'number';
          const isWrong = isSubmitted && userChoice !== q.correctIndex;
          const showImmediateFeedback = !isSubmitted && autoShowQuizExplanations && hasChoice;
          const revealCorrection = isSubmitted || showImmediateFeedback;
          const showExplanation =
            !!q.explanation &&
            ((isSubmitted && (autoShowQuizExplanations || isWrong)) || showImmediateFeedback);

          return (
            <div
              key={`${quiz.id}_${qIdx}`}
              className="bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-xl p-3 shadow-xs"
            >
              <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-400 mb-1.5">
                <span>
                  DOMANDA {qIdx + 1} DI {quiz.questions.length}
                </span>
                {revealCorrection ? (
                  userChoice === q.correctIndex ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <Check className="w-3 h-3" /> Esatta
                    </span>
                  ) : (
                    <span className="text-red-500 font-semibold flex items-center gap-1">
                      <X className="w-3 h-3" /> Errata
                    </span>
                  )
                ) : hasChoice ? (
                  <span className="accent-text font-medium">Selezionata</span>
                ) : null}
              </div>

              <div className="text-xs font-semibold text-slate-800 dark:text-vscode-textBright mb-2.5 leading-relaxed">
                {q.question}
              </div>

              <div className="space-y-1.5">
                {q.options.slice(0, 4).map((optText, oIdx) => {
                  const letter = LETTERS[oIdx] || String.fromCharCode(65 + oIdx);
                  const isSelected = userChoice === oIdx;
                  const isCorrectOpt = q.correctIndex === oIdx;

                  let cardStyle =
                    'border-slate-200 dark:border-vscode-borderLight bg-slate-50/70 dark:bg-vscode-input/60 accent-hover-soft text-slate-700 dark:text-vscode-text cursor-pointer';
                  let badgeStyle =
                    'bg-white dark:bg-vscode-sidebar border-slate-300 dark:border-vscode-borderLight text-slate-600 dark:text-vscode-text';

                  if (revealCorrection) {
                    const cursorClass = isSubmitted ? 'cursor-default' : 'cursor-pointer';
                    if (isSelected && !isCorrectOpt) {
                      cardStyle = `border-red-500 bg-red-500/10 text-red-700 dark:text-red-300 font-medium ${cursorClass}`;
                      badgeStyle = 'bg-red-600 border-red-600 text-white';
                    } else if (isCorrectOpt) {
                      cardStyle = `border-emerald-500 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-medium ${cursorClass}`;
                      badgeStyle = 'bg-emerald-600 border-emerald-600 text-white';
                    } else {
                      cardStyle = `border-slate-200 dark:border-vscode-border bg-transparent text-slate-500 dark:text-vscode-textMuted opacity-70 ${cursorClass}`;
                    }
                  } else if (isSelected) {
                    cardStyle =
                      'border-[var(--primary-500)] accent-soft-bg text-slate-900 dark:text-vscode-textBright font-medium cursor-pointer';
                    badgeStyle = 'accent-btn border-[var(--primary-600)]';
                  }

                  return (
                    <button
                      key={oIdx}
                      type="button"
                      disabled={isSubmitted}
                      onClick={() => onSelectAnswer(quiz, qIdx, oIdx)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg border text-xs flex items-center gap-2 transition ${cardStyle}`}
                    >
                      <span
                        className={`w-5 h-5 rounded-md border flex items-center justify-center font-mono text-[10px] font-bold flex-none ${badgeStyle}`}
                      >
                        {letter}
                      </span>
                      <span className="leading-snug flex-1">{optText}</span>
                      {revealCorrection && isSelected && !isCorrectOpt && (
                        <X className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      )}
                      {revealCorrection && isCorrectOpt && (
                        <span className="ml-auto flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold shrink-0">
                          <Check className="w-3 h-3" /> Corretta
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {showExplanation && (
                <div className="mt-2.5 px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-slate-700 dark:text-vscode-text leading-relaxed flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-amber-700 dark:text-amber-400">Spiegazione:</strong>{' '}
                    {q.explanation}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {!isSubmitted && (
          <div className="sticky bottom-0 pt-1 pb-1 bg-gradient-to-t from-slate-200/95 via-slate-200/80 to-transparent dark:from-[#141414] dark:via-[#141414]/90">
            <button
              type="button"
              onClick={() => void onSubmitQuiz(quiz)}
              className="w-full py-2.5 px-4 rounded-xl accent-btn text-xs font-semibold shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Flag className="w-3.5 h-3.5" />
              <span className="tabular-nums">
                Termina Quiz ({answeredCount}/{quiz.questions.length})
              </span>
            </button>
          </div>
        )}
      </div>
    );
  };

  const selectedHistoryEntry = selectedHistoryId
    ? quizHistory.find((h) => h.id === selectedHistoryId) || null
    : null;

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
          <ListChecks className="w-3 h-3 text-indigo-500" />
          <span>Quiz</span>
        </span>
      </div>

      {/* Controls Bar */}
      <div className="p-2 border-b border-slate-200 dark:border-vscode-border bg-slate-100 dark:bg-vscode-tabInactive flex items-center gap-1.5 flex-none justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setViewMode('active');
              setSelectedHistoryId(null);
            }}
            className={`px-2 py-1 text-[11px] rounded-md transition whitespace-nowrap cursor-pointer ${
              viewMode === 'active'
                ? 'bg-white dark:bg-vscode-input text-slate-800 dark:text-vscode-textBright font-semibold shadow-xs border border-slate-200 dark:border-vscode-borderLight'
                : 'text-slate-600 dark:text-vscode-textMuted font-medium hover:bg-white/60 dark:hover:bg-vscode-hover border border-transparent'
            }`}
          >
            Quiz Attivo
          </button>

          <button
            type="button"
            onClick={() => setViewMode('history')}
            className={`px-2 py-1 text-[11px] rounded-md transition flex items-center gap-1 whitespace-nowrap cursor-pointer ${
              viewMode === 'history'
                ? 'bg-white dark:bg-vscode-input text-slate-800 dark:text-vscode-textBright font-semibold shadow-xs border border-slate-200 dark:border-vscode-borderLight'
                : 'text-slate-600 dark:text-vscode-textMuted font-medium hover:bg-white/60 dark:hover:bg-vscode-hover border border-transparent'
            }`}
          >
            <span>Svolti</span>
            <span className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-vscode-textMuted">
              · {quizHistory.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            max={20}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            className="w-11 px-1.5 py-1 bg-white dark:bg-vscode-input text-slate-700 dark:text-vscode-textBright border border-slate-200 dark:border-vscode-borderLight rounded-lg text-[11px] font-mono tabular-nums text-center focus:outline-none accent-focus"
            title="Numero di domande da generare (1-20)"
          />
          <button
            type="button"
            disabled={generating || isAiBlocked}
            onClick={() => void handleGenerateQuiz()}
            className="px-2.5 py-1.5 bg-white dark:bg-vscode-input accent-hover-soft text-slate-700 dark:text-vscode-text border border-slate-200 dark:border-vscode-borderLight rounded-lg text-[11px] font-medium flex items-center gap-1.5 whitespace-nowrap transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title="Crea Quiz a risposta multipla dalla nota attiva"
          >
            <Sparkles className="w-3.5 h-3.5 accent-icon" />
            <span>Crea Quiz</span>
          </button>
        </div>
      </div>

      {/* Quiz Content */}
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
        {!activeNote ? (
          <div className="text-center text-xs text-slate-500 dark:text-vscode-textMuted mt-10">
            Apri una nota per creare o svolgere un quiz.
          </div>
        ) : generating ? (
          <div className="flex flex-col items-center justify-center py-10 text-xs text-slate-500 dark:text-vscode-textMuted gap-2">
            <Loader2 className="w-5 h-5 animate-spin accent-icon" />
            <span>
              Creazione di {questionCount} {questionCount === 1 ? 'domanda' : 'domande'} A/B/C/D con AI...
            </span>
          </div>
        ) : viewMode === 'history' ? (
          quizHistory.length === 0 ? (
            <div className="text-center text-xs text-slate-500 dark:text-vscode-textMuted mt-10 px-3 leading-relaxed">
              Nessun quiz svolto per questa nota.
              <br />
              Completa un quiz e premi <strong>&ldquo;Termina Quiz&rdquo;</strong> per salvarlo qui.
            </div>
          ) : selectedHistoryEntry ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-xl px-3 py-2 shadow-xs">
                <button
                  type="button"
                  onClick={() => setSelectedHistoryId(null)}
                  className="text-xs font-medium accent-text hover:underline flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Elenco svolti</span>
                </button>
                <span className="text-[11px] font-mono tabular-nums font-semibold text-slate-700 dark:text-vscode-textBright">
                  Punteggio: {selectedHistoryEntry.score}/{selectedHistoryEntry.total}
                </span>
              </div>
              {renderQuizQuestions(selectedHistoryEntry, true)}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {quizHistory.map((entry, idx) => {
                const entryPct =
                  entry.total > 0 ? Math.round((entry.score / entry.total) * 100) : 0;
                const scoreColor =
                  entryPct >= 75
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : entryPct >= 50
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400';
                return (
                  <div
                    key={entry.id}
                    onClick={() => setSelectedHistoryId(entry.id)}
                    className="group bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight accent-hover-border rounded-xl p-3 cursor-pointer transition shadow-xs flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800 dark:text-vscode-textBright truncate">
                        Quiz #{quizHistory.length - idx} · {entry.noteTitle}
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-vscode-textMuted mt-0.5 flex items-center gap-1.5 font-mono tabular-nums">
                        <Clock className="w-3 h-3" />
                        <span>{formatTimestamp(entry.completedAt || entry.createdAt)}</span>
                        <span>·</span>
                        <span>{entry.total} domande</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-none">
                      <span className={`text-xs font-mono tabular-nums font-bold ${scoreColor}`}>
                        {entry.score}/{entry.total}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteQuiz(entry.id);
                        }}
                        className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-red-500 opacity-100 lg:opacity-0 group-hover:opacity-100 transition cursor-pointer"
                        title="Elimina dallo storico"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : !activeQuiz ? (
          <div className="flex flex-col items-center justify-center text-center py-10 px-3">
            <div className="w-11 h-11 rounded-2xl bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight flex items-center justify-center accent-icon mb-3 shadow-xs">
              <ListChecks className="w-5 h-5" />
            </div>
            <p className="text-xs font-medium text-slate-700 dark:text-vscode-textBright mb-1">
              Nessun quiz attivo
            </p>
            <p className="text-[11px] text-slate-500 dark:text-vscode-textMuted max-w-[220px] leading-relaxed">
              Clicca su <strong>&ldquo;Crea Quiz&rdquo;</strong> in alto per generare domande a risposta multipla (A, B, C, D) dalla nota selezionata.
            </p>
          </div>
        ) : (
          renderQuizQuestions(activeQuiz, false)
        )}
      </div>
    </div>
  );
};
