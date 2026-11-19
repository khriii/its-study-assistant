import React, { useEffect, useRef, useState } from 'react';
import { FileText, FolderOpen, GripVertical, Loader2, Presentation, X } from 'lucide-react';
import {
  base64ToBlobUrl,
  base64ToUint8Array,
  extractDocumentPreview,
  getStudyFileExt,
  type ParsedDocBlock,
  type ParsedSlide,
} from '../utils/documentParser';
import type { StudyFile } from '../types';

interface SlideViewerPanelProps {
  studyFiles: StudyFile[];
  selectedExplorerFileId: string | null;
  onSelectExplorerFile: (fileId: string | null) => void;
  onGetStudyFileBase64: (fileId: string) => Promise<string>;
  onToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onHeaderDragStart?: (e: React.DragEvent) => void;
  onHeaderDragEnd?: () => void;
}

interface ViewerState {
  source: 'explorer' | 'local';
  name: string;
  kind: 'pdf' | 'image' | 'pptx' | 'docx';
  blobUrl?: string;
  slides?: ParsedSlide[];
  docxBlocks?: ParsedDocBlock[];
}

export const SlideViewerPanel: React.FC<SlideViewerPanelProps> = ({
  studyFiles,
  selectedExplorerFileId,
  onSelectExplorerFile,
  onGetStudyFileBase64,
  onToast,
  onHeaderDragStart,
  onHeaderDragEnd,
}) => {
  const [viewerState, setViewerState] = useState<ViewerState | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const activeBlobUrlRef = useRef<string | null>(null);

  const revokeCurrentBlob = () => {
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      revokeCurrentBlob();
    };
  }, []);

  // Load selected Explorer file when selectedExplorerFileId changes
  useEffect(() => {
    if (!selectedExplorerFileId) {
      setViewerState((prev) => {
        if (prev?.source === 'explorer') {
          revokeCurrentBlob();
          return null;
        }
        return prev;
      });
      return;
    }

    const fileMeta = studyFiles.find((f) => f.id === selectedExplorerFileId);
    if (!fileMeta) return;

    let cancelled = false;
    setLoadingFile(true);

    (async () => {
      try {
        const b64 = await onGetStudyFileBase64(fileMeta.id);
        if (cancelled) return;

        revokeCurrentBlob();

        if (fileMeta.fileExt === 'pdf') {
          const url = base64ToBlobUrl(b64, 'application/pdf');
          activeBlobUrlRef.current = url;
          setViewerState({
            source: 'explorer',
            name: fileMeta.name,
            kind: 'pdf',
            blobUrl: url,
          });
        } else if (fileMeta.fileExt === 'pptx') {
          const parsed = await extractDocumentPreview(base64ToUint8Array(b64), 'pptx');
          if (cancelled) return;
          setViewerState({
            source: 'explorer',
            name: fileMeta.name,
            kind: 'pptx',
            slides: parsed.slides || [],
          });
        } else if (fileMeta.fileExt === 'docx') {
          const parsed = await extractDocumentPreview(base64ToUint8Array(b64), 'docx');
          if (cancelled) return;
          setViewerState({
            source: 'explorer',
            name: fileMeta.name,
            kind: 'docx',
            docxBlocks: parsed.docxBlocks || [],
          });
        }
      } catch {
        if (!cancelled) {
          onToast(`Impossibile aprire il file "${fileMeta.name}".`, 'error');
        }
      } finally {
        if (!cancelled) setLoadingFile(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedExplorerFileId, studyFiles, onGetStudyFileBase64, onToast]);

  const handleLocalFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    onSelectExplorerFile(null);
    revokeCurrentBlob();

    const ext = getStudyFileExt(file.name);
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      activeBlobUrlRef.current = url;
      setViewerState({
        source: 'local',
        name: file.name,
        kind: 'image',
        blobUrl: url,
      });
      return;
    }

    if (ext === 'pdf' || file.type === 'application/pdf') {
      const url = URL.createObjectURL(file);
      activeBlobUrlRef.current = url;
      setViewerState({
        source: 'local',
        name: file.name,
        kind: 'pdf',
        blobUrl: url,
      });
      return;
    }

    if (ext === 'pptx' || ext === 'docx') {
      setLoadingFile(true);
      try {
        const buffer = await file.arrayBuffer();
        const parsed = await extractDocumentPreview(buffer, ext);
        setViewerState({
          source: 'local',
          name: file.name,
          kind: ext,
          slides: parsed.slides || [],
          docxBlocks: parsed.docxBlocks || [],
        });
      } catch {
        onToast(`Errore nella lettura del file "${file.name}".`, 'error');
      } finally {
        setLoadingFile(false);
      }
      return;
    }

    onToast('Formato non supportato. Usa PDF, DOCX, PPTX o immagini.', 'error');
  };

  const handleCloseFile = () => {
    revokeCurrentBlob();
    setViewerState(null);
    onSelectExplorerFile(null);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-vscode-bg overflow-hidden">
      <div
        draggable
        onDragStart={onHeaderDragStart}
        onDragEnd={onHeaderDragEnd}
        className="window-header h-9 px-3 border-b border-slate-200 dark:border-vscode-border flex justify-between items-center bg-slate-200/80 dark:bg-vscode-border flex-none cursor-grab"
      >
        <span className="font-mono text-[11px] font-semibold tracking-wider text-slate-500 dark:text-vscode-textMuted uppercase flex items-center gap-1.5">
          <GripVertical className="w-3 h-3 text-slate-400" />
          <FileText className="w-3 h-3 text-red-500" />
          <span>Slide Viewer</span>
        </span>
      </div>

      {/* Selector & Local Open Bar */}
      <div className="p-2 border-b border-slate-200 dark:border-vscode-border bg-slate-100 dark:bg-vscode-tabInactive flex flex-wrap items-center gap-1.5 flex-none">
        {studyFiles.length > 0 && (
          <select
            value={selectedExplorerFileId || ''}
            onChange={(e) => onSelectExplorerFile(e.target.value || null)}
            aria-label="Seleziona file dall'Explorer"
            className="flex-1 min-w-[130px] bg-white dark:bg-vscode-input text-[11px] font-medium text-slate-700 dark:text-vscode-textBright px-2 py-1.5 rounded-lg border border-slate-200 dark:border-vscode-borderLight focus:outline-none accent-focus cursor-pointer truncate"
          >
            <option value="">Da Explorer ({studyFiles.length})...</option>
            {studyFiles.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.fileExt.toUpperCase()})
              </option>
            ))}
          </select>
        )}

        <label className="px-2.5 py-1.5 bg-white dark:bg-vscode-input hover:bg-slate-50 dark:hover:bg-vscode-hover text-slate-700 dark:text-vscode-textBright border border-slate-200 dark:border-vscode-borderLight rounded-lg text-[11px] font-medium flex items-center gap-1.5 cursor-pointer shadow-xs transition min-w-0 max-w-full">
          <FolderOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="truncate">
            {viewerState?.source === 'local' ? viewerState.name : 'Apri Locale'}
          </span>
          <input
            type="file"
            accept=".pdf,.docx,.pptx,image/*"
            className="hidden"
            onChange={(e) => void handleLocalFileChange(e)}
          />
        </label>

        {viewerState && (
          <button
            type="button"
            onClick={handleCloseFile}
            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-vscode-hover rounded transition shrink-0 cursor-pointer ml-auto"
            title="Chiudi documento"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Viewer Canvas */}
      <div className="flex-1 relative overflow-hidden flex flex-col bg-slate-200/50 dark:bg-[#141414]">
        {loadingFile ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-slate-500 dark:text-vscode-textMuted">
            <Loader2 className="w-5 h-5 animate-spin accent-icon" />
            <span>Caricamento documento...</span>
          </div>
        ) : !viewerState ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight flex items-center justify-center text-slate-400 dark:text-vscode-textMuted mb-3 shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 dark:text-vscode-textMuted max-w-[240px] leading-relaxed">
              {studyFiles.length > 0
                ? 'Seleziona un file dall’Explorer dal menu in alto oppure apri un documento locale (.pdf, .docx, .pptx, immagini).'
                : 'Nessun file aperto. Carica PDF, DOCX o PPTX nell’Explorer o clicca su "Apri Locale".'}
            </p>
          </div>
        ) : viewerState.kind === 'image' && viewerState.blobUrl ? (
          <img
            src={viewerState.blobUrl}
            alt={viewerState.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain p-2"
          />
        ) : viewerState.kind === 'pdf' && viewerState.blobUrl ? (
          <iframe
            src={viewerState.blobUrl}
            title={viewerState.name}
            className="w-full h-full bg-white border-0"
          />
        ) : viewerState.kind === 'pptx' ? (
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
            {(!viewerState.slides || viewerState.slides.length === 0) ? (
              <div className="text-center text-xs text-slate-500 dark:text-vscode-textMuted py-10">
                Nessun testo trovato in questa presentazione PowerPoint.
              </div>
            ) : (
              viewerState.slides.map((slide) => (
                <article
                  key={slide.index}
                  className="bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-xl p-4 shadow-xs"
                >
                  <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-orange-600 dark:text-orange-400 mb-1.5">
                    <Presentation className="w-3 h-3" />
                    <span>Slide {slide.index}</span>
                  </div>
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-vscode-textBright mb-2">
                    {slide.title}
                  </h4>
                  {slide.lines.length > 0 && (
                    <ul className="space-y-1 text-xs text-slate-600 dark:text-vscode-text leading-relaxed list-disc pl-4">
                      {slide.lines.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  )}
                </article>
              ))
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            <div className="max-w-2xl mx-auto bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-xl p-4 sm:p-5 shadow-xs space-y-2.5 text-xs text-slate-700 dark:text-vscode-text leading-relaxed">
              <div className="text-[10px] font-mono uppercase tracking-wider accent-text pb-2 border-b border-slate-100 dark:border-vscode-border">
                Documento Word · {viewerState.name}
              </div>
              {(!viewerState.docxBlocks || viewerState.docxBlocks.length === 0) ? (
                <p className="text-slate-400 dark:text-vscode-textMuted py-6 text-center">
                  Nessun contenuto testuale trovato nel documento.
                </p>
              ) : (
                viewerState.docxBlocks.map((block, idx) => {
                  if (block.type === 'h1') {
                    return (
                      <h2
                        key={idx}
                        className="text-base font-bold text-slate-900 dark:text-vscode-textBright pt-2"
                      >
                        {block.text}
                      </h2>
                    );
                  }
                  if (block.type === 'h2') {
                    return (
                      <h3
                        key={idx}
                        className="text-sm font-semibold text-slate-800 dark:text-vscode-textBright pt-1.5"
                      >
                        {block.text}
                      </h3>
                    );
                  }
                  if (block.type === 'li') {
                    return (
                      <div key={idx} className="pl-4 flex gap-2">
                        <span className="accent-icon">•</span>
                        <span>{block.text}</span>
                      </div>
                    );
                  }
                  return <p key={idx}>{block.text}</p>;
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
