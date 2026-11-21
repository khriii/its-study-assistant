export type DrawingTool =
  | 'pencil'
  | 'smooth-pen'
  | 'highlighter'
  | 'eraser'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'circle'
  | 'triangle';

export type DrawingSizeCategory =
  | 'pencil'
  | 'smooth-pen'
  | 'highlighter'
  | 'eraser'
  | 'shapes';

export type DrawingBackground = 'blank' | 'grid' | 'lined' | 'dots';

// [x, y, pressure]
export type DrawingPoint = [number, number, number];

export type DrawingItem =
  | {
      id: string;
      type: 'path' | 'highlighter';
      color: string;
      size: number;
      pressureEnabled: boolean;
      points: DrawingPoint[];
    }
  | {
      id: string;
      type: 'line' | 'arrow';
      color: string;
      size: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      dashed?: boolean;
    }
  | {
      id: string;
      type: 'rect' | 'circle' | 'triangle';
      color: string;
      size: number;
      x: number;
      y: number;
      w: number;
      h: number;
      filled?: boolean;
      dashed?: boolean;
    };

export interface DrawingData {
  height: number;
  bg: DrawingBackground;
  items: DrawingItem[];
}

export interface RulerState {
  visible: boolean;
  x: number; // center X in virtual coords
  y: number; // center Y in virtual coords
  angleDeg: number;
  length: number;
}

export interface DrawingToolbarState {
  tool: DrawingTool;
  color: string; // 'auto' adapts to light/dark theme ink, or hex '#rrggbb'
  sizes: Record<DrawingSizeCategory, number>;
  pressureEnabled: boolean;
  stylusOnly: boolean;
  filled: boolean;
  dashed: boolean;
  bg: DrawingBackground;
  rulerVisible: boolean;
}

export const DRAWING_VIEWBOX_WIDTH = 760;
export const DEFAULT_DRAWING_HEIGHT = 480;
export const MIN_DRAWING_HEIGHT = 180;
export const MAX_DRAWING_HEIGHT = 24000;
export const RULER_THICKNESS = 44;

export const DEFAULT_DRAWING_TOOLBAR_STATE: DrawingToolbarState = {
  tool: 'pencil',
  color: 'auto',
  sizes: {
    pencil: 3,
    'smooth-pen': 3,
    highlighter: 6,
    eraser: 10,
    shapes: 3,
  },
  pressureEnabled: true,
  stylusOnly: false,
  filled: false,
  dashed: false,
  bg: 'blank',
  rulerVisible: false,
};

export function getDrawingSizeCategory(tool: DrawingTool): DrawingSizeCategory {
  if (tool === 'pencil') return 'pencil';
  if (tool === 'smooth-pen') return 'smooth-pen';
  if (tool === 'highlighter') return 'highlighter';
  if (tool === 'eraser') return 'eraser';
  return 'shapes';
}

export function getToolStrokeSize(state: DrawingToolbarState): number {
  const cat = getDrawingSizeCategory(state.tool);
  return state.sizes[cat] ?? 3;
}

export function updateToolStrokeSize(
  state: DrawingToolbarState,
  nextSize: number,
): DrawingToolbarState {
  const clamped = Math.max(1, Math.min(22, Math.round(nextSize)));
  const cat = getDrawingSizeCategory(state.tool);
  return {
    ...state,
    sizes: {
      ...state.sizes,
      [cat]: clamped,
    },
  };
}

export function normalizeAngleDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  let a = Math.round(deg) % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return Object.is(a, -0) ? 0 : a;
}

export function resolveInkColor(color: string | undefined, isDark: boolean): string {
  if (!color || color === 'auto') {
    return isDark ? '#f8fafc' : '#0f172a';
  }
  return color;
}

export function createEmptyDrawingData(
  bg: DrawingBackground = 'blank',
  height: number = DEFAULT_DRAWING_HEIGHT,
): DrawingData {
  return {
    height: clampDrawingHeight(height),
    bg,
    items: [],
  };
}

export function clampDrawingHeight(height: number): number {
  if (!Number.isFinite(height)) return DEFAULT_DRAWING_HEIGHT;
  return Math.max(MIN_DRAWING_HEIGHT, Math.min(MAX_DRAWING_HEIGHT, Math.round(height)));
}

export function getDrawingMaxY(data: DrawingData): number {
  let maxY = 0;
  for (const item of data.items) {
    switch (item.type) {
      case 'path':
      case 'highlighter': {
        const pad = item.size;
        for (const pt of item.points) {
          if (pt[1] + pad > maxY) maxY = pt[1] + pad;
        }
        break;
      }
      case 'line':
      case 'arrow': {
        const pad = item.size * 2;
        maxY = Math.max(maxY, item.y1 + pad, item.y2 + pad);
        break;
      }
      case 'rect':
      case 'circle':
      case 'triangle': {
        const bottom = Math.max(item.y, item.y + item.h) + item.size;
        if (bottom > maxY) maxY = bottom;
        break;
      }
    }
  }
  return Math.ceil(maxY);
}

export function roundCoord(val: number): number {
  return Math.round(val * 10) / 10;
}

export function roundPressure(val: number): number {
  return Math.round(Math.max(0.05, Math.min(1, val)) * 100) / 100;
}

export function generateDrawingItemId(): string {
  return `di_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function serializeDrawingData(data: DrawingData): string {
  const compactItems: DrawingItem[] = data.items.map((item) => {
    switch (item.type) {
      case 'path':
      case 'highlighter':
        return {
          ...item,
          points: item.points.map(([x, y, p]) => [roundCoord(x), roundCoord(y), roundPressure(p)]),
        };
      case 'line':
      case 'arrow':
        return {
          ...item,
          x1: roundCoord(item.x1),
          y1: roundCoord(item.y1),
          x2: roundCoord(item.x2),
          y2: roundCoord(item.y2),
        };
      case 'rect':
      case 'circle':
      case 'triangle':
        return {
          ...item,
          x: roundCoord(item.x),
          y: roundCoord(item.y),
          w: roundCoord(item.w),
          h: roundCoord(item.h),
        };
    }
  });

  const payload: DrawingData = {
    height: clampDrawingHeight(Math.max(data.height || DEFAULT_DRAWING_HEIGHT, getDrawingMaxY(data) + 40)),
    bg: data.bg || 'blank',
    items: compactItems,
  };
  return JSON.stringify(payload);
}

export function parseDrawingData(raw: string | null | undefined): DrawingData {
  if (!raw) return createEmptyDrawingData();
  try {
    const parsed = JSON.parse(raw) as Partial<DrawingData>;
    const height = clampDrawingHeight(typeof parsed.height === 'number' ? parsed.height : DEFAULT_DRAWING_HEIGHT);
    const bg: DrawingBackground =
      parsed.bg === 'blank' || parsed.bg === 'grid' || parsed.bg === 'lined' || parsed.bg === 'dots'
        ? parsed.bg
        : 'blank';
    const items = Array.isArray(parsed.items)
      ? parsed.items.filter((it): it is DrawingItem => Boolean(it && typeof it === 'object' && typeof it.type === 'string'))
      : [];
    return { height, bg, items };
  } catch {
    return createEmptyDrawingData();
  }
}

export function cloneDrawingData(data: DrawingData): DrawingData {
  return {
    height: data.height,
    bg: data.bg,
    items: data.items.map((it) => {
      if (it.type === 'path' || it.type === 'highlighter') {
        return {
          ...it,
          points: it.points.map(([x, y, p]) => [x, y, p]),
        };
      }
      return { ...it };
    }),
  };
}

/**
 * Smooths hand-drawn points for the stabilized pen tool by filtering micro-jitter
 * and running a 2-pass weighted spatial/pressure filter while keeping exact endpoints.
 */
export function smoothDrawingPoints(points: DrawingPoint[]): DrawingPoint[] {
  if (points.length <= 2) return points;

  const filtered: DrawingPoint[] = [points[0]];
  const minDist = 3.2;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = filtered[filtered.length - 1];
    const cur = points[i];
    if (Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) >= minDist) {
      filtered.push(cur);
    }
  }
  filtered.push(points[points.length - 1]);

  if (filtered.length <= 2) return filtered;

  let current = filtered;
  for (let pass = 0; pass < 2; pass++) {
    const next: DrawingPoint[] = [current[0]];
    for (let i = 1; i < current.length - 1; i++) {
      const pPrev = current[i - 1];
      const pCur = current[i];
      const pNext = current[i + 1];
      next.push([
        roundCoord(pPrev[0] * 0.25 + pCur[0] * 0.5 + pNext[0] * 0.25),
        roundCoord(pPrev[1] * 0.25 + pCur[1] * 0.5 + pNext[1] * 0.25),
        roundPressure(pPrev[2] * 0.25 + pCur[2] * 0.5 + pNext[2] * 0.25),
      ]);
    }
    next.push(current[current.length - 1]);
    current = next;
  }

  return current;
}

/**
 * Computes effective stroke width given base size, pressure [0..1], and whether pressure is enabled.
 */
export function computeStrokeWidth(baseSize: number, pressure: number, pressureEnabled: boolean): number {
  if (!pressureEnabled) return Math.max(0.8, baseSize);
  const clamped = Math.max(0.05, Math.min(1, pressure));
  const factor = 0.35 + clamped * 1.3;
  return Math.max(0.7, baseSize * factor);
}

/**
 * Snap a point to the nearest edge of the interactive ruler if within threshold.
 */
export function snapPointToRuler(
  px: number,
  py: number,
  ruler: RulerState,
  threshold = 22,
  thickness = RULER_THICKNESS,
): { x: number; y: number; snapped: boolean } {
  if (!ruler.visible) return { x: px, y: py, snapped: false };
  const rad = (ruler.angleDeg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const nx = -uy;
  const ny = ux;

  const dx = px - ruler.x;
  const dy = py - ruler.y;
  const along = dx * ux + dy * uy;
  const perp = dx * nx + dy * ny;

  const halfLen = ruler.length / 2 + 14;
  if (Math.abs(along) > halfLen) {
    return { x: px, y: py, snapped: false };
  }

  const halfThick = thickness / 2;
  const topEdgeDist = Math.abs(perp + halfThick);
  const bottomEdgeDist = Math.abs(perp - halfThick);

  if (topEdgeDist <= threshold && topEdgeDist <= bottomEdgeDist) {
    return {
      x: ruler.x + along * ux - halfThick * nx,
      y: ruler.y + along * uy - halfThick * ny,
      snapped: true,
    };
  }
  if (bottomEdgeDist <= threshold) {
    return {
      x: ruler.x + along * ux + halfThick * nx,
      y: ruler.y + along * uy + halfThick * ny,
      snapped: true,
    };
  }
  return { x: px, y: py, snapped: false };
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = px - x1;
  const wy = py - y1;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 0.0001) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq));
  const projX = x1 + t * vx;
  const projY = y1 + t * vy;
  return Math.hypot(px - projX, py - projY);
}

/**
 * Checks whether an eraser circle at (px, py) with eraserRadius touches the given DrawingItem.
 */
export function hitTestDrawingItem(
  item: DrawingItem,
  px: number,
  py: number,
  eraserRadius: number,
): boolean {
  const tol = eraserRadius + item.size / 2;

  switch (item.type) {
    case 'path':
    case 'highlighter': {
      const pts = item.points;
      if (pts.length === 0) return false;
      if (pts.length === 1) {
        return Math.hypot(px - pts[0][0], py - pts[0][1]) <= tol + 2;
      }
      for (let i = 0; i < pts.length - 1; i++) {
        if (distToSegment(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) <= tol) {
          return true;
        }
      }
      return false;
    }

    case 'line':
    case 'arrow':
      return distToSegment(px, py, item.x1, item.y1, item.x2, item.y2) <= tol + 2;

    case 'rect': {
      const left = Math.min(item.x, item.x + item.w);
      const right = Math.max(item.x, item.x + item.w);
      const top = Math.min(item.y, item.y + item.h);
      const bottom = Math.max(item.y, item.y + item.h);
      if (
        item.filled &&
        px >= left - tol &&
        px <= right + tol &&
        py >= top - tol &&
        py <= bottom + tol
      ) {
        return true;
      }
      return (
        distToSegment(px, py, left, top, right, top) <= tol ||
        distToSegment(px, py, right, top, right, bottom) <= tol ||
        distToSegment(px, py, right, bottom, left, bottom) <= tol ||
        distToSegment(px, py, left, bottom, left, top) <= tol
      );
    }

    case 'circle': {
      const left = Math.min(item.x, item.x + item.w);
      const right = Math.max(item.x, item.x + item.w);
      const top = Math.min(item.y, item.y + item.h);
      const bottom = Math.max(item.y, item.y + item.h);
      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;
      const rx = Math.max(1, (right - left) / 2);
      const ry = Math.max(1, (bottom - top) / 2);
      const norm = Math.hypot((px - cx) / rx, (py - cy) / ry);
      if (item.filled && norm <= 1 + tol / Math.min(rx, ry)) return true;
      const avgR = (rx + ry) / 2;
      return Math.abs(norm - 1) * avgR <= tol + 3;
    }

    case 'triangle': {
      const apexX = item.x + item.w / 2;
      const apexY = item.y;
      const bRightX = item.x + item.w;
      const bRightY = item.y + item.h;
      const bLeftX = item.x;
      const bLeftY = item.y + item.h;

      if (item.filled) {
        const area2 = (
          p1x: number,
          p1y: number,
          p2x: number,
          p2y: number,
          p3x: number,
          p3y: number,
        ) => (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y);
        const d1 = area2(px, py, apexX, apexY, bRightX, bRightY);
        const d2 = area2(px, py, bRightX, bRightY, bLeftX, bLeftY);
        const d3 = area2(px, py, bLeftX, bLeftY, apexX, apexY);
        const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
        const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(hasNeg && hasPos)) return true;
      }

      return (
        distToSegment(px, py, apexX, apexY, bRightX, bRightY) <= tol ||
        distToSegment(px, py, bRightX, bRightY, bLeftX, bLeftY) <= tol ||
        distToSegment(px, py, bLeftX, bLeftY, apexX, apexY) <= tol
      );
    }
  }
}

/**
 * Generates a clean SVG representation for HTML/PDF export and static fallback.
 */
export function renderDrawingToSvgString(
  data: DrawingData,
  options?: { transparentBg?: boolean; isDark?: boolean },
): string {
  const w = DRAWING_VIEWBOX_WIDTH;
  const h = clampDrawingHeight(Math.max(data.height || DEFAULT_DRAWING_HEIGHT, getDrawingMaxY(data) + 40));
  const uid = Math.random().toString(36).slice(2, 8);
  const transparentBg = options?.transparentBg ?? false;
  const isDark = options?.isDark ?? false;

  let bgSvg = transparentBg ? '' : `<rect width="${w}" height="${h}" fill="#ffffff"/>`;
  if (data.bg === 'grid') {
    bgSvg += `<defs><pattern id="grid_${uid}" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="${transparentBg ? 'rgba(148,163,184,0.28)' : '#e2e8f0'}" stroke-width="0.8"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#grid_${uid})"/>`;
  } else if (data.bg === 'lined') {
    bgSvg += `<defs><pattern id="lined_${uid}" width="24" height="28" patternUnits="userSpaceOnUse"><line x1="0" y1="27.5" x2="24" y2="27.5" stroke="${transparentBg ? 'rgba(148,163,184,0.3)' : '#cbd5e1'}" stroke-width="0.8"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#lined_${uid})"/>`;
  } else if (data.bg === 'dots') {
    bgSvg += `<defs><pattern id="dots_${uid}" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="1" fill="${transparentBg ? 'rgba(148,163,184,0.36)' : '#cbd5e1'}"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#dots_${uid})"/>`;
  }

  const elementsSvg = data.items
    .map((item) => {
      const resolvedColor = resolveInkColor(item.color, isDark);
      const strokeAttr = `stroke="${resolvedColor}" stroke-linecap="round" stroke-linejoin="round"`;

      switch (item.type) {
        case 'path':
        case 'highlighter': {
          const opacity = item.type === 'highlighter' ? ' stroke-opacity="0.36"' : '';
          const pts = item.points;
          if (pts.length === 0) return '';
          if (pts.length === 1) {
            const r = computeStrokeWidth(item.size, pts[0][2], item.pressureEnabled && item.type === 'path') / 2;
            const fillOp = item.type === 'highlighter' ? ' fill-opacity="0.36"' : '';
            return `<circle cx="${pts[0][0]}" cy="${pts[0][1]}" r="${roundCoord(r)}" fill="${resolvedColor}"${fillOp}/>`;
          }
          const usePressure = item.pressureEnabled && item.type === 'path';
          if (!usePressure) {
            let d = `M ${pts[0][0]} ${pts[0][1]}`;
            for (let i = 1; i < pts.length - 1; i++) {
              const mx = roundCoord((pts[i][0] + pts[i + 1][0]) / 2);
              const my = roundCoord((pts[i][1] + pts[i + 1][1]) / 2);
              d += ` Q ${pts[i][0]} ${pts[i][1]} ${mx} ${my}`;
            }
            const last = pts[pts.length - 1];
            d += ` L ${last[0]} ${last[1]}`;
            return `<path d="${d}" fill="none" ${strokeAttr} stroke-width="${item.size}"${opacity}/>`;
          }
          const segs: string[] = [];
          let prevMidX = pts[0][0];
          let prevMidY = pts[0][1];
          for (let i = 1; i < pts.length; i++) {
            const p0 = pts[i - 1];
            const p1 = pts[i];
            const isLast = i === pts.length - 1;
            const endX = isLast ? p1[0] : roundCoord((p0[0] + p1[0]) / 2);
            const endY = isLast ? p1[1] : roundCoord((p0[1] + p1[1]) / 2);
            const sw = roundCoord(computeStrokeWidth(item.size, (p0[2] + p1[2]) / 2, true));
            segs.push(
              `<path d="M ${prevMidX} ${prevMidY} Q ${p0[0]} ${p0[1]} ${endX} ${endY}" fill="none" ${strokeAttr} stroke-width="${sw}"/>`,
            );
            prevMidX = endX;
            prevMidY = endY;
          }
          return `<g>${segs.join('')}</g>`;
        }

        case 'line': {
          const dash = item.dashed
            ? ` stroke-dasharray="${Math.max(4, item.size * 2)} ${Math.max(4, item.size * 1.6)}"`
            : '';
          return `<line x1="${item.x1}" y1="${item.y1}" x2="${item.x2}" y2="${item.y2}" ${strokeAttr} stroke-width="${item.size}"${dash}/>`;
        }

        case 'arrow': {
          const dash = item.dashed
            ? ` stroke-dasharray="${Math.max(4, item.size * 2)} ${Math.max(4, item.size * 1.6)}"`
            : '';
          const angle = Math.atan2(item.y2 - item.y1, item.x2 - item.x1);
          const headLen = Math.max(10, item.size * 3.4);
          const ax1 = roundCoord(item.x2 - headLen * Math.cos(angle - Math.PI / 6));
          const ay1 = roundCoord(item.y2 - headLen * Math.sin(angle - Math.PI / 6));
          const ax2 = roundCoord(item.x2 - headLen * Math.cos(angle + Math.PI / 6));
          const ay2 = roundCoord(item.y2 - headLen * Math.sin(angle + Math.PI / 6));
          return `<g><line x1="${item.x1}" y1="${item.y1}" x2="${item.x2}" y2="${item.y2}" ${strokeAttr} stroke-width="${item.size}"${dash}/><polyline points="${ax1},${ay1} ${item.x2},${item.y2} ${ax2},${ay2}" fill="none" ${strokeAttr} stroke-width="${item.size}"/></g>`;
        }

        case 'rect': {
          const dash = item.dashed
            ? ` stroke-dasharray="${Math.max(4, item.size * 2)} ${Math.max(4, item.size * 1.6)}"`
            : '';
          const fillAttr = item.filled ? `fill="${resolvedColor}" fill-opacity="0.16"` : 'fill="none"';
          const rx = item.w >= 0 ? item.x : item.x + item.w;
          const ry = item.h >= 0 ? item.y : item.y + item.h;
          const rw = Math.abs(item.w);
          const rh = Math.abs(item.h);
          return `<rect x="${roundCoord(rx)}" y="${roundCoord(ry)}" width="${roundCoord(rw)}" height="${roundCoord(rh)}" ${fillAttr} ${strokeAttr} stroke-width="${item.size}"${dash}/>`;
        }

        case 'circle': {
          const dash = item.dashed
            ? ` stroke-dasharray="${Math.max(4, item.size * 2)} ${Math.max(4, item.size * 1.6)}"`
            : '';
          const fillAttr = item.filled ? `fill="${resolvedColor}" fill-opacity="0.16"` : 'fill="none"';
          const cx = roundCoord(item.x + item.w / 2);
          const cy = roundCoord(item.y + item.h / 2);
          const rx = roundCoord(Math.abs(item.w) / 2);
          const ry = roundCoord(Math.abs(item.h) / 2);
          return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${fillAttr} ${strokeAttr} stroke-width="${item.size}"${dash}/>`;
        }

        case 'triangle': {
          const dash = item.dashed
            ? ` stroke-dasharray="${Math.max(4, item.size * 2)} ${Math.max(4, item.size * 1.6)}"`
            : '';
          const fillAttr = item.filled ? `fill="${resolvedColor}" fill-opacity="0.16"` : 'fill="none"';
          const p1 = `${roundCoord(item.x + item.w / 2)},${roundCoord(item.y)}`;
          const p2 = `${roundCoord(item.x + item.w)},${roundCoord(item.y + item.h)}`;
          const p3 = `${roundCoord(item.x)},${roundCoord(item.y + item.h)}`;
          return `<polygon points="${p1} ${p2} ${p3}" ${fillAttr} ${strokeAttr} stroke-width="${item.size}"${dash}/>`;
        }
      }
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" class="its-drawing-svg" style="width:100%;height:auto;display:block;">${bgSvg}${elementsSvg}</svg>`;
}
