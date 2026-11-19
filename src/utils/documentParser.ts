import JSZip from 'jszip';
import type { StudyFileExt } from '../types';

export interface ParsedSlide {
  index: number;
  title: string;
  lines: string[];
}

export interface ParsedDocBlock {
  type: 'h1' | 'h2' | 'p' | 'li';
  text: string;
}

export interface DocumentPreviewData {
  extractedText: string;
  slides?: ParsedSlide[];
  docxBlocks?: ParsedDocBlock[];
}

export function getStudyFileExt(filename: string): StudyFileExt | null {
  const lower = filename.toLowerCase().trim();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.pptx')) return 'pptx';
  return null;
}

export function getMimeTypeForExt(ext: StudyFileExt, fallback?: string): string {
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (ext === 'pptx') {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  return fallback || 'application/octet-stream';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    parts.push(String.fromCharCode(...slice));
  }
  return btoa(parts.join(''));
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function base64ToBlobUrl(base64: string, mimeType: string): string {
  const bytes = base64ToUint8Array(base64);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([buffer], { type: mimeType });
  return URL.createObjectURL(blob);
}

export async function parseDocxFromBuffer(buffer: ArrayBuffer | Uint8Array): Promise<DocumentPreviewData> {
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    return { extractedText: '', docxBlocks: [] };
  }

  const xmlText = await docFile.async('text');
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'application/xml');
  const paragraphs = Array.from(xml.getElementsByTagName('w:p'));

  const docxBlocks: ParsedDocBlock[] = [];
  const textLines: string[] = [];

  for (const p of paragraphs) {
    const textRuns = Array.from(p.getElementsByTagName('w:t'));
    const rawText = textRuns.map((t) => t.textContent || '').join('').trim();
    if (!rawText) continue;

    const pStyle = p.getElementsByTagName('w:pStyle')[0]?.getAttribute('w:val') || '';
    const hasNum = p.getElementsByTagName('w:numPr').length > 0;

    let type: ParsedDocBlock['type'] = 'p';
    if (/^(Heading1|Title|Titolo1)/i.test(pStyle)) {
      type = 'h1';
    } else if (/^(Heading|Titolo)/i.test(pStyle)) {
      type = 'h2';
    } else if (hasNum) {
      type = 'li';
    }

    docxBlocks.push({ type, text: rawText });
    textLines.push(type === 'li' ? `• ${rawText}` : rawText);
  }

  return {
    extractedText: textLines.join('\n\n').slice(0, 195000),
    docxBlocks,
  };
}

export async function parsePptxFromBuffer(buffer: ArrayBuffer | Uint8Array): Promise<DocumentPreviewData> {
  const zip = await JSZip.loadAsync(buffer);
  const slideEntries = Object.keys(zip.files)
    .map((path) => {
      const match = path.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
      return match ? { path, index: Number(match[1]) } : null;
    })
    .filter((item): item is { path: string; index: number } => item !== null)
    .sort((a, b) => a.index - b.index);

  const slides: ParsedSlide[] = [];
  const textSections: string[] = [];
  const parser = new DOMParser();

  for (const entry of slideEntries) {
    const file = zip.file(entry.path);
    if (!file) continue;
    const xmlText = await file.async('text');
    const xml = parser.parseFromString(xmlText, 'application/xml');
    const paragraphs = Array.from(xml.getElementsByTagName('a:p'));

    const lines: string[] = [];
    for (const p of paragraphs) {
      const runs = Array.from(p.getElementsByTagName('a:t'));
      const line = runs.map((t) => t.textContent || '').join('').trim();
      if (line) lines.push(line);
    }

    const title = lines[0] || `Slide ${entry.index}`;
    const bodyLines = lines.length > 1 ? lines.slice(1) : [];
    slides.push({
      index: entry.index,
      title,
      lines: bodyLines,
    });

    if (lines.length > 0) {
      textSections.push(`--- Slide ${entry.index}: ${title} ---\n${bodyLines.join('\n')}`.trim());
    }
  }

  return {
    extractedText: textSections.join('\n\n').slice(0, 195000),
    slides,
  };
}

export async function extractDocumentPreview(
  buffer: ArrayBuffer | Uint8Array,
  ext: StudyFileExt,
): Promise<DocumentPreviewData> {
  if (ext === 'docx') {
    return parseDocxFromBuffer(buffer);
  }
  if (ext === 'pptx') {
    return parsePptxFromBuffer(buffer);
  }
  return { extractedText: '' };
}
