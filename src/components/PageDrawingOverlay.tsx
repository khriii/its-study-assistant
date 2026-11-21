import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Magnet, RotateCw } from 'lucide-react';
import {
  clampDrawingHeight,
  cloneDrawingData,
  computeStrokeWidth,
  DEFAULT_DRAWING_HEIGHT,
  DRAWING_VIEWBOX_WIDTH,
  generateDrawingItemId,
  getDrawingMaxY,
  getToolStrokeSize,
  hitTestDrawingItem,
  MAX_DRAWING_HEIGHT,
  normalizeAngleDeg,
  resolveInkColor,
  roundCoord,
  roundPressure,
  RULER_THICKNESS,
  smoothDrawingPoints,
  snapPointToRuler,
  type DrawingBackground,
  type DrawingData,
  type DrawingItem,
  type DrawingPoint,
  type DrawingToolbarState,
  type RulerState,
} from '../utils/drawing';

export interface PageDrawingHandle {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  setBackground: (bg: DrawingBackground) => void;
  getHistoryState: () => { canUndo: boolean; canRedo: boolean; itemCount: number };
}

interface PageDrawingOverlayProps {
  data: DrawingData;
  drawingMode: boolean;
  toolState: DrawingToolbarState;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onEnsureVirtualHeight?: (minVirtualHeight: number) => void;
  onChange: (nextData: DrawingData) => void;
  onHistoryStateChange: (info: {
    canUndo: boolean;
    canRedo: boolean;
    itemCount: number;
  }) => void;
}

function drawItemOnCanvas(
  ctx: CanvasRenderingContext2D,
  item: DrawingItem,
  isDark: boolean,
): void {
  const color = resolveInkColor(item.color, isDark);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  switch (item.type) {
    case 'path':
    case 'highlighter': {
      const pts = item.points;
      if (pts.length === 0) {
        ctx.restore();
        return;
      }
      if (item.type === 'highlighter') {
        ctx.globalAlpha = 0.36;
      }
      if (pts.length === 1) {
        const r =
          computeStrokeWidth(
            item.size,
            pts[0][2],
            item.pressureEnabled && item.type === 'path',
          ) / 2;
        ctx.beginPath();
        ctx.arc(pts[0][0], pts[0][1], Math.max(0.6, r), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }

      const usePressure = item.pressureEnabled && item.type === 'path';
      if (!usePressure) {
        ctx.lineWidth = Math.max(0.8, item.size);
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i][0] + pts[i + 1][0]) / 2;
          const my = (pts[i][1] + pts[i + 1][1]) / 2;
          ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
        }
        const last = pts[pts.length - 1];
        ctx.lineTo(last[0], last[1]);
        ctx.stroke();
        ctx.restore();
        return;
      }

      let prevMidX = pts[0][0];
      let prevMidY = pts[0][1];
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1];
        const p1 = pts[i];
        const isLast = i === pts.length - 1;
        const endX = isLast ? p1[0] : (p0[0] + p1[0]) / 2;
        const endY = isLast ? p1[1] : (p0[1] + p1[1]) / 2;
        const avgP = (p0[2] + p1[2]) / 2;
        ctx.lineWidth = computeStrokeWidth(item.size, avgP, true);
        ctx.beginPath();
        ctx.moveTo(prevMidX, prevMidY);
        ctx.quadraticCurveTo(p0[0], p0[1], endX, endY);
        ctx.stroke();
        prevMidX = endX;
        prevMidY = endY;
      }
      ctx.restore();
      return;
    }

    case 'line': {
      ctx.lineWidth = Math.max(0.8, item.size);
      if (item.dashed) {
        ctx.setLineDash([
          Math.max(5, item.size * 2.1),
          Math.max(4, item.size * 1.5),
        ]);
      }
      ctx.beginPath();
      ctx.moveTo(item.x1, item.y1);
      ctx.lineTo(item.x2, item.y2);
      ctx.stroke();
      ctx.restore();
      return;
    }

    case 'arrow': {
      ctx.lineWidth = Math.max(0.8, item.size);
      if (item.dashed) {
        ctx.setLineDash([
          Math.max(5, item.size * 2.1),
          Math.max(4, item.size * 1.5),
        ]);
      }
      ctx.beginPath();
      ctx.moveTo(item.x1, item.y1);
      ctx.lineTo(item.x2, item.y2);
      ctx.stroke();

      ctx.setLineDash([]);
      const angle = Math.atan2(item.y2 - item.y1, item.x2 - item.x1);
      const headLen = Math.max(10, item.size * 3.4);
      ctx.beginPath();
      ctx.moveTo(
        item.x2 - headLen * Math.cos(angle - Math.PI / 6),
        item.y2 - headLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.lineTo(item.x2, item.y2);
      ctx.lineTo(
        item.x2 - headLen * Math.cos(angle + Math.PI / 6),
        item.y2 - headLen * Math.sin(angle + Math.PI / 6),
      );
      ctx.stroke();
      ctx.restore();
      return;
    }

    case 'rect': {
      const rx = item.w >= 0 ? item.x : item.x + item.w;
      const ry = item.h >= 0 ? item.y : item.y + item.h;
      const rw = Math.abs(item.w);
      const rh = Math.abs(item.h);
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      if (item.filled) {
        ctx.save();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.16;
        ctx.fill();
        ctx.restore();
      }
      ctx.lineWidth = Math.max(0.8, item.size);
      if (item.dashed) {
        ctx.setLineDash([
          Math.max(5, item.size * 2.1),
          Math.max(4, item.size * 1.5),
        ]);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }

    case 'circle': {
      const cx = item.x + item.w / 2;
      const cy = item.y + item.h / 2;
      const rx = Math.max(0.5, Math.abs(item.w) / 2);
      const ry = Math.max(0.5, Math.abs(item.h) / 2);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (item.filled) {
        ctx.save();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.16;
        ctx.fill();
        ctx.restore();
      }
      ctx.lineWidth = Math.max(0.8, item.size);
      if (item.dashed) {
        ctx.setLineDash([
          Math.max(5, item.size * 2.1),
          Math.max(4, item.size * 1.5),
        ]);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }

    case 'triangle': {
      const apexX = item.x + item.w / 2;
      const apexY = item.y;
      const bRightX = item.x + item.w;
      const bRightY = item.y + item.h;
      const bLeftX = item.x;
      const bLeftY = item.y + item.h;
      ctx.beginPath();
      ctx.moveTo(apexX, apexY);
      ctx.lineTo(bRightX, bRightY);
      ctx.lineTo(bLeftX, bLeftY);
      ctx.closePath();
      if (item.filled) {
        ctx.save();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.16;
        ctx.fill();
        ctx.restore();
      }
      ctx.lineWidth = Math.max(0.8, item.size);
      if (item.dashed) {
        ctx.setLineDash([
          Math.max(5, item.size * 2.1),
          Math.max(4, item.size * 1.5),
        ]);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }
  }
}

function drawPaperPatternOnCanvas(
  ctx: CanvasRenderingContext2D,
  virtualHeight: number,
  bg: DrawingBackground,
  isDark: boolean,
): void {
  if (bg === 'blank') return;
  const w = DRAWING_VIEWBOX_WIDTH;
  ctx.save();
  const strokeColor = isDark
    ? 'rgba(148, 163, 184, 0.14)'
    : 'rgba(148, 163, 184, 0.28)';

  if (bg === 'grid') {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let x = 24; x < w; x += 24) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, virtualHeight);
    }
    for (let y = 24; y < virtualHeight; y += 24) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  } else if (bg === 'lined') {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    for (let y = 28; y < virtualHeight; y += 28) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  } else if (bg === 'dots') {
    ctx.fillStyle = isDark
      ? 'rgba(148, 163, 184, 0.24)'
      : 'rgba(148, 163, 184, 0.42)';
    for (let x = 20; x < w; x += 20) {
      for (let y = 20; y < virtualHeight; y += 20) {
        ctx.beginPath();
        ctx.arc(x, y, 1.05, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

export const PageDrawingOverlay = forwardRef<PageDrawingHandle, PageDrawingOverlayProps>(
  (
    {
      data,
      drawingMode,
      toolState,
      scrollContainerRef,
      onEnsureVirtualHeight,
      onChange,
      onHistoryStateChange,
    },
    ref,
  ) => {
    const overlayRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const dataRef = useRef<DrawingData>(data);
    dataRef.current = data;
    const onEnsureVirtualHeightRef = useRef(onEnsureVirtualHeight);
    onEnsureVirtualHeightRef.current = onEnsureVirtualHeight;

    const undoStackRef = useRef<DrawingData[]>([]);
    const redoStackRef = useRef<DrawingData[]>([]);

    // Live 120Hz Apple Pencil drawing refs
    const activePointerIdRef = useRef<number | null>(null);
    const draftItemRef = useRef<DrawingItem | null>(null);
    const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
    const smoothStabilizerRef = useRef<{ x: number; y: number; p: number } | null>(null);
    const eraserCursorRef = useRef<{ x: number; y: number } | null>(null);
    const eraserSnapshotRef = useRef<DrawingData | null>(null);
    const eraserRemovedAnyRef = useRef(false);
    const snappedPointRef = useRef<{ x: number; y: number } | null>(null);

    const activeToolSize = getToolStrokeSize(toolState);

    const [surfaceSize, setSurfaceSize] = useState<{ width: number; height: number }>({
      width: DRAWING_VIEWBOX_WIDTH,
      height: DEFAULT_DRAWING_HEIGHT,
    });
    const [isDark, setIsDark] = useState<boolean>(() =>
      typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
    );

    // Interactive ruler state in virtual coordinates + magnet toggle / Ctrl-hold + degree editor
    const [ruler, setRuler] = useState<RulerState>({
      visible: false,
      x: DRAWING_VIEWBOX_WIDTH / 2,
      y: 220,
      angleDeg: 0,
      length: 420,
    });
    const rulerRef = useRef<RulerState>(ruler);
    rulerRef.current = ruler;
    const prevRulerVisibleRef = useRef(false);

    const [magnetToggled, setMagnetToggled] = useState(false);
    const [ctrlHeld, setCtrlHeld] = useState(false);
    const isMagnetActive = magnetToggled || ctrlHeld;
    const isMagnetActiveRef = useRef(isMagnetActive);
    isMagnetActiveRef.current = isMagnetActive;

    const [editingAngle, setEditingAngle] = useState(false);
    const [angleInputValue, setAngleInputValue] = useState('0');
    const angleInputRef = useRef<HTMLInputElement>(null);

    const rulerDragRef = useRef<{
      mode: 'move' | 'rotate';
      startClientX: number;
      startClientY: number;
      startRulerX: number;
      startRulerY: number;
      startAngleDeg: number;
      centerClientX: number;
      centerClientY: number;
      startPointerAngle: number;
    } | null>(null);

    // Watch document theme class changes so 'auto' ink & paper grid switch cleanly
    useEffect(() => {
      const updateTheme = () => {
        setIsDark(document.documentElement.classList.contains('dark'));
      };
      updateTheme();
      const observer = new MutationObserver(updateTheme);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
      return () => observer.disconnect();
    }, []);

    const emitHistoryInfo = useCallback(() => {
      onHistoryStateChange({
        canUndo: undoStackRef.current.length > 0,
        canRedo: redoStackRef.current.length > 0,
        itemCount: dataRef.current.items.length,
      });
    }, [onHistoryStateChange]);

    const commitDataWithUndo = useCallback(
      (previousSnapshot: DrawingData, nextData: DrawingData) => {
        undoStackRef.current.push(cloneDrawingData(previousSnapshot));
        if (undoStackRef.current.length > 60) {
          undoStackRef.current.shift();
        }
        redoStackRef.current = [];
        dataRef.current = nextData;
        onChange(nextData);
        emitHistoryInfo();
      },
      [emitHistoryInfo, onChange],
    );

    useImperativeHandle(
      ref,
      () => ({
        undo: () => {
          const prev = undoStackRef.current.pop();
          if (!prev) return;
          redoStackRef.current.push(cloneDrawingData(dataRef.current));
          dataRef.current = prev;
          onChange(prev);
          emitHistoryInfo();
        },
        redo: () => {
          const next = redoStackRef.current.pop();
          if (!next) return;
          undoStackRef.current.push(cloneDrawingData(dataRef.current));
          dataRef.current = next;
          onChange(next);
          emitHistoryInfo();
        },
        clear: () => {
          if (dataRef.current.items.length === 0) return;
          const snapshot = cloneDrawingData(dataRef.current);
          const cleared: DrawingData = {
            ...snapshot,
            items: [],
          };
          commitDataWithUndo(snapshot, cleared);
        },
        setBackground: (bg: DrawingBackground) => {
          if (dataRef.current.bg === bg) return;
          const updated: DrawingData = {
            ...cloneDrawingData(dataRef.current),
            bg,
          };
          dataRef.current = updated;
          onChange(updated);
        },
        getHistoryState: () => ({
          canUndo: undoStackRef.current.length > 0,
          canRedo: redoStackRef.current.length > 0,
          itemCount: dataRef.current.items.length,
        }),
      }),
      [commitDataWithUndo, emitHistoryInfo, onChange],
    );

    useEffect(() => {
      emitHistoryInfo();
    }, [emitHistoryInfo]);

    // Position interactive ruler inside currently visible scrolled viewport when toggled ON
    useEffect(() => {
      const shouldShow = drawingMode && toolState.rulerVisible;
      const justOpened = shouldShow && !prevRulerVisibleRef.current;
      prevRulerVisibleRef.current = shouldShow;

      if (!shouldShow) {
        setRuler((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        setEditingAngle(false);
        setCtrlHeld(false);
        return;
      }

      const overlayEl = overlayRef.current;
      const scrollEl = scrollContainerRef.current;
      const rect = overlayEl?.getBoundingClientRect();
      const scale = rect && rect.width > 20 ? rect.width / DRAWING_VIEWBOX_WIDTH : 1;
      const virtualTotalH = Math.max(
        DEFAULT_DRAWING_HEIGHT,
        rect ? rect.height / scale : DEFAULT_DRAWING_HEIGHT,
      );

      setRuler((prev) => {
        let nextY = prev.y;
        if (justOpened && scrollEl) {
          const centerPx = scrollEl.scrollTop + scrollEl.clientHeight * 0.45;
          nextY = Math.max(48, Math.min(virtualTotalH - 48, centerPx / scale));
        } else {
          nextY = Math.max(40, Math.min(virtualTotalH - 40, prev.y));
        }
        return {
          ...prev,
          visible: true,
          x: Math.max(120, Math.min(DRAWING_VIEWBOX_WIDTH - 120, prev.x)),
          y: nextY,
        };
      });
    }, [drawingMode, scrollContainerRef, toolState.rulerVisible]);

    // Hold Ctrl to temporarily activate ruler magnet until released
    useEffect(() => {
      if (!drawingMode || !toolState.rulerVisible) {
        setCtrlHeld(false);
        return;
      }
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Control' || e.ctrlKey) {
          setCtrlHeld(true);
        }
      };
      const onKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Control' || !e.ctrlKey) {
          setCtrlHeld(e.ctrlKey);
        }
      };
      const onBlur = () => setCtrlHeld(false);

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
      return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onBlur);
      };
    }, [drawingMode, toolState.rulerVisible]);

    // Auto-focus & select inline degree input on open
    useEffect(() => {
      if (!editingAngle) return;
      const id = window.setTimeout(() => {
        angleInputRef.current?.focus();
        angleInputRef.current?.select();
      }, 10);
      return () => window.clearTimeout(id);
    }, [editingAngle]);

    // Observe overlay width/height as text flows or panel resizes
    useEffect(() => {
      const el = overlayRef.current;
      if (!el) return;
      const updateSize = () => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 20 && rect.height > 20) {
          setSurfaceSize((prev) =>
            Math.abs(prev.width - rect.width) > 0.5 || Math.abs(prev.height - rect.height) > 0.5
              ? { width: rect.width, height: rect.height }
              : prev,
          );
        }
      };
      updateSize();
      const ro = new ResizeObserver(updateSize);
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    // Redraw transparent full-page canvas
    const redrawCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;

      const currentData = dataRef.current;
      const nothingToDraw =
        !drawingMode &&
        currentData.items.length === 0 &&
        currentData.bg === 'blank' &&
        !draftItemRef.current;

      if (nothingToDraw) {
        if (canvas.width !== 1 || canvas.height !== 1) {
          canvas.width = 1;
          canvas.height = 1;
        }
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, 1, 1);
        return;
      }

      // Clamp backing store safely within GPU canvas limits without clipping strokes
      const maxDim = 8192;
      const maxArea = 16_000_000;
      let dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      if (rect.width * dpr > maxDim) dpr = maxDim / rect.width;
      if (rect.height * dpr > maxDim) dpr = maxDim / rect.height;
      if (rect.width * dpr * rect.height * dpr > maxArea) {
        dpr = Math.min(dpr, Math.sqrt(maxArea / (rect.width * rect.height)));
      }
      dpr = Math.max(0.25, dpr);

      const targetW = Math.min(maxDim, Math.max(1, Math.round(rect.width * dpr)));
      const targetH = Math.min(maxDim, Math.max(1, Math.round(rect.height * dpr)));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, targetW, targetH);

      const cssScale = rect.width / DRAWING_VIEWBOX_WIDTH;
      const virtualHeight = cssScale > 0 ? rect.height / cssScale : DEFAULT_DRAWING_HEIGHT;
      const scaleX = targetW / DRAWING_VIEWBOX_WIDTH;
      const scaleY = targetH / Math.max(1, virtualHeight);

      ctx.save();
      ctx.scale(scaleX, scaleY);

      drawPaperPatternOnCanvas(ctx, virtualHeight, currentData.bg, isDark);

      for (const item of currentData.items) {
        drawItemOnCanvas(ctx, item, isDark);
      }

      if (draftItemRef.current) {
        drawItemOnCanvas(ctx, draftItemRef.current, isDark);
      }

      // Magnet snap indicator dot along ruler edge
      if (snappedPointRef.current && drawingMode && rulerRef.current.visible) {
        ctx.save();
        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        ctx.arc(snappedPointRef.current.x, snappedPointRef.current.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Visual eraser ring
      if (eraserCursorRef.current && drawingMode && toolState.tool === 'eraser') {
        const r = Math.max(10, activeToolSize * 1.8);
        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(eraserCursorRef.current.x, eraserCursorRef.current.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }, [drawingMode, isDark, activeToolSize, toolState.tool]);

    useEffect(() => {
      redrawCanvas();
    }, [data, surfaceSize, drawingMode, isDark, redrawCanvas]);

    const getVirtualScale = useCallback(() => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 1) {
        return { scale: 1, maxVirtualY: DEFAULT_DRAWING_HEIGHT, left: 0, top: 0 };
      }
      const scale = rect.width / DRAWING_VIEWBOX_WIDTH;
      return {
        scale,
        maxVirtualY: Math.max(20, rect.height / scale),
        left: rect.left,
        top: rect.top,
      };
    }, []);

    const ensureVisibleHeightForClientY = useCallback(
      (clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 1) return;
        const scale = rect.width / DRAWING_VIEWBOX_WIDTH;
        const currentVirtualH = rect.height / scale;
        const pointerVirtualY = (clientY - rect.top) / scale;
        if (
          pointerVirtualY + 110 > currentVirtualH &&
          currentVirtualH < MAX_DRAWING_HEIGHT
        ) {
          onEnsureVirtualHeightRef.current?.(
            Math.min(MAX_DRAWING_HEIGHT, Math.ceil(pointerVirtualY + 240)),
          );
        }
        const scrollEl = scrollContainerRef.current;
        if (scrollEl) {
          const scrollRect = scrollEl.getBoundingClientRect();
          if (clientY > scrollRect.bottom - 18) {
            scrollEl.scrollTop += Math.min(28, clientY - (scrollRect.bottom - 18));
          }
        }
      },
      [scrollContainerRef],
    );

    const toVirtualCoords = useCallback(
      (clientX: number, clientY: number): { x: number; y: number } => {
        const { scale, maxVirtualY, left, top } = getVirtualScale();
        const x = (clientX - left) / scale;
        const y = (clientY - top) / scale;
        return {
          x: Math.max(0, Math.min(DRAWING_VIEWBOX_WIDTH, x)),
          y: Math.max(0, Math.min(maxVirtualY, y)),
        };
      },
      [getVirtualScale],
    );

    const getEffectivePressure = (pressure: number, pointerType: string): number => {
      if (!toolState.pressureEnabled) return 0.5;
      if (pointerType === 'pen') {
        return pressure > 0 ? roundPressure(pressure) : 0.5;
      }
      return pressure > 0 && pressure !== 0.5 ? roundPressure(pressure) : 0.5;
    };

    const eraseAtPoint = (vx: number, vy: number) => {
      const eraserRadius = Math.max(10, activeToolSize * 1.8);
      const prevItems = dataRef.current.items;
      const remaining = prevItems.filter(
        (item) => !hitTestDrawingItem(item, vx, vy, eraserRadius),
      );
      if (remaining.length !== prevItems.length) {
        eraserRemovedAnyRef.current = true;
        dataRef.current = {
          ...dataRef.current,
          items: remaining,
        };
      }
    };

    const getEffectiveRulerThickness = useCallback(() => {
      const { scale } = getVirtualScale();
      const visualH = Math.max(28, RULER_THICKNESS * scale);
      return visualH / scale;
    }, [getVirtualScale]);

    const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingMode) return;
      if (toolState.stylusOnly && e.pointerType === 'touch') return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      e.preventDefault();
      e.stopPropagation();
      if (editingAngle) {
        commitAngleInput();
      }
      if (e.ctrlKey !== ctrlHeld) {
        setCtrlHeld(e.ctrlKey);
      }

      activePointerIdRef.current = e.pointerId;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture issues
      }

      const rawPt = toVirtualCoords(e.clientX, e.clientY);
      const magnetOn = isMagnetActiveRef.current || e.ctrlKey;
      const snapEligible =
        magnetOn &&
        (toolState.tool === 'pencil' ||
          toolState.tool === 'smooth-pen' ||
          toolState.tool === 'highlighter' ||
          toolState.tool === 'line' ||
          toolState.tool === 'arrow');
      const snapped = snapEligible
        ? snapPointToRuler(
            rawPt.x,
            rawPt.y,
            rulerRef.current,
            22,
            getEffectiveRulerThickness(),
          )
        : { x: rawPt.x, y: rawPt.y, snapped: false };

      snappedPointRef.current = snapped.snapped ? { x: snapped.x, y: snapped.y } : null;

      if (toolState.tool === 'eraser') {
        eraserCursorRef.current = rawPt;
        eraserSnapshotRef.current = cloneDrawingData(dataRef.current);
        eraserRemovedAnyRef.current = false;
        eraseAtPoint(rawPt.x, rawPt.y);
        redrawCanvas();
        return;
      }

      const p = getEffectivePressure(e.pressure, e.pointerType);

      if (
        toolState.tool === 'pencil' ||
        toolState.tool === 'smooth-pen' ||
        toolState.tool === 'highlighter'
      ) {
        const pt: DrawingPoint = [roundCoord(snapped.x), roundCoord(snapped.y), p];
        smoothStabilizerRef.current =
          toolState.tool === 'smooth-pen'
            ? { x: snapped.x, y: snapped.y, p }
            : null;
        draftItemRef.current = {
          id: generateDrawingItemId(),
          type: toolState.tool === 'highlighter' ? 'highlighter' : 'path',
          color: toolState.color,
          size:
            toolState.tool === 'highlighter'
              ? Math.max(10, activeToolSize * 2.4)
              : activeToolSize,
          pressureEnabled:
            toolState.tool === 'highlighter' ? false : toolState.pressureEnabled,
          points: [pt],
        };
        redrawCanvas();
        return;
      }

      smoothStabilizerRef.current = null;
      shapeStartRef.current = { x: roundCoord(snapped.x), y: roundCoord(snapped.y) };
      if (toolState.tool === 'line' || toolState.tool === 'arrow') {
        draftItemRef.current = {
          id: generateDrawingItemId(),
          type: toolState.tool,
          color: toolState.color,
          size: activeToolSize,
          x1: roundCoord(snapped.x),
          y1: roundCoord(snapped.y),
          x2: roundCoord(snapped.x),
          y2: roundCoord(snapped.y),
          dashed: toolState.dashed,
        };
      } else {
        draftItemRef.current = {
          id: generateDrawingItemId(),
          type: toolState.tool,
          color: toolState.color,
          size: activeToolSize,
          x: roundCoord(snapped.x),
          y: roundCoord(snapped.y),
          w: 0,
          h: 0,
          filled: toolState.filled,
          dashed: toolState.dashed,
        };
      }
      redrawCanvas();
    };

    const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingMode) return;
      if (toolState.stylusOnly && e.pointerType === 'touch') return;

      if (activePointerIdRef.current !== e.pointerId) {
        if (toolState.tool === 'eraser') {
          eraserCursorRef.current = toVirtualCoords(e.clientX, e.clientY);
          redrawCanvas();
        }
        return;
      }

      e.stopPropagation();
      ensureVisibleHeightForClientY(e.clientY);
      const rawPt = toVirtualCoords(e.clientX, e.clientY);
      if (e.ctrlKey !== ctrlHeld) {
        setCtrlHeld(e.ctrlKey);
      }

      const native = e.nativeEvent as PointerEvent;
      const coalesced =
        typeof native.getCoalescedEvents === 'function'
          ? native.getCoalescedEvents()
          : [native];
      const pointerSamples = coalesced && coalesced.length > 0 ? coalesced : [native];
      const effThickness = getEffectiveRulerThickness();
      const magnetOn = isMagnetActiveRef.current || e.ctrlKey;

      if (toolState.tool === 'eraser') {
        for (const sample of pointerSamples) {
          const samplePt = toVirtualCoords(sample.clientX, sample.clientY);
          eraserCursorRef.current = samplePt;
          eraseAtPoint(samplePt.x, samplePt.y);
        }
        redrawCanvas();
        return;
      }

      const draft = draftItemRef.current;
      if (!draft) return;

      if (draft.type === 'path' || draft.type === 'highlighter') {
        const isSmoothPen = toolState.tool === 'smooth-pen';
        const minSpacing = isSmoothPen ? 1.8 : 1.1;
        for (const sample of pointerSamples) {
          const sRaw = toVirtualCoords(sample.clientX, sample.clientY);
          const snapped = magnetOn
            ? snapPointToRuler(sRaw.x, sRaw.y, rulerRef.current, 22, effThickness)
            : { x: sRaw.x, y: sRaw.y, snapped: false };
          snappedPointRef.current = snapped.snapped ? { x: snapped.x, y: snapped.y } : null;

          const sampleP = getEffectivePressure(sample.pressure, sample.pointerType || e.pointerType);
          let targetX = snapped.x;
          let targetY = snapped.y;
          let targetP = sampleP;

          if (isSmoothPen && !snapped.snapped) {
            const prevStab = smoothStabilizerRef.current || {
              x: snapped.x,
              y: snapped.y,
              p: sampleP,
            };
            const alpha = 0.28;
            targetX = prevStab.x + (snapped.x - prevStab.x) * alpha;
            targetY = prevStab.y + (snapped.y - prevStab.y) * alpha;
            targetP = prevStab.p + (sampleP - prevStab.p) * 0.35;
            smoothStabilizerRef.current = { x: targetX, y: targetY, p: targetP };
          }

          const last = draft.points[draft.points.length - 1];
          const nx = roundCoord(targetX);
          const ny = roundCoord(targetY);
          if (!last || Math.hypot(nx - last[0], ny - last[1]) >= minSpacing) {
            draft.points.push([nx, ny, roundPressure(targetP)]);
          }
        }
        redrawCanvas();
        return;
      }

      const snapEligible =
        magnetOn && (draft.type === 'line' || draft.type === 'arrow');
      const snapped = snapEligible
        ? snapPointToRuler(rawPt.x, rawPt.y, rulerRef.current, 22, effThickness)
        : { x: rawPt.x, y: rawPt.y, snapped: false };
      snappedPointRef.current = snapped.snapped ? { x: snapped.x, y: snapped.y } : null;

      switch (draft.type) {
        case 'line':
        case 'arrow': {
          const start = shapeStartRef.current;
          if (!start) return;
          let ex = snapped.x;
          let ey = snapped.y;
          if (e.shiftKey && !snapped.snapped) {
            const dx = ex - start.x;
            const dy = ey - start.y;
            const len = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);
            const snappedAngle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
            ex = start.x + len * Math.cos(snappedAngle);
            ey = start.y + len * Math.sin(snappedAngle);
          }
          draft.x2 = roundCoord(ex);
          draft.y2 = roundCoord(ey);
          redrawCanvas();
          return;
        }

        case 'rect':
        case 'circle':
        case 'triangle': {
          const start = shapeStartRef.current;
          if (!start) return;
          let dw = rawPt.x - start.x;
          let dh = rawPt.y - start.y;
          if (e.shiftKey) {
            const side = Math.max(Math.abs(dw), Math.abs(dh));
            dw = (dw < 0 ? -1 : 1) * side;
            dh = (dh < 0 ? -1 : 1) * side;
          }
          draft.w = roundCoord(dw);
          draft.h = roundCoord(dh);
          redrawCanvas();
          return;
        }
      }
    };

    const finishActiveStroke = (e?: React.PointerEvent<HTMLCanvasElement>) => {
      if (e && activePointerIdRef.current !== e.pointerId) return;
      if (e) {
        try {
          if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        } catch {
          // Ignore
        }
      }
      activePointerIdRef.current = null;
      snappedPointRef.current = null;
      smoothStabilizerRef.current = null;

      if (toolState.tool === 'eraser') {
        const snapshot = eraserSnapshotRef.current;
        eraserSnapshotRef.current = null;
        if (snapshot && eraserRemovedAnyRef.current) {
          eraserRemovedAnyRef.current = false;
          commitDataWithUndo(snapshot, cloneDrawingData(dataRef.current));
        }
        redrawCanvas();
        return;
      }

      const draft = draftItemRef.current;
      draftItemRef.current = null;
      shapeStartRef.current = null;
      if (!draft) {
        redrawCanvas();
        return;
      }

      if (
        (draft.type === 'rect' || draft.type === 'circle' || draft.type === 'triangle') &&
        Math.hypot(draft.w, draft.h) < 4
      ) {
        redrawCanvas();
        return;
      }
      if (
        (draft.type === 'line' || draft.type === 'arrow') &&
        Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) < 3
      ) {
        redrawCanvas();
        return;
      }

      // Normalize rect & circle top-left/positive dimensions and smooth stabilized strokes
      if (draft.type === 'rect' || draft.type === 'circle') {
        const rx = draft.w >= 0 ? draft.x : draft.x + draft.w;
        const ry = draft.h >= 0 ? draft.y : draft.y + draft.h;
        draft.x = roundCoord(rx);
        draft.y = roundCoord(ry);
        draft.w = roundCoord(Math.abs(draft.w));
        draft.h = roundCoord(Math.abs(draft.h));
      } else if (draft.type === 'path' && toolState.tool === 'smooth-pen' && draft.points.length > 2) {
        draft.points = smoothDrawingPoints(draft.points);
      }

      const snapshot = cloneDrawingData(dataRef.current);
      const nextItems = [...snapshot.items, draft];
      const draftData: DrawingData = {
        ...snapshot,
        items: nextItems,
      };
      const maxY = getDrawingMaxY(draftData);
      const nextData: DrawingData = {
        ...draftData,
        height: clampDrawingHeight(Math.max(snapshot.height, maxY + 48)),
      };
      commitDataWithUndo(snapshot, nextData);
      redrawCanvas();
    };

    // Interactive Ruler Drag & Rotate Handlers (with grid/lined/dots magnet snap on Move)
    useEffect(() => {
      const onMove = (e: PointerEvent) => {
        const drag = rulerDragRef.current;
        const overlay = overlayRef.current;
        if (!drag || !overlay) return;
        const rect = overlay.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        setCtrlHeld(e.ctrlKey);
        const scale = rect.width / DRAWING_VIEWBOX_WIDTH;
        const virtualH = Math.max(DEFAULT_DRAWING_HEIGHT, rect.height / scale);

        if (drag.mode === 'move') {
          const dxVirtual = (e.clientX - drag.startClientX) / scale;
          const dyVirtual = (e.clientY - drag.startClientY) / scale;
          let nextX = Math.max(40, Math.min(DRAWING_VIEWBOX_WIDTH - 40, drag.startRulerX + dxVirtual));
          let nextY = Math.max(20, Math.min(virtualH - 20, drag.startRulerY + dyVirtual));

          const magnetOn = isMagnetActiveRef.current || e.ctrlKey;
          const bg = dataRef.current.bg;
          if (magnetOn && bg !== 'blank') {
            const stepX = bg === 'grid' ? 24 : bg === 'dots' ? 20 : 0;
            const stepY = bg === 'grid' ? 24 : bg === 'lined' ? 28 : bg === 'dots' ? 20 : 0;
            const snapDist = 10;
            const visualH = Math.max(28, RULER_THICKNESS * scale);
            const halfThick = (visualH / scale) / 2;
            const angle = rulerRef.current.angleDeg;
            const normMod = ((angle % 180) + 180) % 180;
            const isHorizontal = normMod <= 12 || normMod >= 168;
            const isVertical = Math.abs(normMod - 90) <= 12;

            if (stepY > 0) {
              if (isHorizontal) {
                const topEdge = nextY - halfThick;
                const botEdge = nextY + halfThick;
                const snapTop = Math.round(topEdge / stepY) * stepY;
                const snapBot = Math.round(botEdge / stepY) * stepY;
                const dTop = Math.abs(topEdge - snapTop);
                const dBot = Math.abs(botEdge - snapBot);
                if (dTop <= snapDist && dTop <= dBot) {
                  nextY = snapTop + halfThick;
                } else if (dBot <= snapDist) {
                  nextY = snapBot - halfThick;
                }
              } else {
                const snapY = Math.round(nextY / stepY) * stepY;
                if (Math.abs(nextY - snapY) <= snapDist) {
                  nextY = snapY;
                }
              }
            }

            if (stepX > 0) {
              if (isVertical) {
                const leftEdge = nextX - halfThick;
                const rightEdge = nextX + halfThick;
                const snapLeft = Math.round(leftEdge / stepX) * stepX;
                const snapRight = Math.round(rightEdge / stepX) * stepX;
                const dLeft = Math.abs(leftEdge - snapLeft);
                const dRight = Math.abs(rightEdge - snapRight);
                if (dLeft <= snapDist && dLeft <= dRight) {
                  nextX = snapLeft + halfThick;
                } else if (dRight <= snapDist) {
                  nextX = snapRight - halfThick;
                }
              } else {
                const snapX = Math.round(nextX / stepX) * stepX;
                if (Math.abs(nextX - snapX) <= snapDist) {
                  nextX = snapX;
                }
              }
            }

            nextX = Math.max(40, Math.min(DRAWING_VIEWBOX_WIDTH - 40, nextX));
            nextY = Math.max(20, Math.min(virtualH - 20, nextY));
          }

          setRuler((prev) => ({
            ...prev,
            x: nextX,
            y: nextY,
          }));
        } else {
          const currentAngle =
            (Math.atan2(e.clientY - drag.centerClientY, e.clientX - drag.centerClientX) * 180) /
            Math.PI;
          let nextDeg = drag.startAngleDeg + (currentAngle - drag.startPointerAngle);
          while (nextDeg > 180) nextDeg -= 360;
          while (nextDeg <= -180) nextDeg += 360;

          const magnetOn = isMagnetActiveRef.current || e.ctrlKey;
          if (magnetOn) {
            const nearest5 = Math.round(nextDeg / 5) * 5;
            if (Math.abs(nextDeg - nearest5) < 2.2) {
              nextDeg = nearest5;
            }
          }

          setRuler((prev) => ({
            ...prev,
            angleDeg: magnetOn ? Math.round(nextDeg) : Math.round(nextDeg * 10) / 10,
          }));
        }
      };

      const onUp = () => {
        rulerDragRef.current = null;
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      return () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
    }, []);

    const openAngleInput = () => {
      setAngleInputValue(String(Math.round(ruler.angleDeg)));
      setEditingAngle(true);
    };

    const commitAngleInput = () => {
      const parsed = Number(angleInputValue.trim().replace(',', '.'));
      if (Number.isFinite(parsed)) {
        setRuler((prev) => ({
          ...prev,
          angleDeg: normalizeAngleDeg(parsed),
        }));
      }
      setEditingAngle(false);
    };

    const scaleToScreen = surfaceSize.width / DRAWING_VIEWBOX_WIDTH;
    const rulerWidthPx = Math.max(180, ruler.length * scaleToScreen);
    const rulerHeightPx = Math.max(28, RULER_THICKNESS * scaleToScreen);

    return (
      <div
        ref={overlayRef}
        className={`absolute inset-0 z-20 ${
          drawingMode ? 'pointer-events-auto select-none' : 'pointer-events-none'
        }`}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={finishActiveStroke}
          onPointerCancel={finishActiveStroke}
          onLostPointerCapture={finishActiveStroke}
          onPointerLeave={() => {
            if (eraserCursorRef.current) {
              eraserCursorRef.current = null;
              redrawCanvas();
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            touchAction: drawingMode ? (toolState.stylusOnly ? 'pan-y' : 'none') : 'auto',
          }}
          className={`w-full h-full block ${
            drawingMode
              ? toolState.tool === 'eraser'
                ? 'cursor-none pointer-events-auto'
                : 'cursor-crosshair pointer-events-auto'
              : 'pointer-events-none'
          }`}
        />

        {/* Interactive Draggable & Rotatable Ruler */}
        {drawingMode && ruler.visible && (
          <div
            style={{
              left: `${ruler.x * scaleToScreen}px`,
              top: `${ruler.y * scaleToScreen}px`,
              width: `${rulerWidthPx}px`,
              height: `${rulerHeightPx}px`,
              transform: `translate(-50%, -50%) rotate(${ruler.angleDeg}deg)`,
              touchAction: 'none',
            }}
            className="absolute z-30 rounded-md bg-amber-100/85 border-2 border-amber-500/85 shadow-lg backdrop-blur-[1px] flex items-center justify-between select-none pointer-events-auto"
          >
            {/* Top straightedge ticks */}
            <div className="pointer-events-none absolute top-0 left-3 right-3 h-2.5 flex justify-between overflow-hidden opacity-60">
              {Array.from({ length: 24 }).map((_, i) => (
                <span
                  key={i}
                  className={`w-px bg-amber-900 ${i % 4 === 0 ? 'h-2.5' : 'h-1.5'}`}
                />
              ))}
            </div>

            {/* Bottom straightedge ticks */}
            <div className="pointer-events-none absolute bottom-0 left-3 right-3 h-2.5 flex justify-between items-end overflow-hidden opacity-60">
              {Array.from({ length: 24 }).map((_, i) => (
                <span
                  key={i}
                  className={`w-px bg-amber-900 ${i % 4 === 0 ? 'h-2.5' : 'h-1.5'}`}
                />
              ))}
            </div>

            {/* Left Rotate Knob */}
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                const overlayRect = overlayRef.current?.getBoundingClientRect();
                if (!overlayRect) return;
                const s = overlayRect.width / DRAWING_VIEWBOX_WIDTH;
                const cx = overlayRect.left + ruler.x * s;
                const cy = overlayRect.top + ruler.y * s;
                rulerDragRef.current = {
                  mode: 'rotate',
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  startRulerX: ruler.x,
                  startRulerY: ruler.y,
                  startAngleDeg: ruler.angleDeg,
                  centerClientX: cx,
                  centerClientY: cy,
                  startPointerAngle:
                    (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI,
                };
              }}
              className="w-7 h-7 ml-1 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-xs hover:bg-amber-600 cursor-grab active:cursor-grabbing z-10"
              title="Trascina per ruotare il righello"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>

            {/* Center Drag, Magnet Toggle & Direct Degree Input */}
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                if (editingAngle) return;
                e.preventDefault();
                rulerDragRef.current = {
                  mode: 'move',
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  startRulerX: ruler.x,
                  startRulerY: ruler.y,
                  startAngleDeg: ruler.angleDeg,
                  centerClientX: 0,
                  centerClientY: 0,
                  startPointerAngle: 0,
                };
              }}
              className="flex-1 h-full flex items-center justify-center gap-1.5 cursor-move px-2"
              title="Trascina per spostare il righello · Clicca calamita o tieni Ctrl per agganciare il tratto"
            >
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setMagnetToggled((prev) => !prev);
                }}
                className={`w-6 h-5 rounded border flex items-center justify-center transition cursor-pointer shrink-0 ${
                  isMagnetActive
                    ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                    : 'bg-white/75 text-amber-800 border-amber-400/70 hover:bg-white'
                }`}
                title={
                  isMagnetActive
                    ? ctrlHeld && !magnetToggled
                      ? 'Calamita attiva (tasto Ctrl premuto) — clicca per bloccarla attiva'
                      : 'Calamita attiva — clicca per disattivare'
                    : 'Attiva calamita lungo il righello (o tieni premuto Ctrl)'
                }
              >
                <Magnet className="w-3 h-3" />
              </button>

              {editingAngle ? (
                <div
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center bg-white border border-blue-500 rounded px-1 py-0.2 shadow-xs"
                >
                  <input
                    ref={angleInputRef}
                    type="text"
                    inputMode="numeric"
                    value={angleInputValue}
                    onChange={(e) => setAngleInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitAngleInput();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingAngle(false);
                      }
                    }}
                    onBlur={commitAngleInput}
                    aria-label="Angolo righello in gradi"
                    className="w-10 text-center text-[10px] font-mono font-bold text-amber-950 bg-transparent focus:outline-none"
                  />
                  <span className="text-[10px] font-mono font-bold text-amber-700 select-none">
                    °
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    openAngleInput();
                  }}
                  className="px-1.5 py-0.5 rounded bg-white/90 border border-amber-400 text-[10px] font-mono font-bold text-amber-950 hover:bg-white cursor-text"
                  title="Clicca per digitare i gradi di inclinazione"
                >
                  {Math.round(ruler.angleDeg)}°
                </button>
              )}
            </div>

            {/* Right Rotate Knob */}
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                const overlayRect = overlayRef.current?.getBoundingClientRect();
                if (!overlayRect) return;
                const s = overlayRect.width / DRAWING_VIEWBOX_WIDTH;
                const cx = overlayRect.left + ruler.x * s;
                const cy = overlayRect.top + ruler.y * s;
                rulerDragRef.current = {
                  mode: 'rotate',
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  startRulerX: ruler.x,
                  startRulerY: ruler.y,
                  startAngleDeg: ruler.angleDeg,
                  centerClientX: cx,
                  centerClientY: cy,
                  startPointerAngle:
                    (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI,
                };
              }}
              className="w-7 h-7 mr-1 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-xs hover:bg-amber-600 cursor-grab active:cursor-grabbing z-10"
              title="Trascina per ruotare il righello"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  },
);

PageDrawingOverlay.displayName = 'PageDrawingOverlay';
