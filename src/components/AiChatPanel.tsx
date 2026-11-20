import React, { useCallback, useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import {
  AlignLeft,
  AlertTriangle,
  Bot,
  FileText,
  GripVertical,
  HelpCircle,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  Paperclip,
  RotateCcw,
  Send,
  Upload,
  X,
} from 'lucide-react';
import { getAiEndpoint, parseAiJsonResponse } from '../utils/aiApi';
import {
  base64ToUint8Array,
  extractDocumentPreview,
  getStudyFileExt,
} from '../utils/documentParser';
import { readAttachmentFile, stripHtml } from '../utils/exporters';
import type {
  AiResponseLanguage,
  AiResponseStyle,
  ChatAttachment,
  ChatMessage,
  GeminiModelId,
  Note,
  StudyFile,
  Subject,
} from '../types';

export interface ExternalAiPrompt {
  id: string;
  prompt: string;
  label: string;
}

interface AiChatPanelProps {
  currentSubject: Subject | null;
  activeNote: Note | null;
  notes: Note[];
  studyFiles: StudyFile[];
  onGetStudyFileBase64: (fileId: string) => Promise<string>;
  geminiModel: GeminiModelId;
  aiResponseStyle: AiResponseStyle;
  aiResponseLanguage: AiResponseLanguage;
  externalPrompt: ExternalAiPrompt | null;
  onToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onHeaderDragStart?: (e: React.DragEvent) => void;
  onHeaderDragEnd?: () => void;
}

export const AiChatPanel: React.FC<AiChatPanelProps> = ({
  currentSubject,
  activeNote,
  notes,
  studyFiles,
  onGetStudyFileBase64,
  geminiModel,
  aiResponseStyle,
  aiResponseLanguage,
  externalPrompt,
  onToast,
  onHeaderDragStart,
  onHeaderDragEnd,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [isDropActive, setIsDropActive] = useState(false);
  const [attachingDrop, setAttachingDrop] = useState(false);

  const feedRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyPartsRef = useRef<
    { role: 'user' | 'model'; parts: Record<string, unknown>[] }[]
  >([]);
  const lastExternalIdRef = useRef<string | null>(null);

  const resetChat = useCallback(() => {
    historyPartsRef.current = [];
    setMessages([]);
  }, []);

  // Reset chat when subject changes
  useEffect(() => {
    resetChat();
  }, [currentSubject?.id, resetChat]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const sendMessage = useCallback(
    async (promptText: string, displayLabel: string, files: ChatAttachment[] = []) => {
      if (sending) return;
      const parts: Record<string, unknown>[] = [];
      if (promptText.trim()) {
        parts.push({ text: promptText });
      }
      files.forEach((att) => {
        if ((att.isImage || att.type === 'application/pdf') && att.data) {
          parts.push({
            inlineData: {
              mimeType: att.type,
              data: att.data,
            },
          });
        } else if (att.textData !== undefined) {
          parts.push({
            text: `\n\n--- Contenuto file: ${att.name} ---\n${att.textData}\n--- Fine file ---\n`,
          });
        }
      });

      if (parts.length === 0) return;

      const userMsgId = `u_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          role: 'user',
          text: promptText,
          displayLabel,
          attachments: files.map((f) => ({ name: f.name, isImage: f.isImage })),
        },
      ]);

      const nextHistory = [
        ...historyPartsRef.current,
        { role: 'user' as const, parts },
      ];
      setSending(true);

      try {
        const subjectName = currentSubject?.name || 'Studio ITS';
        const systemInstruction =
          currentSubject?.systemPrompt ||
          `Sei un tutor AI didattico per studenti ITS nella materia ${subjectName}. Rispondi in italiano in modo chiaro, strutturato e preciso.`;

        const res = await fetch(getAiEndpoint('/api/ai/chat'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: geminiModel,
            systemInstruction,
            responseStyle: aiResponseStyle,
            responseLanguage: aiResponseLanguage,
            contents: nextHistory,
          }),
        });
        const data = await parseAiJsonResponse<{ text?: string; error?: string }>(
          res,
          '/api/ai/chat',
        );

        const replyText = String(data.text || 'Nessuna risposta ricevuta.');
        historyPartsRef.current = [
          ...nextHistory,
          { role: 'model', parts: [{ text: replyText }] },
        ];

        setMessages((prev) => [
          ...prev,
          {
            id: `m_${Date.now()}`,
            role: 'model',
            text: replyText,
          },
        ]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Errore connessione AI.';
        setMessages((prev) => [
          ...prev,
          {
            id: `e_${Date.now()}`,
            role: 'error',
            text: msg,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [sending, currentSubject, geminiModel, aiResponseStyle, aiResponseLanguage],
  );

  // Triggered from selection modal / command palette
  useEffect(() => {
    if (externalPrompt && externalPrompt.id !== lastExternalIdRef.current) {
      lastExternalIdRef.current = externalPrompt.id;
      void sendMessage(externalPrompt.prompt, externalPrompt.label);
    }
  }, [externalPrompt, sendMessage]);

  const handleQuickAction = (type: 'summarize' | 'explain' | 'quiz') => {
    const noteText = activeNote ? stripHtml(activeNote.content).trim() : '';
    if (!noteText) {
      onToast('Apri o scrivi una nota prima di usare le azioni rapide AI.', 'info');
      return;
    }
    const subName = currentSubject?.name || 'Studio ITS';
    if (type === 'summarize') {
      void sendMessage(
        `Riassumi in modo chiaro, schematico e per punti chiave questi appunti di ${subName}:\n\n${noteText}`,
        'Riassumi la nota attiva',
      );
    } else if (type === 'explain') {
      void sendMessage(
        `Analizza questi appunti di ${subName} e spiega in modo semplice e approfondito i concetti principali, aggiungendo esempi pratici:\n\n${noteText}`,
        'Spiega i concetti chiave della nota',
      );
    } else {
      void sendMessage(
        `Genera un mini-quiz di autovalutazione con 4 domande a risposta multipla (con soluzioni spiegate in fondo) basato su questi appunti di ${subName}:\n\n${noteText}`,
        'Genera un quiz di verifica dalla nota',
      );
    }
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const added: ChatAttachment[] = [];
    for (const file of Array.from(fileList)) {
      if (file.size > 5 * 1024 * 1024) {
        onToast(`Il file ${file.name} è troppo grande (max 5MB)`, 'error');
        continue;
      }
      try {
        const ext = getStudyFileExt(file.name);
        if (ext === 'docx' || ext === 'pptx') {
          const buffer = await file.arrayBuffer();
          const parsed = await extractDocumentPreview(buffer, ext);
          added.push({
            name: file.name,
            type: 'text/plain',
            isImage: false,
            textData: parsed.extractedText || '(Nessun testo estratto dal documento)',
          });
        } else {
          const att = await readAttachmentFile(file);
          added.push(att);
        }
      } catch {
        onToast(`Errore lettura file ${file.name}`, 'error');
      }
    }
    if (added.length > 0) {
      setAttachments((prev) => [...prev, ...added]);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const added: ChatAttachment[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          try {
            const ext = file.type.split('/')[1] || 'png';
            const renamed = new File([file], `immagine_incollata_${Date.now()}.${ext}`, {
              type: file.type,
            });
            added.push(await readAttachmentFile(renamed));
          } catch {
            onToast('Errore lettura immagine incollata', 'error');
          }
        }
      }
    }
    if (added.length > 0) {
      setAttachments((prev) => [...prev, ...added]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed && attachments.length === 0) return;
    const currentAtts = [...attachments];
    setInputText('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px';
    }
    void sendMessage(trimmed, trimmed || 'Allegato inviato', currentAtts);
  };

  const isAcceptableChatDrop = (dt: DataTransfer): boolean => {
    const types = Array.from(dt.types || []);
    if (types.includes('text/panel-id')) return false;
    return (
      types.includes('application/x-its-explorer-item') ||
      types.includes('Files')
    );
  };

  const handleChatDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    if (!isAcceptableChatDrop(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDropActive(false);

    const explorerRaw = e.dataTransfer.getData('application/x-its-explorer-item');
    if (explorerRaw) {
      try {
        const payload = JSON.parse(explorerRaw) as { kind: 'note' | 'file'; id: string };
        if (payload.kind === 'note') {
          const note = notes.find((n) => n.id === payload.id);
          if (!note) return;
          const text = stripHtml(note.content).trim();
          setAttachments((prev) => [
            ...prev,
            {
              name: `${note.title}.txt`,
              type: 'text/plain',
              isImage: false,
              textData: text || '(Nota vuota)',
            },
          ]);
          onToast(`Nota "${note.title}" allegata alla Chat AI.`, 'info');
          textareaRef.current?.focus();
        } else if (payload.kind === 'file') {
          const file = studyFiles.find((f) => f.id === payload.id);
          if (!file) return;
          setAttachingDrop(true);
          try {
            if (file.fileExt === 'pdf') {
              const b64 = await onGetStudyFileBase64(file.id);
              if (!b64) {
                onToast(`Impossibile leggere il contenuto di "${file.name}".`, 'error');
                return;
              }
              setAttachments((prev) => [
                ...prev,
                {
                  name: file.name,
                  type: 'application/pdf',
                  isImage: false,
                  data: b64,
                },
              ]);
            } else {
              let extracted = file.extractedText?.trim() || '';
              if (!extracted) {
                const b64 = await onGetStudyFileBase64(file.id);
                if (!b64) {
                  onToast(`Impossibile leggere il contenuto di "${file.name}".`, 'error');
                  return;
                }
                const parsed = await extractDocumentPreview(
                  base64ToUint8Array(b64),
                  file.fileExt,
                );
                extracted = parsed.extractedText;
              }
              setAttachments((prev) => [
                ...prev,
                {
                  name: file.name,
                  type: 'text/plain',
                  isImage: false,
                  textData: extracted || '(Nessun testo estratto dal documento)',
                },
              ]);
            }
            onToast(`File "${file.name}" allegato alla Chat AI.`, 'info');
            textareaRef.current?.focus();
          } finally {
            setAttachingDrop(false);
          }
        }
      } catch {
        onToast('Errore durante il collegamento del file alla chat.', 'error');
      }
      return;
    }

    if (e.dataTransfer.files?.length > 0) {
      await handleFilesSelected(e.dataTransfer.files);
      textareaRef.current?.focus();
    }
  };

  return (
    <div
      onDragOver={(e) => {
        if (!isAcceptableChatDrop(e.dataTransfer)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!isDropActive) setIsDropActive(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDropActive(false);
        }
      }}
      onDrop={(e) => void handleChatDrop(e)}
      className="relative flex flex-col h-full bg-slate-50 dark:bg-vscode-sidebar overflow-hidden"
    >
      {/* Drag & Drop Overlay */}
      {isDropActive && (
        <div
          style={{ backgroundColor: 'rgba(var(--primary-rgb), 0.14)' }}
          className="absolute inset-0 z-40 backdrop-blur-[1px] border-2 border-dashed border-[var(--primary-500)] flex flex-col items-center justify-center p-4 pointer-events-none"
        >
          <div className="bg-white dark:bg-vscode-sidebar border border-[var(--primary-500)]/40 dark:border-vscode-borderLight rounded-xl px-4 py-3 shadow-xl flex items-center gap-2.5 text-xs font-semibold accent-text">
            <Upload className="w-4 h-4" />
            <span>Rilascia qui per allegare alla Chat AI</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div
        draggable
        onDragStart={onHeaderDragStart}
        onDragEnd={onHeaderDragEnd}
        className="window-header h-9 px-3 border-b border-slate-200 dark:border-vscode-border flex justify-between items-center bg-slate-200/80 dark:bg-vscode-border flex-none cursor-grab"
      >
        <span className="font-mono text-[11px] font-semibold tracking-wider text-slate-500 dark:text-vscode-textMuted uppercase flex items-center gap-1.5">
          <GripVertical className="w-3 h-3 text-slate-400" />
          <Bot className="w-3 h-3 text-purple-500" />
          <span>AI Chat</span>
        </span>
        <button
          type="button"
          onClick={resetChat}
          className="text-[11px] text-slate-500 hover:text-slate-800 dark:text-vscode-textMuted dark:hover:text-vscode-textBright transition flex items-center gap-1 cursor-pointer"
          title="Nuova conversazione"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset</span>
        </button>
      </div>

      {/* Quick Study Actions */}
      <div className="p-2 border-b border-slate-200 dark:border-vscode-border bg-slate-100 dark:bg-vscode-tabInactive flex items-center gap-1.5 overflow-x-auto hide-scrollbar flex-none">
        <button
          type="button"
          onClick={() => handleQuickAction('summarize')}
          className="px-2.5 py-1.5 bg-white dark:bg-vscode-input accent-hover-soft text-slate-700 dark:text-vscode-text border border-slate-200 dark:border-vscode-borderLight rounded-lg text-[11px] font-medium flex items-center gap-1.5 whitespace-nowrap transition shadow-xs cursor-pointer"
        >
          <AlignLeft className="w-3 h-3 accent-icon" />
          <span>Riassumi</span>
        </button>
        <button
          type="button"
          onClick={() => handleQuickAction('explain')}
          className="px-2.5 py-1.5 bg-white dark:bg-vscode-input hover:bg-purple-50 dark:hover:bg-vscode-hover text-slate-700 dark:text-vscode-text border border-slate-200 dark:border-vscode-borderLight rounded-lg text-[11px] font-medium flex items-center gap-1.5 whitespace-nowrap transition shadow-xs cursor-pointer"
        >
          <Lightbulb className="w-3 h-3 text-purple-500" />
          <span>Spiega Concetti</span>
        </button>
        <button
          type="button"
          onClick={() => handleQuickAction('quiz')}
          className="px-2.5 py-1.5 bg-white dark:bg-vscode-input hover:bg-emerald-50 dark:hover:bg-vscode-hover text-slate-700 dark:text-vscode-text border border-slate-200 dark:border-vscode-borderLight rounded-lg text-[11px] font-medium flex items-center gap-1.5 whitespace-nowrap transition shadow-xs cursor-pointer"
        >
          <HelpCircle className="w-3 h-3 text-emerald-500" />
          <span>Mini-Quiz</span>
        </button>
      </div>

      {/* Chat Feed */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-200/50 dark:bg-[#141414]"
      >
        {/* Welcome Bubble */}
        <div className="flex items-start gap-2.5">
          <div
            style={{ backgroundColor: 'var(--primary-600)' }}
            className="w-7 h-7 rounded-lg text-white flex items-center justify-center flex-none shadow-xs"
          >
            <Bot className="w-3.5 h-3.5" />
          </div>
          <div className="bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-2xl rounded-tl-xs p-3 text-xs text-slate-700 dark:text-vscode-text shadow-xs leading-relaxed">
            Ciao! Sono il tuo <strong>Tutor AI ITS</strong> per{' '}
            <strong>{currentSubject?.name || 'il tuo corso'}</strong>.<br />
            Trascina qui una nota o un file dall&apos;Explorer per analizzarlo insieme, oppure usa le azioni rapide.
          </div>
        </div>

        {messages.map((msg) => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="flex justify-end">
                <div
                  style={{ backgroundColor: 'var(--primary-600)' }}
                  className="text-white rounded-2xl rounded-tr-xs px-3.5 py-2.5 text-xs max-w-[85%] shadow-xs leading-relaxed whitespace-pre-wrap"
                >
                  {msg.displayLabel || msg.text}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {msg.attachments.map((att, i) => (
                        <span
                          key={i}
                          className="bg-black/20 px-1.5 py-0.5 rounded border border-white/25 text-[10px] inline-flex items-center gap-1"
                        >
                          {att.isImage ? (
                            <ImageIcon className="w-2.5 h-2.5" />
                          ) : (
                            <FileText className="w-2.5 h-2.5" />
                          )}
                          <span>{att.name}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          if (msg.role === 'error') {
            return (
              <div key={msg.id} className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-red-600 text-white flex items-center justify-center flex-none shadow-xs">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
                <div className="bg-white dark:bg-vscode-sidebar border border-red-300 dark:border-red-900/60 rounded-2xl rounded-tl-xs p-3 text-xs text-red-600 dark:text-red-400 shadow-xs leading-relaxed">
                  <strong>Errore AI Chat:</strong> {msg.text}
                </div>
              </div>
            );
          }

          const renderedHtml = marked.parse(msg.text) as string;
          return (
            <div key={msg.id} className="flex items-start gap-2.5">
              <div
                style={{ backgroundColor: 'var(--primary-600)' }}
                className="w-7 h-7 rounded-lg text-white flex items-center justify-center flex-none shadow-xs"
              >
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div
                className="ai-markdown bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-2xl rounded-tl-xs p-3 text-xs text-slate-700 dark:text-vscode-text shadow-xs leading-relaxed overflow-x-auto max-w-[88%]"
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            </div>
          );
        })}

        {sending && (
          <div className="flex items-start gap-2.5">
            <div
              style={{ backgroundColor: 'var(--primary-600)' }}
              className="w-7 h-7 rounded-lg text-white flex items-center justify-center flex-none shadow-xs"
            >
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-2xl rounded-tl-xs p-3 text-xs text-slate-500 dark:text-vscode-textMuted shadow-xs flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin accent-icon" />
              <span>Elaborazione risposta...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-2.5 sm:p-3 bg-white dark:bg-vscode-sidebar border-t border-slate-200 dark:border-vscode-border flex-none flex flex-col gap-2">
        {(attachments.length > 0 || attachingDrop) && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {attachments.map((att, idx) => (
              <div
                key={`${att.name}_${idx}`}
                className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-vscode-input border border-slate-200 dark:border-vscode-borderLight rounded text-xs text-slate-700 dark:text-vscode-textBright shadow-xs"
              >
                {att.isImage ? (
                  <ImageIcon className="w-3 h-3 accent-icon" />
                ) : (
                  <FileText className="w-3 h-3 text-slate-400" />
                )}
                <span className="truncate max-w-[140px]" title={att.name}>
                  {att.name}
                </span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-slate-400 hover:text-red-500 ml-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {attachingDrop && (
              <span className="inline-flex items-center gap-1.5 text-[11px] accent-text px-2 py-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Lettura file...</span>
              </span>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2 min-w-0 items-end">
          <label
            className="cursor-pointer bg-slate-100 dark:bg-vscode-input hover:bg-slate-200 dark:hover:bg-vscode-hover border border-slate-300 dark:border-vscode-borderLight rounded-lg w-10 h-10 flex-none flex items-center justify-center transition text-slate-500 dark:text-vscode-textMuted shadow-xs"
            title="Allega file (PDF, DOCX, PPTX, Immagini, Codice, Testo)"
          >
            <Paperclip className="w-4 h-4" />
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.docx,.pptx,.txt,.js,.c,.cpp,.h,.py,.html,.css,.json,.md,.xml"
              className="hidden"
              onChange={(e) => {
                void handleFilesSelected(e.target.files);
                e.target.value = '';
              }}
            />
          </label>

          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              e.target.style.height = '40px';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            onPaste={(e) => void handlePaste(e)}
            placeholder="Chiedi all'AI"
            style={{ minHeight: '40px' }}
            className="flex-1 border border-slate-300 dark:border-vscode-borderLight bg-white dark:bg-vscode-input text-slate-800 dark:text-vscode-textBright rounded-lg px-3.5 py-2.5 text-sm focus:outline-none accent-focus-ring transition min-w-0 resize-none overflow-y-auto max-h-32 hide-scrollbar"
          />

          <button
            type="submit"
            disabled={sending || attachingDrop || (!inputText.trim() && attachments.length === 0)}
            className="accent-btn rounded-lg w-10 h-10 flex-none flex items-center justify-center transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title="Invia messaggio (Invio)"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
