import type { ChatAttachment } from '../types';
import { parseDrawingData, renderDrawingToSvgString } from './drawing';

export function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function stripHtml(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  tmp.querySelectorAll('.its-page-drawing, .its-drawing-block').forEach((n) => n.remove());
  return tmp.textContent || tmp.innerText || '';
}

export function sanitizeFilename(name: string): string {
  return (name || 'nota')
    .replace(/[^a-z0-9àèéìòù_-]/gi, '_')
    .replace(/_+/g, '_');
}

export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function inlineHtmlToMd(el: Node): string {
  let res = '';
  el.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      res += child.nodeValue || '';
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const elem = child as HTMLElement;
    const tag = elem.tagName.toLowerCase();
    if (tag === 'br') {
      res += '  \n';
      return;
    }
    const inner = inlineHtmlToMd(elem);
    if (tag === 'strong' || tag === 'b') res += `**${inner}**`;
    else if (tag === 'em' || tag === 'i') res += `*${inner}*`;
    else if (tag === 'u') res += `<u>${inner}</u>`;
    else if (tag === 'code') res += `\`${elem.innerText}\``;
    else if (tag === 'span') {
      let styled = inner;
      if (elem.style.color) {
        styled = `<span style="color: ${elem.style.color}">${styled}</span>`;
      }
      if (elem.style.backgroundColor && elem.style.backgroundColor !== 'transparent') {
        styled = `==${styled}==`;
      }
      res += styled;
    } else {
      res += inner;
    }
  });
  return res;
}

function htmlToMarkdown(root: HTMLElement): string {
  let out = '';
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue || '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const elem = node as HTMLElement;
    const tag = elem.tagName.toLowerCase();
    if (tag === 'h1') out += `\n# ${elem.innerText.trim()}\n\n`;
    else if (tag === 'h2') out += `\n## ${elem.innerText.trim()}\n\n`;
    else if (tag === 'h3') out += `\n### ${elem.innerText.trim()}\n\n`;
    else if (tag === 'p') out += `${inlineHtmlToMd(elem)}\n\n`;
    else if (tag === 'pre') {
      const codeText = (elem.querySelector('code')?.innerText ?? elem.innerText).replace(/\n$/, '');
      out += `\n\`\`\`\n${codeText}\n\`\`\`\n\n`;
    } else if (tag === 'ul') {
      elem.querySelectorAll(':scope > li').forEach((li) => {
        out += `- ${inlineHtmlToMd(li)}\n`;
      });
      out += '\n';
    } else if (tag === 'ol') {
      elem.querySelectorAll(':scope > li').forEach((li, i) => {
        out += `${i + 1}. ${inlineHtmlToMd(li)}\n`;
      });
      out += '\n';
    } else if (tag === 'div' && elem.classList.contains('its-callout')) {
      out += `> ${elem.innerText.trim().replace(/\n/g, '\n> ')}\n\n`;
    } else if (tag === 'div' && elem.classList.contains('its-page-drawing')) {
      const data = parseDrawingData(elem.getAttribute('data-drawing'));
      if (data.items.length > 0) {
        out += `\n[Annotazioni e disegni sulla pagina]\n\n`;
      }
    } else if (tag === 'div' && elem.classList.contains('its-drawing-block')) {
      out += `\n[Disegno a mano]\n\n`;
    } else if (tag === 'table') {
      const rows = Array.from(elem.querySelectorAll('tr'));
      rows.forEach((tr, rIdx) => {
        const cells = Array.from(tr.querySelectorAll('th, td')).map((c) =>
          inlineHtmlToMd(c).replace(/\n/g, '<br>').replace(/\|/g, '\\|'),
        );
        out += `| ${cells.join(' | ')} |\n`;
        if (rIdx === 0) {
          out += `| ${cells.map(() => '---').join(' | ')} |\n`;
        }
      });
      out += '\n';
    } else {
      out += `${elem.innerText.trim()}\n\n`;
    }
  });
  return out.trim() + '\n';
}

export function exportActiveNoteToMarkdown(
  title: string,
  subjectName: string,
  htmlContent: string,
): void {
  const temp = document.createElement('div');
  temp.innerHTML = htmlContent;
  const md = `# ${title}\n> Materia: ${subjectName}\n\n` + htmlToMarkdown(temp);
  downloadTextFile(md, `${sanitizeFilename(title)}.md`, 'text/markdown;charset=utf-8');
}

function prepareExportHtmlWithPageDrawing(htmlContent: string): string {
  const container = document.createElement('div');
  container.innerHTML = htmlContent || '';
  const pageDrawingEls = Array.from(container.querySelectorAll('.its-page-drawing'));
  if (pageDrawingEls.length === 0) {
    return htmlContent;
  }

  let overlaySvg = '';
  pageDrawingEls.forEach((el) => {
    const data = parseDrawingData(el.getAttribute('data-drawing'));
    if (data.items.length > 0 || data.bg !== 'blank') {
      overlaySvg += renderDrawingToSvgString(data, { transparentBg: true, isDark: false });
    }
    el.remove();
  });

  if (!overlaySvg) {
    return container.innerHTML;
  }

  return `<div class="its-export-page"><div class="its-export-body">${container.innerHTML}</div><div class="its-page-drawing-overlay">${overlaySvg}</div></div>`;
}

export function exportActiveNoteToHTML(title: string, htmlContent: string): void {
  const renderedContent = prepareExportHtmlWithPageDrawing(htmlContent);
  const docHtml = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; max-width: 820px; margin: 40px auto; padding: 0 20px; color: #1e293b; line-height: 1.65; }
h1 { font-size: 1.65rem; font-weight: 700; margin-top: 1.1rem; margin-bottom: 0.6rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3rem; }
h2 { font-size: 1.3rem; font-weight: 600; margin-top: 1rem; margin-bottom: 0.5rem; }
h3 { font-size: 1.1rem; font-weight: 600; margin-top: 0.8rem; margin-bottom: 0.4rem; }
p { margin: 0.5rem 0; }
ul { list-style-type: disc; padding-left: 1.5rem; margin: 0.5rem 0; }
ol { list-style-type: decimal; padding-left: 1.5rem; margin: 0.5rem 0; }
li { margin: 0.25rem 0; }
.its-export-page { display: grid; grid-template-columns: minmax(0, 1fr); position: relative; min-height: 480px; }
.its-export-body { grid-area: 1 / 1; position: relative; z-index: 1; min-width: 0; }
.its-page-drawing-overlay { grid-area: 1 / 1; position: relative; z-index: 10; pointer-events: none; min-width: 0; }
.its-callout { border: 1px solid #bfdbfe; background-color: #eff6ff; padding: 0.75rem 1rem; border-radius: 0.625rem; margin: 0.75rem 0; }
.its-drawing-block { border: 1px solid #cbd5e1; border-radius: 0.75rem; background: #ffffff; margin: 0.85rem 0; overflow: hidden; }
.its-drawing-svg { width: 100%; height: auto; display: block; }
pre { background-color: #18181b; color: #e4e4e7; padding: 0.85rem 1rem; border-radius: 0.625rem; overflow-x: auto; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; }
code:not(pre code) { background-color: #f1f5f9; padding: 0.1rem 0.35rem; border-radius: 0.25rem; font-family: 'JetBrains Mono', monospace; font-size: 0.85em; }
table.its-table { width: 100%; border-collapse: collapse; margin: 0.85rem 0; font-size: 0.85rem; }
table.its-table th, table.its-table td { border: 1px solid #cbd5e1; padding: 0.5rem 0.75rem; text-align: left; }
table.its-table th { background-color: #f8fafc; font-weight: 600; }
</style>
</head>
<body>
${renderedContent}
</body>
</html>`;
  downloadTextFile(docHtml, `${sanitizeFilename(title)}.html`, 'text/html;charset=utf-8');
}

export function exportActiveNoteToPDF(
  title: string,
  subjectName: string,
  htmlContent: string,
): void {
  const renderedContent = prepareExportHtmlWithPageDrawing(htmlContent);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)} - ${escapeHtml(subjectName)}</title>
  <style>
    :root { color-scheme: light; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    body { font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; color: #1e293b; max-width: 800px; margin: 32px auto; padding: 0 24px; line-height: 1.6; }
    .meta { font-size: 12px; color: #64748b; border-bottom: 1px solid #cbd5e1; padding-bottom: 10px; margin-bottom: 24px; }
    h1 { font-size: 24px; margin-top: 24px; margin-bottom: 12px; font-weight: 700; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    h2 { font-size: 19px; margin-top: 20px; margin-bottom: 8px; font-weight: 600; }
    h3 { font-size: 16px; margin-top: 16px; margin-bottom: 6px; font-weight: 600; }
    p { margin: 10px 0; }
    ul { list-style-type: disc; padding-left: 24px; margin: 12px 0; }
    ol { list-style-type: decimal; padding-left: 24px; margin: 12px 0; }
    li { margin: 6px 0; }
    .its-export-page { display: grid; grid-template-columns: minmax(0, 1fr); position: relative; min-height: 480px; }
    .its-export-body { grid-area: 1 / 1; position: relative; z-index: 1; min-width: 0; }
    .its-page-drawing-overlay { grid-area: 1 / 1; position: relative; z-index: 10; pointer-events: none; min-width: 0; }
    .its-callout { border: 1px solid #bfdbfe; background-color: #eff6ff; padding: 12px 16px; border-radius: 8px; margin: 14px 0; }
    .its-drawing-block { border: 1px solid #cbd5e1; border-radius: 10px; background: #ffffff; margin: 16px 0; overflow: hidden; break-inside: avoid; }
    .its-drawing-svg { width: 100%; height: auto; display: block; }
    pre { background-color: #18181b; color: #e4e4e7; padding: 12px 14px; border-radius: 8px; font-family: monospace; font-size: 12px; white-space: pre-wrap; }
    table.its-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
    table.its-table th, table.its-table td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
    table.its-table th { background-color: #f1f5f9; font-weight: 600; }
    code:not(pre code) { background-color: #f1f5f9; padding: 2px 5px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
  </style>
</head>
<body>
  <div class="meta"><strong>ITS Study Assistant</strong> · Materia: ${escapeHtml(subjectName)} · Documento: ${escapeHtml(title)}</div>
  ${renderedContent}
</body>
</html>`;

  iframe.srcdoc = html;
  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => {
          iframe.remove();
        }, 1500);
      }
    }, 200);
  };
  document.body.appendChild(iframe);
}

export function readAttachmentFile(file: File): Promise<ChatAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const useBase64Inline = isImage || isPdf;
    reader.onload = () => {
      if (useBase64Inline) {
        const result = typeof reader.result === 'string' ? reader.result : '';
        resolve({
          name: file.name,
          type: isPdf ? 'application/pdf' : file.type,
          isImage,
          data: result.split(',')[1] || '',
        });
      } else {
        resolve({
          name: file.name,
          type: file.type || 'text/plain',
          isImage: false,
          textData: typeof reader.result === 'string' ? reader.result : '',
        });
      }
    };
    reader.onerror = () => reject(reader.error);
    if (useBase64Inline) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  });
}
