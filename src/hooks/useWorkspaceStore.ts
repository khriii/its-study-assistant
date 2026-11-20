import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  DEFAULT_AI_RESPONSE_LANGUAGE,
  DEFAULT_AI_RESPONSE_STYLE,
  DEFAULT_AUTO_SHOW_EXPLANATIONS,
  DEFAULT_EDITOR_FONT_SIZE,
  DEFAULT_EDITOR_LINE_HEIGHT,
  DEFAULT_FLASHCARD_COUNT,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_PANEL_COLUMNS,
  DEFAULT_PANEL_ORDER,
  DEFAULT_PANEL_WIDTHS,
  DEFAULT_QUIZ_COUNT,
  DEFAULT_STUDY_DIFFICULTY,
  DEFAULT_SUBJECT_COLOR,
  DEFAULT_SUBJECT_NAME,
  DEFAULT_SUBJECT_PROMPT,
  DEFAULT_THEME_MODE,
  DEFAULT_WINDOW_HEADER_LABEL_MODE,
  DEFAULT_WINDOW_VISIBILITY,
  INITIAL_SAMPLE_NOTE_HTML,
  INITIAL_SAMPLE_NOTE_TITLE,
  LAYOUT_PRESETS,
} from '../constants/defaults';
import {
  arrayBufferToBase64,
  extractDocumentPreview,
  getMimeTypeForExt,
  getStudyFileExt,
} from '../utils/documentParser';
import {
  DEFAULT_CODE_COLOR_SCHEME,
  loadSavedCodeColors,
  saveCodeColors,
  type CodeColorScheme,
} from '../utils/codeSyntax';
import {
  ADMIN_EMAIL_ADDRESS,
  fetchAiAccessStatus,
  requestAiAccessApi,
  subscribeAdminPendingRequests,
  verifyAndSyncDecisionTokenApi,
} from '../utils/aiApi';
import type {
  AiAccessRequestResult,
  AiAccessStatus,
  AiPendingRequest,
  AiResponseLanguage,
  AiResponseStyle,
  Flashcard,
  Folder,
  GeminiModelId,
  LayoutPresetId,
  Note,
  PanelColumnGroup,
  Quiz,
  QuizQuestion,
  StudyDifficulty,
  StudyFile,
  Subject,
  ThemeMode,
  ToastItem,
  WindowHeaderLabelMode,
  WindowId,
  WorkspacePreferences,
} from '../types';

const ALL_WINDOW_IDS: WindowId[] = [
  'sidebar',
  'pdf-viewer-panel',
  'left-panel',
  'flashcards-panel',
  'quiz-panel',
  'right-panel',
];

function isValidWindowId(val: unknown): val is WindowId {
  return typeof val === 'string' && ALL_WINDOW_IDS.includes(val as WindowId);
}

export function normalizePanelColumns(raw?: unknown): PanelColumnGroup[] {
  const seen = new Set<WindowId>();
  const groups: PanelColumnGroup[] = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const typed = item as PanelColumnGroup;
      const candidatePanels = Array.isArray(typed.panels)
        ? typed.panels.filter((id): id is WindowId => isValidWindowId(id) && !seen.has(id))
        : [];
      if (candidatePanels.length === 0) continue;
      candidatePanels.forEach((id) => seen.add(id));
      const rawActive = typed.activeTab;
      const activeTab = isValidWindowId(rawActive) && candidatePanels.includes(rawActive)
        ? rawActive
        : candidatePanels[0];

      const group: PanelColumnGroup = { panels: candidatePanels, activeTab };
      if (typed.layout === 'vertical' || typed.layout === 'tabs') {
        group.layout = typed.layout;
      }
      if (typeof typed.width === 'number' && Number.isFinite(typed.width)) {
        group.width = Math.max(180, Math.min(900, Math.round(typed.width)));
      }
      if (typed.heights && typeof typed.heights === 'object') {
        const cleanHeights: Record<string, number> = {};
        let hasAny = false;
        for (const pId of candidatePanels) {
          const val = (typed.heights as Record<string, unknown>)[pId];
          if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
            cleanHeights[pId] = Math.round(val * 100) / 100;
            hasAny = true;
          }
        }
        if (hasAny) group.heights = cleanHeights;
      }
      groups.push(group);
    }
  }

  for (const id of ALL_WINDOW_IDS) {
    if (!seen.has(id)) {
      seen.add(id);
      groups.push({ panels: [id], activeTab: id });
    }
  }

  return groups;
}

function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function sanitizeHexColor(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_SUBJECT_COLOR;
}

function timestampToMillis(ts: unknown): number {
  if (ts && typeof ts === 'object' && 'toMillis' in ts) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export function useWorkspaceStore() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [dataLoading, setDataLoading] = useState<boolean>(false);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [studyFiles, setStudyFiles] = useState<StudyFile[]>([]);

  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('its_theme_mode');
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    return DEFAULT_THEME_MODE;
  });
  const [geminiModel, setGeminiModelState] = useState<GeminiModelId>(DEFAULT_GEMINI_MODEL);
  const [aiResponseStyle, setAiResponseStyleState] = useState<AiResponseStyle>(DEFAULT_AI_RESPONSE_STYLE);
  const [aiResponseLanguage, setAiResponseLanguageState] = useState<AiResponseLanguage>(
    DEFAULT_AI_RESPONSE_LANGUAGE,
  );
  const [defaultFlashcardCount, setDefaultFlashcardCountState] = useState<number>(
    DEFAULT_FLASHCARD_COUNT,
  );
  const [defaultQuizCount, setDefaultQuizCountState] = useState<number>(DEFAULT_QUIZ_COUNT);
  const [studyDifficulty, setStudyDifficultyState] = useState<StudyDifficulty>(
    DEFAULT_STUDY_DIFFICULTY,
  );
  const [autoShowQuizExplanations, setAutoShowQuizExplanationsState] = useState<boolean>(
    DEFAULT_AUTO_SHOW_EXPLANATIONS,
  );
  const [editorFontSize, setEditorFontSizeState] = useState<number>(DEFAULT_EDITOR_FONT_SIZE);
  const [editorLineHeight, setEditorLineHeightState] = useState<number>(DEFAULT_EDITOR_LINE_HEIGHT);
  const [currentSubjectId, setCurrentSubjectIdState] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteIdState] = useState<string | null>(null);
  const [openTabs, setOpenTabsState] = useState<string[]>([]);
  const [windowVisibility, setWindowVisibilityState] = useState<Record<WindowId, boolean>>(
    DEFAULT_WINDOW_VISIBILITY,
  );
  const [panelWidths, setPanelWidthsState] = useState<Record<Exclude<WindowId, 'left-panel'>, number>>(
    DEFAULT_PANEL_WIDTHS,
  );
  const [panelOrder, setPanelOrderState] = useState<WindowId[]>(DEFAULT_PANEL_ORDER);
  const [panelColumns, setPanelColumnsState] = useState<PanelColumnGroup[]>(DEFAULT_PANEL_COLUMNS);
  const [collapsedExplorer, setCollapsedExplorerState] = useState<boolean>(false);
  const [activeLayoutPreset, setActiveLayoutPresetState] = useState<LayoutPresetId | null>('studio-base');
  const [windowHeaderLabelMode, setWindowHeaderLabelModeState] = useState<WindowHeaderLabelMode>(
    DEFAULT_WINDOW_HEADER_LABEL_MODE,
  );
  const [aiAccessStatus, setAiAccessStatus] = useState<AiAccessStatus | null>(null);
  const [aiAccessLoading, setAiAccessLoading] = useState<boolean>(false);
  const [pendingAdminRequests, setPendingAdminRequests] = useState<AiPendingRequest[]>([]);

  const [saveStatus, setSaveStatus] = useState<'Salvato' | 'Salvataggio...'>('Salvato');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [hasLegacyBackup, setHasLegacyBackup] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('its_notes');
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  });

  const bootstrapDoneRef = useRef<string | null>(null);
  const noteSaveTimerRef = useRef<number | null>(null);
  const pendingSaveNoteIdRef = useRef<string | null>(null);
  const studyFileCacheRef = useRef<Map<string, string>>(new Map());
  const decisionTokenProcessedRef = useRef<boolean>(false);

  if (fatalError) {
    throw fatalError;
  }

  const showToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = makeSafeId('toast');
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  // Apply theme class to document.documentElement
  useEffect(() => {
    localStorage.setItem('its_theme_mode', themeMode);
    const apply = () => {
      const isDark =
        themeMode === 'dark' ||
        (themeMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', isDark);
    };
    apply();
    if (themeMode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
    return undefined;
  }, [themeMode]);

  const refreshAiAccess = useCallback(async () => {
    if (!auth.currentUser) {
      setAiAccessStatus(null);
      return;
    }
    setAiAccessLoading(true);
    try {
      const status = await fetchAiAccessStatus();
      setAiAccessStatus(status);
    } catch {
      // Static host or transient error: avoid disrupting workspace
    } finally {
      setAiAccessLoading(false);
    }
  }, []);

  const requestAiAccess = useCallback(
    async (note = ''): Promise<AiAccessRequestResult> => {
      const result = await requestAiAccessApi(note);
      await refreshAiAccess();
      if (result.authorized) {
        showToast('Il tuo account è già autorizzato per usare Gemini AI.', 'success');
      } else if (result.emailSent) {
        showToast('Richiesta inviata via email all\'amministratore!', 'success');
      } else {
        showToast(
          'Richiesta registrata sul server. Usa il pulsante email se vuoi avvisare subito l\'amministratore.',
          'info',
        );
      }
      return result;
    },
    [refreshAiAccess, showToast],
  );

  const isAiAdmin = (user?.email || '').trim().toLowerCase() === ADMIN_EMAIL_ADDRESS;

  // Real-time Firestore listener for Admin pending AI access requests across all environments
  useEffect(() => {
    if (!user || !isAiAdmin) {
      setPendingAdminRequests([]);
      return undefined;
    }
    let initialized = false;
    let knownEmails = new Set<string>();
    const unsub = subscribeAdminPendingRequests((requests) => {
      if (initialized) {
        const newlyAdded = requests.filter((r) => !knownEmails.has(r.email));
        if (newlyAdded.length > 0) {
          showToast(
            `Nuova richiesta accesso AI da ${newlyAdded[0].email} (apri Impostazioni per approvare).`,
            'info',
          );
        }
      }
      initialized = true;
      knownEmails = new Set(requests.map((r) => r.email));
      setPendingAdminRequests(requests);
    });
    return () => unsub();
  }, [user, isAiAdmin, showToast]);

  // Sync email decision token (?aiDecisionToken=...) into Firestore when Admin opens the link
  useEffect(() => {
    if (!user || !isAiAdmin || decisionTokenProcessedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('aiDecisionToken');
    if (!token) return;

    decisionTokenProcessedRef.current = true;
    params.delete('aiDecisionToken');
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);

    void (async () => {
      try {
        const result = await verifyAndSyncDecisionTokenApi(token);
        showToast(
          result.action === 'approve'
            ? `Accesso AI per ${result.email} sincronizzato su Cloud Firestore!`
            : `Rifiuto per ${result.email} sincronizzato su Cloud Firestore.`,
          result.action === 'approve' ? 'success' : 'info',
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Token email non valido o scaduto.';
        showToast(`Sincronizzazione decisione email fallita: ${msg}`, 'error');
      }
    })();
  }, [user, isAiAdmin, showToast]);

  // Auto-refresh pending user's AI access when returning to the tab
  useEffect(() => {
    if (!user || !aiAccessStatus || aiAccessStatus.authorized || !aiAccessStatus.pending) {
      return undefined;
    }
    const handleFocus = () => {
      void refreshAiAccess();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, aiAccessStatus, refreshAiAccess]);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
      if (!firebaseUser) {
        if (noteSaveTimerRef.current) {
          window.clearTimeout(noteSaveTimerRef.current);
          noteSaveTimerRef.current = null;
          pendingSaveNoteIdRef.current = null;
        }
        bootstrapDoneRef.current = null;
        studyFileCacheRef.current.clear();
        setSubjects([]);
        setFolders([]);
        setNotes([]);
        setFlashcards([]);
        setQuizzes([]);
        setStudyFiles([]);
        setCurrentSubjectIdState(null);
        setActiveNoteIdState(null);
        setOpenTabsState([]);
        setAiAccessStatus(null);
        setPendingAdminRequests([]);
      } else {
        void refreshAiAccess();
      }
    });
    return () => unsub();
  }, [refreshAiAccess]);

  // Bootstrap user profile & starter data on first login
  useEffect(() => {
    if (!user) return;
    if (bootstrapDoneRef.current === user.uid) return;

    let cancelled = false;
    const uid = user.uid;

    async function bootstrapUserWorkspace() {
      setDataLoading(true);
      try {
        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid,
            displayName: (user?.displayName?.trim() || 'Studente ITS').slice(0, 120),
            email: (user?.email?.trim() || 'studente@its.local').slice(0, 254),
            photoURL: (user?.photoURL || '').slice(0, 500),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        const subjectsSnap = await getDocs(
          query(collection(db, 'users', uid, 'subjects'), where('userId', '==', uid)),
        );
        const prefRef = doc(db, 'users', uid, 'preferences', 'workspace');
        const prefSnap = await getDoc(prefRef);

        if (subjectsSnap.empty) {
          const batch = writeBatch(db);
          const subId = makeSafeId('sub');
          const noteId = makeSafeId('note');

          batch.set(doc(db, 'users', uid, 'subjects', subId), {
            id: subId,
            userId: uid,
            name: DEFAULT_SUBJECT_NAME,
            color: DEFAULT_SUBJECT_COLOR,
            systemPrompt: DEFAULT_SUBJECT_PROMPT,
            order: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          batch.set(doc(db, 'users', uid, 'notes', noteId), {
            id: noteId,
            userId: uid,
            subjectId: subId,
            folderId: null,
            title: INITIAL_SAMPLE_NOTE_TITLE,
            content: INITIAL_SAMPLE_NOTE_HTML,
            order: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          batch.set(prefRef, {
            userId: uid,
            themeMode,
            geminiModel: DEFAULT_GEMINI_MODEL,
            aiResponseStyle: DEFAULT_AI_RESPONSE_STYLE,
            aiResponseLanguage: DEFAULT_AI_RESPONSE_LANGUAGE,
            defaultFlashcardCount: DEFAULT_FLASHCARD_COUNT,
            defaultQuizCount: DEFAULT_QUIZ_COUNT,
            studyDifficulty: DEFAULT_STUDY_DIFFICULTY,
            autoShowQuizExplanations: DEFAULT_AUTO_SHOW_EXPLANATIONS,
            editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
            editorLineHeight: DEFAULT_EDITOR_LINE_HEIGHT,
            currentSubjectId: subId,
            activeNoteId: noteId,
            openTabs: [noteId],
            windowVisibility: DEFAULT_WINDOW_VISIBILITY,
            panelWidths: DEFAULT_PANEL_WIDTHS,
            panelOrder: DEFAULT_PANEL_ORDER,
            panelColumns: DEFAULT_PANEL_COLUMNS,
            collapsedExplorer: false,
            activeLayoutPreset: 'studio-base',
            windowHeaderLabelMode: DEFAULT_WINDOW_HEADER_LABEL_MODE,
            updatedAt: serverTimestamp(),
          });

          await batch.commit();
        } else if (!prefSnap.exists()) {
          const firstSubId = subjectsSnap.docs[0].id;
          await setDoc(prefRef, {
            userId: uid,
            themeMode,
            geminiModel: DEFAULT_GEMINI_MODEL,
            aiResponseStyle: DEFAULT_AI_RESPONSE_STYLE,
            aiResponseLanguage: DEFAULT_AI_RESPONSE_LANGUAGE,
            defaultFlashcardCount: DEFAULT_FLASHCARD_COUNT,
            defaultQuizCount: DEFAULT_QUIZ_COUNT,
            studyDifficulty: DEFAULT_STUDY_DIFFICULTY,
            autoShowQuizExplanations: DEFAULT_AUTO_SHOW_EXPLANATIONS,
            editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
            editorLineHeight: DEFAULT_EDITOR_LINE_HEIGHT,
            currentSubjectId: firstSubId,
            activeNoteId: null,
            openTabs: [],
            windowVisibility: DEFAULT_WINDOW_VISIBILITY,
            panelWidths: DEFAULT_PANEL_WIDTHS,
            panelOrder: DEFAULT_PANEL_ORDER,
            panelColumns: DEFAULT_PANEL_COLUMNS,
            collapsedExplorer: false,
            activeLayoutPreset: 'studio-base',
            windowHeaderLabelMode: DEFAULT_WINDOW_HEADER_LABEL_MODE,
            updatedAt: serverTimestamp(),
          });
        }

        if (!cancelled) {
          bootstrapDoneRef.current = uid;
        }
      } catch (err) {
        if (!cancelled) {
          try {
            handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
          } catch (wrapped) {
            setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
          }
        }
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }

    void bootstrapUserWorkspace();
    return () => {
      cancelled = true;
    };
  }, [user, themeMode]);

  // Real-time Firestore listeners (only after user authenticated)
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;

    const handleSnapError = (path: string) => (error: unknown) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    };

    const unsubPrefs = onSnapshot(
      doc(db, 'users', uid, 'preferences', 'workspace'),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as WorkspacePreferences;
        if (data.themeMode) setThemeModeState(data.themeMode);
        if (data.geminiModel) setGeminiModelState(data.geminiModel);
        if (
          data.aiResponseStyle === 'concise' ||
          data.aiResponseStyle === 'standard' ||
          data.aiResponseStyle === 'in-depth'
        ) {
          setAiResponseStyleState(data.aiResponseStyle);
        }
        if (data.aiResponseLanguage === 'it' || data.aiResponseLanguage === 'en') {
          setAiResponseLanguageState(data.aiResponseLanguage);
        }
        if (
          typeof data.defaultFlashcardCount === 'number' &&
          Number.isFinite(data.defaultFlashcardCount)
        ) {
          setDefaultFlashcardCountState(
            Math.max(3, Math.min(10, Math.round(data.defaultFlashcardCount))),
          );
        }
        if (typeof data.defaultQuizCount === 'number' && Number.isFinite(data.defaultQuizCount)) {
          setDefaultQuizCountState(Math.max(1, Math.min(20, Math.round(data.defaultQuizCount))));
        }
        if (
          data.studyDifficulty === 'basic' ||
          data.studyDifficulty === 'intermediate' ||
          data.studyDifficulty === 'exam'
        ) {
          setStudyDifficultyState(data.studyDifficulty);
        }
        if (typeof data.autoShowQuizExplanations === 'boolean') {
          setAutoShowQuizExplanationsState(data.autoShowQuizExplanations);
        }
        if (typeof data.editorFontSize === 'number' && Number.isFinite(data.editorFontSize)) {
          setEditorFontSizeState(Math.max(13, Math.min(18, Math.round(data.editorFontSize))));
        }
        if (typeof data.editorLineHeight === 'number' && Number.isFinite(data.editorLineHeight)) {
          setEditorLineHeightState(
            Math.max(1.2, Math.min(2.4, Math.round(data.editorLineHeight * 100) / 100)),
          );
        }
        if (data.currentSubjectId !== undefined) setCurrentSubjectIdState(data.currentSubjectId);
        if (data.activeNoteId !== undefined) setActiveNoteIdState(data.activeNoteId);
        if (Array.isArray(data.openTabs)) setOpenTabsState(data.openTabs);
        if (data.windowVisibility) {
          setWindowVisibilityState({ ...DEFAULT_WINDOW_VISIBILITY, ...data.windowVisibility });
        }
        if (data.panelWidths) {
          setPanelWidthsState({ ...DEFAULT_PANEL_WIDTHS, ...data.panelWidths });
        }
        if (Array.isArray(data.panelOrder) && data.panelOrder.length === 6) {
          setPanelOrderState(data.panelOrder);
        }
        if (Array.isArray(data.panelColumns) && data.panelColumns.length > 0) {
          setPanelColumnsState(normalizePanelColumns(data.panelColumns));
        }
        if (typeof data.collapsedExplorer === 'boolean') {
          setCollapsedExplorerState(data.collapsedExplorer);
        }
        if (data.activeLayoutPreset !== undefined) {
          setActiveLayoutPresetState(data.activeLayoutPreset ?? null);
        }
        if (
          data.windowHeaderLabelMode === 'always' ||
          data.windowHeaderLabelMode === 'auto' ||
          data.windowHeaderLabelMode === 'icons-only'
        ) {
          setWindowHeaderLabelModeState(data.windowHeaderLabelMode);
        }
      },
      handleSnapError(`users/${uid}/preferences/workspace`),
    );

    const unsubSubjects = onSnapshot(
      query(collection(db, 'users', uid, 'subjects'), where('userId', '==', uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Subject);
        list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setSubjects(list);
      },
      handleSnapError(`users/${uid}/subjects`),
    );

    const unsubFolders = onSnapshot(
      query(collection(db, 'users', uid, 'folders'), where('userId', '==', uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Folder);
        list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setFolders(list);
      },
      handleSnapError(`users/${uid}/folders`),
    );

    const unsubNotes = onSnapshot(
      query(collection(db, 'users', uid, 'notes'), where('userId', '==', uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Note);
        list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setNotes(list);
      },
      handleSnapError(`users/${uid}/notes`),
    );

    const unsubFlashcards = onSnapshot(
      query(collection(db, 'users', uid, 'flashcards'), where('userId', '==', uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Flashcard);
        list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setFlashcards(list);
      },
      handleSnapError(`users/${uid}/flashcards`),
    );

    const unsubQuizzes = onSnapshot(
      query(collection(db, 'users', uid, 'quizzes'), where('userId', '==', uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Quiz);
        list.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
        setQuizzes(list);
      },
      handleSnapError(`users/${uid}/quizzes`),
    );

    const unsubStudyFiles = onSnapshot(
      query(collection(db, 'users', uid, 'studyFiles'), where('userId', '==', uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as StudyFile);
        list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setStudyFiles(list);
      },
      handleSnapError(`users/${uid}/studyFiles`),
    );

    return () => {
      unsubPrefs();
      unsubSubjects();
      unsubFolders();
      unsubNotes();
      unsubFlashcards();
      unsubQuizzes();
      unsubStudyFiles();
    };
  }, [user]);

  // Derived active subject and tabs synchronization
  const currentSubject = useMemo(() => {
    if (subjects.length === 0) return null;
    return subjects.find((s) => s.id === currentSubjectId) || subjects[0];
  }, [subjects, currentSubjectId]);

  // Sync CSS accent variables to currentSubject (or default when signed out)
  useEffect(() => {
    const rawHex = user ? (currentSubject?.color || DEFAULT_SUBJECT_COLOR) : DEFAULT_SUBJECT_COLOR;
    const clean = /^#[0-9a-fA-F]{6}$/.test(rawHex) ? rawHex : DEFAULT_SUBJECT_COLOR;
    const r = parseInt(clean.slice(1, 3), 16);
    const g = parseInt(clean.slice(3, 5), 16);
    const b = parseInt(clean.slice(5, 7), 16);

    const mix = (channel: number, target: number, amount: number) =>
      Math.max(0, Math.min(255, Math.round(channel + (target - channel) * amount)));
    const toHex = (rr: number, gg: number, bb: number) =>
      `#${[rr, gg, bb].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

    const lighterHex = toHex(mix(r, 255, 0.25), mix(g, 255, 0.25), mix(b, 255, 0.25));
    const darkerHex = toHex(mix(r, 0, 0.16), mix(g, 0, 0.16), mix(b, 0, 0.16));

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--primary-rgb', `${r}, ${g}, ${b}`);
    rootStyle.setProperty('--primary-400', lighterHex);
    rootStyle.setProperty('--primary-500', clean);
    rootStyle.setProperty('--primary-600', clean);
    rootStyle.setProperty('--primary-700', darkerHex);
  }, [user, currentSubject]);

  const subjectNotes = useMemo(() => {
    if (!currentSubject) return [];
    return notes.filter((n) => n.subjectId === currentSubject.id);
  }, [notes, currentSubject]);

  const subjectFolders = useMemo(() => {
    if (!currentSubject) return [];
    return folders.filter((f) => f.subjectId === currentSubject.id);
  }, [folders, currentSubject]);

  const subjectStudyFiles = useMemo(() => {
    if (!currentSubject) return [];
    return studyFiles.filter((f) => f.subjectId === currentSubject.id);
  }, [studyFiles, currentSubject]);

  const validOpenTabs = useMemo(() => {
    const ids = new Set(subjectNotes.map((n) => n.id));
    return openTabs.filter((id) => ids.has(id));
  }, [openTabs, subjectNotes]);

  const effectiveActiveNoteId = useMemo(() => {
    if (activeNoteId && subjectNotes.some((n) => n.id === activeNoteId)) {
      return activeNoteId;
    }
    if (validOpenTabs.length > 0) return validOpenTabs[0];
    return null;
  }, [activeNoteId, subjectNotes, validOpenTabs]);

  const activeNote = useMemo(
    () => notes.find((n) => n.id === effectiveActiveNoteId) || null,
    [notes, effectiveActiveNoteId],
  );

  const activeNoteFlashcards = useMemo(
    () => flashcards.filter((c) => c.noteId === effectiveActiveNoteId),
    [flashcards, effectiveActiveNoteId],
  );

  const activeQuiz = useMemo(
    () =>
      quizzes.find((q) => q.noteId === effectiveActiveNoteId && q.status === 'active') || null,
    [quizzes, effectiveActiveNoteId],
  );

  const quizHistory = useMemo(
    () => quizzes.filter((q) => q.noteId === effectiveActiveNoteId && q.status === 'completed'),
    [quizzes, effectiveActiveNoteId],
  );

  // Persist preference updates helper
  const updatePreferences = useCallback(
    async (partial: Partial<Omit<WorkspacePreferences, 'userId' | 'updatedAt'>>) => {
      if (!user) return;
      const prefRef = doc(db, 'users', user.uid, 'preferences', 'workspace');
      try {
        await updateDoc(prefRef, {
          ...partial,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        // Fallback if doc hasn't finished bootstrapping
        try {
          await setDoc(
            prefRef,
            {
              userId: user.uid,
              themeMode: partial.themeMode ?? themeMode,
              geminiModel: partial.geminiModel ?? geminiModel,
              aiResponseStyle: partial.aiResponseStyle ?? aiResponseStyle,
              aiResponseLanguage: partial.aiResponseLanguage ?? aiResponseLanguage,
              defaultFlashcardCount: partial.defaultFlashcardCount ?? defaultFlashcardCount,
              defaultQuizCount: partial.defaultQuizCount ?? defaultQuizCount,
              studyDifficulty: partial.studyDifficulty ?? studyDifficulty,
              autoShowQuizExplanations:
                partial.autoShowQuizExplanations ?? autoShowQuizExplanations,
              editorFontSize: partial.editorFontSize ?? editorFontSize,
              editorLineHeight: partial.editorLineHeight ?? editorLineHeight,
              currentSubjectId:
                partial.currentSubjectId !== undefined ? partial.currentSubjectId : currentSubjectId,
              activeNoteId:
                partial.activeNoteId !== undefined ? partial.activeNoteId : activeNoteId,
              openTabs: partial.openTabs ?? openTabs,
              windowVisibility: partial.windowVisibility ?? windowVisibility,
              panelWidths: partial.panelWidths ?? panelWidths,
              panelOrder: partial.panelOrder ?? panelOrder,
              panelColumns: partial.panelColumns ?? panelColumns,
              collapsedExplorer:
                partial.collapsedExplorer !== undefined
                  ? partial.collapsedExplorer
                  : collapsedExplorer,
              activeLayoutPreset:
                partial.activeLayoutPreset !== undefined
                  ? partial.activeLayoutPreset
                  : activeLayoutPreset,
              windowHeaderLabelMode:
                partial.windowHeaderLabelMode ?? windowHeaderLabelMode,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        } catch (innerErr) {
          handleFirestoreError(innerErr, OperationType.WRITE, `users/${user.uid}/preferences/workspace`);
        }
      }
    },
    [
      user,
      themeMode,
      geminiModel,
      aiResponseStyle,
      aiResponseLanguage,
      defaultFlashcardCount,
      defaultQuizCount,
      studyDifficulty,
      autoShowQuizExplanations,
      editorFontSize,
      editorLineHeight,
      currentSubjectId,
      activeNoteId,
      openTabs,
      windowVisibility,
      panelWidths,
      panelOrder,
      panelColumns,
      collapsedExplorer,
      activeLayoutPreset,
      windowHeaderLabelMode,
    ],
  );

  // Auth actions
  const loginWithGoogle = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Accesso effettuato con successo!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Accesso annullato.';
      showToast(`Errore accesso Google: ${msg}`, 'error');
    }
  }, [showToast]);

  const logout = useCallback(async () => {
    await signOut(auth);
    showToast('Disconnessione completata.', 'info');
  }, [showToast]);

  // Preferences setters
  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      setThemeModeState(mode);
      void updatePreferences({ themeMode: mode });
    },
    [updatePreferences],
  );

  const saveWorkspaceSettings = useCallback(
    (next: {
      geminiModel: GeminiModelId;
      aiResponseStyle: AiResponseStyle;
      aiResponseLanguage: AiResponseLanguage;
      defaultFlashcardCount: number;
      defaultQuizCount: number;
      studyDifficulty: StudyDifficulty;
      autoShowQuizExplanations: boolean;
      editorFontSize: number;
      editorLineHeight: number;
      windowHeaderLabelMode: WindowHeaderLabelMode;
    }) => {
      const fcCount = Math.max(3, Math.min(10, Math.round(next.defaultFlashcardCount)));
      const qCount = Math.max(1, Math.min(20, Math.round(next.defaultQuizCount)));
      const fontSz = Math.max(13, Math.min(18, Math.round(next.editorFontSize)));
      const lineH = Math.max(1.2, Math.min(2.4, Math.round(next.editorLineHeight * 100) / 100));

      setGeminiModelState(next.geminiModel);
      setAiResponseStyleState(next.aiResponseStyle);
      setAiResponseLanguageState(next.aiResponseLanguage);
      setDefaultFlashcardCountState(fcCount);
      setDefaultQuizCountState(qCount);
      setStudyDifficultyState(next.studyDifficulty);
      setAutoShowQuizExplanationsState(next.autoShowQuizExplanations);
      setEditorFontSizeState(fontSz);
      setEditorLineHeightState(lineH);
      setWindowHeaderLabelModeState(next.windowHeaderLabelMode);

      void updatePreferences({
        geminiModel: next.geminiModel,
        aiResponseStyle: next.aiResponseStyle,
        aiResponseLanguage: next.aiResponseLanguage,
        defaultFlashcardCount: fcCount,
        defaultQuizCount: qCount,
        studyDifficulty: next.studyDifficulty,
        autoShowQuizExplanations: next.autoShowQuizExplanations,
        editorFontSize: fontSz,
        editorLineHeight: lineH,
        windowHeaderLabelMode: next.windowHeaderLabelMode,
      });
      showToast('Impostazioni salvate.', 'success');
    },
    [updatePreferences, showToast],
  );

  const setWindowVisibility = useCallback(
    (next: Record<WindowId, boolean>, clearPreset = true) => {
      setWindowVisibilityState(next);
      if (clearPreset) {
        setActiveLayoutPresetState(null);
      }
      void updatePreferences(
        clearPreset
          ? { windowVisibility: next, activeLayoutPreset: null }
          : { windowVisibility: next },
      );
    },
    [updatePreferences],
  );

  const setPanelWidths = useCallback(
    (next: Record<Exclude<WindowId, 'left-panel'>, number>, persist = true) => {
      setPanelWidthsState(next);
      if (persist) {
        void updatePreferences({ panelWidths: next });
      }
    },
    [updatePreferences],
  );

  const setPanelOrder = useCallback(
    (next: WindowId[]) => {
      setPanelOrderState(next);
      void updatePreferences({ panelOrder: next });
    },
    [updatePreferences],
  );

  const setPanelColumns = useCallback(
    (next: PanelColumnGroup[], clearPreset = true) => {
      const normalized = normalizePanelColumns(next);
      setPanelColumnsState(normalized);
      if (clearPreset) {
        setActiveLayoutPresetState(null);
      }
      void updatePreferences(
        clearPreset
          ? { panelColumns: normalized, activeLayoutPreset: null }
          : { panelColumns: normalized },
      );
    },
    [updatePreferences],
  );

  const setCollapsedExplorer = useCallback(
    (collapsed: boolean, clearPreset = false) => {
      setCollapsedExplorerState(collapsed);
      if (clearPreset) {
        setActiveLayoutPresetState(null);
      }
      void updatePreferences(
        clearPreset
          ? { collapsedExplorer: collapsed, activeLayoutPreset: null }
          : { collapsedExplorer: collapsed },
      );
    },
    [updatePreferences],
  );

  const applyLayoutPreset = useCallback(
    (presetId: LayoutPresetId) => {
      const preset = LAYOUT_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      const nextVis = { ...preset.windowVisibility };
      const nextCols = normalizePanelColumns(preset.panelColumns);
      setWindowVisibilityState(nextVis);
      setPanelColumnsState(nextCols);
      setCollapsedExplorerState(preset.collapsedExplorer);
      setActiveLayoutPresetState(preset.id);
      void updatePreferences({
        windowVisibility: nextVis,
        panelColumns: nextCols,
        collapsedExplorer: preset.collapsedExplorer,
        activeLayoutPreset: preset.id,
      });
    },
    [updatePreferences],
  );

  const setActiveColumnTab = useCallback(
    (colIndex: number, panelId: WindowId) => {
      setPanelColumnsState((prev) => {
        const next = prev.map((col, idx) =>
          idx === colIndex && col.panels.includes(panelId) ? { ...col, activeTab: panelId } : col,
        );
        void updatePreferences({ panelColumns: next });
        return next;
      });
    },
    [updatePreferences],
  );

  // Subject actions
  const selectSubject = useCallback(
    (subjectId: string) => {
      const subNotes = notes.filter((n) => n.subjectId === subjectId);
      const nextTabs = subNotes.length > 0 ? [subNotes[0].id] : [];
      const nextActive = nextTabs[0] ?? null;
      setCurrentSubjectIdState(subjectId);
      setOpenTabsState(nextTabs);
      setActiveNoteIdState(nextActive);
      void updatePreferences({
        currentSubjectId: subjectId,
        openTabs: nextTabs,
        activeNoteId: nextActive,
      });
    },
    [notes, updatePreferences],
  );

  const createSubject = useCallback(
    async (name: string, color: string, systemPrompt?: string) => {
      if (!user) return;
      const trimmed = name.trim().slice(0, 100);
      if (!trimmed) return;
      if (subjects.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
        showToast('Materia già esistente.', 'error');
        return;
      }

      const customPrompt = (systemPrompt || '').trim();
      const resolvedPrompt = (
        customPrompt || `Sei un tutor AI didattico per studenti ITS nella materia ${trimmed}.`
      ).slice(0, 2000);

      const subId = makeSafeId('sub');
      const noteId = makeSafeId('note');
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', user.uid, 'subjects', subId), {
        id: subId,
        userId: user.uid,
        name: trimmed,
        color: sanitizeHexColor(color),
        systemPrompt: resolvedPrompt,
        order: subjects.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'users', user.uid, 'notes', noteId), {
        id: noteId,
        userId: user.uid,
        subjectId: subId,
        folderId: null,
        title: `Appunti ${trimmed}`.slice(0, 160),
        content: `<h1>${trimmed}</h1><p>Inizia a scrivere qui i tuoi appunti...</p>`,
        order: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      try {
        await batch.commit();
        setCurrentSubjectIdState(subId);
        setOpenTabsState([noteId]);
        setActiveNoteIdState(noteId);
        await updatePreferences({
          currentSubjectId: subId,
          openTabs: [noteId],
          activeNoteId: noteId,
        });
        showToast(`Materia "${trimmed}" creata!`, 'success');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/subjects/${subId}`);
      }
    },
    [user, subjects, updatePreferences, showToast],
  );

  const updateSubject = useCallback(
    async (subjectId: string, name: string, color: string, systemPrompt: string) => {
      if (!user) return;
      const trimmed = name.trim().slice(0, 100);
      if (!trimmed) return;
      try {
        await updateDoc(doc(db, 'users', user.uid, 'subjects', subjectId), {
          name: trimmed,
          color: sanitizeHexColor(color),
          systemPrompt: systemPrompt.trim().slice(0, 2000),
          updatedAt: serverTimestamp(),
        });
        showToast('Materia aggiornata.', 'success');
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/subjects/${subjectId}`);
      }
    },
    [user, showToast],
  );

  const deleteSubject = useCallback(
    async (subjectId: string) => {
      if (!user || subjects.length <= 1) return;
      const target = subjects.find((s) => s.id === subjectId);
      if (!target) return;

      if (
        pendingSaveNoteIdRef.current &&
        notes.some((n) => n.id === pendingSaveNoteIdRef.current && n.subjectId === subjectId) &&
        noteSaveTimerRef.current
      ) {
        window.clearTimeout(noteSaveTimerRef.current);
        noteSaveTimerRef.current = null;
        pendingSaveNoteIdRef.current = null;
        setSaveStatus('Salvato');
      }

      const batch = writeBatch(db);
      batch.delete(doc(db, 'users', user.uid, 'subjects', subjectId));
      folders.filter((f) => f.subjectId === subjectId).forEach((f) => {
        batch.delete(doc(db, 'users', user.uid, 'folders', f.id));
      });
      notes.filter((n) => n.subjectId === subjectId).forEach((n) => {
        batch.delete(doc(db, 'users', user.uid, 'notes', n.id));
      });
      flashcards.filter((c) => c.subjectId === subjectId).forEach((c) => {
        batch.delete(doc(db, 'users', user.uid, 'flashcards', c.id));
      });
      quizzes.filter((q) => q.subjectId === subjectId).forEach((q) => {
        batch.delete(doc(db, 'users', user.uid, 'quizzes', q.id));
      });
      const targetFiles = studyFiles.filter((sf) => sf.subjectId === subjectId);
      for (const sf of targetFiles) {
        batch.delete(doc(db, 'users', user.uid, 'studyFiles', sf.id));
        studyFileCacheRef.current.delete(sf.id);
        const chunksSnap = await getDocs(
          query(
            collection(db, 'users', user.uid, 'fileChunks'),
            where('userId', '==', user.uid),
            where('fileId', '==', sf.id),
          ),
        );
        chunksSnap.docs.forEach((d) => batch.delete(d.ref));
      }

      try {
        await batch.commit();
        const remaining = subjects.filter((s) => s.id !== subjectId);
        if (remaining.length > 0) {
          selectSubject(remaining[0].id);
        }
        showToast(`Materia "${target.name}" eliminata.`, 'info');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/subjects/${subjectId}`);
      }
    },
    [user, subjects, folders, notes, flashcards, quizzes, studyFiles, selectSubject, showToast],
  );

  // Note & Folder actions
  const openNote = useCallback(
    (noteId: string) => {
      const nextTabs = validOpenTabs.includes(noteId) ? validOpenTabs : [...validOpenTabs, noteId];
      setOpenTabsState(nextTabs);
      setActiveNoteIdState(noteId);
      void updatePreferences({ openTabs: nextTabs, activeNoteId: noteId });
    },
    [validOpenTabs, updatePreferences],
  );

  const closeTab = useCallback(
    (noteId: string) => {
      const idx = validOpenTabs.indexOf(noteId);
      if (idx === -1) return;
      const nextTabs = validOpenTabs.filter((id) => id !== noteId);
      const nextActive =
        effectiveActiveNoteId === noteId
          ? nextTabs[Math.max(0, idx - 1)] ?? null
          : effectiveActiveNoteId;
      setOpenTabsState(nextTabs);
      setActiveNoteIdState(nextActive);
      void updatePreferences({ openTabs: nextTabs, activeNoteId: nextActive });
    },
    [validOpenTabs, effectiveActiveNoteId, updatePreferences],
  );

  const reorderTabs = useCallback(
    (fromNoteId: string, toNoteId: string, position: 'before' | 'after') => {
      if (fromNoteId === toNoteId) return;
      const list = [...validOpenTabs];
      const fromIdx = list.indexOf(fromNoteId);
      if (fromIdx === -1) return;
      const [moved] = list.splice(fromIdx, 1);
      const targetIdx = list.indexOf(toNoteId);
      if (targetIdx === -1) return;
      const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
      list.splice(insertIdx, 0, moved);
      setOpenTabsState(list);
      void updatePreferences({ openTabs: list });
    },
    [validOpenTabs, updatePreferences],
  );

  const createNote = useCallback(
    async (folderId: string | null = null): Promise<string | null> => {
      if (!user || !currentSubject) return null;
      const noteId = makeSafeId('note');
      const title = `Nuova Nota ${subjectNotes.length + 1}`.slice(0, 160);
      const batch = writeBatch(db);

      batch.set(doc(db, 'users', user.uid, 'notes', noteId), {
        id: noteId,
        userId: user.uid,
        subjectId: currentSubject.id,
        folderId,
        title,
        content: `<h1>${title}</h1><p>Inizia a scrivere qui i tuoi appunti...</p>`,
        order: subjectNotes.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (folderId) {
        batch.update(doc(db, 'users', user.uid, 'folders', folderId), {
          isOpen: true,
          updatedAt: serverTimestamp(),
        });
      }

      try {
        await batch.commit();
        const nextTabs = [...validOpenTabs, noteId];
        setOpenTabsState(nextTabs);
        setActiveNoteIdState(noteId);
        await updatePreferences({ openTabs: nextTabs, activeNoteId: noteId });
        return noteId;
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/notes/${noteId}`);
      }
    },
    [user, currentSubject, subjectNotes.length, validOpenTabs, updatePreferences],
  );

  const updateNoteContent = useCallback(
    (noteId: string, contentHtml: string) => {
      if (!user) return;
      setSaveStatus('Salvataggio...');
      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, content: contentHtml } : n)),
      );
      if (noteSaveTimerRef.current) {
        window.clearTimeout(noteSaveTimerRef.current);
      }
      pendingSaveNoteIdRef.current = noteId;
      const trimmedContent = contentHtml.slice(0, 450000);
      noteSaveTimerRef.current = window.setTimeout(async () => {
        noteSaveTimerRef.current = null;
        pendingSaveNoteIdRef.current = null;
        try {
          await updateDoc(doc(db, 'users', user.uid, 'notes', noteId), {
            content: trimmedContent,
            updatedAt: serverTimestamp(),
          });
          setSaveStatus('Salvato');
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/notes/${noteId}`);
        }
      }, 400);
    },
    [user],
  );

  const renameNote = useCallback(
    async (noteId: string, newTitle: string) => {
      if (!user) return;
      const trimmed = newTitle.trim().slice(0, 160);
      if (!trimmed) return;
      try {
        await updateDoc(doc(db, 'users', user.uid, 'notes', noteId), {
          title: trimmed,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/notes/${noteId}`);
      }
    },
    [user],
  );

  const deleteNote = useCallback(
    async (noteId: string) => {
      if (!user) return;
      const target = notes.find((n) => n.id === noteId);
      if (!target) return;

      if (pendingSaveNoteIdRef.current === noteId && noteSaveTimerRef.current) {
        window.clearTimeout(noteSaveTimerRef.current);
        noteSaveTimerRef.current = null;
        pendingSaveNoteIdRef.current = null;
        setSaveStatus('Salvato');
      }

      const batch = writeBatch(db);
      batch.delete(doc(db, 'users', user.uid, 'notes', noteId));
      flashcards.filter((c) => c.noteId === noteId).forEach((c) => {
        batch.delete(doc(db, 'users', user.uid, 'flashcards', c.id));
      });
      quizzes.filter((q) => q.noteId === noteId).forEach((q) => {
        batch.delete(doc(db, 'users', user.uid, 'quizzes', q.id));
      });

      try {
        await batch.commit();
        closeTab(noteId);
        showToast(`Nota "${target.title}" eliminata.`, 'info');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/notes/${noteId}`);
      }
    },
    [user, notes, flashcards, quizzes, closeTab, showToast],
  );

  const createFolder = useCallback(async (): Promise<string | null> => {
    if (!user || !currentSubject) return null;
    const folderId = makeSafeId('folder');
    const name = `Nuova Cartella ${subjectFolders.length + 1}`.slice(0, 120);
    try {
      await setDoc(doc(db, 'users', user.uid, 'folders', folderId), {
        id: folderId,
        userId: user.uid,
        subjectId: currentSubject.id,
        name,
        isOpen: true,
        order: subjectFolders.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return folderId;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/folders/${folderId}`);
    }
  }, [user, currentSubject, subjectFolders.length]);

  const toggleFolderOpen = useCallback(
    async (folderId: string) => {
      if (!user) return;
      const folder = folders.find((f) => f.id === folderId);
      if (!folder) return;
      try {
        await updateDoc(doc(db, 'users', user.uid, 'folders', folderId), {
          isOpen: !folder.isOpen,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/folders/${folderId}`);
      }
    },
    [user, folders],
  );

  const renameFolder = useCallback(
    async (folderId: string, newName: string) => {
      if (!user) return;
      const trimmed = newName.trim().slice(0, 120);
      if (!trimmed) return;
      try {
        await updateDoc(doc(db, 'users', user.uid, 'folders', folderId), {
          name: trimmed,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/folders/${folderId}`);
      }
    },
    [user],
  );

  const deleteFolder = useCallback(
    async (folderId: string) => {
      if (!user) return;
      const folder = folders.find((f) => f.id === folderId);
      if (!folder) return;

      const batch = writeBatch(db);
      notes
        .filter((n) => n.folderId === folderId)
        .forEach((n) => {
          batch.update(doc(db, 'users', user.uid, 'notes', n.id), {
            folderId: null,
            updatedAt: serverTimestamp(),
          });
        });
      studyFiles
        .filter((sf) => sf.folderId === folderId)
        .forEach((sf) => {
          batch.update(doc(db, 'users', user.uid, 'studyFiles', sf.id), {
            folderId: null,
            updatedAt: serverTimestamp(),
          });
        });
      batch.delete(doc(db, 'users', user.uid, 'folders', folderId));

      try {
        await batch.commit();
        showToast(`Cartella "${folder.name}" eliminata.`, 'info');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/folders/${folderId}`);
      }
    },
    [user, folders, notes, studyFiles, showToast],
  );

  const moveNoteOrder = useCallback(
    async (
      draggedNoteId: string,
      targetFolderId: string | null,
      targetNoteId?: string,
      position?: 'before' | 'after',
    ) => {
      if (!user || !currentSubject) return;
      const list = [...subjectNotes];
      const draggedIdx = list.findIndex((n) => n.id === draggedNoteId);
      if (draggedIdx === -1) return;

      const [moved] = list.splice(draggedIdx, 1);
      moved.folderId = targetFolderId;

      if (targetNoteId) {
        const targetIdx = list.findIndex((n) => n.id === targetNoteId);
        if (targetIdx !== -1) {
          const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
          list.splice(insertIdx, 0, moved);
        } else {
          list.push(moved);
        }
      } else {
        list.push(moved);
      }

      const batch = writeBatch(db);
      list.forEach((n, index) => {
        batch.update(doc(db, 'users', user.uid, 'notes', n.id), {
          folderId: n.id === draggedNoteId ? targetFolderId : n.folderId,
          order: index,
          updatedAt: serverTimestamp(),
        });
      });

      if (targetFolderId) {
        batch.update(doc(db, 'users', user.uid, 'folders', targetFolderId), {
          isOpen: true,
          updatedAt: serverTimestamp(),
        });
      }

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/notes/${draggedNoteId}`);
      }
    },
    [user, currentSubject, subjectNotes],
  );

  // Study File (.pdf, .docx, .pptx) actions
  const uploadStudyFile = useCallback(
    async (file: File, folderId: string | null = null): Promise<StudyFile | null> => {
      if (!user || !currentSubject) return null;
      const ext = getStudyFileExt(file.name);
      if (!ext) {
        showToast(`Formato non supportato per "${file.name}". Usa .pdf, .docx o .pptx.`, 'error');
        return null;
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast(`Il file "${file.name}" supera il limite di 5 MB.`, 'error');
        return null;
      }

      try {
        const buffer = await file.arrayBuffer();
        const base64 = arrayBufferToBase64(buffer);
        const CHUNK_LEN = 500000;
        const chunks: string[] = [];
        for (let i = 0; i < base64.length; i += CHUNK_LEN) {
          chunks.push(base64.slice(i, i + CHUNK_LEN));
        }
        if (chunks.length === 0) chunks.push('');
        if (chunks.length > 20) {
          showToast(`Il file "${file.name}" è troppo grande per il salvataggio.`, 'error');
          return null;
        }

        let extractedText = '';
        if (ext === 'docx' || ext === 'pptx') {
          const parsed = await extractDocumentPreview(buffer, ext);
          extractedText = parsed.extractedText;
        }

        const fileId = makeSafeId('sfile');
        const mimeType = getMimeTypeForExt(ext, file.type);
        const batch = writeBatch(db);

        const docPayload: StudyFile = {
          id: fileId,
          userId: user.uid,
          subjectId: currentSubject.id,
          folderId,
          name: file.name.trim().slice(0, 180),
          mimeType: mimeType.slice(0, 160),
          fileExt: ext,
          size: Math.round(file.size),
          totalChunks: chunks.length,
          extractedText: extractedText.slice(0, 200000),
          order: subjectStudyFiles.length,
        };

        batch.set(doc(db, 'users', user.uid, 'studyFiles', fileId), {
          ...docPayload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        chunks.forEach((chunkData, index) => {
          const chunkId = `${fileId}_c${index}`;
          batch.set(doc(db, 'users', user.uid, 'fileChunks', chunkId), {
            id: chunkId,
            userId: user.uid,
            fileId,
            index,
            data: chunkData,
          });
        });

        if (folderId) {
          batch.update(doc(db, 'users', user.uid, 'folders', folderId), {
            isOpen: true,
            updatedAt: serverTimestamp(),
          });
        }

        await batch.commit();
        studyFileCacheRef.current.set(fileId, base64);
        showToast(`"${docPayload.name}" caricato nell'Explorer!`, 'success');
        return docPayload;
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/studyFiles`);
      }
    },
    [user, currentSubject, subjectStudyFiles.length, showToast],
  );

  const getStudyFileBase64 = useCallback(
    async (fileId: string): Promise<string> => {
      const cached = studyFileCacheRef.current.get(fileId);
      if (cached) return cached;
      if (!user) throw new Error('Utente non autenticato.');
      try {
        const snap = await getDocs(
          query(
            collection(db, 'users', user.uid, 'fileChunks'),
            where('userId', '==', user.uid),
            where('fileId', '==', fileId),
          ),
        );
        const chunks = snap.docs
          .map((d) => d.data() as { index: number; data: string })
          .sort((a, b) => a.index - b.index);
        const combined = chunks.map((c) => c.data).join('');
        studyFileCacheRef.current.set(fileId, combined);
        return combined;
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/fileChunks`);
      }
    },
    [user],
  );

  const renameStudyFile = useCallback(
    async (fileId: string, newName: string) => {
      if (!user) return;
      const trimmed = newName.trim().slice(0, 180);
      if (!trimmed) return;
      try {
        await updateDoc(doc(db, 'users', user.uid, 'studyFiles', fileId), {
          name: trimmed,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/studyFiles/${fileId}`);
      }
    },
    [user],
  );

  const moveStudyFileToFolder = useCallback(
    async (fileId: string, targetFolderId: string | null) => {
      if (!user) return;
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', user.uid, 'studyFiles', fileId), {
        folderId: targetFolderId,
        updatedAt: serverTimestamp(),
      });
      if (targetFolderId) {
        batch.update(doc(db, 'users', user.uid, 'folders', targetFolderId), {
          isOpen: true,
          updatedAt: serverTimestamp(),
        });
      }
      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/studyFiles/${fileId}`);
      }
    },
    [user],
  );

  const deleteStudyFile = useCallback(
    async (fileId: string) => {
      if (!user) return;
      const target = studyFiles.find((f) => f.id === fileId);
      if (!target) return;

      const batch = writeBatch(db);
      batch.delete(doc(db, 'users', user.uid, 'studyFiles', fileId));
      try {
        const chunksSnap = await getDocs(
          query(
            collection(db, 'users', user.uid, 'fileChunks'),
            where('userId', '==', user.uid),
            where('fileId', '==', fileId),
          ),
        );
        chunksSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        studyFileCacheRef.current.delete(fileId);
        showToast(`File "${target.name}" eliminato.`, 'info');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/studyFiles/${fileId}`);
      }
    },
    [user, studyFiles, showToast],
  );

  // Flashcards actions
  const addFlashcardsBatch = useCallback(
    async (noteId: string, subjectId: string, cards: { q: string; a: string }[]) => {
      if (!user || cards.length === 0) return;
      const batch = writeBatch(db);
      const baseOrder = activeNoteFlashcards.length;
      cards.slice(0, 10).forEach((card, idx) => {
        const cardId = makeSafeId('card');
        batch.set(doc(db, 'users', user.uid, 'flashcards', cardId), {
          id: cardId,
          userId: user.uid,
          subjectId,
          noteId,
          question: card.q.slice(0, 1000),
          answer: card.a.slice(0, 2000),
          order: baseOrder + idx,
          createdAt: serverTimestamp(),
        });
      });
      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/flashcards`);
      }
    },
    [user, activeNoteFlashcards.length],
  );

  const deleteFlashcard = useCallback(
    async (cardId: string) => {
      if (!user) return;
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'flashcards', cardId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/flashcards/${cardId}`);
      }
    },
    [user],
  );

  // Quiz actions
  const createActiveQuiz = useCallback(
    async (note: Note, questions: QuizQuestion[]) => {
      if (!user) return;
      const batch = writeBatch(db);
      // Remove previous unsubmitted active quiz for this note so only 1 active quiz exists
      quizzes
        .filter((q) => q.noteId === note.id && q.status === 'active')
        .forEach((old) => {
          batch.delete(doc(db, 'users', user.uid, 'quizzes', old.id));
        });

      const quizId = makeSafeId('quiz');
      const clamped = questions.slice(0, 20);
      batch.set(doc(db, 'users', user.uid, 'quizzes', quizId), {
        id: quizId,
        userId: user.uid,
        subjectId: note.subjectId,
        noteId: note.id,
        noteTitle: note.title.slice(0, 160),
        status: 'active',
        questions: clamped,
        userAnswers: {},
        score: 0,
        total: clamped.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/quizzes/${quizId}`);
      }
    },
    [user, quizzes],
  );

  const selectQuizAnswer = useCallback(
    async (quiz: Quiz, qIndex: number, optionIndex: number) => {
      if (!user || quiz.status !== 'active') return;
      const nextAnswers = { ...quiz.userAnswers, [String(qIndex)]: optionIndex };
      try {
        await updateDoc(doc(db, 'users', user.uid, 'quizzes', quiz.id), {
          userAnswers: nextAnswers,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/quizzes/${quiz.id}`);
      }
    },
    [user],
  );

  const submitQuiz = useCallback(
    async (quiz: Quiz) => {
      if (!user || quiz.status !== 'active') return;
      const answeredCount = quiz.questions.filter(
        (_, i) => typeof quiz.userAnswers[String(i)] === 'number',
      ).length;
      if (answeredCount < quiz.questions.length) {
        showToast(
          `Rispondi a tutte le domande (${answeredCount}/${quiz.questions.length}) prima di terminare.`,
          'info',
        );
        return;
      }

      const score = quiz.questions.reduce(
        (acc, q, idx) => acc + (quiz.userAnswers[String(idx)] === q.correctIndex ? 1 : 0),
        0,
      );

      try {
        await updateDoc(doc(db, 'users', user.uid, 'quizzes', quiz.id), {
          status: 'completed',
          score,
          userAnswers: quiz.userAnswers,
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        showToast(
          `Quiz terminato! Punteggio: ${score}/${quiz.questions.length}`,
          score === quiz.questions.length ? 'success' : 'info',
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/quizzes/${quiz.id}`);
      }
    },
    [user, showToast],
  );

  const cloneQuizAsActive = useCallback(
    async (sourceQuiz: Quiz) => {
      if (!user) return;
      const quizId = makeSafeId('quiz');
      try {
        await setDoc(doc(db, 'users', user.uid, 'quizzes', quizId), {
          id: quizId,
          userId: user.uid,
          subjectId: sourceQuiz.subjectId,
          noteId: sourceQuiz.noteId,
          noteTitle: sourceQuiz.noteTitle.slice(0, 160),
          status: 'active',
          questions: sourceQuiz.questions,
          userAnswers: {},
          score: 0,
          total: sourceQuiz.questions.length,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/quizzes/${quizId}`);
      }
    },
    [user],
  );

  const deleteQuiz = useCallback(
    async (quizId: string) => {
      if (!user) return;
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'quizzes', quizId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/quizzes/${quizId}`);
      }
    },
    [user],
  );

  // JSON Backup Export & Import (Supports Cloud v5 with StudyFiles/Quizzes & Legacy HTML v4 format!)
  const exportFullBackupJson = useCallback(async () => {
    try {
      const legacySubjects = subjects.map((s) => s.name);
      const subjectConfig: Record<string, { color: string; prompt: string }> = {};
      const subjectNameById = new Map<string, string>();
      subjects.forEach((s) => {
        subjectNameById.set(s.id, s.name);
        subjectConfig[s.name] = { color: s.color, prompt: s.systemPrompt };
      });

      const flashcardsData: Record<string, { q: string; a: string }[]> = {};
      flashcards.forEach((c) => {
        if (!flashcardsData[c.noteId]) flashcardsData[c.noteId] = [];
        flashcardsData[c.noteId].push({ q: c.question, a: c.answer });
      });

      if (studyFiles.length > 0) {
        showToast('Preparazione backup completo (.json)...', 'info');
      }

      const exportedStudyFiles = await Promise.all(
        studyFiles.map(async (sf) => {
          let base64Data = '';
          try {
            base64Data = await getStudyFileBase64(sf.id);
          } catch {
            base64Data = '';
          }
          return {
            id: sf.id,
            subject: subjectNameById.get(sf.subjectId) || DEFAULT_SUBJECT_NAME,
            folderId: sf.folderId,
            name: sf.name,
            mimeType: sf.mimeType,
            fileExt: sf.fileExt,
            size: sf.size,
            extractedText: sf.extractedText,
            order: sf.order,
            base64Data,
          };
        }),
      );

      const payload = {
        version: 5,
        exportedAt: new Date().toISOString(),
        themeMode,
        geminiModel,
        aiResponseStyle,
        aiResponseLanguage,
        defaultFlashcardCount,
        defaultQuizCount,
        studyDifficulty,
        autoShowQuizExplanations,
        editorFontSize,
        editorLineHeight,
        codeColorScheme: loadSavedCodeColors(),
        windowVisibility,
        panelWidths,
        panelOrder,
        subjects: legacySubjects,
        currentSubject: currentSubject?.name || legacySubjects[0] || DEFAULT_SUBJECT_NAME,
        activeNoteId: effectiveActiveNoteId,
        openTabs,
        subjectConfig,
        folders: folders.map((f) => ({
          id: f.id,
          subject: subjectNameById.get(f.subjectId) || DEFAULT_SUBJECT_NAME,
          name: f.name,
          isOpen: f.isOpen,
          order: f.order,
        })),
        notes: notes.map((n) => ({
          id: n.id,
          subject: subjectNameById.get(n.subjectId) || DEFAULT_SUBJECT_NAME,
          folderId: n.folderId,
          title: n.title,
          content: n.content,
          order: n.order,
        })),
        flashcardsData,
        quizzes: quizzes.map((q) => ({
          id: q.id,
          subject: subjectNameById.get(q.subjectId) || DEFAULT_SUBJECT_NAME,
          noteId: q.noteId,
          noteTitle: q.noteTitle,
          status: q.status,
          questions: q.questions,
          userAnswers: q.userAnswers,
          score: q.score,
          total: q.total,
        })),
        studyFiles: exportedStudyFiles,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `its_workspace_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Backup completo esportato (.json).', 'success');
    } catch {
      showToast("Errore durante l'esportazione del backup JSON.", 'error');
    }
  }, [
    subjects,
    folders,
    notes,
    flashcards,
    quizzes,
    studyFiles,
    getStudyFileBase64,
    themeMode,
    geminiModel,
    aiResponseStyle,
    aiResponseLanguage,
    defaultFlashcardCount,
    defaultQuizCount,
    studyDifficulty,
    autoShowQuizExplanations,
    editorFontSize,
    editorLineHeight,
    windowVisibility,
    panelWidths,
    panelOrder,
    currentSubject,
    effectiveActiveNoteId,
    openTabs,
    showToast,
  ]);

  const importBackupData = useCallback(
    async (rawData: Record<string, unknown>) => {
      if (!user) return;
      const rawSubjects = Array.isArray(rawData.subjects) ? (rawData.subjects as string[]) : [];
      const rawNotes = Array.isArray(rawData.notes) ? (rawData.notes as Record<string, unknown>[]) : [];
      if (rawSubjects.length === 0 && rawNotes.length === 0) {
        showToast('Formato backup non valido.', 'error');
        return;
      }

      const rawConfig =
        (rawData.subjectConfig as Record<string, { color?: string; prompt?: string }>) || {};
      const rawFolders = Array.isArray(rawData.folders)
        ? (rawData.folders as Record<string, unknown>[])
        : [];
      const rawFlashcardsMap =
        (rawData.flashcardsData as Record<string, { q?: string; a?: string }[]>) || {};
      const rawQuizzes = Array.isArray(rawData.quizzes)
        ? (rawData.quizzes as Record<string, unknown>[])
        : [];
      const rawStudyFiles = Array.isArray(rawData.studyFiles)
        ? (rawData.studyFiles as Record<string, unknown>[])
        : [];

      const commitBatched = async (ops: ((batch: WriteBatch) => void)[]) => {
        const CHUNK_SIZE = 350;
        for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
          const batch = writeBatch(db);
          ops.slice(i, i + CHUNK_SIZE).forEach((fn) => fn(batch));
          await batch.commit();
        }
      };

      const subjectOps: ((b: WriteBatch) => void)[] = [];
      const folderOps: ((b: WriteBatch) => void)[] = [];
      const noteOps: ((b: WriteBatch) => void)[] = [];
      const studyAuxOps: ((b: WriteBatch) => void)[] = [];
      const fileOps: ((b: WriteBatch) => void)[] = [];
      const fileChunkOps: ((b: WriteBatch) => void)[] = [];
      const cachedFilesToStore: { fileId: string; base64: string }[] = [];

      const subjectIdByName = new Map<string, string>();
      const folderIdMap = new Map<string, string>();
      const noteIdMap = new Map<string, string>();
      const importedNoteIds = new Set<string>();
      const importedNotesMeta: { id: string; subjectId: string }[] = [];

      const effectiveRawSubjects =
        rawSubjects.length > 0 ? rawSubjects : [currentSubject?.name || DEFAULT_SUBJECT_NAME];

      effectiveRawSubjects.forEach((subName, idx) => {
        const cleanName = String(subName || '').trim().slice(0, 100);
        if (!cleanName || subjectIdByName.has(cleanName)) return;
        const existing = subjects.find((s) => s.name.toLowerCase() === cleanName.toLowerCase());
        const subId = existing ? existing.id : makeSafeId('sub');
        subjectIdByName.set(cleanName, subId);
        if (!existing) {
          const cfg = rawConfig[cleanName] || {};
          subjectOps.push((b) =>
            b.set(doc(db, 'users', user.uid, 'subjects', subId), {
              id: subId,
              userId: user.uid,
              name: cleanName,
              color: sanitizeHexColor(cfg.color || DEFAULT_SUBJECT_COLOR),
              systemPrompt: String(cfg.prompt || DEFAULT_SUBJECT_PROMPT).slice(0, 2000),
              order: subjects.length + idx,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
          );
        }
      });

      const fallbackSubId = Array.from(subjectIdByName.values())[0] || currentSubject?.id;
      if (!fallbackSubId) return;

      rawFolders.forEach((f, idx) => {
        const oldId = String(f.id || '');
        const newId = makeSafeId('folder');
        if (oldId) folderIdMap.set(oldId, newId);
        const subId = subjectIdByName.get(String(f.subject || '').trim()) || fallbackSubId;
        const folderOrder =
          typeof f.order === 'number' && Number.isFinite(f.order)
            ? Math.max(0, Math.min(100000, Math.round(f.order)))
            : folders.length + idx;
        folderOps.push((b) =>
          b.set(doc(db, 'users', user.uid, 'folders', newId), {
            id: newId,
            userId: user.uid,
            subjectId: subId,
            name: (String(f.name || '').trim() || 'Cartella').slice(0, 120),
            isOpen: f.isOpen !== false,
            order: folderOrder,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        );
      });

      rawNotes.forEach((n, idx) => {
        const oldId = String(n.id || '');
        const newId = makeSafeId('note');
        if (oldId) noteIdMap.set(oldId, newId);
        importedNoteIds.add(newId);
        const subId = subjectIdByName.get(String(n.subject || '').trim()) || fallbackSubId;
        importedNotesMeta.push({ id: newId, subjectId: subId });
        const mappedFolderId = n.folderId ? folderIdMap.get(String(n.folderId)) ?? null : null;
        const noteOrder =
          typeof n.order === 'number' && Number.isFinite(n.order)
            ? Math.max(0, Math.min(100000, Math.round(n.order)))
            : notes.length + idx;
        noteOps.push((b) =>
          b.set(doc(db, 'users', user.uid, 'notes', newId), {
            id: newId,
            userId: user.uid,
            subjectId: subId,
            folderId: mappedFolderId,
            title: (String(n.title || '').trim() || 'Nota importata').slice(0, 160),
            content: String(n.content || '').slice(0, 450000),
            order: noteOrder,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        );

        const cards = rawFlashcardsMap[oldId] || [];
        cards.slice(0, 20).forEach((card, cIdx) => {
          const q = String(card?.q || '').trim();
          const a = String(card?.a || '').trim();
          if (!q || !a) return;
          const cardId = makeSafeId('card');
          studyAuxOps.push((b) =>
            b.set(doc(db, 'users', user.uid, 'flashcards', cardId), {
              id: cardId,
              userId: user.uid,
              subjectId: subId,
              noteId: newId,
              question: q.slice(0, 1000),
              answer: a.slice(0, 2000),
              order: cIdx,
              createdAt: serverTimestamp(),
            }),
          );
        });
      });

      rawQuizzes.forEach((q) => {
        const mappedNoteId = q.noteId ? noteIdMap.get(String(q.noteId)) : undefined;
        if (!mappedNoteId || !importedNoteIds.has(mappedNoteId)) return;
        const rawQuestions = Array.isArray(q.questions)
          ? (q.questions as Record<string, unknown>[])
          : [];
        if (rawQuestions.length === 0 || rawQuestions.length > 20) return;

        const cleanQuestions: QuizQuestion[] = rawQuestions
          .map((item): QuizQuestion | null => {
            if (!item || typeof item !== 'object') return null;
            const questionText =
              typeof item.question === 'string'
                ? item.question
                : typeof item.q === 'string'
                  ? item.q
                  : '';
            const opts = Array.isArray(item.options)
              ? item.options.map((o) => String(o ?? ''))
              : [];
            const idxVal =
              typeof item.correctIndex === 'number'
                ? item.correctIndex
                : typeof item.correct === 'number'
                  ? item.correct
                  : -1;
            if (!questionText.trim() || opts.length !== 4 || idxVal < 0 || idxVal >= 4) {
              return null;
            }
            return {
              question: questionText.slice(0, 1000),
              options: opts.map((o) => o.slice(0, 500)),
              correctIndex: idxVal,
              explanation:
                typeof item.explanation === 'string' ? item.explanation.slice(0, 1500) : '',
            };
          })
          .filter((item): item is QuizQuestion => item !== null)
          .slice(0, 20);
        if (cleanQuestions.length === 0) return;

        const subId = subjectIdByName.get(String(q.subject || '').trim()) || fallbackSubId;
        const status = q.status === 'completed' ? 'completed' : 'active';
        const rawAnswers =
          q.userAnswers && typeof q.userAnswers === 'object'
            ? (q.userAnswers as Record<string, number>)
            : {};
        const cleanAnswers: Record<string, number> = {};
        Object.entries(rawAnswers).forEach(([k, v]) => {
          if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 4) {
            cleanAnswers[String(k)] = v;
          }
        });
        const total = cleanQuestions.length;
        const rawScore = typeof q.score === 'number' ? Math.round(q.score) : 0;
        const score = Math.max(0, Math.min(total, rawScore));
        const quizId = makeSafeId('quiz');

        studyAuxOps.push((b) => {
          const docData: Record<string, unknown> = {
            id: quizId,
            userId: user.uid,
            subjectId: subId,
            noteId: mappedNoteId,
            noteTitle: (String(q.noteTitle || '').trim() || 'Quiz importato').slice(0, 160),
            status,
            questions: cleanQuestions,
            userAnswers: cleanAnswers,
            score,
            total,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (status === 'completed') {
            docData.completedAt = serverTimestamp();
          }
          b.set(doc(db, 'users', user.uid, 'quizzes', quizId), docData);
        });
      });

      rawStudyFiles.forEach((sf, idx) => {
        const extRaw = String(sf.fileExt || '').toLowerCase();
        if (extRaw !== 'pdf' && extRaw !== 'docx' && extRaw !== 'pptx') return;
        const base64Data = typeof sf.base64Data === 'string' ? sf.base64Data : '';
        if (!base64Data) return;

        const CHUNK_LEN = 500000;
        const chunks: string[] = [];
        for (let i = 0; i < base64Data.length; i += CHUNK_LEN) {
          chunks.push(base64Data.slice(i, i + CHUNK_LEN));
        }
        if (chunks.length === 0 || chunks.length > 20) return;

        const fileId = makeSafeId('sfile');
        const subId = subjectIdByName.get(String(sf.subject || '').trim()) || fallbackSubId;
        const mappedFolderId = sf.folderId ? folderIdMap.get(String(sf.folderId)) ?? null : null;
        const fileSize =
          typeof sf.size === 'number' && Number.isFinite(sf.size)
            ? Math.max(0, Math.min(7000000, Math.round(sf.size)))
            : Math.round((base64Data.length * 3) / 4);
        const fileOrder =
          typeof sf.order === 'number' && Number.isFinite(sf.order)
            ? Math.max(0, Math.min(100000, Math.round(sf.order)))
            : studyFiles.length + idx;

        fileOps.push((b) =>
          b.set(doc(db, 'users', user.uid, 'studyFiles', fileId), {
            id: fileId,
            userId: user.uid,
            subjectId: subId,
            folderId: mappedFolderId,
            name: (String(sf.name || '').trim() || `documento.${extRaw}`).slice(0, 180),
            mimeType: getMimeTypeForExt(extRaw, String(sf.mimeType || '')).slice(0, 160),
            fileExt: extRaw,
            size: fileSize,
            totalChunks: chunks.length,
            extractedText: String(sf.extractedText || '').slice(0, 200000),
            order: fileOrder,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        );

        chunks.forEach((chunkData, cIdx) => {
          const chunkId = `${fileId}_c${cIdx}`;
          fileChunkOps.push((b) =>
            b.set(doc(db, 'users', user.uid, 'fileChunks', chunkId), {
              id: chunkId,
              userId: user.uid,
              fileId,
              index: cIdx,
              data: chunkData,
            }),
          );
        });

        cachedFilesToStore.push({ fileId, base64: base64Data });
      });

      try {
        await commitBatched(subjectOps);
        await commitBatched(folderOps);
        await commitBatched(noteOps);
        await commitBatched(studyAuxOps);
        await commitBatched(fileOps);
        await commitBatched(fileChunkOps);

        cachedFilesToStore.forEach(({ fileId, base64 }) => {
          studyFileCacheRef.current.set(fileId, base64);
        });

        const targetSubId =
          subjectIdByName.get(String(rawData.currentSubject || '').trim()) || fallbackSubId;
        const mappedOpenTabs = Array.isArray(rawData.openTabs)
          ? (rawData.openTabs as unknown[])
              .map((oldId) => noteIdMap.get(String(oldId)))
              .filter((id): id is string => !!id && importedNoteIds.has(id))
          : [];
        const mappedActiveNoteId =
          typeof rawData.activeNoteId === 'string'
            ? noteIdMap.get(rawData.activeNoteId) ?? null
            : null;
        const firstNewNoteId =
          mappedActiveNoteId ||
          importedNotesMeta.find((item) => item.subjectId === targetSubId)?.id ||
          importedNotesMeta[0]?.id ||
          null;
        const finalOpenTabs =
          mappedOpenTabs.length > 0
            ? mappedOpenTabs.slice(0, 50)
            : firstNewNoteId
              ? [firstNewNoteId]
              : [];

        const prefUpdate: Partial<Omit<WorkspacePreferences, 'userId' | 'updatedAt'>> = {
          currentSubjectId: targetSubId,
          activeNoteId: firstNewNoteId,
          openTabs: finalOpenTabs,
        };
        if (
          rawData.themeMode === 'light' ||
          rawData.themeMode === 'dark' ||
          rawData.themeMode === 'system'
        ) {
          prefUpdate.themeMode = rawData.themeMode;
          setThemeModeState(rawData.themeMode);
        }
        if (
          rawData.geminiModel === 'gemini-4-hydrogen' ||
          rawData.geminiModel === 'gemini-3.1-flash-lite'
        ) {
          prefUpdate.geminiModel = rawData.geminiModel;
          setGeminiModelState(rawData.geminiModel);
        }
        if (
          rawData.aiResponseStyle === 'concise' ||
          rawData.aiResponseStyle === 'standard' ||
          rawData.aiResponseStyle === 'in-depth'
        ) {
          prefUpdate.aiResponseStyle = rawData.aiResponseStyle;
          setAiResponseStyleState(rawData.aiResponseStyle);
        }
        if (rawData.aiResponseLanguage === 'it' || rawData.aiResponseLanguage === 'en') {
          prefUpdate.aiResponseLanguage = rawData.aiResponseLanguage;
          setAiResponseLanguageState(rawData.aiResponseLanguage);
        }
        if (
          typeof rawData.defaultFlashcardCount === 'number' &&
          Number.isFinite(rawData.defaultFlashcardCount)
        ) {
          const fc = Math.max(3, Math.min(10, Math.round(rawData.defaultFlashcardCount)));
          prefUpdate.defaultFlashcardCount = fc;
          setDefaultFlashcardCountState(fc);
        }
        if (typeof rawData.defaultQuizCount === 'number' && Number.isFinite(rawData.defaultQuizCount)) {
          const qc = Math.max(1, Math.min(20, Math.round(rawData.defaultQuizCount)));
          prefUpdate.defaultQuizCount = qc;
          setDefaultQuizCountState(qc);
        }
        if (
          rawData.studyDifficulty === 'basic' ||
          rawData.studyDifficulty === 'intermediate' ||
          rawData.studyDifficulty === 'exam'
        ) {
          prefUpdate.studyDifficulty = rawData.studyDifficulty;
          setStudyDifficultyState(rawData.studyDifficulty);
        }
        if (typeof rawData.autoShowQuizExplanations === 'boolean') {
          prefUpdate.autoShowQuizExplanations = rawData.autoShowQuizExplanations;
          setAutoShowQuizExplanationsState(rawData.autoShowQuizExplanations);
        }
        if (typeof rawData.editorFontSize === 'number' && Number.isFinite(rawData.editorFontSize)) {
          const fs = Math.max(13, Math.min(18, Math.round(rawData.editorFontSize)));
          prefUpdate.editorFontSize = fs;
          setEditorFontSizeState(fs);
        }
        if (typeof rawData.editorLineHeight === 'number' && Number.isFinite(rawData.editorLineHeight)) {
          const lh = Math.max(1.2, Math.min(2.4, Math.round(rawData.editorLineHeight * 100) / 100));
          prefUpdate.editorLineHeight = lh;
          setEditorLineHeightState(lh);
        }
        if (rawData.windowVisibility && typeof rawData.windowVisibility === 'object') {
          const nextVis = { ...DEFAULT_WINDOW_VISIBILITY };
          (Object.keys(DEFAULT_WINDOW_VISIBILITY) as WindowId[]).forEach((k) => {
            const v = (rawData.windowVisibility as Record<string, unknown>)[k];
            if (typeof v === 'boolean') nextVis[k] = v;
          });
          prefUpdate.windowVisibility = nextVis;
          setWindowVisibilityState(nextVis);
        }
        if (
          Array.isArray(rawData.panelOrder) &&
          rawData.panelOrder.length === DEFAULT_PANEL_ORDER.length &&
          DEFAULT_PANEL_ORDER.every((id) => (rawData.panelOrder as unknown[]).includes(id))
        ) {
          const nextOrder = rawData.panelOrder as WindowId[];
          prefUpdate.panelOrder = nextOrder;
          setPanelOrderState(nextOrder);
        }
        if (rawData.codeColorScheme && typeof rawData.codeColorScheme === 'object') {
          const restoredColors: CodeColorScheme = { ...DEFAULT_CODE_COLOR_SCHEME };
          (Object.keys(DEFAULT_CODE_COLOR_SCHEME) as (keyof CodeColorScheme)[]).forEach((part) => {
            const val = (rawData.codeColorScheme as Record<string, unknown>)[part];
            if (typeof val === 'string' && /^#[0-9a-fA-F]{6}$/.test(val)) {
              restoredColors[part] = val;
            }
          });
          saveCodeColors(restoredColors);
        }

        await updatePreferences(prefUpdate);
        showToast('Backup importato nel tuo cloud workspace!', 'success');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
      }
    },
    [
      user,
      subjects,
      folders,
      notes,
      studyFiles.length,
      currentSubject,
      updatePreferences,
      showToast,
    ],
  );

  const importLegacyLocalStorage = useCallback(async () => {
    try {
      const legacyPayload: Record<string, unknown> = {
        subjects: JSON.parse(localStorage.getItem('its_subjects') || '[]'),
        currentSubject: localStorage.getItem('its_current_subject') || DEFAULT_SUBJECT_NAME,
        subjectConfig: JSON.parse(localStorage.getItem('its_subject_config') || '{}'),
        folders: JSON.parse(localStorage.getItem('its_folders') || '[]'),
        notes: JSON.parse(localStorage.getItem('its_notes') || '[]'),
        flashcardsData: JSON.parse(localStorage.getItem('its_flashcards') || '{}'),
      };
      await importBackupData(legacyPayload);
      localStorage.removeItem('its_notes');
      setHasLegacyBackup(false);
    } catch {
      showToast('Impossibile leggere i dati locali precedenti.', 'error');
    }
  }, [importBackupData, showToast]);

  return {
    user,
    authLoading,
    dataLoading,
    subjects,
    currentSubject,
    subjectFolders,
    subjectNotes,
    subjectStudyFiles,
    validOpenTabs,
    activeNote,
    effectiveActiveNoteId,
    activeNoteFlashcards,
    activeQuiz,
    quizHistory,
    themeMode,
    geminiModel,
    aiResponseStyle,
    aiResponseLanguage,
    defaultFlashcardCount,
    defaultQuizCount,
    studyDifficulty,
    autoShowQuizExplanations,
    editorFontSize,
    editorLineHeight,
    windowVisibility,
    panelWidths,
    panelOrder,
    panelColumns,
    collapsedExplorer,
    activeLayoutPreset,
    windowHeaderLabelMode,
    saveStatus,
    toasts,
    hasLegacyBackup,
    showToast,
    loginWithGoogle,
    logout,
    setThemeMode,
    saveWorkspaceSettings,
    setWindowVisibility,
    setPanelWidths,
    setPanelOrder,
    setPanelColumns,
    setCollapsedExplorer,
    applyLayoutPreset,
    setActiveColumnTab,
    selectSubject,
    createSubject,
    updateSubject,
    deleteSubject,
    openNote,
    closeTab,
    reorderTabs,
    createNote,
    updateNoteContent,
    renameNote,
    deleteNote,
    createFolder,
    toggleFolderOpen,
    renameFolder,
    deleteFolder,
    moveNoteOrder,
    uploadStudyFile,
    getStudyFileBase64,
    renameStudyFile,
    moveStudyFileToFolder,
    deleteStudyFile,
    addFlashcardsBatch,
    deleteFlashcard,
    createActiveQuiz,
    selectQuizAnswer,
    submitQuiz,
    cloneQuizAsActive,
    deleteQuiz,
    exportFullBackupJson,
    importBackupData,
    importLegacyLocalStorage,
    dismissLegacyBanner: () => setHasLegacyBackup(false),
    aiAccessStatus,
    aiAccessLoading,
    isAiAdmin,
    pendingAdminRequests,
    refreshAiAccess,
    requestAiAccess,
  };
}
