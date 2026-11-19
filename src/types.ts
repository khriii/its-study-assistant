export type ThemeMode = 'light' | 'dark' | 'system';

export type GeminiModelId = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';

export type WindowId =
  | 'sidebar'
  | 'pdf-viewer-panel'
  | 'left-panel'
  | 'flashcards-panel'
  | 'quiz-panel'
  | 'right-panel';

export type MobilePanelId =
  | 'left-panel'
  | 'pdf-viewer-panel'
  | 'flashcards-panel'
  | 'quiz-panel'
  | 'right-panel';

export interface Subject {
  id: string;
  userId: string;
  name: string;
  color: string;
  systemPrompt: string;
  order: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Folder {
  id: string;
  userId: string;
  subjectId: string;
  name: string;
  isOpen: boolean;
  order: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Note {
  id: string;
  userId: string;
  subjectId: string;
  folderId: string | null;
  title: string;
  content: string;
  order: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Flashcard {
  id: string;
  userId: string;
  subjectId: string;
  noteId: string;
  question: string;
  answer: string;
  order: number;
  createdAt?: unknown;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface Quiz {
  id: string;
  userId: string;
  subjectId: string;
  noteId: string;
  noteTitle: string;
  status: 'active' | 'completed';
  questions: QuizQuestion[];
  userAnswers: Record<string, number>;
  score: number;
  total: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  completedAt?: unknown;
}

export interface WorkspacePreferences {
  userId: string;
  themeMode: ThemeMode;
  geminiModel: GeminiModelId;
  currentSubjectId: string | null;
  activeNoteId: string | null;
  openTabs: string[];
  windowVisibility: Record<WindowId, boolean>;
  panelWidths: Record<Exclude<WindowId, 'left-panel'>, number>;
  panelOrder: WindowId[];
  updatedAt?: unknown;
}

export type StudyFileExt = 'pdf' | 'docx' | 'pptx';

export interface StudyFile {
  id: string;
  userId: string;
  subjectId: string;
  folderId: string | null;
  name: string;
  mimeType: string;
  fileExt: StudyFileExt;
  size: number;
  totalChunks: number;
  extractedText: string;
  order: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatAttachment {
  name: string;
  type: string;
  isImage: boolean;
  data?: string;
  textData?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'error';
  text: string;
  displayLabel?: string;
  attachments?: { name: string; isImage: boolean }[];
}

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}
