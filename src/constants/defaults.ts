import type {
  AiResponseLanguage,
  AiResponseStyle,
  GeminiModelId,
  LayoutPresetId,
  PanelColumnGroup,
  StudyDifficulty,
  ThemeMode,
  WindowHeaderLabelMode,
  WindowId,
} from '../types';

export const APP_VERSION = 'v1.0.4';

export interface WindowConfigMeta {
  id: WindowId;
  label: string;
  shortLabel: string;
  colorClass: string;
}

export const WORKSPACE_WINDOWS: WindowConfigMeta[] = [
  { id: 'sidebar', label: 'Explorer', shortLabel: 'Explorer', colorClass: 'text-amber-500' },
  { id: 'pdf-viewer-panel', label: 'Slide Viewer', shortLabel: 'Slide', colorClass: 'text-red-500' },
  { id: 'left-panel', label: 'Editor', shortLabel: 'Editor', colorClass: 'text-blue-500' },
  { id: 'flashcards-panel', label: 'Flashcards', shortLabel: 'Card', colorClass: 'text-emerald-500' },
  { id: 'quiz-panel', label: 'Quiz', shortLabel: 'Quiz', colorClass: 'text-indigo-500' },
  { id: 'right-panel', label: 'AI Chat', shortLabel: 'AI Chat', colorClass: 'text-purple-500' },
];

export const DEFAULT_WINDOW_VISIBILITY: Record<WindowId, boolean> = {
  sidebar: true,
  'pdf-viewer-panel': false,
  'left-panel': true,
  'flashcards-panel': false,
  'quiz-panel': false,
  'right-panel': true,
};

export const DEFAULT_PANEL_WIDTHS: Record<Exclude<WindowId, 'left-panel'>, number> = {
  sidebar: 235,
  'pdf-viewer-panel': 350,
  'flashcards-panel': 300,
  'quiz-panel': 340,
  'right-panel': 330,
};

export const DEFAULT_PANEL_ORDER: WindowId[] = [
  'sidebar',
  'pdf-viewer-panel',
  'left-panel',
  'flashcards-panel',
  'quiz-panel',
  'right-panel',
];

export const DEFAULT_PANEL_COLUMNS: PanelColumnGroup[] = [
  { panels: ['sidebar'], activeTab: 'sidebar' },
  { panels: ['pdf-viewer-panel'], activeTab: 'pdf-viewer-panel' },
  { panels: ['left-panel'], activeTab: 'left-panel' },
  {
    panels: ['right-panel', 'flashcards-panel', 'quiz-panel'],
    activeTab: 'right-panel',
  },
];

export interface LayoutPresetConfig {
  id: LayoutPresetId;
  label: string;
  description: string;
  windowVisibility: Record<WindowId, boolean>;
  panelColumns: PanelColumnGroup[];
  collapsedExplorer: boolean;
}

export const LAYOUT_PRESETS: LayoutPresetConfig[] = [
  {
    id: 'studio-base',
    label: 'Studio Base',
    description: 'Explorer · Editor · AI Chat',
    windowVisibility: {
      sidebar: true,
      'pdf-viewer-panel': false,
      'left-panel': true,
      'flashcards-panel': false,
      'quiz-panel': false,
      'right-panel': true,
    },
    panelColumns: DEFAULT_PANEL_COLUMNS,
    collapsedExplorer: false,
  },
  {
    id: 'lettura-slide',
    label: 'Lettura Slide',
    description: 'Explorer · Slide PDF · Editor',
    windowVisibility: {
      sidebar: true,
      'pdf-viewer-panel': true,
      'left-panel': true,
      'flashcards-panel': false,
      'quiz-panel': false,
      'right-panel': false,
    },
    panelColumns: DEFAULT_PANEL_COLUMNS,
    collapsedExplorer: false,
  },
  {
    id: 'ripasso-totale',
    label: 'Ripasso Totale',
    description: 'Editor · Schede impilate AI, Card, Quiz',
    windowVisibility: {
      sidebar: true,
      'pdf-viewer-panel': false,
      'left-panel': true,
      'flashcards-panel': true,
      'quiz-panel': true,
      'right-panel': true,
    },
    panelColumns: DEFAULT_PANEL_COLUMNS,
    collapsedExplorer: true,
  },
  {
    id: 'tutto-aperto',
    label: 'Tutto Aperto (6)',
    description: 'Tutte e 6 le finestre accessibili',
    windowVisibility: {
      sidebar: true,
      'pdf-viewer-panel': true,
      'left-panel': true,
      'flashcards-panel': true,
      'quiz-panel': true,
      'right-panel': true,
    },
    panelColumns: DEFAULT_PANEL_COLUMNS,
    collapsedExplorer: false,
  },
  {
    id: 'solo-editor',
    label: 'Focus Scrittura',
    description: 'Explorer ridotto · Editor ampio',
    windowVisibility: {
      sidebar: true,
      'pdf-viewer-panel': false,
      'left-panel': true,
      'flashcards-panel': false,
      'quiz-panel': false,
      'right-panel': false,
    },
    panelColumns: DEFAULT_PANEL_COLUMNS,
    collapsedExplorer: true,
  },
];

export const DEFAULT_THEME_MODE: ThemeMode = 'system';
export const DEFAULT_GEMINI_MODEL: GeminiModelId = 'gemini-4-hydrogen';

export const DEFAULT_AI_RESPONSE_STYLE: AiResponseStyle = 'standard';
export const DEFAULT_AI_RESPONSE_LANGUAGE: AiResponseLanguage = 'it';
export const DEFAULT_FLASHCARD_COUNT = 6;
export const DEFAULT_QUIZ_COUNT = 5;
export const DEFAULT_STUDY_DIFFICULTY: StudyDifficulty = 'intermediate';
export const DEFAULT_AUTO_SHOW_EXPLANATIONS = true;
export const DEFAULT_EDITOR_FONT_SIZE = 14;
export const DEFAULT_EDITOR_LINE_HEIGHT = 1.65;
export const DEFAULT_WINDOW_HEADER_LABEL_MODE: WindowHeaderLabelMode = 'always';

export const WINDOW_HEADER_LABEL_OPTIONS: {
  value: WindowHeaderLabelMode;
  label: string;
  description: string;
}[] = [
  { value: 'always', label: 'Mostra sempre', description: 'Icona + nome' },
  { value: 'auto', label: 'Solo se impilate', description: 'Solo icona in gruppo' },
  { value: 'icons-only', label: 'Solo icone', description: 'Sempre compatto' },
];

export const GEMINI_MODEL_OPTIONS: { value: GeminiModelId; label: string; badge: string }[] = [
  {
    value: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen (gemini-4-hydrogen) — Bilanciato & Ragionamento',
    badge: 'Consigliato',
  },
  {
    value: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite (gemini-3.1-flash-lite) — Ultra-veloce & Leggero',
    badge: 'Rapido',
  },
];

export const AI_RESPONSE_STYLE_OPTIONS: {
  value: AiResponseStyle;
  label: string;
  description: string;
}[] = [
  { value: 'concise', label: 'Sintetico', description: 'A punti essenziali' },
  { value: 'standard', label: 'Didattico', description: 'Chiaro e bilanciato' },
  { value: 'in-depth', label: 'Approfondito', description: 'Dettagliato con esempi' },
];

export const AI_RESPONSE_LANGUAGE_OPTIONS: { value: AiResponseLanguage; label: string }[] = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'Inglese tecnico' },
];

export const STUDY_DIFFICULTY_OPTIONS: { value: StudyDifficulty; label: string }[] = [
  { value: 'basic', label: 'Base' },
  { value: 'intermediate', label: 'Intermedio' },
  { value: 'exam', label: 'Esame' },
];

export const EDITOR_LINE_HEIGHT_OPTIONS: { value: number; label: string }[] = [
  { value: 1.45, label: 'Compatta (1.45)' },
  { value: 1.65, label: 'Standard (1.65)' },
  { value: 1.9, label: 'Ampia (1.90)' },
];

export const HIGHLIGHT_SWATCHES: { color: string; label: string; border: string }[] = [
  { color: '#fef08a', label: 'Giallo', border: 'border-amber-300' },
  { color: '#bbf7d0', label: 'Verde', border: 'border-green-300' },
  { color: '#bae6fd', label: 'Azzurro', border: 'border-blue-300' },
  { color: '#fbcfe8', label: 'Rosa', border: 'border-pink-300' },
  { color: '#fed7aa', label: 'Arancione', border: 'border-orange-300' },
  { color: '#e9d5ff', label: 'Viola', border: 'border-purple-300' },
];

export interface PresetColorOption {
  color: string;
  label: string;
}

export const PRESET_ACCENT_COLORS: PresetColorOption[] = [
  { color: '#3b82f6', label: 'Blu' },
  { color: '#6366f1', label: 'Indaco' },
  { color: '#8b5cf6', label: 'Viola' },
  { color: '#d946ef', label: 'Fucsia' },
  { color: '#ec4899', label: 'Rosa' },
  { color: '#ef4444', label: 'Rosso' },
  { color: '#f97316', label: 'Arancione' },
  { color: '#f59e0b', label: 'Ambra' },
  { color: '#10b981', label: 'Smeraldo' },
  { color: '#22c55e', label: 'Verde' },
  { color: '#14b8a6', label: 'Teal' },
  { color: '#06b6d4', label: 'Ciano' },
];

export const PRESET_TEXT_COLORS: PresetColorOption[] = [
  { color: '#2563eb', label: 'Blu' },
  { color: '#7c3aed', label: 'Viola' },
  { color: '#db2777', label: 'Rosa' },
  { color: '#dc2626', label: 'Rosso' },
  { color: '#ea580c', label: 'Arancione' },
  { color: '#d97706', label: 'Ambra' },
  { color: '#16a34a', label: 'Verde' },
  { color: '#0d9488', label: 'Teal' },
  { color: '#0891b2', label: 'Ciano' },
  { color: '#475569', label: 'Grigio Ardesia' },
  { color: '#ffffff', label: 'Bianco' },
  { color: '#0f172a', label: 'Nero Inchiostro' },
];

export const PRESET_CODE_COLORS: PresetColorOption[] = [
  { color: '#c678dd', label: 'Viola Sintassi' },
  { color: '#61afef', label: 'Blu Funzioni' },
  { color: '#e06c75', label: 'Corallo Variabili' },
  { color: '#e5c07b', label: 'Oro Tipi' },
  { color: '#98c379', label: 'Verde Stringhe' },
  { color: '#d19a66', label: 'Arancione Numeri' },
  { color: '#7f848e', label: 'Grigio Commenti' },
  { color: '#56b6c2', label: 'Ciano Operatori' },
  { color: '#f472b6', label: 'Rosa' },
  { color: '#a78bfa', label: 'Lavanda' },
  { color: '#38bdf8', label: 'Celeste' },
  { color: '#4ade80', label: 'Verde Lime' },
  { color: '#facc15', label: 'Giallo Vivo' },
  { color: '#e4e4e7', label: 'Bianco Ghiaccio' },
];

export const CODE_LANGUAGES = [
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'java', label: 'Java' },
  { id: 'csharp', label: 'C#' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'php', label: 'PHP' },
  { id: 'sql', label: 'SQL' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'bash', label: 'Bash' },
  { id: 'json', label: 'JSON' },
  { id: 'plaintext', label: 'Testo' },
] as const;

export const DEFAULT_SUBJECT_NAME = 'Programmazione C';
export const DEFAULT_SUBJECT_COLOR = '#3b82f6';
export const DEFAULT_SUBJECT_PROMPT =
  'Sei un tutor esperto per studenti ITS specializzato in Programmazione C, puntatori, gestione memoria e algoritmi.';

export const INITIAL_SAMPLE_NOTE_TITLE = 'Guida & Showcase Programmazione C';
export const INITIAL_SAMPLE_NOTE_HTML = `
<h1>Introduzione alla Programmazione in C</h1>
<p>Benvenuto nel tuo <strong>ITS Study Assistant</strong>! Questa nota introduttiva mostra in azione tutti gli strumenti disponibili nella barra superiore dell'editor.</p>

<h2>1. Formattazione del Testo ed Evidenziatori</h2>
<p>Puoi combinare <strong>grassetto</strong>, <em>corsivo</em>, <u>sottolineato</u> e <span style="color: #3b82f6;">colori personalizzati</span> per strutturare al meglio i tuoi appunti di lezione.</p>
<p>Usa la palette evidenziatore per mettere in risalto concetti chiave con 6 tonalità:
  <span style="background-color: #fef08a; color: #0f172a; padding: 0 4px; border-radius: 3px;">Giallo</span>,
  <span style="background-color: #bbf7d0; color: #0f172a; padding: 0 4px; border-radius: 3px;">Verde</span>,
  <span style="background-color: #bae6fd; color: #0f172a; padding: 0 4px; border-radius: 3px;">Azzurro</span>,
  <span style="background-color: #fbcfe8; color: #0f172a; padding: 0 4px; border-radius: 3px;">Rosa</span>,
  <span style="background-color: #fed7aa; color: #0f172a; padding: 0 4px; border-radius: 3px;">Arancione</span> e
  <span style="background-color: #e9d5ff; color: #0f172a; padding: 0 4px; border-radius: 3px;">Viola</span>.
</p>

<h3>2. Elenchi Puntati, Numerati e Blocchi Codice</h3>
<ul>
  <li><strong>Gestione manuale della memoria:</strong> allocazione sullo stack e sull'heap (<code>malloc</code>, <code>calloc</code>, <code>free</code>).</li>
  <li><strong>Puntatori e indirizzi:</strong> accesso diretto alle celle di memoria tramite operatori <code>&amp;</code> e <code>*</code>.</li>
  <li><strong>Compilazione nativa:</strong> preprocessing, compilazione, assemblaggio e linking.</li>
</ul>
<ol>
  <li>Analisi del problema e definizione delle strutture dati.</li>
  <li>Scrittura del codice sorgente (<code>.c</code>) e degli header (<code>.h</code>).</li>
  <li>Compilazione con flag di controllo (<code>-Wall -Wextra</code>) e debug.</li>
</ol>

<pre class="its-code-block"><code>#include &lt;stdio.h&gt;
#include &lt;stdlib.h&gt;

int main(void) {
    int *ptr = malloc(sizeof(int));
    if (!ptr) return 1;
    *ptr = 42;
    printf("Valore allocato: %d\\n", *ptr);
    free(ptr);
    ptr = NULL;
    return 0;
}</code></pre>

<div class="its-callout">
  <strong>Nota in Evidenza (Callout):</strong> Ricorda di liberare sempre la memoria allocata dinamicamente con <code>free(ptr)</code> e di impostare il puntatore a <code>NULL</code> per evitare <em>dangling pointers</em> e <em>memory leak</em>.
</div>

<h3>3. Tabella Riepilogativa Tipi di Dato in C</h3>
<table class="its-table">
  <thead>
    <tr>
      <th>Tipo C</th>
      <th>Dimensione Tipica</th>
      <th>Specificatore <code>printf</code></th>
      <th>Utilizzo Principale</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>char</code></td>
      <td>1 byte (8 bit)</td>
      <td><code>%c</code></td>
      <td>Caratteri ASCII e piccoli interi</td>
    </tr>
    <tr>
      <td><code>int</code></td>
      <td>4 byte (32 bit)</td>
      <td><code>%d</code></td>
      <td>Numeri interi con segno</td>
    </tr>
    <tr>
      <td><code>float</code></td>
      <td>4 byte (32 bit)</td>
      <td><code>%f</code></td>
      <td>Virgola mobile a singola precisione</td>
    </tr>
    <tr>
      <td><code>double</code></td>
      <td>8 byte (64 bit)</td>
      <td><code>%lf</code></td>
      <td>Virgola mobile a doppia precisione</td>
    </tr>
  </tbody>
</table>
<p>Seleziona qualsiasi frase e fai <strong>clic destro</strong> per evidenziarla rapidamente o chiedere spiegazioni all'<strong>AI Chat</strong>!</p>
`.trim();
