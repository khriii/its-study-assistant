export type ThemeMode = 'light' | 'dark' | 'system';

export type GeminiModelId = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';

export type AiResponseStyle = 'concise' | 'standard' | 'in-depth';
export type AiResponseLanguage = 'it' | 'en';
export type StudyDifficulty = 'basic' | 'intermediate' | 'exam';

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

export type ContainerLayoutMode = 'tabs' | 'vertical';

export type WindowHeaderLabelMode = 'always' | 'auto' | 'icons-only';

export interface PanelColumnGroup {
  panels: WindowId[];
  activeTab: WindowId;
  layout?: ContainerLayoutMode;
  width?: number;
  heights?: Record<string, number>;
}

export type LayoutPresetId =
  | 'studio-base'
  | 'lettura-slide'
  | 'ripasso-totale'
  | 'tutto-aperto'
  | 'solo-editor';

export interface PanelWindowActions {
  hideWindowHeader?: boolean;
  iconOnlyHeader?: boolean;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onClosePanel?: () => void;
  onToggleCollapseExplorer?: () => void;
  onSwitchToTabs?: () => void;
}

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
  aiResponseStyle?: AiResponseStyle;
  aiResponseLanguage?: AiResponseLanguage;
  defaultFlashcardCount?: number;
  defaultQuizCount?: number;
  studyDifficulty?: StudyDifficulty;
  autoShowQuizExplanations?: boolean;
  editorFontSize?: number;
  editorLineHeight?: number;
  currentSubjectId: string | null;
  activeNoteId: string | null;
  openTabs: string[];
  windowVisibility: Record<WindowId, boolean>;
  panelWidths: Record<Exclude<WindowId, 'left-panel'>, number>;
  panelOrder: WindowId[];
  panelColumns?: PanelColumnGroup[];
  collapsedExplorer?: boolean;
  activeLayoutPreset?: LayoutPresetId | null;
  windowHeaderLabelMode?: WindowHeaderLabelMode;
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

export interface AiAccessStatus {
  email: string;
  displayName: string;
  authorized: boolean;
  isAdmin: boolean;
  adminEmail: string;
  pending: boolean;
  rejected: boolean;
  smtpConfigured: boolean;
  rateLimitPerMin: number;
}

export interface AiPendingRequest {
  email: string;
  uid: string;
  displayName: string;
  note: string;
  requestedAt: string;
  lastEmailSentAt?: string;
}

export interface AiAdminAccessOverview {
  adminEmail: string;
  smtpConfigured: boolean;
  rateLimitPerMin: number;
  envAllowedEmails: string[];
  approvedEmails: string[];
  rejectedEmails: string[];
  pendingRequests: AiPendingRequest[];
  suggestedAllowedEnv: string;
}

export interface AiAccessRequestResult {
  ok: boolean;
  authorized: boolean;
  pending: boolean;
  emailSent: boolean;
  reason?: string;
  mailtoUrl?: string;
}

