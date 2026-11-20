import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Ban,
  Bold,
  ChevronDown,
  ChevronUp,
  Code,
  Columns3,
  Download,
  FileCode2,
  FilePlus2,
  FileText,
  GripVertical,
  Highlighter,
  Italic,
  Lightbulb,
  List,
  ListOrdered,
  Minus,
  Plus,
  Quote,
  Replace,
  Rows3,
  Search,
  Sparkles,
  Table as TableIcon,
  Trash2,
  Type as TypeIcon,
  Underline,
  X,
} from 'lucide-react';
import { HIGHLIGHT_SWATCHES, PRESET_TEXT_COLORS } from '../constants/defaults';
import {
  loadSavedCodeColors,
  normalizeCodeLanguage,
  saveCodeColors,
  DEFAULT_CODE_COLOR_SCHEME,
  type CodeColorScheme,
  type CodeLanguage,
} from '../utils/codeSyntax';
import {
  exportActiveNoteToHTML,
  exportActiveNoteToMarkdown,
  exportActiveNoteToPDF,
  stripHtml,
} from '../utils/exporters';
import { CodeBlockWidget } from './CodeBlockWidget';
import { PresetColorPicker } from './PresetColorPicker';
import type { Note } from '../types';

interface RichTextEditorPanelProps {
  notes: Note[];
  openTabIds: string[];
  activeNote: Note | null;
  subjectName: string;
  saveStatus: 'Salvato' | 'Salvataggio...';
  searchTriggerToken: number;
  editorFontSize: number;
  editorLineHeight: number;
  onSelectNote: (noteId: string) => void;
  onCloseTab: (noteId: string) => void;
  onReorderTabs: (fromNoteId: string, toNoteId: string, position: 'before' | 'after') => void;
  onCreateNote: () => void;
  onChangeContent: (noteId: string, html: string) => void;
  onAskAiSelection: (selectedText: string) => void;
  onExplainSelection: (selectedText: string) => void;
  onToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onHeaderDragStart?: (e: React.DragEvent) => void;
  onHeaderDragEnd?: () => void;
}

interface ActiveFormats {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  unorderedList: boolean;
  orderedList: boolean;
  blockTag: string;
  inTable: boolean;
  inCodeBlock: boolean;
  highlightColor: string | null;
}

interface CodeBlockEntry {
  id: string;
  hostEl: HTMLDivElement;
  code: string;
  language: CodeLanguage;
}

const DEFAULT_FORMATS: ActiveFormats = {
  bold: false,
  italic: false,
  underline: false,
  unorderedList: false,
  orderedList: false,
  blockTag: 'P',
  inTable: false,
  inCodeBlock: false,
  highlightColor: null,
};

function getThemeDefaultTextColor(): string {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return '#ffffff';
  }
  return '#0f172a';
}

function normalizeCssColorToHex(color: string | null | undefined): string | null {
  if (!color) return null;
  const trimmed = color.trim().toLowerCase();
  if (!trimmed || trimmed === 'transparent' || trimmed === 'rgba(0, 0, 0, 0)') return null;
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
  const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const hex = [rgbMatch[1], rgbMatch[2], rgbMatch[3]]
      .map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0'))
      .join('');
    return `#${hex}`;
  }
  return null;
}

const ALLOWED_PASTE_TAGS = new Set([
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'P',
  'BR',
  'STRONG',
  'B',
  'EM',
  'I',
  'U',
  'S',
  'STRIKE',
  'SUB',
  'SUP',
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
  'PRE',
  'CODE',
  'TABLE',
  'THEAD',
  'TBODY',
  'TFOOT',
  'TR',
  'TH',
  'TD',
  'A',
  'SPAN',
  'DIV',
  'MARK',
]);

const SKIP_PASTE_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'META',
  'LINK',
  'TITLE',
  'HEAD',
  'NOSCRIPT',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'SVG',
  'BUTTON',
  'INPUT',
  'TEXTAREA',
  'SELECT',
]);

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sanitizeExternalPasteHtml(rawHtml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');

  const sanitizeNode = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.nodeValue || '');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();
    if (SKIP_PASTE_TAGS.has(tag)) return null;

    if (!ALLOWED_PASTE_TAGS.has(tag)) {
      const frag = document.createDocumentFragment();
      el.childNodes.forEach((child) => {
        const cleanChild = sanitizeNode(child);
        if (cleanChild) frag.appendChild(cleanChild);
      });
      return frag;
    }

    let outTag = tag.toLowerCase();
    if (tag === 'H4' || tag === 'H5' || tag === 'H6') {
      outTag = 'h3';
    } else if (tag === 'DIV') {
      outTag = el.classList.contains('its-callout') ? 'div' : 'p';
    } else if (tag === 'MARK') {
      outTag = 'span';
    }

    const outEl = document.createElement(outTag);

    if (outTag === 'div' && el.classList.contains('its-callout')) {
      outEl.className = 'its-callout';
    } else if (outTag === 'pre') {
      outEl.className = 'its-code-block';
      const lang = el.getAttribute('data-lang');
      if (lang) outEl.setAttribute('data-lang', lang);
    } else if (outTag === 'table') {
      outEl.className = 'its-table';
    }

    if (outTag === 'a') {
      const href = el.getAttribute('href') || '';
      if (/^(https?:|mailto:|#)/i.test(href)) {
        outEl.setAttribute('href', href);
        outEl.setAttribute('target', '_blank');
        outEl.setAttribute('rel', 'noopener noreferrer');
      }
    }

    if (el.dataset.itsHighlight === 'true' && el.style.backgroundColor) {
      outEl.dataset.itsHighlight = 'true';
      outEl.style.backgroundColor = el.style.backgroundColor;
      outEl.style.color = '#0f172a';
    } else {
      if (el.style.fontWeight === 'bold' || Number(el.style.fontWeight) >= 600) {
        outEl.style.fontWeight = 'bold';
      }
      if (el.style.fontStyle === 'italic') {
        outEl.style.fontStyle = 'italic';
      }
      if (el.style.textDecorationLine?.includes('underline')) {
        outEl.style.textDecoration = 'underline';
      }
    }

    el.childNodes.forEach((child) => {
      const cleanChild = sanitizeNode(child);
      if (cleanChild) outEl.appendChild(cleanChild);
    });

    if (outTag === 'span' && !outEl.style.cssText && outEl.childNodes.length === 0) {
      return null;
    }

    return outEl;
  };

  const container = document.createElement('div');
  doc.body.childNodes.forEach((child) => {
    const clean = sanitizeNode(child);
    if (clean) container.appendChild(clean);
  });

  return container.innerHTML;
}

export const RichTextEditorPanel: React.FC<RichTextEditorPanelProps> = ({
  notes,
  openTabIds,
  activeNote,
  subjectName,
  saveStatus,
  searchTriggerToken,
  editorFontSize,
  editorLineHeight,
  onSelectNote,
  onCloseTab,
  onReorderTabs,
  onCreateNote,
  onChangeContent,
  onAskAiSelection,
  onExplainSelection,
  onToast,
  onHeaderDragStart,
  onHeaderDragEnd,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchMatchesRef = useRef<HTMLElement[]>([]);
  const loadedNoteIdRef = useRef<string | null>(null);
  const activeTableCellRef = useRef<HTMLTableCellElement | null>(null);
  const codeBlocksMapRef = useRef<Map<string, CodeBlockEntry>>(new Map());
  const cbCounterRef = useRef(0);
  const hasCustomTextColorRef = useRef(false);
  const pendingTypedColorRef = useRef<string | null>(null);

  const [wordCount, setWordCount] = useState(0);
  const [highlightMenuOpen, setHighlightMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [selectedTextColor, setSelectedTextColor] = useState<string>(() =>
    getThemeDefaultTextColor(),
  );
  const [activeFormats, setActiveFormats] = useState<ActiveFormats>(DEFAULT_FORMATS);

  // Portal-rendered CodeBlock widgets & persistent color theme
  const [codeBlocks, setCodeBlocks] = useState<CodeBlockEntry[]>([]);
  const [codeColorScheme, setCodeColorScheme] = useState<CodeColorScheme>(() =>
    loadSavedCodeColors(),
  );

  // Tab drag-reorder state (single slot index across tabs bar: 0..visibleTabs.length)
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [tabDropSlot, setTabDropSlot] = useState<number | null>(null);

  // In-note search & replace state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1);
  const [totalMatches, setTotalMatches] = useState(0);

  // Custom right-click & selection context menu state
  const [selectionMenu, setSelectionMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    text: string;
  }>({ visible: false, x: 0, y: 0, text: '' });

  // Sync default text color with active theme (white in dark mode, ink black in light mode)
  useEffect(() => {
    const syncThemeColor = () => {
      if (!hasCustomTextColorRef.current) {
        setSelectedTextColor(getThemeDefaultTextColor());
      }
    };
    syncThemeColor();
    const observer = new MutationObserver(syncThemeColor);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  const stripHighlightsFromDom = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const marks = el.querySelectorAll('mark.search-highlight');
    if (marks.length === 0) return;
    marks.forEach((mark) => {
      mark.replaceWith(document.createTextNode(mark.textContent || ''));
    });
    el.normalize();
  }, []);

  const getCleanHtml = useCallback((): string => {
    const el = editorRef.current;
    if (!el) return '';
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('mark.search-highlight').forEach((mark) => {
      mark.replaceWith(document.createTextNode(mark.textContent || ''));
    });
    clone.querySelectorAll('.its-code-host').forEach((host) => {
      const cbId = host.getAttribute('data-cb-id') || '';
      const entry = codeBlocksMapRef.current.get(cbId);
      const lang = entry?.language || normalizeCodeLanguage(host.getAttribute('data-lang'));
      const code = entry?.code ?? host.getAttribute('data-code') ?? '';
      const pre = document.createElement('pre');
      pre.className = 'its-code-block';
      pre.setAttribute('data-lang', lang);
      const codeEl = document.createElement('code');
      codeEl.textContent = code;
      pre.appendChild(codeEl);
      host.replaceWith(pre);
    });
    clone.normalize();
    return clone.innerHTML;
  }, []);

  const updateWordCount = useCallback(() => {
    const clean = getCleanHtml();
    const text = stripHtml(clean).trim();
    setWordCount(text ? text.split(/\s+/).length : 0);
  }, [getCleanHtml]);

  // Upgrade raw <pre> elements inside #notes-area into React portal host containers
  const syncCodeBlocksFromDom = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;

    let changed = false;
    const rawPres = Array.from(el.querySelectorAll('pre')).filter(
      (pre) => !pre.closest('.its-code-host'),
    );

    rawPres.forEach((pre) => {
      const id = `cb_${++cbCounterRef.current}_${Date.now()}`;
      const lang = normalizeCodeLanguage(pre.getAttribute('data-lang'));
      const rawCode = (pre.querySelector('code')?.textContent ?? pre.textContent ?? '').replace(
        /\r\n/g,
        '\n',
      );
      const host = document.createElement('div');
      host.className = 'its-code-host';
      host.setAttribute('contenteditable', 'false');
      host.setAttribute('data-cb-id', id);
      host.setAttribute('data-lang', lang);
      host.setAttribute('data-code', rawCode);
      pre.replaceWith(host);

      codeBlocksMapRef.current.set(id, {
        id,
        hostEl: host,
        code: rawCode,
        language: lang,
      });
      changed = true;
    });

    // Prune code blocks whose host was removed from DOM
    for (const [id, entry] of Array.from(codeBlocksMapRef.current.entries())) {
      if (!el.contains(entry.hostEl)) {
        codeBlocksMapRef.current.delete(id);
        changed = true;
      }
    }

    if (changed) {
      setCodeBlocks(Array.from(codeBlocksMapRef.current.values()));
    }
  }, []);

  const isFocusOrSelectionInCodeBlock = useCallback((): boolean => {
    const el = editorRef.current;
    if (!el) return false;
    const active = document.activeElement as HTMLElement | null;
    if (active && el.contains(active) && active.closest('.its-code-host')) {
      return true;
    }
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const node = sel.anchorNode;
      const anchorEl =
        node?.nodeType === Node.ELEMENT_NODE
          ? (node as HTMLElement)
          : node?.parentElement || null;
      if (anchorEl && el.contains(anchorEl) && anchorEl.closest('.its-code-host')) {
        return true;
      }
    }
    return false;
  }, []);

  const syncSelectionState = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;

    if (isFocusOrSelectionInCodeBlock()) {
      activeTableCellRef.current = null;
      setActiveFormats({
        ...DEFAULT_FORMATS,
        blockTag: 'PRE',
        inCodeBlock: true,
      });
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;

    savedRangeRef.current = range.cloneRange();

    const anchorNode = sel.anchorNode;
    const anchorEl =
      anchorNode?.nodeType === Node.ELEMENT_NODE
        ? (anchorNode as HTMLElement)
        : anchorNode?.parentElement || null;

    const cell = anchorEl?.closest('td, th') as HTMLTableCellElement | null;
    const inEditorTable = !!(cell && el.contains(cell));
    activeTableCellRef.current = inEditorTable ? cell : null;

    let blockTag = 'P';
    const blockEl = anchorEl?.closest('h1, h2, h3, p, li, blockquote, td, th');
    if (blockEl && el.contains(blockEl)) {
      blockTag = blockEl.tagName.toUpperCase();
    } else {
      const cmdBlock = String(document.queryCommandValue('formatBlock') || '').toUpperCase();
      if (cmdBlock === 'H1' || cmdBlock === 'H2' || cmdBlock === 'H3') {
        blockTag = cmdBlock;
      }
    }

    let highlightColor: string | null = null;
    let detectedTextColor: string | null = null;
    let walkerEl: HTMLElement | null = anchorEl;
    while (walkerEl && el.contains(walkerEl) && walkerEl !== el) {
      if (!highlightColor && walkerEl.style.backgroundColor) {
        const hex = normalizeCssColorToHex(walkerEl.style.backgroundColor);
        if (hex) {
          highlightColor = hex;
        }
      }
      if (!detectedTextColor && walkerEl.dataset.itsHighlight !== 'true') {
        const rawColor =
          walkerEl.style.color ||
          (walkerEl.tagName === 'FONT' ? walkerEl.getAttribute('color') : null);
        const textHex = normalizeCssColorToHex(rawColor);
        if (textHex) {
          detectedTextColor = textHex;
        }
      }
      if (highlightColor && detectedTextColor) break;
      walkerEl = walkerEl.parentElement;
    }

    if (detectedTextColor) {
      pendingTypedColorRef.current = null;
      hasCustomTextColorRef.current = true;
      setSelectedTextColor(detectedTextColor);
    } else if (pendingTypedColorRef.current) {
      hasCustomTextColorRef.current = true;
      setSelectedTextColor(pendingTypedColorRef.current);
    } else {
      hasCustomTextColorRef.current = false;
      setSelectedTextColor(getThemeDefaultTextColor());
    }

    const isHeadingBlock = blockTag === 'H1' || blockTag === 'H2' || blockTag === 'H3';

    setActiveFormats({
      bold: isHeadingBlock ? false : document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      unorderedList: document.queryCommandState('insertUnorderedList'),
      orderedList: document.queryCommandState('insertOrderedList'),
      blockTag,
      inTable: inEditorTable,
      inCodeBlock: false,
      highlightColor,
    });
  }, [isFocusOrSelectionInCodeBlock]);

  useEffect(() => {
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      const el = editorRef.current;
      if (!el) return;
      const active = document.activeElement;
      if (active !== el && !el.contains(active)) return;
      syncSelectionState();
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [syncSelectionState]);

  // Load active note into contentEditable when activeNote changes
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    if (!activeNote) {
      loadedNoteIdRef.current = null;
      activeTableCellRef.current = null;
      codeBlocksMapRef.current.clear();
      setCodeBlocks([]);
      el.innerHTML = '';
      setWordCount(0);
      setActiveFormats(DEFAULT_FORMATS);
      setSearchOpen(false);
      return;
    }

    const isDifferentNote = loadedNoteIdRef.current !== activeNote.id;
    const isFocusedInside = el.contains(document.activeElement);

    if (isDifferentNote || (!isFocusedInside && getCleanHtml() !== activeNote.content)) {
      loadedNoteIdRef.current = activeNote.id;
      codeBlocksMapRef.current.clear();
      setCodeBlocks([]);
      el.innerHTML = activeNote.content || '';
      syncCodeBlocksFromDom();
      updateWordCount();
      if (isDifferentNote) {
        activeTableCellRef.current = null;
        pendingTypedColorRef.current = null;
        hasCustomTextColorRef.current = false;
        setSelectedTextColor(getThemeDefaultTextColor());
        setActiveFormats(DEFAULT_FORMATS);
        setSearchOpen(false);
        setSearchQuery('');
        setReplaceQuery('');
        setTotalMatches(0);
        setActiveMatchIndex(-1);
        searchMatchesRef.current = [];
      }
    }
  }, [activeNote, getCleanHtml, syncCodeBlocksFromDom, updateWordCount]);

  useEffect(() => {
    if (searchTriggerToken > 0 && activeNote) {
      setSearchOpen(true);
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 20);
    }
  }, [searchTriggerToken, activeNote]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-highlight-menu]')) setHighlightMenuOpen(false);
      if (!target.closest('[data-export-menu]')) setExportMenuOpen(false);
      if (!target.closest('[data-selection-toolbar]')) {
        setSelectionMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const saveSelection = useCallback(() => {
    if (isFocusOrSelectionInCodeBlock()) return;
    const sel = window.getSelection();
    const el = editorRef.current;
    if (sel && sel.rangeCount > 0 && el) {
      const range = sel.getRangeAt(0);
      if (el.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    }
  }, [isFocusOrSelectionInCodeBlock]);

  const restoreSelection = useCallback(() => {
    const range = savedRangeRef.current;
    if (!range) return;
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, []);

  const ensureCaretInEditor = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (savedRangeRef.current && el.contains(savedRangeRef.current.commonAncestorContainer)) {
      restoreSelection();
      return;
    }
    if (sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
      savedRangeRef.current = range.cloneRange();
    }
  }, [restoreSelection]);

  // Select word under caret or last word before caret when selection is collapsed
  const resolveWordRangeIfCollapsed = useCallback((): string => {
    const el = editorRef.current;
    if (!el) return '';
    ensureCaretInEditor();
    const sel = window.getSelection();
    const baseRange = savedRangeRef.current || (sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null);
    if (!baseRange) return '';

    const currentText = baseRange.toString().trim();
    if (!baseRange.collapsed && currentText) {
      return currentText;
    }

    const isWordChar = (ch: string) => /[\p{L}\p{N}_'-]/u.test(ch);
    const selectTextSlice = (node: Text, start: number, end: number): string => {
      const r = document.createRange();
      r.setStart(node, start);
      r.setEnd(node, end);
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(r);
      }
      savedRangeRef.current = r.cloneRange();
      const selected = r.toString().trim();
      setSelectionMenu((prev) => (prev.visible ? { ...prev, text: selected } : prev));
      return selected;
    };

    // 1. Check directly at caret if inside a text node
    if (
      baseRange.startContainer.nodeType === Node.TEXT_NODE &&
      !baseRange.startContainer.parentElement?.closest('.its-code-host')
    ) {
      const textNode = baseRange.startContainer as Text;
      const val = textNode.nodeValue || '';
      const pos = baseRange.startOffset;
      const charAt = pos < val.length ? val[pos] : '';
      const charBefore = pos > 0 ? val[pos - 1] : '';
      if (isWordChar(charAt) || isWordChar(charBefore)) {
        let start = isWordChar(charBefore) ? pos - 1 : pos;
        let end = isWordChar(charAt) ? pos + 1 : pos;
        while (start > 0 && isWordChar(val[start - 1])) start--;
        while (end < val.length && isWordChar(val[end])) end++;
        if (end > start) {
          return selectTextSlice(textNode, start, end);
        }
      }
    }

    // 2. Otherwise walk backwards through text nodes before caret to find the last word
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent || parent.closest('.its-code-host')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let lastWordNode: Text | null = null;
    let lastWordStart = 0;
    let lastWordEnd = 0;
    const wordRegex = /[\p{L}\p{N}_'-]+/gu;

    let currentNode: Node | null;
    while ((currentNode = walker.nextNode())) {
      const tNode = currentNode as Text;
      const textVal = tNode.nodeValue || '';
      if (!textVal.trim()) continue;

      let limit = textVal.length;
      if (tNode === baseRange.startContainer) {
        limit = baseRange.startOffset;
      } else {
        const nodeRange = document.createRange();
        nodeRange.setStart(tNode, 0);
        nodeRange.collapse(true);
        try {
          if (nodeRange.compareBoundaryPoints(Range.START_TO_START, baseRange) > 0) {
            break;
          }
        } catch {
          break;
        }
      }

      const slice = textVal.slice(0, limit);
      wordRegex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = wordRegex.exec(slice)) !== null) {
        lastWordNode = tNode;
        lastWordStart = match.index;
        lastWordEnd = match.index + match[0].length;
      }

      if (tNode === baseRange.startContainer) break;
    }

    if (lastWordNode && lastWordEnd > lastWordStart) {
      return selectTextSlice(lastWordNode, lastWordStart, lastWordEnd);
    }

    return '';
  }, [ensureCaretInEditor]);

  const notifyContentChanged = useCallback(() => {
    if (!activeNote) return;
    updateWordCount();
    onChangeContent(activeNote.id, getCleanHtml());
  }, [activeNote, getCleanHtml, onChangeContent, updateWordCount]);

  // CodeBlock callbacks
  const handleCodeBlockChange = useCallback(
    (id: string, nextCode: string, nextLanguage: CodeLanguage) => {
      const existing = codeBlocksMapRef.current.get(id);
      if (!existing) return;
      existing.hostEl.setAttribute('data-lang', nextLanguage);
      existing.hostEl.setAttribute('data-code', nextCode);
      const updatedEntry: CodeBlockEntry = {
        ...existing,
        code: nextCode,
        language: nextLanguage,
      };
      codeBlocksMapRef.current.set(id, updatedEntry);
      setCodeBlocks(Array.from(codeBlocksMapRef.current.values()));
      notifyContentChanged();
    },
    [notifyContentChanged],
  );

  const handleCodeBlockDelete = useCallback(
    (id: string) => {
      const existing = codeBlocksMapRef.current.get(id);
      if (!existing) return;
      existing.hostEl.remove();
      codeBlocksMapRef.current.delete(id);
      setCodeBlocks(Array.from(codeBlocksMapRef.current.values()));
      setActiveFormats(DEFAULT_FORMATS);
      notifyContentChanged();
    },
    [notifyContentChanged],
  );

  const handleChangeCodeColors = useCallback((next: CodeColorScheme) => {
    setCodeColorScheme(next);
    saveCodeColors(next);
  }, []);

  const handleResetCodeColors = useCallback(() => {
    const defaults = { ...DEFAULT_CODE_COLOR_SCHEME };
    setCodeColorScheme(defaults);
    saveCodeColors(defaults);
    onToast('Colori sintassi ripristinati.', 'info');
  }, [onToast]);

  const handleFocusCodeBlock = useCallback(() => {
    setHighlightMenuOpen(false);
    setSelectionMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    activeTableCellRef.current = null;
    setActiveFormats({
      ...DEFAULT_FORMATS,
      blockTag: 'PRE',
      inCodeBlock: true,
    });
  }, []);

  const formatDoc = (cmd: string, value?: string) => {
    const el = editorRef.current;
    if (!el || !activeNote || activeFormats.inCodeBlock || isFocusOrSelectionInCodeBlock()) return;
    restoreSelection();
    el.focus();
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
      document.execCommand(cmd, false, value);
    } catch (err) {
      console.warn('Comando formattazione non supportato:', cmd, err);
    }
    syncSelectionState();
    notifyContentChanged();
  };

  // Preserve multi-paragraph boundaries and vertical spacing when toggling H1 / H2 / H3
  const toggleHeading = (tag: 'H1' | 'H2' | 'H3') => {
    const el = editorRef.current;
    if (!el || !activeNote || activeFormats.inCodeBlock || isFocusOrSelectionInCodeBlock()) return;
    ensureCaretInEditor();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;

    // Wrap any direct inline nodes inside #notes-area (e.g. initial bare text) into separate <p> elements
    const directChildren = Array.from(el.childNodes);
    const hasBareInline = directChildren.some(
      (n) =>
        (n.nodeType === Node.TEXT_NODE && (n.nodeValue || '').trim().length > 0) ||
        (n.nodeType === Node.ELEMENT_NODE &&
          !['P', 'H1', 'H2', 'H3', 'UL', 'OL', 'TABLE', 'DIV', 'PRE', 'BLOCKQUOTE'].includes(
            (n as HTMLElement).tagName.toUpperCase(),
          )),
    );
    if (hasBareInline) {
      let currentP: HTMLParagraphElement | null = null;
      directChildren.forEach((node) => {
        const isBlock =
          node.nodeType === Node.ELEMENT_NODE &&
          ['P', 'H1', 'H2', 'H3', 'UL', 'OL', 'TABLE', 'DIV', 'PRE', 'BLOCKQUOTE'].includes(
            (node as HTMLElement).tagName.toUpperCase(),
          );
        if (isBlock) {
          currentP = null;
          return;
        }
        if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') {
          currentP = null;
          node.parentNode?.removeChild(node);
          return;
        }
        if (!currentP) {
          currentP = document.createElement('p');
          el.insertBefore(currentP, node);
        }
        currentP.appendChild(node);
      });
    }

    // Collect every individual paragraph/heading block intersecting the selection
    const candidates = Array.from(
      el.querySelectorAll('p, h1, h2, h3, div:not(.its-callout):not(.its-code-host)'),
    ).filter(
      (node): node is HTMLElement =>
        !node.closest('.its-code-host, .its-callout, table, ul, ol'),
    );

    let targetBlocks: HTMLElement[] = [];
    if (range.collapsed) {
      const anchorEl =
        range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as HTMLElement)
          : range.startContainer.parentElement;
      const single = anchorEl?.closest(
        'h1, h2, h3, p, div:not(.its-callout):not(.its-code-host)',
      ) as HTMLElement | null;
      if (single && el.contains(single) && !single.closest('.its-code-host, .its-callout, table')) {
        targetBlocks = [single];
      }
    } else {
      targetBlocks = candidates.filter((block) => {
        if (!range.intersectsNode(block)) return false;
        // Exclude trailing block if selection ends right at offset 0 of that block
        if (
          range.endOffset === 0 &&
          range.startContainer !== range.endContainer &&
          (range.endContainer === block || block.firstChild === range.endContainer)
        ) {
          return false;
        }
        return true;
      });
      // Keep only leaf blocks so nested wrappers aren't processed twice
      targetBlocks = targetBlocks.filter(
        (b) => !targetBlocks.some((other) => other !== b && b.contains(other)),
      );
    }

    if (targetBlocks.length === 0) {
      formatDoc('formatBlock', tag);
      return;
    }

    const allSameHeading = targetBlocks.every((b) => b.tagName.toUpperCase() === tag);
    const nextTag = allSameHeading ? 'p' : tag.toLowerCase();

    const startContainer = range.startContainer;
    const startOffset = range.startOffset;
    const endContainer = range.endContainer;
    const endOffset = range.endOffset;
    const blockSwapMap = new Map<Node, HTMLElement>();

    // Convert each selected block individually so paragraph separation is NEVER collapsed
    targetBlocks.forEach((block) => {
      if (block.tagName.toLowerCase() === nextTag) return;
      const replacement = document.createElement(nextTag);
      while (block.firstChild) {
        replacement.appendChild(block.firstChild);
      }
      if (!replacement.hasChildNodes()) {
        replacement.innerHTML = '<br>';
      }
      block.replaceWith(replacement);
      blockSwapMap.set(block, replacement);
    });

    const newRange = document.createRange();
    try {
      const mappedStart = blockSwapMap.get(startContainer) || startContainer;
      const mappedEnd = blockSwapMap.get(endContainer) || endContainer;
      newRange.setStart(mappedStart, startOffset);
      newRange.setEnd(mappedEnd, endOffset);
      sel.removeAllRanges();
      sel.addRange(newRange);
    } catch {
      // Fallback: select from start of first block to end of last block
      const first = blockSwapMap.get(targetBlocks[0]) || targetBlocks[0];
      const last =
        blockSwapMap.get(targetBlocks[targetBlocks.length - 1]) ||
        targetBlocks[targetBlocks.length - 1];
      if (first && last && el.contains(first) && el.contains(last)) {
        newRange.setStart(first, 0);
        newRange.setEnd(last, last.childNodes.length);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
    }

    syncSelectionState();
    notifyContentChanged();
  };

  const applyColor = (color: string, selectWordIfEmpty = false) => {
    const el = editorRef.current;
    if (!el || !activeNote || activeFormats.inCodeBlock || isFocusOrSelectionInCodeBlock()) return;
    if (selectWordIfEmpty) {
      resolveWordRangeIfCollapsed();
    } else {
      restoreSelection();
    }
    el.focus();
    const sel = window.getSelection();
    const isCollapsed = !sel || sel.rangeCount === 0 || sel.getRangeAt(0).collapsed;
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('foreColor', false, color);
    pendingTypedColorRef.current = isCollapsed ? color : null;
    syncSelectionState();
    hasCustomTextColorRef.current = true;
    setSelectedTextColor(color);
    notifyContentChanged();
  };

  const resetTextColor = (selectWordIfEmpty = false) => {
    const el = editorRef.current;
    if (!el || !activeNote || activeFormats.inCodeBlock || isFocusOrSelectionInCodeBlock()) return;
    pendingTypedColorRef.current = null;
    hasCustomTextColorRef.current = false;
    setSelectedTextColor(getThemeDefaultTextColor());
    if (selectWordIfEmpty) {
      resolveWordRangeIfCollapsed();
    } else {
      restoreSelection();
    }
    el.focus();
    document.execCommand('removeFormat', false);
    syncSelectionState();
    notifyContentChanged();
  };

  const applyHighlight = (color: string, selectWordIfEmpty = false) => {
    const el = editorRef.current;
    if (!el || !activeNote || activeFormats.inCodeBlock || isFocusOrSelectionInCodeBlock()) return;
    if (selectWordIfEmpty) {
      resolveWordRangeIfCollapsed();
    } else {
      restoreSelection();
    }
    el.focus();
    document.execCommand('styleWithCSS', false, 'true');
    if (color === 'transparent') {
      document.execCommand('hiliteColor', false, 'transparent');
      document.execCommand('removeFormat', false);
    } else {
      const ok = document.execCommand('hiliteColor', false, color);
      if (!ok) {
        document.execCommand('backColor', false, color);
      }
    }
    setHighlightMenuOpen(false);
    setSelectionMenu((prev) => ({ ...prev, visible: false }));
    syncSelectionState();
    notifyContentChanged();
  };

  const insertCodeBlock = () => {
    const el = editorRef.current;
    if (!el || !activeNote || activeFormats.inCodeBlock || isFocusOrSelectionInCodeBlock()) return;
    ensureCaretInEditor();
    const selText = window.getSelection()?.toString().trim();
    const initialCode = selText
      ? escapeHtmlText(selText)
      : '// Scrivi il tuo codice qui...';
    const html = `<pre class="its-code-block" data-lang="c"><code>${initialCode}</code></pre><p><br></p>`;
    document.execCommand('insertHTML', false, html);
    syncCodeBlocksFromDom();
    syncSelectionState();
    notifyContentChanged();
  };

  const insertCallout = () => {
    const el = editorRef.current;
    if (!el || !activeNote || activeFormats.inCodeBlock || isFocusOrSelectionInCodeBlock()) return;
    ensureCaretInEditor();
    const html = `<div class="its-callout"><strong>Nota:</strong> Scrivi qui il concetto importante...</div><p><br></p>`;
    document.execCommand('insertHTML', false, html);
    syncSelectionState();
    notifyContentChanged();
  };

  const insertTable = () => {
    const el = editorRef.current;
    if (!el || !activeNote || activeFormats.inCodeBlock || isFocusOrSelectionInCodeBlock()) return;
    ensureCaretInEditor();
    const html = `<table class="its-table"><thead><tr><th>Colonna 1</th><th>Colonna 2</th><th>Colonna 3</th></tr></thead><tbody><tr><td>Dato 1</td><td>Dato 2</td><td>Dato 3</td></tr><tr><td>Dato 4</td><td>Dato 5</td><td>Dato 6</td></tr></tbody></table><p><br></p>`;
    document.execCommand('insertHTML', false, html);
    syncSelectionState();
    notifyContentChanged();
  };

  // Table Row & Column Manipulation
  const getActiveTableContext = () => {
    const el = editorRef.current;
    if (!el) return null;
    let cell = activeTableCellRef.current;
    if (!cell || !el.contains(cell)) {
      const anchor = window.getSelection()?.anchorNode;
      const anchorEl =
        anchor?.nodeType === Node.ELEMENT_NODE
          ? (anchor as HTMLElement)
          : anchor?.parentElement || null;
      cell = anchorEl?.closest('td, th') as HTMLTableCellElement | null;
    }
    if (!cell || !el.contains(cell)) return null;
    const row = cell.closest('tr');
    const table = cell.closest('table');
    if (!row || !table) return null;
    return { table, row, cell };
  };

  const focusTableCell = (cell: HTMLTableCellElement) => {
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    activeTableCellRef.current = cell;
    syncSelectionState();
  };

  const handleAddTableRow = () => {
    const ctx = getActiveTableContext();
    if (!ctx) return;
    const { table, row } = ctx;
    const colCount = Math.max(1, row.cells.length);
    const newRow = document.createElement('tr');
    for (let i = 0; i < colCount; i++) {
      const td = document.createElement('td');
      td.innerHTML = '<br>';
      newRow.appendChild(td);
    }
    const inThead = !!row.closest('thead');
    if (inThead) {
      let tbody = table.querySelector('tbody');
      if (!tbody) {
        tbody = document.createElement('tbody');
        table.appendChild(tbody);
      }
      tbody.insertBefore(newRow, tbody.firstChild);
    } else {
      row.parentNode?.insertBefore(newRow, row.nextSibling);
    }
    const firstCell = newRow.cells[0] as HTMLTableCellElement | undefined;
    if (firstCell) focusTableCell(firstCell);
    notifyContentChanged();
  };

  const handleRemoveTableRow = () => {
    const ctx = getActiveTableContext();
    if (!ctx) return;
    const { table, row } = ctx;
    const allRows = Array.from(table.querySelectorAll('tr'));
    if (allRows.length <= 1) {
      table.remove();
      activeTableCellRef.current = null;
      syncSelectionState();
      notifyContentChanged();
      return;
    }
    const rowIndex = allRows.indexOf(row);
    const fallbackRow = allRows[rowIndex + 1] || allRows[rowIndex - 1];
    row.remove();
    const targetCell = fallbackRow?.cells[0] as HTMLTableCellElement | undefined;
    if (targetCell) focusTableCell(targetCell);
    notifyContentChanged();
  };

  const handleAddTableCol = () => {
    const ctx = getActiveTableContext();
    if (!ctx) return;
    const { table, row, cell } = ctx;
    const colIdx = cell.cellIndex;
    const rows = Array.from(table.querySelectorAll('tr'));
    let cellToFocus: HTMLTableCellElement | null = null;
    rows.forEach((r) => {
      const isHeaderRow = !!r.closest('thead') || r.cells[0]?.tagName.toUpperCase() === 'TH';
      const newCell = document.createElement(isHeaderRow ? 'th' : 'td') as HTMLTableCellElement;
      newCell.innerHTML = isHeaderRow ? `Colonna ${r.cells.length + 1}` : '<br>';
      const refNode = r.cells[colIdx + 1] || null;
      r.insertBefore(newCell, refNode);
      if (r === row) {
        cellToFocus = newCell;
      }
    });
    if (cellToFocus) focusTableCell(cellToFocus);
    notifyContentChanged();
  };

  const handleRemoveTableCol = () => {
    const ctx = getActiveTableContext();
    if (!ctx) return;
    const { table, row, cell } = ctx;
    const colIdx = cell.cellIndex;
    if (row.cells.length <= 1) {
      table.remove();
      activeTableCellRef.current = null;
      syncSelectionState();
      notifyContentChanged();
      return;
    }
    const rows = Array.from(table.querySelectorAll('tr'));
    rows.forEach((r) => {
      const target = r.cells[colIdx];
      if (target) target.remove();
    });
    const nextCell = (row.cells[colIdx] || row.cells[colIdx - 1]) as HTMLTableCellElement | undefined;
    if (nextCell) focusTableCell(nextCell);
    notifyContentChanged();
  };

  const handleDeleteTable = () => {
    const ctx = getActiveTableContext();
    if (!ctx) return;
    ctx.table.remove();
    activeTableCellRef.current = null;
    setActiveFormats((prev) => ({ ...prev, inTable: false }));
    notifyContentChanged();
  };

  // External Paste Sanitization
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!activeNote) return;
    if ((e.target as HTMLElement).closest('.its-code-host')) return;

    const plainText = e.clipboardData.getData('text/plain');
    const rawHtml = e.clipboardData.getData('text/html');

    if (rawHtml) {
      e.preventDefault();
      const sanitized = sanitizeExternalPasteHtml(rawHtml);
      if (sanitized.trim()) {
        document.execCommand('defaultParagraphSeparator', false, 'p');
        document.execCommand('insertHTML', false, sanitized);
      } else if (plainText) {
        document.execCommand('insertText', false, plainText);
      }
      syncCodeBlocksFromDom();
      syncSelectionState();
      notifyContentChanged();
      return;
    }

    if (plainText) {
      e.preventDefault();
      const lines = plainText.replace(/\r\n/g, '\n').split('\n');
      if (lines.length > 1) {
        const html = lines
          .map((line) => `<p>${line ? escapeHtmlText(line) : '<br>'}</p>`)
          .join('');
        document.execCommand('insertHTML', false, html);
      } else {
        document.execCommand('insertText', false, plainText);
      }
      syncSelectionState();
      notifyContentChanged();
    }
  };

  // In-Note Search & Replace Logic (skipping code-block widgets so widget DOM is untouched)
  const runInNoteSearch = useCallback(
    (q: string, preferredIndex = 0) => {
      stripHighlightsFromDom();
      searchMatchesRef.current = [];
      const el = editorRef.current;
      const trimmed = q.trim();
      if (!el || !trimmed) {
        setTotalMatches(0);
        setActiveMatchIndex(-1);
        return;
      }

      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (parent && parent.closest('.its-code-host')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const textNodes: Text[] = [];
      const lower = trimmed.toLowerCase();
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (node.nodeValue && node.nodeValue.toLowerCase().includes(lower)) {
          textNodes.push(node as Text);
        }
      }

      const marks: HTMLElement[] = [];
      textNodes.forEach((textNode) => {
        const text = textNode.nodeValue || '';
        const frag = document.createDocumentFragment();
        let lastIdx = 0;
        let idx = text.toLowerCase().indexOf(lower, lastIdx);
        while (idx !== -1) {
          if (idx > lastIdx) {
            frag.appendChild(document.createTextNode(text.slice(lastIdx, idx)));
          }
          const mark = document.createElement('mark');
          mark.className = 'search-highlight';
          mark.textContent = text.slice(idx, idx + trimmed.length);
          frag.appendChild(mark);
          marks.push(mark);
          lastIdx = idx + trimmed.length;
          idx = text.toLowerCase().indexOf(lower, lastIdx);
        }
        if (lastIdx < text.length) {
          frag.appendChild(document.createTextNode(text.slice(lastIdx)));
        }
        textNode.parentNode?.replaceChild(frag, textNode);
      });

      searchMatchesRef.current = marks;
      setTotalMatches(marks.length);
      if (marks.length > 0) {
        const clampedIdx = Math.max(0, Math.min(preferredIndex, marks.length - 1));
        setActiveMatchIndex(clampedIdx);
        marks[clampedIdx].classList.add('active-match');
        marks[clampedIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setActiveMatchIndex(-1);
      }
    },
    [stripHighlightsFromDom],
  );

  const navigateSearchMatch = (forward: boolean) => {
    const marks = searchMatchesRef.current;
    if (marks.length === 0) return;
    const nextIdx = forward
      ? (activeMatchIndex + 1) % marks.length
      : (activeMatchIndex - 1 + marks.length) % marks.length;
    marks.forEach((m, i) => m.classList.toggle('active-match', i === nextIdx));
    marks[nextIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setActiveMatchIndex(nextIdx);
  };

  const replaceCurrentMatch = () => {
    const marks = searchMatchesRef.current;
    if (marks.length === 0 || activeMatchIndex < 0 || activeMatchIndex >= marks.length) return;
    const targetMark = marks[activeMatchIndex];
    const parent = targetMark.parentNode;
    targetMark.replaceWith(document.createTextNode(replaceQuery));
    parent?.normalize();
    const nextPreferred = activeMatchIndex >= marks.length - 1 ? 0 : activeMatchIndex;
    runInNoteSearch(searchQuery, nextPreferred);
    notifyContentChanged();
  };

  const replaceAllMatches = () => {
    const marks = searchMatchesRef.current;
    if (marks.length === 0) return;
    const count = marks.length;
    marks.forEach((mark) => {
      mark.replaceWith(document.createTextNode(replaceQuery));
    });
    editorRef.current?.normalize();
    searchMatchesRef.current = [];
    setTotalMatches(0);
    setActiveMatchIndex(-1);
    notifyContentChanged();
    onToast(
      count === 1 ? '1 occorrenza sostituita.' : `Sostituite ${count} occorrenze.`,
      'success',
    );
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setReplaceQuery('');
    setTotalMatches(0);
    setActiveMatchIndex(-1);
    searchMatchesRef.current = [];
    stripHighlightsFromDom();
  };

  const openContextMenuAt = (clientX: number, clientY: number, currentText: string) => {
    const menuWidth = 268;
    const menuHeight = 365;
    const x = Math.max(12, Math.min(clientX, window.innerWidth - menuWidth - 12));
    const y =
      clientY + menuHeight > window.innerHeight
        ? Math.max(12, window.innerHeight - menuHeight - 12)
        : Math.max(12, clientY);
    setSelectionMenu({ visible: true, x, y, text: currentText });
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.its-code-host') || isFocusOrSelectionInCodeBlock()) {
      return;
    }
    const el = editorRef.current;
    if (!el || !activeNote) return;

    e.preventDefault();

    const sel = window.getSelection();
    let currentText = '';
    const hasActiveNonEmptySelection =
      sel &&
      sel.rangeCount > 0 &&
      !sel.isCollapsed &&
      el.contains(sel.getRangeAt(0).commonAncestorContainer) &&
      sel.toString().trim().length > 0;

    if (hasActiveNonEmptySelection && sel) {
      currentText = sel.toString().trim();
      saveSelection();
    } else {
      // Place caret at right-click coordinates so tools can toggle state or select word cleanly
      let pointRange: Range | null = null;
      if (typeof document.caretRangeFromPoint === 'function') {
        pointRange = document.caretRangeFromPoint(e.clientX, e.clientY);
      } else if ('caretPositionFromPoint' in document) {
        const pos = (
          document as unknown as {
            caretPositionFromPoint: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
          }
        ).caretPositionFromPoint(e.clientX, e.clientY);
        if (pos) {
          pointRange = document.createRange();
          pointRange.setStart(pos.offsetNode, pos.offset);
          pointRange.collapse(true);
        }
      }

      if (pointRange && el.contains(pointRange.startContainer) && !((pointRange.startContainer instanceof Element ? pointRange.startContainer : pointRange.startContainer.parentElement)?.closest('.its-code-host'))) {
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(pointRange);
        }
        savedRangeRef.current = pointRange.cloneRange();
      } else {
        ensureCaretInEditor();
      }
    }

    syncSelectionState();
    openContextMenuAt(e.clientX, e.clientY, currentText);
  };

  const handleTouchOrMouseSelection = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.its-code-host')) {
      handleFocusCodeBlock();
      return;
    }
    syncSelectionState();
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (!text || !sel?.rangeCount) return;
    if (window.matchMedia('(pointer: coarse)').matches) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      openContextMenuAt(rect.left, rect.bottom + 8, text);
    }
  };

  const toolbarDisabled = !activeNote || activeFormats.inCodeBlock;

  const toolbarBtnClass = (isActive: boolean) =>
    `w-7 h-7 flex items-center justify-center rounded transition ${
      toolbarDisabled
        ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-vscode-textMuted'
        : isActive
          ? 'accent-toolbar-active cursor-pointer'
          : 'text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-borderLight cursor-pointer'
    }`;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-vscode-bg overflow-hidden">
      {/* Window Header */}
      <div
        draggable
        onDragStart={onHeaderDragStart}
        onDragEnd={onHeaderDragEnd}
        className="window-header h-9 px-3 border-b border-slate-200 dark:border-vscode-border flex justify-between items-center bg-slate-200/80 dark:bg-vscode-border flex-none cursor-grab"
      >
        <span className="font-mono text-[11px] font-semibold tracking-wider text-slate-500 dark:text-vscode-textMuted uppercase flex items-center gap-1.5">
          <GripVertical className="w-3 h-3 text-slate-400" />
          <Code className="w-3 h-3 text-blue-500" />
          <span>Editor</span>
        </span>
      </div>

      {/* Tabs Bar (Drag & Drop Reorderable with single unified drop-slot line) */}
      {(() => {
        const visibleTabs = openTabIds
          .map((id) => notes.find((n) => n.id === id))
          .filter((n): n is Note => Boolean(n));
        const draggedIdx = draggedTabId
          ? visibleTabs.findIndex((t) => t.id === draggedTabId)
          : -1;

        const commitSlotDrop = (slot: number) => {
          if (!draggedTabId || visibleTabs.length === 0) return;
          if (slot < visibleTabs.length) {
            onReorderTabs(draggedTabId, visibleTabs[slot].id, 'before');
          } else {
            onReorderTabs(draggedTabId, visibleTabs[visibleTabs.length - 1].id, 'after');
          }
        };

        return (
          <div
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setTabDropSlot(null);
              }
            }}
            onDragOver={(e) => {
              if (!draggedTabId) return;
              e.preventDefault();
              if (e.target === e.currentTarget && visibleTabs.length > 0) {
                const endSlot = visibleTabs.length;
                if (draggedIdx !== -1 && (endSlot === draggedIdx || endSlot === draggedIdx + 1)) {
                  setTabDropSlot(null);
                } else {
                  setTabDropSlot(endSlot);
                }
              }
            }}
            onDrop={(e) => {
              if (!draggedTabId) return;
              e.preventDefault();
              if (tabDropSlot !== null) {
                commitSlotDrop(tabDropSlot);
              }
              setDraggedTabId(null);
              setTabDropSlot(null);
            }}
            className="flex overflow-x-auto bg-slate-100 dark:bg-vscode-sidebar border-b border-slate-200 dark:border-vscode-border flex-none hide-scrollbar"
          >
            {visibleTabs.map((tabNote, idx) => {
              const tabId = tabNote.id;
              const isActive = tabId === activeNote?.id;
              const showLeftLine = tabDropSlot === idx;
              const showRightLine =
                idx === visibleTabs.length - 1 && tabDropSlot === visibleTabs.length;

              return (
                <div
                  key={tabId}
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    setDraggedTabId(tabId);
                    e.dataTransfer.setData('text/tab-id', tabId);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => {
                    setDraggedTabId(null);
                    setTabDropSlot(null);
                  }}
                  onDragOver={(e) => {
                    if (!draggedTabId) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const rawSlot = e.clientX - rect.left < rect.width / 2 ? idx : idx + 1;
                    if (
                      draggedIdx !== -1 &&
                      (rawSlot === draggedIdx || rawSlot === draggedIdx + 1)
                    ) {
                      setTabDropSlot(null);
                    } else {
                      setTabDropSlot(rawSlot);
                    }
                  }}
                  onDrop={(e) => {
                    if (!draggedTabId) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const rawSlot = e.clientX - rect.left < rect.width / 2 ? idx : idx + 1;
                    if (
                      draggedIdx === -1 ||
                      (rawSlot !== draggedIdx && rawSlot !== draggedIdx + 1)
                    ) {
                      commitSlotDrop(rawSlot);
                    }
                    setDraggedTabId(null);
                    setTabDropSlot(null);
                  }}
                  onClick={() => onSelectNote(tabId)}
                  style={isActive ? { borderTopColor: 'var(--primary-500)' } : undefined}
                  className={`group relative flex items-center gap-2 px-3 py-2 text-xs border-r border-slate-200 dark:border-vscode-border cursor-pointer select-none flex-none max-w-[180px] transition focus:outline-none ${
                    isActive
                      ? 'bg-white dark:bg-vscode-bg text-slate-800 dark:text-vscode-textBright font-medium border-t-2'
                      : 'text-slate-500 dark:text-vscode-textMuted hover:bg-slate-200/60 dark:hover:bg-vscode-hover'
                  } ${draggedTabId === tabId ? 'opacity-40' : ''}`}
                  title={`${tabNote.title} · Trascina per riordinare le schede`}
                >
                  {showLeftLine && (
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute top-0 bottom-0 w-0.5 z-20 ${
                        idx === 0 ? 'left-0' : '-left-[1.5px]'
                      }`}
                      style={{ backgroundColor: 'var(--primary-500)' }}
                    />
                  )}
                  {showRightLine && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute top-0 bottom-0 right-0 w-0.5 z-20"
                      style={{ backgroundColor: 'var(--primary-500)' }}
                    />
                  )}
                  <FileText
                    className={`w-3 h-3 shrink-0 ${isActive ? 'accent-icon' : 'text-slate-400'}`}
                  />
                  <span className="truncate">{tabNote.title}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tabId);
                    }}
                    className="ml-1 w-4 h-4 rounded hover:bg-slate-200 dark:hover:bg-vscode-borderLight flex items-center justify-center opacity-60 group-hover:opacity-100 cursor-pointer"
                    aria-label={`Chiudi ${tabNote.title}`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Formatting Toolbar */}
      <div className="bg-slate-100 dark:bg-vscode-sidebar border-b border-slate-200 dark:border-vscode-border p-1.5 flex gap-1 items-center flex-none flex-wrap">
        <button
          type="button"
          disabled={toolbarDisabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => formatDoc('bold')}
          className={toolbarBtnClass(activeFormats.bold)}
          title={
            toolbarDisabled
              ? 'Formattazione disabilitata nei blocchi codice'
              : 'Grassetto'
          }
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={toolbarDisabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => formatDoc('italic')}
          className={toolbarBtnClass(activeFormats.italic)}
          title={
            toolbarDisabled
              ? 'Formattazione disabilitata nei blocchi codice'
              : 'Corsivo'
          }
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={toolbarDisabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => formatDoc('underline')}
          className={toolbarBtnClass(activeFormats.underline)}
          title={
            toolbarDisabled
              ? 'Formattazione disabilitata nei blocchi codice'
              : 'Sottolineato'
          }
        >
          <Underline className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-slate-300 dark:bg-vscode-borderLight mx-0.5" />

        {/* Text Color Preset Menu (no color wheel) */}
        <div
          className={toolbarDisabled ? 'pointer-events-none opacity-40' : ''}
          onMouseDown={saveSelection}
        >
          <PresetColorPicker
            value={selectedTextColor}
            presets={PRESET_TEXT_COLORS}
            onSelect={(c) => applyColor(c)}
            onReset={() => resetTextColor()}
            resetLabel="Ripristina colore"
            title={
              toolbarDisabled
                ? 'Colore testo disabilitato nei blocchi codice'
                : 'Colore Testo'
            }
            triggerClassName="w-7 h-7 flex flex-col items-center justify-center text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-borderLight rounded transition cursor-pointer"
            trigger={
              <>
                <TypeIcon className="w-3.5 h-3.5" />
                <span
                  className="w-3.5 h-0.5 rounded-full mt-0.5 border border-black/15 dark:border-white/25"
                  style={{ backgroundColor: selectedTextColor }}
                />
              </>
            }
          />
        </div>

        {/* Highlight Palette */}
        <div className="relative inline-block" data-highlight-menu>
          <button
            type="button"
            disabled={toolbarDisabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (toolbarDisabled) return;
              saveSelection();
              setHighlightMenuOpen((prev) => !prev);
              setExportMenuOpen(false);
            }}
            className={toolbarBtnClass(false)}
            title={
              toolbarDisabled
                ? 'Evidenziazione disabilitata nei blocchi codice'
                : 'Evidenzia Testo'
            }
          >
            <Highlighter className="w-3.5 h-3.5" />
          </button>

          {highlightMenuOpen && !toolbarDisabled && (
            <div className="absolute left-0 mt-1 p-2 bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-lg shadow-xl z-50 flex gap-1.5 items-center">
              {HIGHLIGHT_SWATCHES.map((sw) => (
                <button
                  key={sw.color}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyHighlight(sw.color)}
                  style={{ backgroundColor: sw.color }}
                  className={`w-5 h-5 rounded-full border ${sw.border} hover:scale-110 transition shadow-xs cursor-pointer`}
                  title={sw.label}
                />
              ))}
              <div className="w-px h-4 bg-slate-200 dark:bg-vscode-borderLight mx-0.5" />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyHighlight('transparent')}
                className="w-5 h-5 rounded-full border border-slate-300 dark:border-vscode-borderLight flex items-center justify-center text-slate-400 hover:text-red-500 hover:scale-110 transition cursor-pointer"
                title="Rimuovi Evidenziatore"
              >
                <Ban className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-slate-300 dark:bg-vscode-borderLight mx-0.5" />

        <button
          type="button"
          disabled={toolbarDisabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => formatDoc('insertUnorderedList')}
          className={toolbarBtnClass(activeFormats.unorderedList)}
          title="Elenco Puntato"
        >
          <List className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={toolbarDisabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => formatDoc('insertOrderedList')}
          className={toolbarBtnClass(activeFormats.orderedList)}
          title="Elenco Numerato"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-slate-300 dark:bg-vscode-borderLight mx-0.5" />

        {(['H1', 'H2', 'H3'] as const).map((h) => {
          const isHeadingActive = !toolbarDisabled && activeFormats.blockTag === h;
          return (
            <button
              key={h}
              type="button"
              disabled={toolbarDisabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggleHeading(h)}
              className={`h-7 px-1.5 flex items-center justify-center font-bold text-xs rounded transition ${
                toolbarDisabled
                  ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-vscode-textMuted'
                  : isHeadingActive
                    ? 'accent-toolbar-active cursor-pointer'
                    : 'text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-borderLight cursor-pointer'
              }`}
              title={
                toolbarDisabled
                  ? 'Titoli disabilitati nei blocchi codice'
                  : isHeadingActive
                    ? `Rimuovi Titolo ${h.slice(1)} (torna a paragrafo normale)`
                    : `Titolo ${h.slice(1)}`
              }
            >
              {h}
            </button>
          );
        })}

        <div className="w-px h-4 bg-slate-300 dark:bg-vscode-borderLight mx-0.5" />

        {/* Enabled Code Block Tool */}
        <button
          type="button"
          disabled={toolbarDisabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertCodeBlock}
          className={`h-7 px-2 flex items-center justify-center gap-1 text-xs rounded transition whitespace-nowrap ${
            toolbarDisabled
              ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-vscode-textMuted'
              : 'text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-borderLight cursor-pointer'
          }`}
          title="Inserisci Blocco Codice"
        >
          <Code className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Code</span>
        </button>

        <button
          type="button"
          disabled={toolbarDisabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertCallout}
          className={`h-7 px-2 flex items-center justify-center gap-1 text-xs rounded transition whitespace-nowrap ${
            toolbarDisabled
              ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-vscode-textMuted'
              : 'text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-borderLight cursor-pointer'
          }`}
          title="Inserisci Nota In Evidenza"
        >
          <Quote className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Nota</span>
        </button>

        <button
          type="button"
          disabled={toolbarDisabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertTable}
          className={`h-7 px-2 flex items-center justify-center gap-1 text-xs rounded transition whitespace-nowrap ${
            toolbarDisabled
              ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-vscode-textMuted'
              : activeFormats.inTable
                ? 'accent-toolbar-active cursor-pointer'
                : 'text-slate-600 dark:text-vscode-text hover:bg-slate-200 dark:hover:bg-vscode-borderLight cursor-pointer'
          }`}
          title="Inserisci Tabella"
        >
          <TableIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Tabella</span>
        </button>

        {/* Export Active Note Dropdown */}
        <div className="relative inline-block ml-auto" data-export-menu>
          <button
            type="button"
            onClick={() => {
              setExportMenuOpen((prev) => !prev);
              setHighlightMenuOpen(false);
            }}
            className="h-7 px-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-slate-700 dark:text-vscode-text bg-white dark:bg-vscode-input hover:bg-slate-200 dark:hover:bg-vscode-borderLight border border-slate-200 dark:border-vscode-borderLight rounded transition shadow-xs whitespace-nowrap cursor-pointer"
            title="Esporta nota corrente"
          >
            <Download className="w-3.5 h-3.5 accent-icon" />
            <span className="hidden sm:inline">Esporta</span>
            <ChevronDown className="w-3 h-3 opacity-75" />
          </button>

          {exportMenuOpen && (
            <div className="absolute right-0 mt-1 w-52 bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-xl shadow-xl z-50 p-1">
              <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 dark:text-vscode-textMuted">
                Esporta Nota Attiva
              </div>
              <button
                type="button"
                onClick={() => {
                  setExportMenuOpen(false);
                  if (!activeNote) {
                    onToast('Nessuna nota attiva da esportare.', 'error');
                    return;
                  }
                  exportActiveNoteToPDF(activeNote.title, subjectName, getCleanHtml());
                }}
                className="w-full text-left px-2.5 py-2 text-xs text-slate-700 dark:text-vscode-text hover:bg-slate-100 dark:hover:bg-vscode-hover rounded-lg transition flex items-center gap-2 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-red-500" />
                <span>Esporta PDF / Stampa</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setExportMenuOpen(false);
                  if (!activeNote) {
                    onToast('Nessuna nota attiva da esportare.', 'error');
                    return;
                  }
                  exportActiveNoteToMarkdown(activeNote.title, subjectName, getCleanHtml());
                  onToast('Nota esportata in Markdown (.md).', 'success');
                }}
                className="w-full text-left px-2.5 py-2 text-xs text-slate-700 dark:text-vscode-text hover:bg-slate-100 dark:hover:bg-vscode-hover rounded-lg transition flex items-center gap-2 cursor-pointer"
              >
                <FileCode2 className="w-3.5 h-3.5 text-blue-500" />
                <span>Esporta Markdown (.md)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setExportMenuOpen(false);
                  if (!activeNote) {
                    onToast('Nessuna nota attiva da esportare.', 'error');
                    return;
                  }
                  exportActiveNoteToHTML(activeNote.title, getCleanHtml());
                  onToast('Nota esportata in HTML (.html).', 'success');
                }}
                className="w-full text-left px-2.5 py-2 text-xs text-slate-700 dark:text-vscode-text hover:bg-slate-100 dark:hover:bg-vscode-hover rounded-lg transition flex items-center gap-2 cursor-pointer"
              >
                <Code className="w-3.5 h-3.5 text-amber-500" />
                <span>Esporta HTML (.html)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Contextual Table Sub-Toolbar (when caret is inside a table) */}
      {activeNote && activeFormats.inTable && !activeFormats.inCodeBlock && (
        <div className="accent-soft-bg border-b border-slate-200 dark:border-vscode-border px-2.5 py-1 flex items-center gap-1.5 flex-wrap flex-none text-[11px]">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider accent-text mr-1">
            Tabella
          </span>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleAddTableRow}
            className="px-2 py-0.5 rounded bg-white dark:bg-vscode-input border border-slate-200 dark:border-vscode-borderLight text-slate-700 dark:text-vscode-text accent-hover-soft inline-flex items-center gap-1 cursor-pointer transition"
            title="Aggiungi riga sotto"
          >
            <Plus className="w-3 h-3 text-emerald-500" />
            <Rows3 className="w-3 h-3" />
            <span>Riga</span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleRemoveTableRow}
            className="px-2 py-0.5 rounded bg-white dark:bg-vscode-input border border-slate-200 dark:border-vscode-borderLight text-slate-700 dark:text-vscode-text hover:bg-red-50 dark:hover:bg-vscode-hover inline-flex items-center gap-1 cursor-pointer transition"
            title="Rimuovi riga corrente"
          >
            <Minus className="w-3 h-3 text-red-500" />
            <span>Riga</span>
          </button>
          <div className="w-px h-3.5 bg-slate-300 dark:bg-vscode-borderLight" />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleAddTableCol}
            className="px-2 py-0.5 rounded bg-white dark:bg-vscode-input border border-slate-200 dark:border-vscode-borderLight text-slate-700 dark:text-vscode-text accent-hover-soft inline-flex items-center gap-1 cursor-pointer transition"
            title="Aggiungi colonna a destra"
          >
            <Plus className="w-3 h-3 text-emerald-500" />
            <Columns3 className="w-3 h-3" />
            <span>Colonna</span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleRemoveTableCol}
            className="px-2 py-0.5 rounded bg-white dark:bg-vscode-input border border-slate-200 dark:border-vscode-borderLight text-slate-700 dark:text-vscode-text hover:bg-red-50 dark:hover:bg-vscode-hover inline-flex items-center gap-1 cursor-pointer transition"
            title="Rimuovi colonna corrente"
          >
            <Minus className="w-3 h-3 text-red-500" />
            <span>Colonna</span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleDeleteTable}
            className="ml-auto px-2 py-0.5 rounded bg-white dark:bg-vscode-input border border-slate-200 dark:border-vscode-borderLight text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 inline-flex items-center gap-1 cursor-pointer transition"
            title="Elimina l'intera tabella"
          >
            <Trash2 className="w-3 h-3" />
            <span>Elimina Tabella</span>
          </button>
        </div>
      )}

      {/* Content Editable Area + Search + Empty Overlay */}
      <div className="relative flex-1 overflow-hidden flex flex-col bg-white dark:bg-vscode-bg">
        {searchOpen && (
          <div className="absolute top-3 right-4 z-30 bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight shadow-xl rounded-xl p-2 flex flex-col gap-1.5 min-w-[270px] sm:min-w-[330px]">
            {/* Row 1: Find */}
            <div className="flex items-center gap-1">
              <Search className="w-3.5 h-3.5 text-slate-400 ml-1 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  runInNoteSearch(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    navigateSearchMatch(!e.shiftKey);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    closeSearch();
                  }
                }}
                placeholder="Cerca..."
                className="flex-1 min-w-0 bg-slate-50 dark:bg-vscode-input border border-slate-200 dark:border-vscode-borderLight rounded-lg text-xs text-slate-800 dark:text-vscode-textBright px-2 py-1 focus:outline-none accent-focus"
              />
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-vscode-textMuted px-1 min-w-[3.2ch] text-center">
                {totalMatches > 0 ? `${activeMatchIndex + 1}/${totalMatches}` : '0/0'}
              </span>
              <button
                type="button"
                onClick={() => navigateSearchMatch(false)}
                disabled={totalMatches === 0}
                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-vscode-hover text-slate-600 dark:text-vscode-text disabled:opacity-40 cursor-pointer"
                title="Precedente (Shift+Invio)"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => navigateSearchMatch(true)}
                disabled={totalMatches === 0}
                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-vscode-hover text-slate-600 dark:text-vscode-text disabled:opacity-40 cursor-pointer"
                title="Successivo (Invio)"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={closeSearch}
                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-500 hover:text-red-500 transition cursor-pointer"
                title="Chiudi (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Row 2: Replace & Replace All */}
            <div className="flex items-center gap-1">
              <Replace className="w-3.5 h-3.5 text-slate-400 ml-1 shrink-0" />
              <input
                type="text"
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.shiftKey) {
                      replaceAllMatches();
                    } else {
                      replaceCurrentMatch();
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    closeSearch();
                  }
                }}
                placeholder="Sostituisci con..."
                className="flex-1 min-w-0 bg-slate-50 dark:bg-vscode-input border border-slate-200 dark:border-vscode-borderLight rounded-lg text-xs text-slate-800 dark:text-vscode-textBright px-2 py-1 focus:outline-none accent-focus"
              />
              <button
                type="button"
                disabled={totalMatches === 0}
                onClick={replaceCurrentMatch}
                className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-vscode-input hover:bg-slate-200 dark:hover:bg-vscode-hover border border-slate-200 dark:border-vscode-borderLight text-[11px] font-medium text-slate-700 dark:text-vscode-textBright disabled:opacity-40 cursor-pointer transition whitespace-nowrap"
                title="Sostituisci occorrenza corrente (Invio)"
              >
                Sostituisci
              </button>
              <button
                type="button"
                disabled={totalMatches === 0}
                onClick={replaceAllMatches}
                className="px-2 py-1 rounded-lg accent-btn text-[11px] font-medium disabled:opacity-40 cursor-pointer transition whitespace-nowrap"
                title="Sostituisci tutte le occorrenze (Shift+Invio)"
              >
                Tutto
              </button>
            </div>
          </div>
        )}

        <div
          id="notes-area"
          ref={editorRef}
          contentEditable={!!activeNote}
          suppressContentEditableWarning
          data-placeholder="Inizia a scrivere i tuoi appunti qui..."
          onFocus={(e) => {
            if ((e.target as HTMLElement).closest('.its-code-host')) {
              handleFocusCodeBlock();
              return;
            }
            try {
              document.execCommand('defaultParagraphSeparator', false, 'p');
            } catch {
              // Ignore
            }
            syncSelectionState();
          }}
          onInput={() => {
            syncCodeBlocksFromDom();
            syncSelectionState();
            notifyContentChanged();
          }}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if ((e.target as HTMLElement).closest('.its-code-host')) return;
            const sel = window.getSelection();
            const anchor = sel?.anchorNode;
            const anchorEl =
              anchor?.nodeType === Node.ELEMENT_NODE
                ? (anchor as HTMLElement)
                : anchor?.parentElement;

            const currentCell = anchorEl?.closest('td, th') as HTMLTableCellElement | null;
            if (currentCell && e.key === 'Tab') {
              const table = currentCell.closest('table');
              if (table) {
                e.preventDefault();
                const allCells = Array.from(table.querySelectorAll('th, td')) as HTMLTableCellElement[];
                const idx = allCells.indexOf(currentCell);
                const nextCell = e.shiftKey ? allCells[idx - 1] : allCells[idx + 1];
                if (nextCell) {
                  focusTableCell(nextCell);
                }
              }
              return;
            }

            if (e.key === 'Enter' && !e.shiftKey) {
              try {
                document.execCommand('defaultParagraphSeparator', false, 'p');
              } catch {
                // Ignore
              }
            }
          }}
          onMouseDown={() => {
            pendingTypedColorRef.current = null;
          }}
          onMouseUp={handleTouchOrMouseSelection}
          onKeyUp={(e) => {
            if (
              ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(
                e.key,
              )
            ) {
              pendingTypedColorRef.current = null;
            }
            syncSelectionState();
          }}
          onContextMenu={handleContextMenu}
          style={{
            fontSize: `${editorFontSize}px`,
            lineHeight: editorLineHeight,
          }}
          className="flex-1 w-full h-full overflow-y-auto p-4 sm:p-6 focus:outline-none text-slate-800 dark:text-vscode-textBright"
        />

        {/* Render interactive CodeBlockWidget inside each code block host via React Portal */}
        {codeBlocks.map((cb) =>
          createPortal(
            <CodeBlockWidget
              key={cb.id}
              id={cb.id}
              code={cb.code}
              language={cb.language}
              colorScheme={codeColorScheme}
              onChange={handleCodeBlockChange}
              onChangeColorScheme={handleChangeCodeColors}
              onResetColorScheme={handleResetCodeColors}
              onDelete={handleCodeBlockDelete}
              onFocusCodeBlock={handleFocusCodeBlock}
              onToast={onToast}
            />,
            cb.hostEl,
          ),
        )}

        {!activeNote && (
          <div className="absolute inset-0 bg-white dark:bg-vscode-bg flex flex-col items-center justify-center p-6 text-center z-10">
            <div className="w-12 h-12 rounded-2xl accent-soft-bg border border-[var(--primary-500)]/25 dark:border-vscode-borderLight flex items-center justify-center accent-icon mb-3 shadow-xs">
              <FilePlus2 className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-vscode-textBright mb-1">
              Nessun file aperto
            </h4>
            <p className="text-xs text-slate-500 dark:text-vscode-textMuted max-w-xs mb-4 leading-relaxed">
              Seleziona una nota dall&apos;Explorer oppure crea un nuovo documento per iniziare a prendere appunti.
            </p>
            <button
              type="button"
              onClick={onCreateNote}
              className="px-4 py-2 accent-btn text-xs font-semibold rounded-lg transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuovo File Appunti</span>
            </button>
          </div>
        )}
      </div>

      {/* Editor Bottom Bar */}
      <div className="h-7 px-3 border-t border-slate-200 dark:border-vscode-border bg-slate-50 dark:bg-vscode-sidebar flex items-center justify-between text-[11px] text-slate-500 dark:text-vscode-textMuted flex-none">
        <div className="flex items-center gap-2 font-mono tabular-nums">
          <span className={saveStatus === 'Salvato' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
            {saveStatus}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {wordCount} {wordCount === 1 ? 'parola' : 'parole'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            if (searchOpen) {
              closeSearch();
            } else if (activeNote) {
              setSearchOpen(true);
              setTimeout(() => searchInputRef.current?.focus(), 20);
            }
          }}
          className="flex items-center gap-1 text-slate-500 dark:text-vscode-textMuted accent-hover-text transition cursor-pointer"
          title="Cerca nella nota (Ctrl+F)"
        >
          <Search className="w-3 h-3" />
          <span>Cerca</span>
        </button>
      </div>

      {/* Custom Right-Click & Selection Context Menu */}
      {selectionMenu.visible && !activeFormats.inCodeBlock && (
        <div
          data-selection-toolbar
          onMouseDown={(e) => e.preventDefault()}
          style={{ left: selectionMenu.x, top: selectionMenu.y }}
          className="fixed z-[100] w-[268px] bg-white dark:bg-vscode-sidebar border border-slate-200 dark:border-vscode-borderLight rounded-xl shadow-2xl p-2 flex flex-col gap-1.5 text-xs text-slate-700 dark:text-vscode-text"
        >
          {/* Header status */}
          <div className="flex items-center justify-between px-1.5 pt-0.5 pb-1 border-b border-slate-100 dark:border-vscode-border">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-vscode-textMuted truncate">
              {selectionMenu.text ? `Selezione (${selectionMenu.text.length} car.)` : 'Cursore · Ultima parola'}
            </span>
            <button
              type="button"
              onClick={() => setSelectionMenu((prev) => ({ ...prev, visible: false }))}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-vscode-textBright cursor-pointer"
              title="Chiudi menu"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {/* Inline formatting toggles + Headings */}
          <div className="flex items-center justify-between gap-1 px-0.5">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => {
                  resolveWordRangeIfCollapsed();
                  formatDoc('bold');
                }}
                className={`w-7 h-7 rounded-lg border flex items-center justify-center transition cursor-pointer ${
                  activeFormats.bold
                    ? 'accent-toolbar-active'
                    : 'border-transparent hover:bg-slate-100 dark:hover:bg-vscode-hover'
                }`}
                title="Grassetto"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  resolveWordRangeIfCollapsed();
                  formatDoc('italic');
                }}
                className={`w-7 h-7 rounded-lg border flex items-center justify-center transition cursor-pointer ${
                  activeFormats.italic
                    ? 'accent-toolbar-active'
                    : 'border-transparent hover:bg-slate-100 dark:hover:bg-vscode-hover'
                }`}
                title="Corsivo"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  resolveWordRangeIfCollapsed();
                  formatDoc('underline');
                }}
                className={`w-7 h-7 rounded-lg border flex items-center justify-center transition cursor-pointer ${
                  activeFormats.underline
                    ? 'accent-toolbar-active'
                    : 'border-transparent hover:bg-slate-100 dark:hover:bg-vscode-hover'
                }`}
                title="Sottolineato"
              >
                <Underline className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="h-4 w-px bg-slate-200 dark:bg-vscode-borderLight" />

            <div className="flex items-center gap-0.5">
              {(['H1', 'H2', 'H3'] as const).map((h) => {
                const isH = activeFormats.blockTag === h;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => toggleHeading(h)}
                    className={`h-7 px-1.5 rounded-lg border text-[11px] font-bold transition cursor-pointer ${
                      isH
                        ? 'accent-toolbar-active'
                        : 'border-transparent text-slate-600 dark:text-vscode-text hover:bg-slate-100 dark:hover:bg-vscode-hover'
                    }`}
                    title={isH ? `Rimuovi ${h}` : `Titolo ${h.slice(1)}`}
                  >
                    {h}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Highlight swatches with active ring indicator */}
          <div className="flex items-center justify-between gap-1 px-1.5 py-1 bg-slate-50 dark:bg-vscode-bg/60 border border-slate-100 dark:border-vscode-border rounded-lg">
            <span className="text-[10px] font-medium text-slate-500 dark:text-vscode-textMuted flex items-center gap-1">
              <Highlighter className="w-3 h-3" />
            </span>
            <div className="flex items-center gap-1.5">
              {HIGHLIGHT_SWATCHES.map((sw) => {
                const isActiveSw =
                  activeFormats.highlightColor?.toLowerCase() === sw.color.toLowerCase();
                return (
                  <button
                    key={sw.color}
                    type="button"
                    onClick={() => applyHighlight(sw.color, true)}
                    style={{ backgroundColor: sw.color }}
                    className={`w-4.5 h-4.5 rounded-full border ${sw.border} hover:scale-110 transition cursor-pointer ${
                      isActiveSw
                        ? 'ring-2 ring-[var(--primary-500)] ring-offset-1 ring-offset-white dark:ring-offset-vscode-sidebar'
                        : ''
                    }`}
                    title={`Evidenzia ${sw.label}`}
                  />
                );
              })}
              <button
                type="button"
                onClick={() => applyHighlight('transparent', true)}
                className="w-4.5 h-4.5 rounded-full border border-slate-300 dark:border-vscode-borderLight flex items-center justify-center text-slate-400 hover:text-red-500 hover:scale-110 transition cursor-pointer"
                title="Rimuovi Evidenziatore"
              >
                <Ban className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>

          {/* Lists & Blocks */}
          <div className="grid grid-cols-2 gap-1 pt-0.5">
            <button
              type="button"
              onClick={() => formatDoc('insertUnorderedList')}
              className={`px-2 py-1.5 rounded-lg border text-left text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer ${
                activeFormats.unorderedList
                  ? 'accent-toolbar-active'
                  : 'border-transparent hover:bg-slate-100 dark:hover:bg-vscode-hover'
              }`}
            >
              <List className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Elenco puntato</span>
            </button>
            <button
              type="button"
              onClick={() => formatDoc('insertOrderedList')}
              className={`px-2 py-1.5 rounded-lg border text-left text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer ${
                activeFormats.orderedList
                  ? 'accent-toolbar-active'
                  : 'border-transparent hover:bg-slate-100 dark:hover:bg-vscode-hover'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Numerato</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectionMenu((prev) => ({ ...prev, visible: false }));
                insertCodeBlock();
              }}
              className="px-2 py-1.5 rounded-lg text-left text-[11px] font-medium flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-vscode-hover transition cursor-pointer"
            >
              <Code className="w-3.5 h-3.5 accent-icon shrink-0" />
              <span className="truncate">Blocco Codice</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectionMenu((prev) => ({ ...prev, visible: false }));
                insertCallout();
              }}
              className="px-2 py-1.5 rounded-lg text-left text-[11px] font-medium flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-vscode-hover transition cursor-pointer"
            >
              <Quote className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="truncate">Nota Callout</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectionMenu((prev) => ({ ...prev, visible: false }));
                insertTable();
              }}
              className={`col-span-2 px-2 py-1.5 rounded-lg border text-left text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer ${
                activeFormats.inTable
                  ? 'accent-toolbar-active'
                  : 'border-transparent hover:bg-slate-100 dark:hover:bg-vscode-hover'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Inserisci Tabella</span>
            </button>
          </div>

          <div className="border-t border-slate-100 dark:border-vscode-border my-0.5" />

          {/* AI Actions */}
          <button
            type="button"
            onClick={() => {
              const targetTxt = selectionMenu.text || resolveWordRangeIfCollapsed();
              setSelectionMenu((prev) => ({ ...prev, visible: false }));
              if (!targetTxt) {
                onToast('Scrivi o seleziona almeno una parola per chiedere all’AI.', 'info');
                return;
              }
              onAskAiSelection(targetTxt);
            }}
            className="w-full text-left px-2.5 py-1.5 rounded-lg accent-hover-soft accent-text font-medium flex items-center gap-2 transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>Chiedi al Tutor AI</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const targetTxt = selectionMenu.text || resolveWordRangeIfCollapsed();
              setSelectionMenu((prev) => ({ ...prev, visible: false }));
              if (!targetTxt) {
                onToast('Scrivi o seleziona almeno una parola da spiegare.', 'info');
                return;
              }
              onExplainSelection(targetTxt);
            }}
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-vscode-hover flex items-center gap-2 transition cursor-pointer"
          >
            <Lightbulb className="w-3.5 h-3.5 text-purple-500 shrink-0" />
            <span>Spiega questo passaggio</span>
          </button>
        </div>
      )}
    </div>
  );
};
