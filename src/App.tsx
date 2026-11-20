import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Columns2,
  FileText,
  FolderTree,
  Layers,
  ListChecks,
  Loader2,
  Maximize2,
  Presentation,
  RotateCcw,
  Rows2,
  Upload,
  X,
} from 'lucide-react';
import { DEFAULT_PANEL_WIDTHS, WORKSPACE_WINDOWS } from './constants/defaults';
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
import type {
  ContainerLayoutMode,
  MobilePanelId,
  PanelColumnGroup,
  Subject,
  WindowId,
} from './types';

function renderWindowIcon(id: WindowId, className = 'w-3.5 h-3.5 shrink-0') {
  switch (id) {
    case 'sidebar':
      return <FolderTree className={`${className} text-amber-500`} />;
    case 'pdf-viewer-panel':
      return <Presentation className={`${className} text-red-500`} />;
    case 'left-panel':
      return <FileText className={`${className} text-blue-500`} />;
    case 'flashcards-panel':
      return <Layers className={`${className} text-emerald-500`} />;
    case 'quiz-panel':
      return <ListChecks className={`${className} text-indigo-500`} />;
    case 'right-panel':
      return <Bot className={`${className} text-purple-500`} />;
  }
}

type DragDropTarget =
  | { kind: 'col-slot'; slotIndex: number }
  | { kind: 'stack-tab'; colIndex: number }
  | { kind: 'stack-vertical'; colIndex: number; position: 'top' | 'bottom' };

interface VisibleColumn {
  colIndex: number;
  panels: WindowId[];
  activeTab: WindowId;
  layout: ContainerLayoutMode;
  width?: number;
  heights?: Record<string, number>;
}

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

  // Desktop multitasking, drag & maximize states
  const [maximizedPanelId, setMaximizedPanelId] = useState<WindowId | null>(null);
  const [draggedPanelId, setDraggedPanelId] = useState<WindowId | null>(null);
  const [dragDropTarget, setDragDropTarget] = useState<DragDropTarget | null>(null);
  const hoverTabTimerRef = useRef<{ timer: number; key: string } | null>(null);
  const workspaceRowRef = useRef<HTMLDivElement>(null);

  // Live width & vertical pane height states for smooth 60fps resizing
  const [localPanelWidths, setLocalPanelWidths] = useState(store.panelWidths);
  const localWidthsRef = useRef(store.panelWidths);
  const [localColumnWidths, setLocalColumnWidths] = useState<Record<number, number>>({});
  const localColumnWidthsRef = useRef<Record<number, number>>({});
  const [localPaneHeights, setLocalPaneHeights] = useState<Record<number, Record<string, number>>>(
    {},
  );
  const localPaneHeightsRef = useRef<Record<number, Record<string, number>>>({});

  // Reset activeSlideFileId when subject changes or file is removed
  useEffect(() => {
    if (
      activeSlideFileId &&
      !store.subjectStudyFiles.some((f) => f.id === activeSlideFileId)
    ) {
      setActiveSlideFileId(null);
    }
  }, [activeSlideFileId, store.subjectStudyFiles]);

  // Clear maximize if that window gets hidden
  useEffect(() => {
    if (maximizedPanelId && !store.windowVisibility[maximizedPanelId]) {
      setMaximizedPanelId(null);
    }
  }, [maximizedPanelId, store.windowVisibility]);

  useEffect(() => {
    setLocalPanelWidths(store.panelWidths);
    localWidthsRef.current = store.panelWidths;
  }, [store.panelWidths]);

  useEffect(() => {
    setLocalColumnWidths({});
    localColumnWidthsRef.current = {};
    setLocalPaneHeights({});
    localPaneHeightsRef.current = {};
  }, [store.panelColumns]);

  useEffect(() => {
    return () => {
      if (hoverTabTimerRef.current) {
        window.clearTimeout(hoverTabTimerRef.current.timer);
      }
    };
  }, []);

  const visibleColumns: VisibleColumn[] = useMemo(() => {
    return store.panelColumns
      .map((col, colIndex): VisibleColumn | null => {
        const panels = col.panels.filter((id) => store.windowVisibility[id]);
        if (panels.length === 0) return null;
        const activeTab = panels.includes(col.activeTab) ? col.activeTab : panels[0];
        return {
          colIndex,
          panels,
          activeTab,
          layout: col.layout === 'vertical' ? 'vertical' : 'tabs',
          width: col.width,
          heights: col.heights,
        };
      })
      .filter((col): col is VisibleColumn => col !== null);
  }, [store.panelColumns, store.windowVisibility]);

  // Pick which visible column expands dynamically (prefer Editor column, else last non-collapsed column)
  const flexibleColPos = useMemo(() => {
    if (visibleColumns.length === 0) return -1;
    const editorIdx = visibleColumns.findIndex((c) => c.panels.includes('left-panel'));
    if (editorIdx !== -1) return editorIdx;
    for (let i = visibleColumns.length - 1; i >= 0; i -= 1) {
      const c = visibleColumns[i];
      const isCollapsedRail =
        c.panels.length === 1 && c.panels[0] === 'sidebar' && store.collapsedExplorer;
      if (!isCollapsedRail) return i;
    }
    return visibleColumns.length - 1;
  }, [visibleColumns, store.collapsedExplorer]);

  // Stable column width helper (does NOT jump when switching tabs in a stacked container)
  const getRawPanelWidth = useCallback(
    (panelId: WindowId): number => {
      if (panelId === 'left-panel') return 420;
      return localPanelWidths[panelId] || DEFAULT_PANEL_WIDTHS[panelId] || 320;
    },
    [localPanelWidths],
  );

  const getColumnWidthPx = useCallback(
    (col: VisibleColumn): number => {
      if (col.panels.length === 1) {
        return getRawPanelWidth(col.panels[0]);
      }
      const liveW = localColumnWidths[col.colIndex];
      if (typeof liveW === 'number' && Number.isFinite(liveW)) return liveW;
      if (typeof col.width === 'number' && Number.isFinite(col.width)) return col.width;
      const anchor = col.panels.find((p) => p !== 'left-panel') || col.panels[0];
      return getRawPanelWidth(anchor);
    },
    [getRawPanelWidth, localColumnWidths],
  );

  // Ensure a panel is visible when triggered programmatically (no 3-window lock)
  const ensurePanelVisible = useCallback(
    (targetId: WindowId) => {
      if (!isDesktop) {
        if (targetId === 'sidebar') {
          setMobileDrawerOpen(true);
        } else {
          setMobilePanel(targetId);
        }
        return;
      }
      if (!store.windowVisibility[targetId]) {
        store.setWindowVisibility({
          ...store.windowVisibility,
          [targetId]: true,
        });
      }
      const colIdx = store.panelColumns.findIndex((c) => c.panels.includes(targetId));
      if (colIdx !== -1 && store.panelColumns[colIdx].activeTab !== targetId) {
        store.setActiveColumnTab(colIdx, targetId);
      }
      if (targetId === 'sidebar' && store.collapsedExplorer) {
        store.setCollapsedExplorer(false, false);
      }
      setMaximizedPanelId((prev) => (prev && prev !== targetId ? targetId : prev));
    },
    [isDesktop, store],
  );

  // Toggle any window freely (up to all 6 windows simultaneously)
  const handleToggleWindow = useCallback(
    (id: WindowId) => {
      const currentlyOn = !!store.windowVisibility[id];
      if (currentlyOn) {
        if (id === 'quiz-panel') setQuizTriggerToken(0);
        if (id === 'right-panel') setExternalAiPrompt(null);
        setMaximizedPanelId((prev) => (prev === id ? null : prev));
      } else {
        const colIdx = store.panelColumns.findIndex((c) => c.panels.includes(id));
        if (colIdx !== -1 && store.panelColumns[colIdx].activeTab !== id) {
          store.setActiveColumnTab(colIdx, id);
        }
        if (id === 'sidebar' && store.collapsedExplorer) {
          store.setCollapsedExplorer(false, false);
        }
      }
      store.setWindowVisibility({
        ...store.windowVisibility,
        [id]: !currentlyOn,
      });
    },
    [store],
  );

  const handleToggleMaximize = useCallback((id: WindowId) => {
    setMaximizedPanelId((prev) => (prev === id ? null : id));
  }, []);

  const handleToggleCollapseExplorer = useCallback(() => {
    if (!store.windowVisibility.sidebar) {
      store.setWindowVisibility({ ...store.windowVisibility, sidebar: true });
      store.setCollapsedExplorer(false, false);
      return;
    }
    store.setCollapsedExplorer(!store.collapsedExplorer, false);
  }, [store]);

  const handleRestoreDefaultWindows = useCallback(() => {
    setMaximizedPanelId(null);
    store.applyLayoutPreset('studio-base');
    store.setPanelWidths({ ...DEFAULT_PANEL_WIDTHS }, true);
  }, [store]);

  // Switch a multi-window column between 'tabs' and 'vertical'
  const handleSwitchContainerLayout = useCallback(
    (colIndex: number, nextLayout: ContainerLayoutMode) => {
      const nextCols = store.panelColumns.map((col, idx) =>
        idx === colIndex ? { ...col, layout: nextLayout } : col,
      );
      store.setPanelColumns(nextCols, true);
    },
    [store],
  );

  // Unstack a tab out of a stacked column into its own column right next to it
  const handleUnstackTab = useCallback(
    (colIndex: number, panelId: WindowId) => {
      const source = store.panelColumns[colIndex];
      if (!source || source.panels.length <= 1) return;
      const nextCols: PanelColumnGroup[] = [];
      store.panelColumns.forEach((col, idx) => {
        if (idx !== colIndex) {
          nextCols.push(col);
          return;
        }
        const remaining = col.panels.filter((p) => p !== panelId);
        if (remaining.length > 0) {
          nextCols.push({
            ...col,
            panels: remaining,
            activeTab: remaining.includes(col.activeTab) ? col.activeTab : remaining[0],
            layout: remaining.length > 1 ? col.layout : 'tabs',
          });
        }
        nextCols.push({ panels: [panelId], activeTab: panelId });
      });
      store.setPanelColumns(nextCols, true);
    },
    [store],
  );

  // Commit unified drop operation (single slot, tab stack, or vertical split)
  const commitPanelDrop = useCallback(
    (activeDraggedId: WindowId, target: DragDropTarget) => {
      if (target.kind === 'col-slot') {
        const sourcePos = visibleColumns.findIndex((c) => c.panels.includes(activeDraggedId));
        const sourceCol = sourcePos !== -1 ? visibleColumns[sourcePos] : null;
        if (
          sourceCol &&
          sourceCol.panels.length === 1 &&
          (target.slotIndex === sourcePos || target.slotIndex === sourcePos + 1)
        ) {
          return;
        }

        // Determine raw insertion target column index in store.panelColumns
        let rawInsertColIndex: number;
        if (target.slotIndex < visibleColumns.length) {
          rawInsertColIndex = visibleColumns[target.slotIndex].colIndex;
        } else {
          const lastVisible = visibleColumns[visibleColumns.length - 1];
          rawInsertColIndex = lastVisible ? lastVisible.colIndex + 1 : store.panelColumns.length;
        }

        const withoutDragged: PanelColumnGroup[] = [];
        let adjustedInsertIdx = rawInsertColIndex;

        store.panelColumns.forEach((rawCol, idx) => {
          if (rawCol.panels.includes(activeDraggedId)) {
            const remaining = rawCol.panels.filter((p) => p !== activeDraggedId);
            if (remaining.length === 0) {
              if (idx < rawInsertColIndex) adjustedInsertIdx -= 1;
            } else {
              const nextActive = remaining.includes(rawCol.activeTab)
                ? rawCol.activeTab
                : remaining[0];
              withoutDragged.push({
                ...rawCol,
                panels: remaining,
                activeTab: nextActive,
                layout: remaining.length > 1 ? rawCol.layout : 'tabs',
              });
            }
          } else {
            withoutDragged.push({ ...rawCol, panels: [...rawCol.panels] });
          }
        });

        const safeInsert = Math.max(0, Math.min(withoutDragged.length, adjustedInsertIdx));
        withoutDragged.splice(safeInsert, 0, {
          panels: [activeDraggedId],
          activeTab: activeDraggedId,
        });
        store.setPanelColumns(withoutDragged, true);
        return;
      }

      // Stack into target column (tabs or vertical)
      const targetColIndex = target.colIndex;
      const targetRawCol = store.panelColumns[targetColIndex];
      if (!targetRawCol) return;

      const isSameCol = targetRawCol.panels.includes(activeDraggedId);
      const visibleInTarget = targetRawCol.panels.filter((p) => store.windowVisibility[p]);
      if (isSameCol && visibleInTarget.length <= 1) return;

      // Preserve stable container width when merging columns
      const existingVisibleTarget = visibleColumns.find((c) => c.colIndex === targetColIndex);
      const targetWidth = existingVisibleTarget ? getColumnWidthPx(existingVisibleTarget) : 320;
      const draggedWidth = getRawPanelWidth(activeDraggedId);
      const stableMergedWidth =
        targetRawCol.width ?? Math.max(targetWidth, Math.min(draggedWidth, 420), 300);

      const withoutDragged: PanelColumnGroup[] = [];
      let adjustedTargetIdx = targetColIndex;

      store.panelColumns.forEach((rawCol, idx) => {
        if (rawCol.panels.includes(activeDraggedId)) {
          const remaining = rawCol.panels.filter((p) => p !== activeDraggedId);
          if (remaining.length === 0) {
            if (idx < targetColIndex) adjustedTargetIdx -= 1;
          } else {
            const nextActive = remaining.includes(rawCol.activeTab)
              ? rawCol.activeTab
              : remaining[0];
            withoutDragged.push({
              ...rawCol,
              panels: remaining,
              activeTab: nextActive,
              layout: remaining.length > 1 ? rawCol.layout : 'tabs',
            });
          }
        } else {
          withoutDragged.push({ ...rawCol, panels: [...rawCol.panels] });
        }
      });

      const safeIdx = Math.max(0, Math.min(withoutDragged.length - 1, adjustedTargetIdx));
      const dest = withoutDragged[safeIdx];
      if (!dest) return;

      if (target.kind === 'stack-tab') {
        withoutDragged[safeIdx] = {
          ...dest,
          panels: [...dest.panels, activeDraggedId],
          activeTab: activeDraggedId,
          layout: 'tabs',
          width: dest.panels.includes('left-panel') || activeDraggedId === 'left-panel' ? dest.width : stableMergedWidth,
        };
      } else {
        // stack-vertical ('top' or 'bottom')
        const nextPanels =
          target.position === 'top'
            ? [activeDraggedId, ...dest.panels]
            : [...dest.panels, activeDraggedId];
        withoutDragged[safeIdx] = {
          ...dest,
          panels: nextPanels,
          activeTab: activeDraggedId,
          layout: 'vertical',
          width: dest.panels.includes('left-panel') || activeDraggedId === 'left-panel' ? dest.width : stableMergedWidth,
        };
      }

      store.setPanelColumns(withoutDragged, true);
    },
    [visibleColumns, store, getColumnWidthPx, getRawPanelWidth],
  );

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
        setMaximizedPanelId(null);
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

  // Viewport-clamped horizontal column resizer (prevents pushing other windows off screen)
  const startResizing = (e: React.MouseEvent, leftPos: number, rightPos: number) => {
    e.preventDefault();
    const startX = e.clientX;
    const isLeftFlexible = leftPos === flexibleColPos;
    const targetPos = isLeftFlexible ? rightPos : leftPos;
    const targetCol = visibleColumns[targetPos];
    if (!targetCol || targetPos === flexibleColPos) return;

    const containerW = workspaceRowRef.current?.clientWidth || window.innerWidth;
    const totalResizersW = Math.max(0, visibleColumns.length - 1) * 4;
    let reservedForOtherCols = totalResizersW;
    visibleColumns.forEach((c, idx) => {
      if (idx === targetPos) return;
      const isCollapsed =
        c.panels.length === 1 && c.panels[0] === 'sidebar' && store.collapsedExplorer;
      if (isCollapsed) {
        reservedForOtherCols += 44;
      } else if (idx === flexibleColPos) {
        reservedForOtherCols += 220;
      } else {
        reservedForOtherCols += getColumnWidthPx(c);
      }
    });

    const maxAllowed = Math.max(200, Math.min(760, containerW - reservedForOtherCols));
    const initialWidth = getColumnWidthPx(targetCol);
    const isMultiPanelContainer = targetCol.panels.length >= 2;
    const singlePanelId = targetCol.panels[0];

    const onMouseMove = (moveEvt: MouseEvent) => {
      const dx = moveEvt.clientX - startX;
      const rawNext = isLeftFlexible ? initialWidth - dx : initialWidth + dx;
      const clamped = Math.max(200, Math.min(maxAllowed, Math.round(rawNext)));

      if (isMultiPanelContainer) {
        const nextMap = { ...localColumnWidthsRef.current, [targetCol.colIndex]: clamped };
        localColumnWidthsRef.current = nextMap;
        setLocalColumnWidths(nextMap);
      } else if (singlePanelId && singlePanelId !== 'left-panel') {
        const updated = { ...localWidthsRef.current, [singlePanelId]: clamped };
        localWidthsRef.current = updated;
        setLocalPanelWidths(updated);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';

      if (isMultiPanelContainer) {
        const finalWidth = localColumnWidthsRef.current[targetCol.colIndex];
        if (typeof finalWidth === 'number') {
          const nextCols = store.panelColumns.map((rawCol, idx) =>
            idx === targetCol.colIndex ? { ...rawCol, width: finalWidth } : rawCol,
          );
          store.setPanelColumns(nextCols, false);
        }
      } else {
        store.setPanelWidths(localWidthsRef.current, true);
      }
    };

    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Vertical pane resizer inside a vertically split container
  const startVerticalResizing = (
    e: React.MouseEvent,
    col: VisibleColumn,
    topPaneIdx: number,
  ) => {
    e.preventDefault();
    const sepEl = e.currentTarget as HTMLElement;
    const containerEl = sepEl.parentElement;
    if (!containerEl) return;

    const topId = col.panels[topPaneIdx];
    const bottomId = col.panels[topPaneIdx + 1];
    if (!topId || !bottomId) return;

    const paneElements = Array.from(containerEl.children).filter(
      (el) => el.getAttribute('data-pane-id') !== null,
    ) as HTMLElement[];
    const topEl = paneElements[topPaneIdx];
    const bottomEl = paneElements[topPaneIdx + 1];
    if (!topEl || !bottomEl) return;

    const startY = e.clientY;
    const initialTopH = topEl.getBoundingClientRect().height;
    const initialBottomH = bottomEl.getBoundingClientRect().height;
    const combinedH = initialTopH + initialBottomH;
    const minPaneH = 130;

    // Seed baseline weights from current pixel heights
    const baseWeights: Record<string, number> = {};
    col.panels.forEach((pId, idx) => {
      const el = paneElements[idx];
      baseWeights[pId] = el ? Math.max(minPaneH, el.getBoundingClientRect().height) : 200;
    });

    const onMouseMove = (moveEvt: MouseEvent) => {
      const dy = moveEvt.clientY - startY;
      const nextTop = Math.max(minPaneH, Math.min(combinedH - minPaneH, initialTopH + dy));
      const nextBottom = Math.max(minPaneH, combinedH - nextTop);

      const nextColHeights = {
        ...baseWeights,
        [topId]: Math.round(nextTop),
        [bottomId]: Math.round(nextBottom),
      };
      const updatedMap = {
        ...localPaneHeightsRef.current,
        [col.colIndex]: nextColHeights,
      };
      localPaneHeightsRef.current = updatedMap;
      setLocalPaneHeights(updatedMap);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';

      const finalHeights = localPaneHeightsRef.current[col.colIndex];
      if (finalHeights) {
        const nextCols = store.panelColumns.map((rawCol, idx) =>
          idx === col.colIndex ? { ...rawCol, heights: finalHeights } : rawCol,
        );
        store.setPanelColumns(nextCols, false);
      }
    };

    document.body.style.cursor = 'row-resize';
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

  // Drag-over hover timer helper on stacked tabs for cross-panel Explorer/OS file drops
  const clearHoverTabTimer = () => {
    if (hoverTabTimerRef.current) {
      window.clearTimeout(hoverTabTimerRef.current.timer);
      hoverTabTimerRef.current = null;
    }
  };

  // Render any panel by WindowId
  const renderPanelContent = (
    id: WindowId,
    mobileDrawer = false,
    options: {
      hideWindowHeader?: boolean;
      iconOnlyHeader?: boolean;
      isMaximized?: boolean;
      forceExpandedExplorer?: boolean;
      onSwitchToTabs?: () => void;
    } = {},
  ) => {
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
            setDragDropTarget(null);
          },
        };

    const windowActionProps = mobileDrawer
      ? {}
      : {
          hideWindowHeader: options.hideWindowHeader ?? false,
          iconOnlyHeader: options.iconOnlyHeader ?? false,
          isMaximized: options.isMaximized ?? false,
          onToggleMaximize: () => handleToggleMaximize(id),
          onClosePanel: () => handleToggleWindow(id),
          onSwitchToTabs: options.onSwitchToTabs,
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
            collapsed={
              mobileDrawer || options.forceExpandedExplorer || options.isMaximized
                ? false
                : store.collapsedExplorer
            }
            onToggleCollapseExplorer={handleToggleCollapseExplorer}
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
            {...windowActionProps}
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
            {...windowActionProps}
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
            {...windowActionProps}
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
            {...windowActionProps}
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
            {...windowActionProps}
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
            {...windowActionProps}
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

  // Compute drag drop target from cursor position inside column pos
  const resolveColumnDropTarget = (
    clientX: number,
    clientY: number,
    rect: DOMRect,
    pos: number,
    col: VisibleColumn,
    activeDraggedId: WindowId,
  ): DragDropTarget | null => {
    const relX = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
    const relY = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;

    const sourcePos = visibleColumns.findIndex((c) => c.panels.includes(activeDraggedId));
    const sourceCol = sourcePos !== -1 ? visibleColumns[sourcePos] : null;
    const isSameCol = col.panels.includes(activeDraggedId);

    // Horizontal edge zones -> unified single slot index (0..visibleColumns.length)
    if (relX < 0.2) {
      const slotIndex = pos;
      if (
        sourceCol &&
        sourceCol.panels.length === 1 &&
        (slotIndex === sourcePos || slotIndex === sourcePos + 1)
      ) {
        return null;
      }
      return { kind: 'col-slot', slotIndex };
    }
    if (relX > 0.8) {
      const slotIndex = pos + 1;
      if (
        sourceCol &&
        sourceCol.panels.length === 1 &&
        (slotIndex === sourcePos || slotIndex === sourcePos + 1)
      ) {
        return null;
      }
      return { kind: 'col-slot', slotIndex };
    }

    if (isSameCol && col.panels.length <= 1) return null;

    // Top / Bottom bands -> arrange vertically inside container
    if (relY < 0.28) {
      if (isSameCol && col.layout === 'vertical' && col.panels[0] === activeDraggedId) return null;
      return { kind: 'stack-vertical', colIndex: col.colIndex, position: 'top' };
    }
    if (relY > 0.72) {
      if (
        isSameCol &&
        col.layout === 'vertical' &&
        col.panels[col.panels.length - 1] === activeDraggedId
      ) {
        return null;
      }
      return { kind: 'stack-vertical', colIndex: col.colIndex, position: 'bottom' };
    }

    // Center -> stack into compact tabs
    if (isSameCol && col.layout === 'tabs') return null;
    return { kind: 'stack-tab', colIndex: col.colIndex };
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-vscode-bg text-slate-800 dark:text-vscode-text overflow-hidden transition-colors duration-200">
      <TopHeader
        user={store.user}
        subjects={store.subjects}
        currentSubject={store.currentSubject}
        themeMode={store.themeMode}
        windowVisibility={store.windowVisibility}
        activeLayoutPreset={store.activeLayoutPreset}
        collapsedExplorer={store.collapsedExplorer}
        onSelectSubject={store.selectSubject}
        onOpenSubjectCustomize={(sub) => setCustomizeSubjectId(sub.id)}
        onOpenNewSubject={() => setNewSubjectOpen(true)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onToggleWindow={handleToggleWindow}
        onApplyLayoutPreset={(presetId) => {
          setMaximizedPanelId(null);
          store.applyLayoutPreset(presetId);
        }}
        onToggleCollapseExplorer={handleToggleCollapseExplorer}
        onRestoreDefaultWindows={handleRestoreDefaultWindows}
        onSetThemeMode={store.setThemeMode}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenKeybindings={() => setKeybindingsOpen(true)}
        onExportBackup={store.exportFullBackupJson}
        onImportBackupFile={(file) => void handleImportBackupFile(file)}
        onLogout={() => void store.logout()}
        onToggleMobileDrawer={() => setMobileDrawerOpen((prev) => !prev)}
        isAiAdmin={store.isAiAdmin}
        pendingAiRequestsCount={store.pendingAdminRequests.length}
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
          maximizedPanelId && store.windowVisibility[maximizedPanelId] ? (
            <div className="flex-1 flex min-w-0 h-full overflow-hidden">
              <section className="relative flex-1 h-full overflow-hidden flex flex-col">
                {renderPanelContent(maximizedPanelId, false, {
                  hideWindowHeader: false,
                  iconOnlyHeader: store.windowHeaderLabelMode === 'icons-only',
                  isMaximized: true,
                  forceExpandedExplorer: true,
                })}
              </section>
            </div>
          ) : visibleColumns.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-slate-50 dark:bg-vscode-bg">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-vscode-textBright mb-1">
                Tutte le finestre sono nascoste
              </h3>
              <p className="text-xs text-slate-500 dark:text-vscode-textMuted max-w-xs mb-4">
                Attiva una finestra dal menu &ldquo;Finestre&rdquo; nella barra superiore oppure ripristina un layout predefinito.
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
            <div
              ref={workspaceRowRef}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragDropTarget(null);
                }
              }}
              className="flex-1 flex min-w-0 h-full overflow-x-auto overflow-y-hidden"
            >
              {visibleColumns.map((col, pos) => {
                const isFlexible = pos === flexibleColPos;
                const isCollapsedRail =
                  col.panels.length === 1 &&
                  col.panels[0] === 'sidebar' &&
                  store.collapsedExplorer;
                const isMulti = col.panels.length >= 2;
                const isVertical = isMulti && col.layout === 'vertical';
                const isIconOnly =
                  store.windowHeaderLabelMode === 'icons-only' ||
                  (store.windowHeaderLabelMode === 'auto' && isMulti);

                const widthPx = getColumnWidthPx(col);
                const colStyle: React.CSSProperties = isCollapsedRail
                  ? { flex: '0 0 44px', minWidth: '44px' }
                  : isFlexible
                    ? { flex: '1 1 220px', minWidth: '220px' }
                    : { flex: `0 1 ${widthPx}px`, minWidth: '180px' };

                const nextCol = visibleColumns[pos + 1];
                const nextIsCollapsedRail =
                  nextCol &&
                  nextCol.panels.length === 1 &&
                  nextCol.panels[0] === 'sidebar' &&
                  store.collapsedExplorer;
                const showResizer = !!nextCol && !isCollapsedRail && !nextIsCollapsedRail;

                const showLeftSlotLine =
                  dragDropTarget?.kind === 'col-slot' && dragDropTarget.slotIndex === pos;
                const showRightSlotLine =
                  pos === visibleColumns.length - 1 &&
                  dragDropTarget?.kind === 'col-slot' &&
                  dragDropTarget.slotIndex === visibleColumns.length;

                const dropOverlayClass =
                  dragDropTarget?.kind === 'stack-tab' && dragDropTarget.colIndex === col.colIndex
                    ? 'panel-drop-zone-center'
                    : dragDropTarget?.kind === 'stack-vertical' &&
                        dragDropTarget.colIndex === col.colIndex
                      ? dragDropTarget.position === 'top'
                        ? 'panel-drop-zone-top'
                        : 'panel-drop-zone-bottom'
                      : '';

                return (
                  <React.Fragment key={`col_${col.colIndex}_${col.panels.join('_')}`}>
                    <section
                      onDragOver={(e) => {
                        if (!draggedPanelId) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const nextTarget = resolveColumnDropTarget(
                          e.clientX,
                          e.clientY,
                          rect,
                          pos,
                          col,
                          draggedPanelId,
                        );
                        if (nextTarget) {
                          e.preventDefault();
                        }
                        setDragDropTarget(nextTarget);
                      }}
                      onDrop={(e) => {
                        const activeDraggedId =
                          draggedPanelId ||
                          (e.dataTransfer.getData('text/panel-id') as WindowId | '');
                        if (!activeDraggedId) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const finalTarget = resolveColumnDropTarget(
                          e.clientX,
                          e.clientY,
                          rect,
                          pos,
                          col,
                          activeDraggedId,
                        );
                        if (finalTarget) {
                          e.preventDefault();
                          e.stopPropagation();
                          commitPanelDrop(activeDraggedId, finalTarget);
                        }
                        setDraggedPanelId(null);
                        setDragDropTarget(null);
                      }}
                      style={colStyle}
                      className={`relative h-full overflow-hidden flex flex-col ${dropOverlayClass}`}
                    >
                      {/* Single unified column-boundary insertion line (identical to Editor tabs) */}
                      {showLeftSlotLine && (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute top-0 bottom-0 left-0 w-[3px] z-50"
                          style={{
                            backgroundColor: 'var(--primary-500)',
                            boxShadow: '0 0 8px rgba(var(--primary-rgb), 0.5)',
                          }}
                        />
                      )}
                      {showRightSlotLine && (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute top-0 bottom-0 right-0 w-[3px] z-50"
                          style={{
                            backgroundColor: 'var(--primary-500)',
                            boxShadow: '0 0 8px rgba(var(--primary-rgb), 0.5)',
                          }}
                        />
                      )}

                      {isMulti && !isVertical ? (
                        <>
                          {/* Compact Editor-style Container Tab Bar */}
                          <div className="flex items-stretch justify-between bg-slate-100 dark:bg-vscode-sidebar border-b border-slate-200 dark:border-vscode-border flex-none select-none">
                            <div className="flex items-stretch overflow-x-auto hide-scrollbar flex-1 min-w-0">
                              {col.panels.map((tabId) => {
                                const meta = WORKSPACE_WINDOWS.find((w) => w.id === tabId);
                                const isActive = tabId === col.activeTab;
                                const timerKey = `${col.colIndex}_${tabId}`;
                                return (
                                  <div
                                    key={tabId}
                                    role="tab"
                                    aria-selected={isActive}
                                    draggable
                                    onDragStart={(e) => {
                                      setDraggedPanelId(tabId);
                                      e.dataTransfer.setData('text/panel-id', tabId);
                                      e.dataTransfer.effectAllowed = 'move';
                                    }}
                                    onDragEnd={() => {
                                      setDraggedPanelId(null);
                                      setDragDropTarget(null);
                                      clearHoverTabTimer();
                                    }}
                                    onDragOver={(e) => {
                                      if (isActive) return;
                                      const types = Array.from(e.dataTransfer.types || []);
                                      const isContentDrag =
                                        types.includes('application/x-its-explorer-item') ||
                                        types.includes('Files');
                                      if (!isContentDrag) return;
                                      e.preventDefault();
                                      if (hoverTabTimerRef.current?.key !== timerKey) {
                                        clearHoverTabTimer();
                                        const timer = window.setTimeout(() => {
                                          store.setActiveColumnTab(col.colIndex, tabId);
                                          hoverTabTimerRef.current = null;
                                        }, 250);
                                        hoverTabTimerRef.current = { timer, key: timerKey };
                                      }
                                    }}
                                    onDragLeave={() => {
                                      if (hoverTabTimerRef.current?.key === timerKey) {
                                        clearHoverTabTimer();
                                      }
                                    }}
                                    onDrop={() => {
                                      clearHoverTabTimer();
                                    }}
                                    onClick={() => store.setActiveColumnTab(col.colIndex, tabId)}
                                    style={
                                      isActive ? { borderTopColor: 'var(--primary-500)' } : undefined
                                    }
                                    title={`${meta?.label || tabId} · Trascina per riordinare, separare o impilare`}
                                    className={`group relative flex items-center gap-1.5 px-2.5 py-2 text-[11px] border-r border-slate-200 dark:border-vscode-border cursor-pointer select-none flex-none transition focus:outline-none ${
                                      isActive
                                        ? 'bg-white dark:bg-vscode-bg text-slate-800 dark:text-vscode-textBright font-medium border-t-2'
                                        : 'text-slate-500 dark:text-vscode-textMuted hover:bg-slate-200/60 dark:hover:bg-vscode-hover border-t-2 border-t-transparent'
                                    } ${draggedPanelId === tabId ? 'opacity-40' : ''}`}
                                  >
                                    {renderWindowIcon(tabId, 'w-3.5 h-3.5 shrink-0')}
                                    {!isIconOnly && (
                                      <span className="whitespace-nowrap">
                                        {meta?.shortLabel || meta?.label || tabId}
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      draggable={false}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleWindow(tabId);
                                      }}
                                      title={`Chiudi ${meta?.label || tabId}`}
                                      className={`p-0.5 rounded hover:bg-slate-200 dark:hover:bg-vscode-borderLight transition cursor-pointer ${
                                        isActive
                                          ? 'opacity-65 hover:opacity-100'
                                          : 'opacity-0 group-hover:opacity-75 hover:!opacity-100'
                                      }`}
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="flex items-center gap-0.5 px-1 shrink-0 border-l border-slate-200 dark:border-vscode-border bg-slate-100 dark:bg-vscode-sidebar">
                              <button
                                type="button"
                                onClick={() => handleSwitchContainerLayout(col.colIndex, 'vertical')}
                                title="Disponi verticalmente nella colonna"
                                className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-vscode-hover transition cursor-pointer"
                              >
                                <Rows2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUnstackTab(col.colIndex, col.activeTab)}
                                title="Separa scheda attiva in colonna autonoma"
                                className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-vscode-hover transition cursor-pointer"
                              >
                                <Columns2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleMaximize(col.activeTab)}
                                title="Espandi finestra attiva"
                                className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-vscode-hover transition cursor-pointer"
                              >
                                <Maximize2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                            {renderPanelContent(col.activeTab, false, {
                              hideWindowHeader: true,
                              iconOnlyHeader: isIconOnly,
                              isMaximized: false,
                              forceExpandedExplorer: true,
                            })}
                          </div>
                        </>
                      ) : isVertical ? (
                        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                          {col.panels.map((paneId, pIdx) => {
                            const weight =
                              localPaneHeights[col.colIndex]?.[paneId] ??
                              col.heights?.[paneId] ??
                              1;
                            const hasNextPane = pIdx < col.panels.length - 1;
                            return (
                              <React.Fragment key={paneId}>
                                <div
                                  data-pane-id={paneId}
                                  style={{ flex: `${weight} 1 0%`, minHeight: '130px' }}
                                  className="relative flex flex-col min-h-0 overflow-hidden"
                                >
                                  {renderPanelContent(paneId, false, {
                                    hideWindowHeader: false,
                                    iconOnlyHeader: isIconOnly,
                                    isMaximized: false,
                                    forceExpandedExplorer: true,
                                    onSwitchToTabs: () =>
                                      handleSwitchContainerLayout(col.colIndex, 'tabs'),
                                  })}
                                </div>
                                {hasNextPane && (
                                  <div
                                    role="separator"
                                    aria-orientation="horizontal"
                                    onMouseDown={(e) => startVerticalResizing(e, col, pIdx)}
                                    className="h-1 bg-slate-200 dark:bg-vscode-border accent-resizer cursor-row-resize flex-none transition-colors z-10"
                                  />
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      ) : (
                        renderPanelContent(col.activeTab, false, {
                          hideWindowHeader: false,
                          iconOnlyHeader: isIconOnly,
                          isMaximized: false,
                        })
                      )}
                    </section>

                    {showResizer && nextCol && (
                      <div
                        role="separator"
                        aria-orientation="vertical"
                        onDragOver={(e) => {
                          if (!draggedPanelId) return;
                          const sourcePos = visibleColumns.findIndex((c) =>
                            c.panels.includes(draggedPanelId),
                          );
                          const sourceCol = sourcePos !== -1 ? visibleColumns[sourcePos] : null;
                          const slotIndex = pos + 1;
                          if (
                            sourceCol &&
                            sourceCol.panels.length === 1 &&
                            (slotIndex === sourcePos || slotIndex === sourcePos + 1)
                          ) {
                            setDragDropTarget(null);
                            return;
                          }
                          e.preventDefault();
                          setDragDropTarget({ kind: 'col-slot', slotIndex });
                        }}
                        onDrop={(e) => {
                          const activeDraggedId =
                            draggedPanelId ||
                            (e.dataTransfer.getData('text/panel-id') as WindowId | '');
                          if (!activeDraggedId) return;
                          e.preventDefault();
                          e.stopPropagation();
                          commitPanelDrop(activeDraggedId, {
                            kind: 'col-slot',
                            slotIndex: pos + 1,
                          });
                          setDraggedPanelId(null);
                          setDragDropTarget(null);
                        }}
                        onMouseDown={(e) => startResizing(e, pos, pos + 1)}
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
          windowHeaderLabelMode: store.windowHeaderLabelMode,
        }}
        aiAccessStatus={store.aiAccessStatus}
        isAiAdmin={store.isAiAdmin}
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
          ensurePanelVisible('sidebar');
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
        onApplyLayoutPreset={(presetId) => {
          setMaximizedPanelId(null);
          store.applyLayoutPreset(presetId);
        }}
        onToggleCollapseExplorer={handleToggleCollapseExplorer}
        onRestoreDefaultLayout={handleRestoreDefaultWindows}
      />

      <ToastContainer toasts={store.toasts} />
    </div>
  );
}
