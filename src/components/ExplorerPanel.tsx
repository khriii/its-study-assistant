import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  FolderTree,
  GripVertical,
  Loader2,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelTop,
  Pencil,
  Plus,
  Presentation,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { formatFileSize } from '../utils/documentParser';
import { stripHtml } from '../utils/exporters';
import type { Folder, Note, PanelWindowActions, StudyFile } from '../types';

interface ExplorerPanelProps extends PanelWindowActions {
  folders: Folder[];
  notes: Note[];
  studyFiles: StudyFile[];
  activeNoteId: string | null;
  activeSlideFileId: string | null;
  activeSelectionKind?: 'note' | 'file';
  collapsed?: boolean;
  onOpenNote: (noteId: string) => void;
  onOpenStudyFile: (file: StudyFile) => void;
  onCreateNote: (folderId?: string | null) => Promise<string | null>;
  onCreateFolder: () => Promise<string | null>;
  onToggleFolder: (folderId: string) => void;
  onRenameNote: (noteId: string, title: string) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onDeleteNote: (note: Note) => void;
  onDeleteFolder: (folder: Folder) => void;
  onMoveNoteOrder: (
    draggedNoteId: string,
    targetFolderId: string | null,
    targetNoteId?: string,
    position?: 'before' | 'after',
  ) => void;
  onUploadFiles: (files: FileList | File[], folderId?: string | null) => Promise<void>;
  onRenameStudyFile: (fileId: string, name: string) => void;
  onDeleteStudyFile: (file: StudyFile) => void;
  onMoveStudyFileToFolder: (fileId: string, folderId: string | null) => void;
  onHeaderDragStart?: (e: React.DragEvent) => void;
  onHeaderDragEnd?: () => void;
  isMobileDrawer?: boolean;
  onCloseMobileDrawer?: () => void;
}

export const ExplorerPanel: React.FC<ExplorerPanelProps> = ({
  folders,
  notes,
  studyFiles,
  activeNoteId,
  activeSlideFileId,
  activeSelectionKind = 'note',
  onOpenNote,
  onOpenStudyFile,
  onCreateNote,
  onCreateFolder,
  onToggleFolder,
  onRenameNote,
  onRenameFolder,
  onDeleteNote,
  onDeleteFolder,
  onMoveNoteOrder,
  onUploadFiles,
  onRenameStudyFile,
  onDeleteStudyFile,
  onMoveStudyFileToFolder,
  onHeaderDragStart,
  onHeaderDragEnd,
  isMobileDrawer = false,
  onCloseMobileDrawer,
  collapsed = false,
  hideWindowHeader = false,
  iconOnlyHeader = false,
  isMaximized = false,
  onToggleMaximize,
  onClosePanel,
  onToggleCollapseExplorer,
  onSwitchToTabs,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [externalFileHover, setExternalFileHover] = useState(false);
  const [folderPlusMenu, setFolderPlusMenu] = useState<{
    folderId: string;
    x: number;
    y: number;
  } | null>(null);
  const [editingItem, setEditingItem] = useState<{
    type: 'note' | 'folder' | 'file';
    id: string;
    value: string;
  } | null>(null);
  const [draggedItem, setDraggedItem] = useState<{
    kind: 'note' | 'file';
    id: string;
  } | null>(null);
  const [dropIndicator, setDropIndicator] = useState<
    | { type: 'note'; id: string; position: 'before' | 'after' }
    | { type: 'folder'; id: string }
    | { type: 'root' }
    | null
  >(null);

  const editInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadFolderIdRef = useRef<string | null>(null);
  const folderClickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (folderClickTimerRef.current) {
        window.clearTimeout(folderClickTimerRef.current);
      }
    };
  }, []);

  // Only focus & select text ONCE when entering inline rename mode (NOT on every keystroke)
  const editingKey = editingItem ? `${editingItem.type}:${editingItem.id}` : null;
  useEffect(() => {
    if (editingKey && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingKey]);

  // Collapse search bar when pressing/clicking outside
  useEffect(() => {
    if (!searchExpanded) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setSearchExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [searchExpanded]);

  // Close folder '+' context menu on outside click or Escape
  useEffect(() => {
    if (!folderPlusMenu) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-folder-plus-menu]')) return;
      setFolderPlusMenu(null);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFolderPlusMenu(null);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [folderPlusMenu]);

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredNotes = trimmedQuery
    ? notes.filter(
        (n) =>
          n.title.toLowerCase().includes(trimmedQuery) ||
          stripHtml(n.content).toLowerCase().includes(trimmedQuery),
      )
    : notes;

  const filteredStudyFiles = trimmedQuery
    ? studyFiles.filter((f) => f.name.toLowerCase().includes(trimmedQuery))
    : studyFiles;

  const commitInlineEdit = () => {
    if (!editingItem) return;
    const trimmed = editingItem.value.trim();
    if (trimmed) {
      if (editingItem.type === 'note') {
        onRenameNote(editingItem.id, trimmed);
      } else if (editingItem.type === 'folder') {
        onRenameFolder(editingItem.id, trimmed);
      } else {
        onRenameStudyFile(editingItem.id, trimmed);
      }
    }
    setEditingItem(null);
  };

  const handleCreateNoteClick = async (folderId: string | null = null, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const createdId = await onCreateNote(folderId);
    if (createdId) {
      const countLabel = `Nuova Nota ${notes.length + 1}`;
      setEditingItem({ type: 'note', id: createdId, value: countLabel });
    }
  };

  const handleCreateFolderClick = async () => {
    const createdId = await onCreateFolder();
    if (createdId) {
      const countLabel = `Nuova Cartella ${folders.length + 1}`;
      setEditingItem({ type: 'folder', id: createdId, value: countLabel });
    }
  };

  const openFilePickerForFolder = (folderId: string | null = null) => {
    pendingUploadFolderIdRef.current = folderId;
    uploadInputRef.current?.click();
  };

  const handleUploadTrigger = async (
    fileList: FileList | File[] | null,
    folderId: string | null = null,
  ) => {
    if (!fileList || fileList.length === 0 || uploading) return;
    setUploading(true);
    try {
      await onUploadFiles(fileList, folderId);
    } finally {
      setUploading(false);
    }
  };

  const isExternalFileDrag = (e: React.DragEvent): boolean => {
    if (draggedItem) return false;
    const types = Array.from(e.dataTransfer?.types || []);
    if (types.includes('text/panel-id') || types.includes('application/x-its-explorer-item')) {
      return false;
    }
    if (types.includes('Files') || types.includes('application/x-moz-file')) {
      return true;
    }
    const items = e.dataTransfer?.items;
    if (items && items.length > 0) {
      return Array.from(items).some((it) => it.kind === 'file');
    }
    return false;
  };

  const handleOpenFolderPlusMenu = (folderId: string, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setFolderPlusMenu((prev) => {
      if (prev?.folderId === folderId) return null;
      const menuW = 168;
      const menuH = 88;
      const x = Math.max(8, Math.min(rect.left, window.innerWidth - menuW - 8));
      const y =
        rect.bottom + menuH + 8 > window.innerHeight
          ? Math.max(8, rect.top - menuH - 4)
          : rect.bottom + 4;
      return { folderId, x, y };
    });
  };

  const expandSearch = () => {
    setSearchExpanded(true);
    window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 15);
  };

  const renderNoteItem = (note: Note) => {
    const isActive = activeSelectionKind === 'note' && note.id === activeNoteId;
    const isEditing = editingItem?.type === 'note' && editingItem.id === note.id;
    const isDraggingThis = draggedItem?.kind === 'note' && draggedItem.id === note.id;
    const noteDrop =
      dropIndicator?.type === 'note' && dropIndicator.id === note.id
        ? dropIndicator.position
        : null;

    return (
      <li
        key={note.id}
        draggable={!isEditing && !isMobileDrawer}
        onDragStart={(e) => {
          e.stopPropagation();
          setDraggedItem({ kind: 'note', id: note.id });
          e.dataTransfer.setData(
            'application/x-its-explorer-item',
            JSON.stringify({ kind: 'note', id: note.id }),
          );
          e.dataTransfer.setData('text/plain', note.id);
          e.dataTransfer.effectAllowed = 'copyMove';
        }}
        onDragEnd={() => {
          setDraggedItem(null);
          setDropIndicator(null);
        }}
        onDragOver={(e) => {
          if (draggedItem?.kind !== 'note' || draggedItem.id === note.id) return;
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
          setDropIndicator({ type: 'note', id: note.id, position: pos });
        }}
        onDrop={(e) => {
          if (draggedItem?.kind !== 'note') return;
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
          if (draggedItem.id !== note.id) {
            onMoveNoteOrder(draggedItem.id, note.folderId, note.id, pos);
          }
          setDraggedItem(null);
          setDropIndicator(null);
        }}
        onClick={() => {
          if (!isEditing) {
            onOpenNote(note.id);
            onCloseMobileDrawer?.();
          }
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!isEditing) {
            setEditingItem({ type: 'note', id: note.id, value: note.title });
          }
        }}
        title="Clic per aprire · Doppio clic per rinominare · Trascina in AI Chat per allegare"
        className={`group relative min-h-[32px] lg:min-h-[28px] flex items-center justify-between px-2 rounded-lg cursor-pointer text-xs transition ${
          isActive
            ? 'accent-selected-row font-medium'
            : 'text-slate-600 dark:text-vscode-text hover:bg-slate-200/70 dark:hover:bg-vscode-hover'
        } ${isDraggingThis ? 'opacity-40' : ''}`}
      >
        {noteDrop && <div className={`explorer-drop-line ${noteDrop === 'before' ? 'top' : 'bottom'}`} />}

        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <FileText
            className={`w-3.5 h-3.5 flex-none ${
              isActive ? 'accent-icon' : 'text-slate-400'
            }`}
          />
          {isEditing ? (
            <input
              ref={editInputRef}
              type="text"
              value={editingItem.value}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) =>
                setEditingItem((prev) => (prev ? { ...prev, value: e.target.value } : null))
              }
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitInlineEdit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditingItem(null);
                }
              }}
              onBlur={commitInlineEdit}
              className="w-full bg-white dark:bg-vscode-input text-xs text-slate-800 dark:text-vscode-textBright px-1.5 py-0.5 rounded border border-[var(--primary-500)] focus:outline-none"
            />
          ) : (
            <span className="truncate">{note.title}</span>
          )}
        </div>

        {!isEditing && (
          <div className="flex lg:hidden group-hover:flex items-center gap-0.5 flex-none ml-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditingItem({ type: 'note', id: note.id, value: note.title });
              }}
              className="w-6 h-6 flex items-center justify-center text-slate-400 accent-hover-text rounded transition cursor-pointer"
              title="Rinomina"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteNote(note);
              }}
              className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500 rounded transition cursor-pointer"
              title="Elimina"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </li>
    );
  };

  const renderStudyFileItem = (file: StudyFile) => {
    const isActive = activeSelectionKind === 'file' && file.id === activeSlideFileId;
    const isEditing = editingItem?.type === 'file' && editingItem.id === file.id;
    const isDraggingThis = draggedItem?.kind === 'file' && draggedItem.id === file.id;

    const iconEl =
      file.fileExt === 'pptx' ? (
        <Presentation className="w-3.5 h-3.5 flex-none text-orange-500" />
      ) : file.fileExt === 'docx' ? (
        <FileText className="w-3.5 h-3.5 flex-none text-blue-500" />
      ) : (
        <FileText className="w-3.5 h-3.5 flex-none text-red-500" />
      );

    return (
      <li
        key={file.id}
        draggable={!isEditing && !isMobileDrawer}
        onDragStart={(e) => {
          e.stopPropagation();
          setDraggedItem({ kind: 'file', id: file.id });
          e.dataTransfer.setData(
            'application/x-its-explorer-item',
            JSON.stringify({ kind: 'file', id: file.id }),
          );
          e.dataTransfer.setData('text/plain', file.name);
          e.dataTransfer.effectAllowed = 'copyMove';
        }}
        onDragEnd={() => {
          setDraggedItem(null);
          setDropIndicator(null);
        }}
        onClick={() => {
          if (!isEditing) {
            onOpenStudyFile(file);
            onCloseMobileDrawer?.();
          }
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!isEditing) {
            setEditingItem({ type: 'file', id: file.id, value: file.name });
          }
        }}
        title={`${file.name} (${formatFileSize(file.size)}) · Clic per aprire in Slide Viewer · Doppio clic per rinominare · Trascina in AI Chat`}
        className={`group relative min-h-[32px] lg:min-h-[28px] flex items-center justify-between px-2 rounded-lg cursor-pointer text-xs transition ${
          isActive
            ? 'accent-selected-row font-medium'
            : 'text-slate-600 dark:text-vscode-text hover:bg-slate-200/70 dark:hover:bg-vscode-hover'
        } ${isDraggingThis ? 'opacity-40' : ''}`}
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {iconEl}
          {isEditing ? (
            <input
              ref={editInputRef}
              type="text"
              value={editingItem.value}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) =>
                setEditingItem((prev) => (prev ? { ...prev, value: e.target.value } : null))
              }
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitInlineEdit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditingItem(null);
                }
              }}
              onBlur={commitInlineEdit}
              className="w-full bg-white dark:bg-vscode-input text-xs text-slate-800 dark:text-vscode-textBright px-1.5 py-0.5 rounded border border-[var(--primary-500)] focus:outline-none"
            />
          ) : (
            <>
              <span className="truncate">{file.name}</span>
              <span className="text-[9px] font-mono uppercase text-slate-400 dark:text-vscode-textMuted flex-none">
                {file.fileExt}
              </span>
            </>
          )}
        </div>

        {!isEditing && (
          <div className="flex lg:hidden group-hover:flex items-center gap-0.5 flex-none ml-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditingItem({ type: 'file', id: file.id, value: file.name });
              }}
              className="w-6 h-6 flex items-center justify-center text-slate-400 accent-hover-text rounded transition cursor-pointer"
              title="Rinomina file"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteStudyFile(file);
              }}
              className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500 rounded transition cursor-pointer"
              title="Elimina file"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </li>
    );
  };

  const rootNotes = filteredNotes.filter((n) => !n.folderId);
  const rootFiles = filteredStudyFiles.filter((f) => !f.folderId);

  const hiddenUploadInput = (
    <input
      ref={uploadInputRef}
      type="file"
      accept=".pdf,.docx,.pptx"
      multiple
      className="hidden"
      onChange={(e) => {
        const targetFolder = pendingUploadFolderIdRef.current;
        pendingUploadFolderIdRef.current = null;
        void handleUploadTrigger(e.target.files, targetFolder);
        e.target.value = '';
      }}
    />
  );

  if (collapsed && !isMobileDrawer && !hideWindowHeader && !isMaximized) {
    return (
      <div
        onDragOver={(e) => {
          if (!isExternalFileDrag(e)) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
          setExternalFileHover(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setExternalFileHover(false);
          }
        }}
        onDrop={(e) => {
          if (e.dataTransfer.files?.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            setExternalFileHover(false);
            void handleUploadTrigger(e.dataTransfer.files, null);
          }
        }}
        className={`flex flex-col items-center h-full bg-slate-50 dark:bg-vscode-sidebar overflow-hidden py-1.5 gap-1.5 select-none transition-colors ${
          externalFileHover ? 'accent-soft-bg' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => onToggleCollapseExplorer?.()}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-hover transition cursor-pointer"
          title="Espandi Explorer"
          aria-label="Espandi Explorer"
        >
          <PanelLeftOpen className="w-4 h-4 accent-icon" />
        </button>

        <div className="w-5 h-px bg-slate-200 dark:bg-vscode-borderLight" />

        <button
          type="button"
          onClick={() => {
            onToggleCollapseExplorer?.();
            setSearchExpanded(true);
            window.setTimeout(() => searchInputRef.current?.focus(), 60);
          }}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-vscode-textMuted hover:bg-slate-200 dark:hover:bg-vscode-hover hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
          title="Cerca appunti o file"
        >
          <Search className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => {
            onToggleCollapseExplorer?.();
            void handleCreateNoteClick(null);
          }}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-vscode-textMuted hover:bg-slate-200 dark:hover:bg-vscode-hover hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
          title="Nuovo File (Alt+N)"
        >
          <FilePlus2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => {
            onToggleCollapseExplorer?.();
            void handleCreateFolderClick();
          }}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-vscode-textMuted hover:bg-slate-200 dark:hover:bg-vscode-hover hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
          title="Nuova Cartella"
        >
          <FolderPlus className="w-4 h-4" />
        </button>

        <button
          type="button"
          disabled={uploading}
          onClick={() => openFilePickerForFolder(null)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-vscode-textMuted hover:bg-slate-200 dark:hover:bg-vscode-hover hover:text-slate-800 dark:hover:text-white transition cursor-pointer disabled:opacity-50"
          title="Carica PDF, DOCX o PPTX (max 5MB)"
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin accent-icon" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
        </button>

        {hiddenUploadInput}

        <div className="mt-auto pb-1 flex flex-col items-center gap-1">
          <span
            className="text-[10px] font-mono tabular-nums text-slate-400 dark:text-vscode-textMuted"
            title={`${notes.length} note · ${studyFiles.length} file`}
          >
            {notes.length + studyFiles.length}
          </span>
          {onClosePanel && (
            <button
              type="button"
              onClick={onClosePanel}
              className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-vscode-hover transition cursor-pointer"
              title="Nascondi Explorer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        if (!isExternalFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        setExternalFileHover(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setExternalFileHover(false);
          setDropIndicator(null);
        }
      }}
      onDrop={(e) => {
        if (isExternalFileDrag(e) && e.dataTransfer.files?.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          setExternalFileHover(false);
          setDropIndicator(null);
          void handleUploadTrigger(e.dataTransfer.files, null);
        }
      }}
      className="relative flex flex-col h-full bg-slate-50 dark:bg-vscode-sidebar overflow-hidden"
    >
      {/* Header */}
      {!hideWindowHeader && (
        <div
          draggable={!isMobileDrawer}
          onDragStart={onHeaderDragStart}
          onDragEnd={onHeaderDragEnd}
          className={`window-header h-9 px-3 border-b border-slate-200 dark:border-vscode-border flex justify-between items-center bg-slate-200/80 dark:bg-vscode-border flex-none ${
            isMobileDrawer ? '' : 'cursor-grab'
          }`}
        >
          <span
            title="Explorer"
            className="font-mono text-[11px] font-semibold tracking-wider text-slate-500 dark:text-vscode-textMuted uppercase flex items-center gap-1.5 min-w-0"
          >
            {!isMobileDrawer && <GripVertical className="w-3 h-3 text-slate-400 shrink-0" />}
            <FolderTree className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            {!iconOnlyHeader && <span className="truncate">Explorer</span>}
          </span>
          {isMobileDrawer && onCloseMobileDrawer ? (
            <button
              type="button"
              onClick={onCloseMobileDrawer}
              className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
              aria-label="Chiudi Explorer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
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
              {onToggleCollapseExplorer && !isMaximized && (
                <button
                  type="button"
                  draggable={false}
                  onClick={onToggleCollapseExplorer}
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
                  title="Comprimi Explorer in barra laterale"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
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
          )}
        </div>
      )}

      {/* Search (Far-Left Collapsible) & Creation Bar */}
      <div
        ref={searchContainerRef}
        className="px-1.5 py-1 border-b border-slate-200 dark:border-vscode-border flex items-center justify-between gap-1 flex-none min-h-[34px]"
      >
        {searchExpanded ? (
          <div className="relative flex-1 w-full min-w-0">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setSearchExpanded(false);
                }
              }}
              placeholder="Cerca appunti o file..."
              className="w-full h-6 bg-white dark:bg-vscode-input text-xs text-slate-700 dark:text-vscode-textBright pl-6.5 pr-6 rounded-md border border-slate-200 dark:border-vscode-borderLight focus:outline-none accent-focus"
            />
            <Search className="w-3 h-3 absolute left-2 top-1.5 text-slate-400 dark:text-vscode-textMuted pointer-events-none" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                className="w-4 h-4 flex items-center justify-center absolute right-1 top-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded cursor-pointer"
                title="Cancella ricerca"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={expandSearch}
              className={`relative w-6 h-6 flex items-center justify-center rounded-md transition flex-none cursor-pointer ${
                trimmedQuery
                  ? 'accent-toolbar-active border'
                  : 'text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-borderLight'
              }`}
              title={trimmedQuery ? `Ricerca attiva: "${searchQuery}"` : 'Cerca appunti o file'}
              aria-label="Cerca appunti o file"
            >
              <Search className="w-3.5 h-3.5" />
              {trimmedQuery && (
                <span
                  aria-hidden="true"
                  className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--primary-500)' }}
                />
              )}
            </button>

            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => void handleCreateNoteClick(null)}
                className="w-6 h-6 flex items-center justify-center text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-borderLight rounded-md transition flex-none cursor-pointer"
                title="Nuovo File (Alt+N)"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void handleCreateFolderClick()}
                className="w-6 h-6 flex items-center justify-center text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-borderLight rounded-md transition flex-none cursor-pointer"
                title="Nuova Cartella"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={() => openFilePickerForFolder(null)}
                className="w-6 h-6 flex items-center justify-center text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-borderLight rounded-md transition flex-none cursor-pointer disabled:opacity-50"
                title="Carica PDF, DOCX o PPTX (max 5MB)"
              >
                {uploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin accent-icon" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </>
        )}
        {hiddenUploadInput}
      </div>

      {/* External File Drag Overlay */}
      {externalFileHover && dropIndicator?.type !== 'folder' && (
        <div
          style={{ backgroundColor: 'rgba(var(--primary-rgb), 0.12)' }}
          className="pointer-events-none absolute inset-x-1.5 bottom-1.5 top-10 z-30 rounded-lg border-2 border-dashed border-[var(--primary-500)] flex flex-col items-center justify-center p-3 text-center backdrop-blur-[1px]"
        >
          <div className="bg-white dark:bg-vscode-sidebar border border-[var(--primary-500)]/40 rounded-xl px-3 py-2 shadow-lg flex items-center gap-2 text-xs font-semibold accent-text">
            <Upload className="w-4 h-4 shrink-0" />
            <span>Rilascia PDF, DOCX o PPTX qui</span>
          </div>
        </div>
      )}

      {/* Hierarchical Tree */}
      <ul
        onDragOver={(e) => {
          if (!draggedItem && !isExternalFileDrag(e)) return;
          e.preventDefault();
          if (isExternalFileDrag(e)) {
            e.dataTransfer.dropEffect = 'copy';
          }
          setDropIndicator({ type: 'root' });
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDropIndicator(null);
          }
        }}
        onDrop={(e) => {
          if (draggedItem) {
            e.preventDefault();
            e.stopPropagation();
            if (draggedItem.kind === 'note') {
              onMoveNoteOrder(draggedItem.id, null);
            } else {
              onMoveStudyFileToFolder(draggedItem.id, null);
            }
            setDraggedItem(null);
            setDropIndicator(null);
            return;
          }
          if (e.dataTransfer.files?.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            setExternalFileHover(false);
            setDropIndicator(null);
            void handleUploadTrigger(e.dataTransfer.files, null);
          }
        }}
        style={
          dropIndicator?.type === 'root'
            ? { backgroundColor: 'rgba(var(--primary-rgb), 0.08)' }
            : undefined
        }
        className="flex-1 overflow-y-auto overflow-x-hidden p-1.5 space-y-0.5 text-sm text-slate-600 dark:text-vscode-text transition-colors"
      >
        {folders.map((folder) => {
          const folderNotes = filteredNotes.filter((n) => n.folderId === folder.id);
          const folderFiles = filteredStudyFiles.filter((f) => f.folderId === folder.id);
          if (
            trimmedQuery &&
            folderNotes.length === 0 &&
            folderFiles.length === 0 &&
            !folder.name.toLowerCase().includes(trimmedQuery)
          ) {
            return null;
          }
          const isOpen = trimmedQuery ? true : folder.isOpen !== false;
          const isEditingFolder = editingItem?.type === 'folder' && editingItem.id === folder.id;
          const isFolderDropTarget =
            dropIndicator?.type === 'folder' && dropIndicator.id === folder.id;

          return (
            <li key={folder.id} className="space-y-0.5">
              <div
                onClick={() => {
                  if (isEditingFolder) return;
                  if (folderClickTimerRef.current) {
                    window.clearTimeout(folderClickTimerRef.current);
                  }
                  folderClickTimerRef.current = window.setTimeout(() => {
                    folderClickTimerRef.current = null;
                    onToggleFolder(folder.id);
                  }, 170);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (folderClickTimerRef.current) {
                    window.clearTimeout(folderClickTimerRef.current);
                    folderClickTimerRef.current = null;
                  }
                  if (!isEditingFolder) {
                    setEditingItem({ type: 'folder', id: folder.id, value: folder.name });
                  }
                }}
                title="Clic per aprire/chiudere · Doppio clic per rinominare"
                onDragOver={(e) => {
                  if (!draggedItem && !isExternalFileDrag(e)) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (isExternalFileDrag(e)) {
                    e.dataTransfer.dropEffect = 'copy';
                    setExternalFileHover(true);
                  }
                  setDropIndicator({ type: 'folder', id: folder.id });
                }}
                onDrop={(e) => {
                  if (draggedItem) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (draggedItem.kind === 'note') {
                      onMoveNoteOrder(draggedItem.id, folder.id);
                    } else {
                      onMoveStudyFileToFolder(draggedItem.id, folder.id);
                    }
                    setDraggedItem(null);
                    setDropIndicator(null);
                    return;
                  }
                  if (e.dataTransfer.files?.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    setExternalFileHover(false);
                    setDropIndicator(null);
                    void handleUploadTrigger(e.dataTransfer.files, folder.id);
                  }
                }}
                className={`group relative min-h-[32px] lg:min-h-[28px] flex items-center justify-between px-2 rounded-lg cursor-pointer text-xs text-slate-700 dark:text-vscode-text hover:bg-slate-200/70 dark:hover:bg-vscode-hover transition ${
                  isFolderDropTarget ? 'explorer-folder-drop-active' : ''
                }`}
              >
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  {isOpen ? (
                    <ChevronDown className="w-3 h-3 text-slate-400 flex-none" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-slate-400 flex-none" />
                  )}
                  {isOpen ? (
                    <FolderOpen className="w-3.5 h-3.5 accent-icon flex-none" />
                  ) : (
                    <FolderIcon className="w-3.5 h-3.5 accent-icon flex-none" />
                  )}

                  {isEditingFolder ? (
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editingItem.value}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setEditingItem((prev) =>
                          prev ? { ...prev, value: e.target.value } : null,
                        )
                      }
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitInlineEdit();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingItem(null);
                        }
                      }}
                      onBlur={commitInlineEdit}
                      className="w-full bg-white dark:bg-vscode-input text-xs text-slate-800 dark:text-vscode-textBright px-1.5 py-0.5 rounded border border-[var(--primary-500)] focus:outline-none"
                    />
                  ) : (
                    <span className="truncate font-medium">{folder.name}</span>
                  )}
                </div>

                {!isEditingFolder && (
                  <div className="flex lg:hidden group-hover:flex items-center gap-0.5 flex-none ml-1">
                    <button
                      type="button"
                      data-folder-plus-menu
                      onClick={(e) => handleOpenFolderPlusMenu(folder.id, e)}
                      className={`w-6 h-6 flex items-center justify-center rounded transition cursor-pointer ${
                        folderPlusMenu?.folderId === folder.id
                          ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40'
                          : 'text-slate-400 hover:text-emerald-500'
                      }`}
                      title="Nuova nota o carica file nella cartella"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingItem({ type: 'folder', id: folder.id, value: folder.name });
                      }}
                      className="w-6 h-6 flex items-center justify-center text-slate-400 accent-hover-text rounded transition cursor-pointer"
                      title="Rinomina cartella"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteFolder(folder);
                      }}
                      className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500 rounded transition cursor-pointer"
                      title="Elimina cartella"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {isOpen && (
                <ul className="pl-4 space-y-0.5 border-l border-slate-200 dark:border-vscode-border ml-2.5">
                  {folderNotes.map((n) => renderNoteItem(n))}
                  {folderFiles.map((f) => renderStudyFileItem(f))}
                </ul>
              )}
            </li>
          );
        })}

        {rootNotes.map((n) => renderNoteItem(n))}
        {rootFiles.map((f) => renderStudyFileItem(f))}

        {folders.length === 0 && rootNotes.length === 0 && rootFiles.length === 0 && (
          <li className="px-3 py-8 text-center text-xs text-slate-400 dark:text-vscode-textMuted">
            Nessun appunto o file trovato.
          </li>
        )}
      </ul>

      {/* Folder '+' Action Context Menu */}
      {folderPlusMenu &&
        createPortal(
          <div
            data-folder-plus-menu
            style={{ left: folderPlusMenu.x, top: folderPlusMenu.y }}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-[120] w-44 p-1 bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-xl shadow-2xl flex flex-col gap-0.5 text-xs"
          >
            <button
              type="button"
              onClick={() => {
                const targetId = folderPlusMenu.folderId;
                setFolderPlusMenu(null);
                void handleCreateNoteClick(targetId);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-vscode-text hover:bg-slate-100 dark:hover:bg-vscode-hover flex items-center gap-2 transition cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5 accent-icon shrink-0" />
              <span>Nuovo File</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const targetId = folderPlusMenu.folderId;
                setFolderPlusMenu(null);
                openFilePickerForFolder(targetId);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-vscode-text hover:bg-slate-100 dark:hover:bg-vscode-hover flex items-center gap-2 transition cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Carica File</span>
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
};
