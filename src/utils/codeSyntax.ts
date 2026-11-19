import { CODE_LANGUAGES } from '../constants/defaults';

export type CodeLanguage = (typeof CODE_LANGUAGES)[number]['id'];

export type CodeTokenPart =
  | 'keyword'
  | 'function'
  | 'variable'
  | 'type'
  | 'string'
  | 'number'
  | 'comment'
  | 'operator';

export type CodeColorScheme = Record<CodeTokenPart, string>;

export const DEFAULT_CODE_COLOR_SCHEME: CodeColorScheme = {
  keyword: '#c678dd',
  function: '#61afef',
  variable: '#e06c75',
  type: '#e5c07b',
  string: '#98c379',
  number: '#d19a66',
  comment: '#7f848e',
  operator: '#56b6c2',
};

export const CODE_COLOR_PARTS: { part: CodeTokenPart; label: string }[] = [
  { part: 'keyword', label: 'Parole chiave' },
  { part: 'function', label: 'Funzioni / Metodi' },
  { part: 'variable', label: 'Variabili / Identificatori' },
  { part: 'type', label: 'Tipi / Classi' },
  { part: 'string', label: 'Stringhe / Caratteri' },
  { part: 'number', label: 'Numeri' },
  { part: 'comment', label: 'Commenti' },
  { part: 'operator', label: 'Operatori / Simboli' },
];

const STORAGE_KEY = 'its_code_color_scheme_v1';

export function loadSavedCodeColors(): CodeColorScheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CODE_COLOR_SCHEME };
    const parsed = JSON.parse(raw) as Partial<CodeColorScheme>;
    return { ...DEFAULT_CODE_COLOR_SCHEME, ...parsed };
  } catch {
    return { ...DEFAULT_CODE_COLOR_SCHEME };
  }
}

export function saveCodeColors(scheme: CodeColorScheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scheme));
  } catch {
    // Ignore storage errors
  }
}

export interface CodeToken {
  text: string;
  part: CodeTokenPart | 'plain';
}

const KEYWORDS_BY_LANG: Record<string, Set<string>> = {
  common: new Set([
    'if',
    'else',
    'elif',
    'for',
    'while',
    'do',
    'switch',
    'case',
    'default',
    'break',
    'continue',
    'return',
    'try',
    'catch',
    'finally',
    'throw',
    'throws',
    'new',
    'delete',
    'import',
    'from',
    'export',
    'as',
    'class',
    'struct',
    'enum',
    'interface',
    'extends',
    'implements',
    'public',
    'private',
    'protected',
    'static',
    'const',
    'let',
    'var',
    'function',
    'def',
    'async',
    'await',
    'yield',
    'true',
    'false',
    'null',
    'undefined',
    'None',
    'True',
    'False',
    'sizeof',
    'typedef',
    'typeof',
    'instanceof',
    'in',
    'not',
    'and',
    'or',
    'is',
    'with',
    'pass',
    'lambda',
    'fn',
    'pub',
    'mut',
    'impl',
    'match',
    'package',
    'func',
    'go',
    'defer',
    'using',
    'namespace',
    'echo',
  ]),
  sql: new Set([
    'SELECT',
    'FROM',
    'WHERE',
    'INSERT',
    'INTO',
    'VALUES',
    'UPDATE',
    'SET',
    'DELETE',
    'CREATE',
    'TABLE',
    'DROP',
    'ALTER',
    'ADD',
    'JOIN',
    'INNER',
    'LEFT',
    'RIGHT',
    'ON',
    'GROUP',
    'BY',
    'ORDER',
    'HAVING',
    'LIMIT',
    'AS',
    'AND',
    'OR',
    'NOT',
    'NULL',
    'PRIMARY',
    'KEY',
    'FOREIGN',
    'REFERENCES',
    'DISTINCT',
    'COUNT',
    'SUM',
    'AVG',
    'MIN',
    'MAX',
  ]),
};

const BUILTIN_TYPES = new Set([
  'void',
  'int',
  'char',
  'float',
  'double',
  'long',
  'short',
  'unsigned',
  'signed',
  'bool',
  'boolean',
  'string',
  'number',
  'any',
  'unknown',
  'never',
  'size_t',
  'FILE',
  'String',
  'Number',
  'Boolean',
  'Array',
  'Object',
  'Promise',
  'Map',
  'Set',
  'List',
  'Dict',
  'Vec',
  'Option',
  'Result',
  'i32',
  'i64',
  'u32',
  'u64',
  'f64',
  'str',
  'usize',
  'NULL',
  'nullptr',
  'INT',
  'VARCHAR',
  'TEXT',
  'DATE',
  'TIMESTAMP',
]);

export function normalizeCodeLanguage(raw?: string | null): CodeLanguage {
  const lower = (raw || '').toLowerCase().trim();
  if (CODE_LANGUAGES.some((l) => l.id === lower)) {
    return lower as CodeLanguage;
  }
  if (lower === 'js') return 'javascript';
  if (lower === 'ts') return 'typescript';
  if (lower === 'py') return 'python';
  if (lower === 'c++') return 'cpp';
  if (lower === 'c#') return 'csharp';
  if (lower === 'sh' || lower === 'shell') return 'bash';
  return 'c';
}

export function tokenizeCode(code: string, lang: CodeLanguage): CodeToken[] {
  if (!code) return [];
  if (lang === 'plaintext') {
    return [{ text: code, part: 'plain' }];
  }

  const tokens: CodeToken[] = [];
  const len = code.length;
  let i = 0;

  const pushToken = (text: string, part: CodeToken['part']) => {
    if (!text) return;
    const prev = tokens[tokens.length - 1];
    if (prev && prev.part === part) {
      prev.text += text;
    } else {
      tokens.push({ text, part });
    }
  };

  while (i < len) {
    const ch = code[i];
    const next = code[i + 1] || '';

    // Whitespace
    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < len && /\s/.test(code[j])) j++;
      pushToken(code.slice(i, j), 'plain');
      i = j;
      continue;
    }

    // Comments
    if (lang !== 'python' && lang !== 'bash' && ch === '/' && next === '/') {
      let j = i + 2;
      while (j < len && code[j] !== '\n') j++;
      pushToken(code.slice(i, j), 'comment');
      i = j;
      continue;
    }
    if (ch === '/' && next === '*') {
      let j = i + 2;
      while (j < len && !(code[j] === '*' && code[j + 1] === '/')) j++;
      j = Math.min(len, j + 2);
      pushToken(code.slice(i, j), 'comment');
      i = j;
      continue;
    }
    if ((lang === 'python' || lang === 'bash' || lang === 'php') && ch === '#') {
      let j = i + 1;
      while (j < len && code[j] !== '\n') j++;
      pushToken(code.slice(i, j), 'comment');
      i = j;
      continue;
    }
    if (lang === 'sql' && ch === '-' && next === '-') {
      let j = i + 2;
      while (j < len && code[j] !== '\n') j++;
      pushToken(code.slice(i, j), 'comment');
      i = j;
      continue;
    }
    if (lang === 'html' && code.slice(i, i + 4) === '<!--') {
      const end = code.indexOf('-->', i + 4);
      const j = end === -1 ? len : end + 3;
      pushToken(code.slice(i, j), 'comment');
      i = j;
      continue;
    }

    // C/C++ preprocessor directives (#include, #define, etc.)
    if ((lang === 'c' || lang === 'cpp') && ch === '#') {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_]/.test(code[j])) j++;
      pushToken(code.slice(i, j), 'keyword');
      i = j;
      continue;
    }

    // Strings & template literals
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      let j = i + 1;
      while (j < len) {
        if (code[j] === '\\') {
          j += 2;
          continue;
        }
        if (code[j] === quote) {
          j++;
          break;
        }
        if (quote !== '`' && code[j] === '\n') break;
        j++;
      }
      pushToken(code.slice(i, j), 'string');
      i = j;
      continue;
    }

    // C/C++ #include <header.h>
    if ((lang === 'c' || lang === 'cpp') && ch === '<') {
      const lineStart = code.lastIndexOf('\n', i) + 1;
      const before = code.slice(lineStart, i);
      if (/^\s*#\s*include\s*$/.test(before)) {
        const closeIdx = code.indexOf('>', i + 1);
        const nlIdx = code.indexOf('\n', i + 1);
        if (closeIdx !== -1 && (nlIdx === -1 || closeIdx < nlIdx)) {
          pushToken(code.slice(i, closeIdx + 1), 'string');
          i = closeIdx + 1;
          continue;
        }
      }
    }

    // Numbers
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(next))) {
      let j = i + 1;
      while (j < len && /[0-9a-fA-FxXbBoO._uUlLfF]/.test(code[j])) j++;
      pushToken(code.slice(i, j), 'number');
      i = j;
      continue;
    }

    // Identifiers, Keywords, Types, Functions, Variables
    if (/[a-zA-Z_$@]/.test(ch)) {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_$]/.test(code[j])) j++;
      const word = code.slice(i, j);

      // Look ahead for '(' to detect function calls/declarations
      let k = j;
      while (k < len && (code[k] === ' ' || code[k] === '\t')) k++;
      const followedByParen = code[k] === '(';

      if (lang === 'json') {
        const rest = code.slice(j).trimStart();
        if (word === 'true' || word === 'false' || word === 'null') {
          pushToken(word, 'keyword');
        } else {
          pushToken(word, rest.startsWith(':') ? 'function' : 'variable');
        }
      } else if (
        KEYWORDS_BY_LANG.common.has(word) ||
        (lang === 'sql' && KEYWORDS_BY_LANG.sql.has(word.toUpperCase()))
      ) {
        pushToken(word, 'keyword');
      } else if (BUILTIN_TYPES.has(word) || /^[A-Z][a-zA-Z0-9_]*$/.test(word)) {
        // Uppercase constants vs PascalCase types
        if (/^[A-Z0-9_]{2,}$/.test(word)) {
          pushToken(word, followedByParen ? 'function' : 'number');
        } else {
          pushToken(word, followedByParen ? 'function' : 'type');
        }
      } else if (followedByParen) {
        pushToken(word, 'function');
      } else {
        pushToken(word, 'variable');
      }

      i = j;
      continue;
    }

    // HTML/XML tag brackets & CSS selectors
    if (lang === 'html' && (ch === '<' || ch === '>')) {
      pushToken(ch, 'operator');
      i++;
      continue;
    }

    // Operators & punctuation
    if (/[+\-*/%=!<>&|^~?:;.,()[\]{}]/.test(ch)) {
      pushToken(ch, 'operator');
      i++;
      continue;
    }

    pushToken(ch, 'plain');
    i++;
  }

  return tokens;
}

export function formatCodeSnippet(code: string, lang: CodeLanguage): string {
  const clean = code.replace(/\r\n/g, '\n').trim();
  if (!clean) return '';

  if (lang === 'json') {
    try {
      return JSON.stringify(JSON.parse(clean), null, 2);
    } catch {
      return clean;
    }
  }

  if (lang === 'sql') {
    let formatted = clean.replace(/[ \t]+/g, ' ');
    const sqlClauses = [
      'SELECT',
      'FROM',
      'WHERE',
      'INNER JOIN',
      'LEFT JOIN',
      'RIGHT JOIN',
      'JOIN',
      'GROUP BY',
      'ORDER BY',
      'HAVING',
      'LIMIT',
      'INSERT INTO',
      'VALUES',
      'UPDATE',
      'SET',
      'DELETE FROM',
    ];
    sqlClauses.forEach((kw) => {
      const re = new RegExp(`\\b${kw}\\b`, 'gi');
      formatted = formatted.replace(re, `\n${kw}`);
    });
    return formatted
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n');
  }

  if (lang === 'python' || lang === 'bash' || lang === 'plaintext') {
    const indentUnit = lang === 'python' ? '    ' : '  ';
    return clean
      .split('\n')
      .map((line) =>
        line
          .replace(/\t/g, indentUnit)
          .replace(/[ \t]+$/g, ''),
      )
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');
  }

  if (lang === 'html') {
    const rawLines = clean
      .replace(/>\s*</g, '>\n<')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    let level = 0;
    const voidTags = /^<(meta|link|img|br|hr|input|area|base|col|embed|source|track|wbr)\b/i;
    return rawLines
      .map((line) => {
        if (/^<\//.test(line)) {
          level = Math.max(0, level - 1);
        }
        const out = `${'  '.repeat(level)}${line}`;
        if (
          /^<[a-zA-Z]/.test(line) &&
          !voidTags.test(line) &&
          !/\/>$/.test(line) &&
          !/<\/[a-zA-Z][^>]*>$/.test(line)
        ) {
          level++;
        }
        return out;
      })
      .join('\n');
  }

  // Brace-based languages (C, C++, JS, TS, Java, C#, Go, Rust, PHP, CSS)
  const lines = clean.split('\n').map((l) => l.trim());
  let indent = 0;
  const result: string[] = [];

  for (const line of lines) {
    if (!line) {
      if (result[result.length - 1] !== '') {
        result.push('');
      }
      continue;
    }

    // Count braces outside strings/comments
    let netCloseLead = 0;
    if (line.startsWith('}') || line.startsWith(']') || line.startsWith(')')) {
      netCloseLead = 1;
    }
    const lineIndent = Math.max(0, indent - netCloseLead);
    result.push(`${'  '.repeat(lineIndent)}${line}`);

    let inStr: string | null = null;
    for (let idx = 0; idx < line.length; idx++) {
      const c = line[idx];
      const n = line[idx + 1] || '';
      if (!inStr && c === '/' && n === '/') break;
      if (inStr) {
        if (c === '\\') {
          idx++;
        } else if (c === inStr) {
          inStr = null;
        }
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        inStr = c;
        continue;
      }
      if (c === '{') indent++;
      else if (c === '}') indent = Math.max(0, indent - 1);
    }
  }

  return result.join('\n').trim();
}
