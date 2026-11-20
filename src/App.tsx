import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RotateCcw, Upload } from 'lucide-react';
import { DEFAULT_PANEL_WIDTHS, DEFAULT_WINDOW_VISIBILITY } from './constants/defaults';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useWorkspaceStore } from './hooks/useWorkspaceStore';
import { AiChatPanel, type ExternalAiPrompt } from './components/AiChatPanel';
import { AuthScreen } from './components/AuthScreen';
import { ExplorerPanel } from './components/ExplorerPanel';
import { FlashcardsPanel } from './components/FlashcardsPanel';
import { MobileBottomNav } from './components/MobileBottomNav';
import {
  AskAiSelectionModal,
  CommandPaletteModal,
  ConfirmDialogModal,
  KeybindingsModal,
  NewSubjectModal,
  SettingsModal,
  SubjectCustomizeModal,
  ToastContainer,
} from './components/Modals';
import { QuizPanel } from './components/QuizPanel';
import { RichTextEditorPanel } from './components/RichTextEditorPanel';
import { SlideViewerPanel } from './components/SlideViewerPanel';
import { TopHeader } from './components/TopHeader';
import {
  exportActiveNoteToHTML,
  exportActiveNoteToMarkdown,
  exportActiveNoteToPDF,
  stripHtml,
} from './utils/exporters';
import type { MobilePanelId, Subject, WindowId } from './types';

export default function App() {
  const store = useWorkspaceStore();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const [mobilePanel, setMobilePanel] = useState<MobilePanelId>('left-panel');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Modal states
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customizeSubjectId, setCustomizeSubjectId] = useState<string | null>(null);
  const [newSubjectOpen, setNewSubjectOpen] = useState(false);
  const [keybindingsOpen, setKeybindingsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [askSelectionState, setAskSelectionState] = useState<{
    open: boolean;
    text: string;
  }>({ open: false, text: '' });
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    open: false,
    title: '',
    message: '',
    onConfirm: () => undefined,
  });

  // Cross-panel triggers
  const [searchTriggerToken, setSearchTriggerToken] = useState(0);
  const [quizTriggerToken, setQuizTriggerToken] = useState(0);
  const [externalAiPrompt, setExternalAiPrompt] = useState<ExternalAiPrompt | null>(null);
  const [activeSlideFileId, setActiveSlideFileId] = useState<string | null>(null);

  // Reset activeSlideFileId when subject changes or file is removed
  useEffect(() => {
    if (
      activeSlideFileId &&
      !store.subjectStudyFiles.some((f) => f.id === activeSlideFileId)
    ) {
      setActiveSlideFileId(null);
    }
  }, [activeSlideFileId, store.subjectStudyFiles]);

  // Desktop panel drag & resize states
  const [draggedPanelId, setDraggedPanelId] = useState<WindowId | null>(null);
  const [dragOverPanelId, setDragOverPanelId] = useState<WindowId | null>(null);
  const [localPanelWidths, setLocalPanelWidths] = useState(store.panelWidths);
  const localWidthsRef = useRef(store.panelWidths);

  useEffect(() => {
    setLocalPanelWidths(store.panelWidths);
    localWidthsRef.current = store.panelWidths;
  }, [store.panelWidths]);

  const visibleDesktopPanels = useMemo(
    () => store.panelOrder.filter((id) => store.windowVisibility[id]),
    [store.panelOrder, store.windowVisibility],
  );

  // Determine which visible desktop panel gets flex: 1 1 0%
  const flexiblePanelId: WindowId | null = useMemo(() => {
    if (visibleDesktopPanels.length === 0) return null;
    if (visibleDesktopPanels.includes('left-panel')) return 'left-panel';
    return visibleDesktopPanels[visibleDesktopPanels.length - 1];
  }, [visibleDesktopPanels]);

  // Ensure a panel is visible when triggered programmatically (AI prompt / Quiz / Search)
  const ensurePanelVisible = useCallback(
    (targetId: MobilePanelId) => {
      if (!isDesktop) {
        setMobilePanel(targetId);
        return;
      }
      if (store.windowVisibility[targetId]) return;
      const next = { ...store.windowVisibility };
      const openCount = Object.values(next).filter(Boolean).length;
      if (openCount >= 3) {
        // Close a secondary panel (never the editor unless needed) to stay within max 3 windows
        const replaceable = (
          ['flashcards-panel', 'quiz-panel', 'pdf-viewer-panel', 'right-panel', 'sidebar', 'left-panel'] as WindowId[]
        ).find((id) => id !== targetId && next[id]);
        if (replaceable) next[replaceable] = false;
      }
      next[targetId] = true;
      store.setWindowVisibility(next);
    },
    [isDesktop, store],
  );

  // Window visibility toggling (Max 3 rule enforced)
  const handleToggleWindow = useCallback(
    (id: WindowId) => {
      const currentlyOn = !!store.windowVisibility[id];
      if (!currentlyOn) {
        const openCount = Object.values(store.windowVisibility).filter(Boolean).length;
        if (openCount >= 3) {
          store.showToast('Puoi tenere aperte al massimo 3 finestre contemporaneamente.', 'info');
          return;
        }
      } else {
        if (id === 'quiz-panel') setQuizTriggerToken(0);
        if (id === 'right-panel') setExternalAiPrompt(null);
      }
      store.setWindowVisibility({
        ...store.windowVisibility,
        [id]: !currentlyOn,
      });
    },
    [store],
  );

  const handleRestoreDefaultWindows = useCallback(() => {
    store.setWindowVisibility({ ...DEFAULT_WINDOW_VISIBILITY });
    store.setPanelWidths({ ...DEFAULT_PANEL_WIDTHS }, true);
  }, [store]);

  // Trigger AI Chat externally
  const dispatchAiPrompt = useCallback(
    (prompt: string, label: string) => {
      ensurePanelVisible('right-panel');
      setExternalAiPrompt({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        prompt,
        label,
      });
    },
    [ensurePanelVisible],
  );

  // Trigger Quiz generation from Command Palette
  const triggerQuizCreation = useCallback(() => {
    if (!store.activeNote || !stripHtml(store.activeNote.content).trim()) {
      store.showToast('Apri o scrivi una nota prima di generare un quiz.', 'info');
      return;
    }
    ensurePanelVisible('quiz-panel');
    setQuizTriggerToken((t) => t + 1);
  }, [ensurePanelVisible, store]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!store.user) return;
      const isMod = e.ctrlKey || e.metaKey;

      if ((isMod && e.key.toLowerCase() === 'k') || (isMod && e.shiftKey && e.key.toLowerCase() === 'p')) {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      } else if (isMod && e.key.toLowerCase() === 'f') {
        if (store.activeNote) {
          e.preventDefault();
          ensurePanelVisible('left-panel');
          setSearchTriggerToken((t) => t + 1);
        }
      } else if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        void store.createNote(null);
        ensurePanelVisible('left-panel');
      } else if (e.key === 'Escape') {
        setMobileDrawerOpen(false);
        setCommandPaletteOpen(false);
        setSettingsOpen(false);
        setCustomizeSubjectId(null);
        setNewSubjectOpen(false);
        setKeybindingsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store, ensurePanelVisible]);

  // Resizer Mouse Drag Logic
  const startResizing = (
    e: React.MouseEvent,
    leftId: WindowId,
    rightId: WindowId,
  ) => {
    e.preventDefault();
    const startX = e.clientX;
    const isLeftFlexible = leftId === flexiblePanelId;
    const targetId = isLeftFlexible ? rightId : leftId;
    if (targetId === 'left-panel') return;

    const initialWidth =
      localWidthsRef.current[targetId] ||
      DEFAULT_PANEL_WIDTHS[targetId] ||
      300;

    const onMouseMove = (moveEvt: MouseEvent) => {
      const dx = moveEvt.clientX - startX;
      const rawNext = isLeftFlexible ? initialWidth - dx : initialWidth + dx;
      const clamped = Math.max(210, Math.min(680, Math.round(rawNext)));
      const updated = { ...localWidthsRef.current, [targetId]: clamped };
      localWidthsRef.current = updated;
      setLocalPanelWidths(updated);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      store.setPanelWidths(localWidthsRef.current, true);
    };

    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // JSON Backup File Handler
  const handleImportBackupFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      await store.importBackupData(parsed);
    } catch {
      store.showToast('Errore nella lettura del file di backup JSON.', 'error');
    }
  };

  // Render any panel by WindowId
  const renderPanelContent = (id: WindowId, mobileDrawer = false) => {
    const dragProps = mobileDrawer
      ? {}
      : {
          onHeaderDragStart: (e: React.DragEvent) => {
            setDraggedPanelId(id);
            e.dataTransfer.setData('text/panel-id', id);
            e.dataTransfer.effectAllowed = 'move';
          },
          onHeaderDragEnd: () => {
            setDraggedPanelId(null);
            setDragOverPanelId(null);
          },
        };

    switch (id) {
      case 'sidebar':
        return (
          <ExplorerPanel
            folders={store.subjectFolders}
            notes={store.subjectNotes}
            studyFiles={store.subjectStudyFiles}
            activeNoteId={store.effectiveActiveNoteId}
            activeSlideFileId={activeSlideFileId}
            onOpenNote={(noteId) => {
              store.openNote(noteId);
              if (!isDesktop) setMobilePanel('left-panel');
            }}
            onOpenStudyFile={(file) => {
              setActiveSlideFileId(file.id);
              ensurePanelVisible('pdf-viewer-panel');
            }}
            onCreateNote={(folderId) => store.createNote(folderId ?? null)}
            onCreateFolder={() => store.createFolder()}
            onToggleFolder={(folderId) => void store.toggleFolderOpen(folderId)}
            onRenameNote={(noteId, title) => void store.renameNote(noteId, title)}
            onRenameFolder={(folderId, name) => void store.renameFolder(folderId, name)}
            onDeleteNote={(note) =>
              setConfirmState({
                open: true,
                title: 'Elimina Nota',
                message: `Vuoi eliminare definitivamente la nota "${note.title}"?`,
                onConfirm: () => void store.deleteNote(note.id),
              })
            }
            onDeleteFolder={(folder) =>
              setConfirmState({
                open: true,
                title: 'Elimina Cartella',
                message: `Vuoi eliminare la cartella "${folder.name}"? Le note al suo interno verranno spostate nella root.`,
                onConfirm: () => void store.deleteFolder(folder.id),
              })
            }
            onMoveNoteOrder={(dragId, targetFolderId, targetNoteId, pos) =>
              void store.moveNoteOrder(dragId, targetFolderId, targetNoteId, pos)
            }
            onUploadFiles={async (files, folderId = null) => {
              for (const file of Array.from(files)) {
                await store.uploadStudyFile(file, folderId);
              }
            }}
            onRenameStudyFile={(fileId, name) => void store.renameStudyFile(fileId, name)}
            onDeleteStudyFile={(file) =>
              setConfirmState({
                open: true,
                title: 'Elimina File',
                message: `Vuoi eliminare definitivamente il file "${file.name}"?`,
                onConfirm: () => {
                  if (activeSlideFileId === file.id) {
                    setActiveSlideFileId(null);
                  }
                  void store.deleteStudyFile(file.id);
                },
              })
            }
            onMoveStudyFileToFolder={(fileId, folderId) =>
              void store.moveStudyFileToFolder(fileId, folderId)
            }
            isMobileDrawer={mobileDrawer}
            onCloseMobileDrawer={() => setMobileDrawerOpen(false)}
            {...dragProps}
          />
        );
      case 'pdf-viewer-panel':
        return (
          <SlideViewerPanel
            studyFiles={store.subjectStudyFiles}
            selectedExplorerFileId={activeSlideFileId}
            onSelectExplorerFile={setActiveSlideFileId}
            onGetStudyFileBase64={store.getStudyFileBase64}
            onToast={store.showToast}
            {...dragProps}
          />
        );
      case 'left-panel':
        return (
          <RichTextEditorPanel
            notes={store.subjectNotes}
            openTabIds={store.validOpenTabs}
            activeNote={store.activeNote}
            subjectName={store.currentSubject?.name || 'Studio ITS'}
            saveStatus={store.saveStatus}
            searchTriggerToken={searchTriggerToken}
            editorFontSize={store.editorFontSize}
            editorLineHeight={store.editorLineHeight}
            onSelectNote={store.openNote}
            onCloseTab={store.closeTab}
            onReorderTabs={store.reorderTabs}
            onCreateNote={() => void store.createNote(null)}
            onChangeContent={store.updateNoteContent}
            onAskAiSelection={(text) => setAskSelectionState({ open: true, text })}
            onExplainSelection={(text) =>
              dispatchAiPrompt(
                `Spiega in modo chiaro e didattico questo concetto/passaggio degli appunti di ${store.currentSubject?.name || 'Studio ITS'}:\n\n"${text}"`,
                `Spiegazione di: "${text.length > 60 ? text.slice(0, 60) + '...' : text}"`,
              )
            }
            onToast={store.showToast}
            {...dragProps}
          />
        );
      case 'flashcards-panel':
        return (
          <FlashcardsPanel
            activeNote={store.activeNote}
            subjectName={store.currentSubject?.name || 'Studio ITS'}
            geminiModel={store.geminiModel}
            defaultFlashcardCount={store.defaultFlashcardCount}
            studyDifficulty={store.studyDifficulty}
            aiResponseLanguage={store.aiResponseLanguage}
            cards={store.activeNoteFlashcards}
            aiAccessStatus={store.aiAccessStatus}
            onRequestAiAccess={store.requestAiAccess}
            onRefreshAiAccess={store.refreshAiAccess}
            onAddCards={store.addFlashcardsBatch}
            onDeleteCard={(cardId) => void store.deleteFlashcard(cardId)}
            onToast={store.showToast}
            {...dragProps}
          />
        );
      case 'quiz-panel':
        return (
          <QuizPanel
            activeNote={store.activeNote}
            subjectName={store.currentSubject?.name || 'Studio ITS'}
            geminiModel={store.geminiModel}
            defaultQuizCount={store.defaultQuizCount}
            studyDifficulty={store.studyDifficulty}
            aiResponseLanguage={store.aiResponseLanguage}
            autoShowQuizExplanations={store.autoShowQuizExplanations}
            activeQuiz={store.activeQuiz}
            quizHistory={store.quizHistory}
            generateTriggerToken={quizTriggerToken}
            aiAccessStatus={store.aiAccessStatus}
            onRequestAiAccess={store.requestAiAccess}
            onRefreshAiAccess={store.refreshAiAccess}
            onCreateQuiz={store.createActiveQuiz}
            onSelectAnswer={(quiz, qIdx, optIdx) =>
              void store.selectQuizAnswer(quiz, qIdx, optIdx)
            }
            onSubmitQuiz={store.submitQuiz}
            onCloneQuiz={store.cloneQuizAsActive}
            onDeleteQuiz={(quizId) => void store.deleteQuiz(quizId)}
            onToast={store.showToast}
            {...dragProps}
          />
        );
      case 'right-panel':
        return (
          <AiChatPanel
            currentSubject={store.currentSubject}
            activeNote={store.activeNote}
            notes={store.subjectNotes}
            studyFiles={store.subjectStudyFiles}
            onGetStudyFileBase64={store.getStudyFileBase64}
            geminiModel={store.geminiModel}
            aiResponseStyle={store.aiResponseStyle}
            aiResponseLanguage={store.aiResponseLanguage}
            externalPrompt={externalAiPrompt}
            aiAccessStatus={store.aiAccessStatus}
            onRequestAiAccess={store.requestAiAccess}
            onRefreshAiAccess={store.refreshAiAccess}
            onToast={store.showToast}
            {...dragProps}
          />
        );
    }
  };

  if (store.authLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-vscode-bg text-slate-600 dark:text-vscode-text gap-3">
        <Loader2 className="w-6 h-6 animate-spin accent-icon" />
        <span className="text-xs font-medium">Inizializzazione workspace...</span>
      </div>
    );
  }

  if (!store.user) {
    return (
      <>
        <AuthScreen
          onLogin={() => void store.loginWithGoogle()}
          themeMode={store.themeMode}
          onSetThemeMode={store.setThemeMode}
        />
        <ToastContainer toasts={store.toasts} />
      </>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-vscode-bg text-slate-800 dark:text-vscode-text overflow-hidden transition-colors duration-200">
      <TopHeader
        user={store.user}
        subjects={store.subjects}
        currentSubject={store.currentSubject}
        themeMode={store.themeMode}
        windowVisibility={store.windowVisibility}
        onSelectSubject={store.selectSubject}
        onOpenSubjectCustomize={(sub) => setCustomizeSubjectId(sub.id)}
        onOpenNewSubject={() => setNewSubjectOpen(true)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onToggleWindow={handleToggleWindow}
        onRestoreDefaultWindows={handleRestoreDefaultWindows}
        onSetThemeMode={store.setThemeMode}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenKeybindings={() => setKeybindingsOpen(true)}
        onExportBackup={store.exportFullBackupJson}
        onImportBackupFile={(file) => void handleImportBackupFile(file)}
        onLogout={() => void store.logout()}
        onToggleMobileDrawer={() => setMobileDrawerOpen((prev) => !prev)}
      />

      {/* Legacy localStorage migration banner */}
      {store.hasLegacyBackup && (
        <div className="px-4 py-2 accent-soft-bg dark:bg-vscode-sidebar border-b border-[var(--primary-500)]/30 dark:border-vscode-borderLight flex flex-wrap items-center justify-between gap-2 text-xs flex-none">
          <div className="flex items-center gap-2 text-slate-700 dark:text-vscode-textBright">
            <Upload className="w-3.5 h-3.5 accent-icon shrink-0" />
            <span>
              Abbiamo rilevato appunti locali salvati in precedenza su questo browser. Vuoi importarli nel tuo cloud?
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void store.importLegacyLocalStorage()}
              className="px-3 py-1 rounded-lg accent-btn font-semibold transition cursor-pointer"
            >
              Importa nel Cloud
            </button>
            <button
              type="button"
              onClick={store.dismissLegacyBanner}
              className="px-2.5 py-1 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-vscode-hover transition cursor-pointer"
            >
              Ignora
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace Area */}
      <main className="flex-1 flex min-h-0 overflow-hidden relative">
        {store.dataLoading && store.subjects.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-500 dark:text-vscode-textMuted gap-2">
            <Loader2 className="w-5 h-5 animate-spin accent-icon" />
            <span>Sincronizzazione materie e appunti...</span>
          </div>
        ) : isDesktop ? (
          visibleDesktopPanels.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-slate-50 dark:bg-vscode-bg">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-vscode-textBright mb-1">
                Tutte le finestre sono nascoste
              </h3>
              <p className="text-xs text-slate-500 dark:text-vscode-textMuted max-w-xs mb-4">
                Attiva una finestra dal menu &ldquo;Finestre&rdquo; nella barra superiore oppure ripristina la disposizione predefinita.
              </p>
              <button
                type="button"
                onClick={handleRestoreDefaultWindows}
                className="px-4 py-2 accent-btn text-xs font-semibold rounded-lg transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Ripristina layout base</span>
              </button>
            </div>
          ) : (
            <div className="flex-1 flex min-w-0 h-full overflow-hidden">
              {visibleDesktopPanels.map((panelId, idx) => {
                const isFlexible = panelId === flexiblePanelId;
                const widthPx =
                  panelId === 'left-panel'
                    ? undefined
                    : localPanelWidths[panelId] || DEFAULT_PANEL_WIDTHS[panelId] || 300;
                const nextPanelId = visibleDesktopPanels[idx + 1];

                return (
                  <React.Fragment key={panelId}>
                    <section
                      onDragOver={(e) => {
                        if (!draggedPanelId || draggedPanelId === panelId) return;
                        e.preventDefault();
                        setDragOverPanelId(panelId);
                      }}
                      onDragLeave={() => {
                        if (dragOverPanelId === panelId) setDragOverPanelId(null);
                      }}
                      onDrop={(e) => {
                        if (!draggedPanelId || draggedPanelId === panelId) return;
                        e.preventDefault();
                        const nextOrder = [...store.panelOrder];
                        const fromIdx = nextOrder.indexOf(draggedPanelId);
                        const toIdx = nextOrder.indexOf(panelId);
                        if (fromIdx !== -1 && toIdx !== -1) {
                          [nextOrder[fromIdx], nextOrder[toIdx]] = [
                            nextOrder[toIdx],
                            nextOrder[fromIdx],
                          ];
                          store.setPanelOrder(nextOrder);
                        }
                        setDraggedPanelId(null);
                        setDragOverPanelId(null);
                      }}
                      style={
                        isFlexible
                          ? { flex: '1 1 0%', minWidth: '260px' }
                          : { flex: `0 0 ${widthPx}px`, minWidth: '200px' }
                      }
                      className={`relative h-full overflow-hidden flex flex-col ${
                        dragOverPanelId === panelId ? 'panel-drop-target' : ''
                      }`}
                    >
                      {renderPanelContent(panelId, false)}
                    </section>

                    {nextPanelId && (
                      <div
                        role="separator"
                        aria-orientation="vertical"
                        onMouseDown={(e) => startResizing(e, panelId, nextPanelId)}
                        className="w-1 bg-slate-200 dark:bg-vscode-border accent-resizer cursor-col-resize flex-none transition-colors z-10"
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )
        ) : (
          /* Mobile & Tablet Single-Panel View + Bottom Switcher */
          <div className="flex-1 flex flex-col min-w-0 min-h-0 pb-14 overflow-hidden">
            {renderPanelContent(mobilePanel, false)}
          </div>
        )}

        {/* Mobile / Tablet Slide-Over Explorer Drawer */}
        {!isDesktop && mobileDrawerOpen && (
          <div className="fixed inset-0 z-40 flex">
            <div
              onClick={() => setMobileDrawerOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            />
            <aside className="relative z-50 w-72 max-w-[85vw] h-full bg-slate-50 dark:bg-vscode-sidebar border-r border-slate-200 dark:border-vscode-borderLight shadow-2xl">
              {renderPanelContent('sidebar', true)}
            </aside>
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      {!isDesktop && (
        <MobileBottomNav activePanel={mobilePanel} onSelectPanel={setMobilePanel} />
      )}

      {/* Modals & Notifications */}
      <SettingsModal
        open={settingsOpen}
        settings={{
          geminiModel: store.geminiModel,
          aiResponseStyle: store.aiResponseStyle,
          aiResponseLanguage: store.aiResponseLanguage,
          defaultFlashcardCount: store.defaultFlashcardCount,
          defaultQuizCount: store.defaultQuizCount,
          studyDifficulty: store.studyDifficulty,
          autoShowQuizExplanations: store.autoShowQuizExplanations,
          editorFontSize: store.editorFontSize,
          editorLineHeight: store.editorLineHeight,
        }}
        aiAccessStatus={store.aiAccessStatus}
        onToast={store.showToast}
        onClose={() => setSettingsOpen(false)}
        onSave={store.saveWorkspaceSettings}
      />

      <SubjectCustomizeModal
        open={!!customizeSubjectId}
        subject={store.subjects.find((s) => s.id === customizeSubjectId) || null}
        canDelete={store.subjects.length > 1}
        onClose={() => setCustomizeSubjectId(null)}
        onSave={store.updateSubject}
        onDeleteRequest={(sub: Subject) =>
          setConfirmState({
            open: true,
            title: 'Elimina Materia',
            message: `Vuoi eliminare la materia "${sub.name}" e tutti i relativi appunti, flashcard e quiz?`,
            onConfirm: () => void store.deleteSubject(sub.id),
          })
        }
      />

      <NewSubjectModal
        open={newSubjectOpen}
        onClose={() => setNewSubjectOpen(false)}
        onCreate={store.createSubject}
      />

      <AskAiSelectionModal
        open={askSelectionState.open}
        selectedText={askSelectionState.text}
        onClose={() => setAskSelectionState({ open: false, text: '' })}
        onSubmit={(question, selectedText) =>
          dispatchAiPrompt(
            `Riguardo a questo testo degli appunti di ${store.currentSubject?.name || 'Studio ITS'}:\n"${selectedText}"\n\nDomanda: ${question}`,
            `${question} (su: "${selectedText.length > 40 ? selectedText.slice(0, 40) + '...' : selectedText}")`,
          )
        }
      />

      <ConfirmDialogModal
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        onCancel={() => setConfirmState((prev) => ({ ...prev, open: false }))}
        onConfirm={confirmState.onConfirm}
      />

      <KeybindingsModal
        open={keybindingsOpen}
        onClose={() => setKeybindingsOpen(false)}
      />

      <CommandPaletteModal
        open={commandPaletteOpen}
        subjects={store.subjects}
        hasActiveNote={!!store.activeNote}
        onClose={() => setCommandPaletteOpen(false)}
        onCreateNote={() => {
          void store.createNote(null);
          ensurePanelVisible('left-panel');
        }}
        onCreateFolder={() => {
          void store.createFolder();
          if (isDesktop) {
            if (!store.windowVisibility.sidebar) handleToggleWindow('sidebar');
          } else {
            setMobileDrawerOpen(true);
          }
        }}
        onNewSubject={() => setNewSubjectOpen(true)}
        onSearchInNote={() => {
          ensurePanelVisible('left-panel');
          setSearchTriggerToken((t) => t + 1);
        }}
        onExportPDF={() => {
          if (store.activeNote) {
            exportActiveNoteToPDF(
              store.activeNote.title,
              store.currentSubject?.name || 'Studio ITS',
              store.activeNote.content,
            );
          }
        }}
        onExportMD={() => {
          if (store.activeNote) {
            exportActiveNoteToMarkdown(
              store.activeNote.title,
              store.currentSubject?.name || 'Studio ITS',
              store.activeNote.content,
            );
            store.showToast('Nota esportata in Markdown (.md).', 'success');
          }
        }}
        onExportHTML={() => {
          if (store.activeNote) {
            exportActiveNoteToHTML(store.activeNote.title, store.activeNote.content);
            store.showToast('Nota esportata in HTML (.html).', 'success');
          }
        }}
        onAiSummarize={() => {
          if (!store.activeNote) return;
          const noteText = stripHtml(store.activeNote.content).trim();
          if (!noteText) {
            store.showToast('La nota attiva è vuota.', 'info');
            return;
          }
          dispatchAiPrompt(
            `Riassumi in modo chiaro, schematico e per punti chiave questi appunti di ${store.currentSubject?.name || 'Studio ITS'}:\n\n${noteText}`,
            'Riassumi la nota attiva',
          );
        }}
        onCreateQuiz={triggerQuizCreation}
        onOpenSettings={() => setSettingsOpen(true)}
        onSelectSubject={store.selectSubject}
      />

      <ToastContainer toasts={store.toasts} />
    </div>
  );
}
