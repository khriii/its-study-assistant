import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { GoogleGenAI, Type } from '@google/genai';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'christianstelluti7@gmail.com').trim().toLowerCase();
const ENV_ALLOWED_EMAILS = new Set(
  (process.env.ALLOWED_USER_EMAILS || '')
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);
const AI_RATE_LIMIT_PER_MIN = Math.max(1, Number(process.env.AI_RATE_LIMIT_PER_MIN) || 15);
const REQUEST_COOLDOWN_MS = 5 * 60 * 1000;
const APPROVAL_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ACCESS_STORE_PATH = path.resolve(__dirname, '.ai-access-store.json');

interface AiPendingRequest {
  email: string;
  uid: string;
  displayName: string;
  note: string;
  requestedAt: string;
  lastEmailSentAt?: string;
}

interface AiAccessStore {
  approvedEmails: string[];
  rejectedEmails: string[];
  pendingRequests: AiPendingRequest[];
  signingSecret?: string;
}

interface VerifiedCaller {
  uid: string;
  email: string;
  displayName: string;
}

function resolveFirebaseProjectId(): string {
  const fromEnv = (process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { projectId?: unknown };
      if (typeof parsed.projectId === 'string' && parsed.projectId.trim()) {
        return parsed.projectId.trim();
      }
    }
  } catch (err) {
    console.warn('Impossibile leggere firebase-applet-config.json:', err);
  }
  return '';
}

const firebaseProjectId = resolveFirebaseProjectId();
const firebaseAdminApp = firebaseProjectId
  ? getApps().length > 0
    ? getApp()
    : initializeApp({ projectId: firebaseProjectId })
  : null;

function normalizeEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

function loadAccessStore(): AiAccessStore {
  const empty: AiAccessStore = {
    approvedEmails: [],
    rejectedEmails: [],
    pendingRequests: [],
  };
  try {
    if (!fs.existsSync(ACCESS_STORE_PATH)) return empty;
    const raw = fs.readFileSync(ACCESS_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AiAccessStore>;
    const approvedEmails = Array.isArray(parsed.approvedEmails)
      ? Array.from(new Set(parsed.approvedEmails.map(normalizeEmail).filter(Boolean)))
      : [];
    const rejectedEmails = Array.isArray(parsed.rejectedEmails)
      ? Array.from(new Set(parsed.rejectedEmails.map(normalizeEmail).filter(Boolean)))
      : [];
    const pendingRequests: AiPendingRequest[] = Array.isArray(parsed.pendingRequests)
      ? parsed.pendingRequests
          .filter((item): item is AiPendingRequest => Boolean(item && typeof item === 'object' && normalizeEmail(item.email)))
          .map((item) => ({
            email: normalizeEmail(item.email),
            uid: typeof item.uid === 'string' ? item.uid : '',
            displayName: typeof item.displayName === 'string' ? item.displayName.slice(0, 120) : '',
            note: typeof item.note === 'string' ? item.note.slice(0, 500) : '',
            requestedAt: typeof item.requestedAt === 'string' ? item.requestedAt : new Date().toISOString(),
            ...(typeof item.lastEmailSentAt === 'string' ? { lastEmailSentAt: item.lastEmailSentAt } : {}),
          }))
      : [];
    const signingSecret =
      typeof parsed.signingSecret === 'string' && parsed.signingSecret.trim()
        ? parsed.signingSecret.trim()
        : undefined;
    return { approvedEmails, rejectedEmails, pendingRequests, signingSecret };
  } catch (err) {
    console.warn('Impossibile leggere .ai-access-store.json, uso stato vuoto:', err);
    return empty;
  }
}

function saveAccessStore(store: AiAccessStore): void {
  fs.writeFileSync(ACCESS_STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function getSigningSecret(): string {
  const envSecret = (process.env.APPROVAL_TOKEN_SECRET || '').trim();
  if (envSecret) return envSecret;
  const store = loadAccessStore();
  if (store.signingSecret) return store.signingSecret;
  const generated = crypto.randomBytes(32).toString('hex');
  store.signingSecret = generated;
  saveAccessStore(store);
  return generated;
}

function isEmailAuthorized(email: string, store: AiAccessStore): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (normalized === ADMIN_EMAIL) return true;
  if (ENV_ALLOWED_EMAILS.has(normalized)) return true;
  return store.approvedEmails.includes(normalized);
}

function createDecisionToken(email: string, action: 'approve' | 'reject'): string {
  const payload = {
    email: normalizeEmail(email),
    action,
    exp: Date.now() + APPROVAL_TOKEN_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

function verifyDecisionToken(
  token: string,
): { email: string; action: 'approve' | 'reject'; exp: number } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payloadB64)
    .digest('base64url');
  const a = Buffer.from(sigB64, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      email?: unknown;
      action?: unknown;
      exp?: unknown;
    };
    const email = normalizeEmail(parsed.email);
    const action = parsed.action;
    const exp = Number(parsed.exp);
    if (!email || !email.includes('@')) return null;
    if (action !== 'approve' && action !== 'reject') return null;
    if (!Number.isFinite(exp) || exp < Date.now()) return null;
    return { email, action, exp };
  } catch {
    return null;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSmtpConfigured(): boolean {
  return Boolean((process.env.SMTP_USER || '').trim() && (process.env.SMTP_PASS || '').trim());
}

function resolvePublicBaseUrl(req: Request): string {
  const configured = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto =
    typeof protoHeader === 'string' && protoHeader.trim()
      ? protoHeader.split(',')[0].trim()
      : req.protocol || 'http';
  const hostHeader = req.headers['x-forwarded-host'] || req.get('host') || `localhost:${process.env.PORT || 3000}`;
  const host = typeof hostHeader === 'string' ? hostHeader.split(',')[0].trim() : `localhost:${process.env.PORT || 3000}`;
  return `${proto}://${host}`;
}

async function sendApprovalEmail(params: {
  requesterEmail: string;
  requesterName: string;
  note: string;
  approveUrl: string;
  rejectUrl: string;
}): Promise<void> {
  const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = Number(process.env.SMTP_PORT) || 465;
  const secureEnv = (process.env.SMTP_SECURE || '').trim().toLowerCase();
  const secure = secureEnv ? secureEnv === 'true' : port === 465;
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();
  const from = (process.env.SMTP_FROM || user).trim();

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  const safeName = escapeHtml(params.requesterName || 'Utente Google');
  const safeEmail = escapeHtml(params.requesterEmail);
  const safeNote = escapeHtml(params.note || 'Nessuna nota aggiuntiva.');

  const text = [
    `Nuova richiesta di accesso AI su ITS Universal Study Assistant`,
    ``,
    `Utente: ${params.requesterName || 'Utente Google'} (${params.requesterEmail})`,
    `Messaggio: ${params.note || 'Nessuna nota aggiuntiva.'}`,
    ``,
    `Approva accesso (valido 7 giorni): ${params.approveUrl}`,
    `Rifiuta richiesta: ${params.rejectUrl}`,
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; color: #0f172a; background: #ffffff;">
      <h2 style="margin: 0 0 12px; font-size: 18px; color: #0f172a;">Richiesta Accesso Gemini AI</h2>
      <p style="margin: 0 0 16px; font-size: 14px; color: #475569;">
        Un utente ha chiesto di utilizzare le funzionalità AI di <strong>ITS Universal Study Assistant</strong>.
      </p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 20px; font-size: 13px; line-height: 1.5;">
        <div><strong>Nome:</strong> ${safeName}</div>
        <div><strong>Email Google:</strong> ${safeEmail}</div>
        <div><strong>Nota:</strong> ${safeNote}</div>
      </div>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <a href="${escapeHtml(params.approveUrl)}" style="display: inline-block; background: #059669; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; font-size: 13px;">
          Approva Accesso AI
        </a>
        <a href="${escapeHtml(params.rejectUrl)}" style="display: inline-block; background: #dc2626; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; font-size: 13px;">
          Rifiuta Richiesta
        </a>
      </div>
      <p style="margin: 20px 0 0; font-size: 11px; color: #64748b;">
        I link firmati scadono tra 7 giorni. Puoi gestire le approvazioni anche da Impostazioni &gt; Gestione Accessi AI nell&apos;app.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from,
    to: ADMIN_EMAIL,
    subject: `[ITS Study Assistant] Richiesta accesso AI: ${params.requesterEmail}`,
    text,
    html,
  });
}

function applyAccessDecision(
  store: AiAccessStore,
  email: string,
  decision: 'approve' | 'reject' | 'revoke',
): AiAccessStore {
  const normalized = normalizeEmail(email);
  if (!normalized) return store;

  store.pendingRequests = store.pendingRequests.filter((r) => r.email !== normalized);

  if (decision === 'approve') {
    if (!store.approvedEmails.includes(normalized)) {
      store.approvedEmails.push(normalized);
    }
    store.rejectedEmails = store.rejectedEmails.filter((e) => e !== normalized);
  } else if (decision === 'reject') {
    if (!store.rejectedEmails.includes(normalized)) {
      store.rejectedEmails.push(normalized);
    }
    store.approvedEmails = store.approvedEmails.filter((e) => e !== normalized);
  } else {
    store.approvedEmails = store.approvedEmails.filter((e) => e !== normalized);
  }

  saveAccessStore(store);
  return store;
}

function buildAdminOverview(store: AiAccessStore) {
  const envList = Array.from(ENV_ALLOWED_EMAILS).filter((e) => e !== ADMIN_EMAIL);
  const allNonAdminApproved = Array.from(new Set([...envList, ...store.approvedEmails])).filter(
    (e) => e !== ADMIN_EMAIL,
  );
  return {
    adminEmail: ADMIN_EMAIL,
    smtpConfigured: isSmtpConfigured(),
    rateLimitPerMin: AI_RATE_LIMIT_PER_MIN,
    envAllowedEmails: envList,
    approvedEmails: store.approvedEmails,
    rejectedEmails: store.rejectedEmails,
    pendingRequests: store.pendingRequests,
    suggestedAllowedEnv: allNonAdminApproved.join(','),
  };
}

const rateLimitMap = new Map<string, number[]>();

function checkUserRateLimit(uid: string): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const now = Date.now();
  const windowStart = now - 60_000;
  const existing = rateLimitMap.get(uid) || [];
  const recent = existing.filter((ts) => ts > windowStart);
  if (recent.length >= AI_RATE_LIMIT_PER_MIN) {
    const oldest = recent[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + 60_000 - now) / 1000));
    rateLimitMap.set(uid, recent);
    return { allowed: false, retryAfterSec };
  }
  recent.push(now);
  rateLimitMap.set(uid, recent);
  return { allowed: true };
}

async function verifyFirebaseCaller(
  req: Request,
  res: Response,
): Promise<VerifiedCaller | null> {
  if (!firebaseAdminApp) {
    res.status(500).json({
      error: 'Configurazione Firebase del server mancante (projectId non trovato).',
      code: 'FIREBASE_CONFIG_MISSING',
    });
    return null;
  }

  const authHeader = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match || !match[1]?.trim()) {
    res.status(401).json({
      error: 'Autenticazione Google richiesta per utilizzare o verificare le funzioni AI.',
      code: 'AUTH_REQUIRED',
    });
    return null;
  }

  try {
    // 1-argument verifyIdToken works with zero IAM on Firebase Starter Tier
    const decoded = await getAuth(firebaseAdminApp).verifyIdToken(match[1].trim());
    const email = normalizeEmail(decoded.email);
    if (!email || decoded.email_verified !== true) {
      res.status(401).json({
        error: 'Account Google privo di email verificata.',
        code: 'EMAIL_NOT_VERIFIED',
      });
      return null;
    }
    const displayName =
      typeof decoded.name === 'string' && decoded.name.trim()
        ? decoded.name.trim().slice(0, 120)
        : email;
    return {
      uid: decoded.uid,
      email,
      displayName,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token Firebase non valido o scaduto.';
    res.status(401).json({
      error: `Sessione non valida o scaduta. Ricarica la pagina o rieffettua il login (${msg}).`,
      code: 'INVALID_AUTH_TOKEN',
    });
    return null;
  }
}

async function requireAiAccess(req: Request, res: Response): Promise<VerifiedCaller | null> {
  const caller = await verifyFirebaseCaller(req, res);
  if (!caller) return null;

  const store = loadAccessStore();
  if (!isEmailAuthorized(caller.email, store)) {
    const pending = store.pendingRequests.some((r) => r.email === caller.email);
    const rejected = store.rejectedEmails.includes(caller.email);
    res.status(403).json({
      error: pending
        ? `La tua richiesta AI è in attesa di approvazione da ${ADMIN_EMAIL}.`
        : rejected
          ? `L'accesso AI non è stato approvato per ${caller.email}. Puoi inviare una nuova richiesta.`
          : `Accesso alle funzioni Gemini AI riservato agli utenti approvati da ${ADMIN_EMAIL}.`,
      code: 'AI_ACCESS_REQUIRED',
      pending,
      rejected,
      adminEmail: ADMIN_EMAIL,
    });
    return null;
  }

  const limitCheck = checkUserRateLimit(caller.uid);
  if (!limitCheck.allowed) {
    res.setHeader('Retry-After', String(limitCheck.retryAfterSec));
    res.status(429).json({
      error: `Limite di ${AI_RATE_LIMIT_PER_MIN} richieste AI al minuto raggiunto. Riprova tra ${limitCheck.retryAfterSec} secondi.`,
      code: 'AI_RATE_LIMITED',
      retryAfterSec: limitCheck.retryAfterSec,
    });
    return null;
  }

  return caller;
}

const ALLOWED_MODELS = new Set(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);

type AiResponseStyle = 'concise' | 'standard' | 'in-depth';
type AiResponseLanguage = 'it' | 'en';
type StudyDifficulty = 'basic' | 'intermediate' | 'exam';

function resolveModel(requested?: unknown): string {
  if (typeof requested === 'string' && ALLOWED_MODELS.has(requested)) {
    return requested;
  }
  return 'gemini-4-hydrogen';
}

function resolveResponseStyle(val?: unknown): AiResponseStyle {
  return val === 'concise' || val === 'in-depth' ? val : 'standard';
}

function resolveLanguage(val?: unknown): AiResponseLanguage {
  return val === 'en' ? 'en' : 'it';
}

function resolveDifficulty(val?: unknown): StudyDifficulty {
  return val === 'basic' || val === 'exam' ? val : 'intermediate';
}

function stripJsonFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function buildChatStyleInstruction(style: AiResponseStyle, language: AiResponseLanguage): string {
  const langRule =
    language === 'en'
      ? 'Respond in clear Technical English (accurate IT/engineering terminology).'
      : 'Rispondi sempre in italiano chiaro, preciso e con terminologia tecnica appropriata.';

  const styleRule =
    style === 'concise'
      ? language === 'en'
        ? 'Style: Concise and schematic. Use short bullet points, key formulas/commands, and zero filler.'
        : 'Stile: Sintetico ed essenziale. Usa elenchi puntati brevi, parole chiave e zero preamboli superflui.'
      : style === 'in-depth'
        ? language === 'en'
          ? 'Style: In-depth and comprehensive. Explain underlying principles thoroughly and include concrete practical examples, edge cases, or code snippets.'
          : 'Stile: Approfondito e completo. Spiega i meccanismi sottostanti nel dettaglio e includi esempi pratici concreti, casi limite o snippet di codice.'
        : language === 'en'
          ? 'Style: Standard educational tutor. Clear structure with brief explanations and balanced examples.'
          : 'Stile: Didattico standard. Struttura ordinata con spiegazioni chiare ed esempi equilibrati.';

  return `${langRule}\n${styleRule}`;
}

function buildDifficultyInstruction(difficulty: StudyDifficulty, language: AiResponseLanguage): string {
  if (language === 'en') {
    if (difficulty === 'basic') return 'Difficulty: Basic (foundational definitions and core concepts).';
    if (difficulty === 'exam') return 'Difficulty: Exam-level (challenging edge cases, applied reasoning, and tricky distractors).';
    return 'Difficulty: Intermediate (solid conceptual understanding and practical application).';
  }
  if (difficulty === 'basic') return 'Difficoltà: Base (concetti fondamentali, definizioni e comprensione iniziale).';
  if (difficulty === 'exam') return 'Difficoltà: Livello Esame ITS (casi limite, ragionamento applicato e domande sfidanti).';
  return 'Difficoltà: Intermedia (comprensione solida e applicazione pratica dei concetti).';
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = /\b(429|503|504|RESOURCE_EXHAUSTED|UNAVAILABLE|fetch failed)\b/i.test(msg);
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw lastErr;
}

function formatGeminiError(error: unknown): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error || 'Errore interno del servizio AI.');
  if (raw.includes('GEMINI_API_KEY')) {
    return {
      status: 500,
      message: 'Chiave GEMINI_API_KEY non configurata o non valida sul server (controlla Settings > Secrets in AI Studio).',
    };
  }
  if (/401|UNAUTHENTICATED|API key not valid|ACCESS_TOKEN_TYPE_UNSUPPORTED|API_KEY_INVALID/i.test(raw)) {
    return {
      status: 401,
      message: 'Chiave API Gemini non valida o mancante sul server. Verifica o seleziona una chiave valida nel pannello Settings > Secrets di AI Studio e riavvia il server.',
    };
  }
  if (/403|PERMISSION_DENIED/i.test(raw)) {
    return {
      status: 403,
      message: 'Permessi insufficienti per la chiave API Gemini configurata (controlla Settings > Secrets in AI Studio).',
    };
  }
  if (/404|NOT_FOUND/i.test(raw)) {
    return {
      status: 404,
      message: 'Modello Gemini non trovato o non supportato. Seleziona gemini-4-hydrogen dalle Impostazioni.',
    };
  }
  if (/429|RESOURCE_EXHAUSTED/i.test(raw)) {
    return {
      status: 429,
      message: 'Quota richieste Gemini momentaneamente esaurita. Riprova tra qualche secondo.',
    };
  }
  return { status: 500, message: raw };
}

function getGenAIClient(): GoogleGenAI {
  const rawKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '')
    .trim()
    .replace(/^["']|["']$/g, '');
  if (!rawKey || rawKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY non configurata sul server.');
  }
  return new GoogleGenAI({
    apiKey: rawKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer(): Promise<void> {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  const extraOrigins = new Set(
    (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      const isAllowedOrigin =
        extraOrigins.has(origin) ||
        /^https:\/\/[a-z0-9-]+\.github\.io$/i.test(origin) ||
        /^http:\/\/localhost(:\d+)?$/i.test(origin);
      if (isAllowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      }
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/ai/access', async (req, res) => {
    const caller = await verifyFirebaseCaller(req, res);
    if (!caller) return;

    const store = loadAccessStore();
    const authorized = isEmailAuthorized(caller.email, store);
    const isAdmin = caller.email === ADMIN_EMAIL;
    const pending = store.pendingRequests.some((r) => r.email === caller.email);
    const rejected = !authorized && store.rejectedEmails.includes(caller.email);

    res.json({
      email: caller.email,
      displayName: caller.displayName,
      authorized,
      isAdmin,
      adminEmail: ADMIN_EMAIL,
      pending,
      rejected,
      smtpConfigured: isSmtpConfigured(),
      rateLimitPerMin: AI_RATE_LIMIT_PER_MIN,
    });
  });

  app.post('/api/ai/request-access', async (req, res) => {
    const caller = await verifyFirebaseCaller(req, res);
    if (!caller) return;

    const store = loadAccessStore();
    if (isEmailAuthorized(caller.email, store)) {
      res.json({
        ok: true,
        authorized: true,
        pending: false,
        emailSent: false,
        reason: 'ALREADY_AUTHORIZED',
      });
      return;
    }

    const existing = store.pendingRequests.find((r) => r.email === caller.email);
    if (existing) {
      const lastTime = Date.parse(existing.lastEmailSentAt || existing.requestedAt);
      if (Number.isFinite(lastTime) && Date.now() - lastTime < REQUEST_COOLDOWN_MS) {
        const waitSec = Math.max(
          1,
          Math.ceil((REQUEST_COOLDOWN_MS - (Date.now() - lastTime)) / 1000),
        );
        res.status(429).json({
          error: `Hai già inviato una richiesta di recente. Attendi circa ${Math.ceil(waitSec / 60)} min prima di inviarne un'altra.`,
          code: 'REQUEST_COOLDOWN',
        });
        return;
      }
    }

    const rawNote = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '';
    const nowIso = new Date().toISOString();

    store.rejectedEmails = store.rejectedEmails.filter((e) => e !== caller.email);
    store.pendingRequests = [
      {
        email: caller.email,
        uid: caller.uid,
        displayName: caller.displayName,
        note: rawNote,
        requestedAt: nowIso,
      },
      ...store.pendingRequests.filter((r) => r.email !== caller.email),
    ];
    saveAccessStore(store);

    const mailtoSubject = encodeURIComponent(
      `[ITS Study Assistant] Richiesta accesso AI - ${caller.email}`,
    );
    const mailtoBody = encodeURIComponent(
      [
        `Ciao,`,
        ``,
        `Vorrei richiedere l'approvazione per usare le funzioni Gemini AI su ITS Universal Study Assistant.`,
        `Utente: ${caller.displayName}`,
        `Email Google: ${caller.email}`,
        rawNote ? `Messaggio: ${rawNote}` : '',
        ``,
        `Per approvare o rifiutare, apri Impostazioni > Gestione Accessi AI nell'applicazione.`,
      ]
        .filter(Boolean)
        .join('\n'),
    );
    const mailtoUrl = `mailto:${ADMIN_EMAIL}?subject=${mailtoSubject}&body=${mailtoBody}`;

    if (!isSmtpConfigured()) {
      res.json({
        ok: true,
        authorized: false,
        pending: true,
        emailSent: false,
        reason: 'SMTP_NOT_CONFIGURED',
        mailtoUrl,
      });
      return;
    }

    try {
      const baseUrl = resolvePublicBaseUrl(req);
      const approveToken = createDecisionToken(caller.email, 'approve');
      const rejectToken = createDecisionToken(caller.email, 'reject');
      const approveUrl = `${baseUrl}/api/ai/decision?token=${encodeURIComponent(approveToken)}`;
      const rejectUrl = `${baseUrl}/api/ai/decision?token=${encodeURIComponent(rejectToken)}`;

      await sendApprovalEmail({
        requesterEmail: caller.email,
        requesterName: caller.displayName,
        note: rawNote,
        approveUrl,
        rejectUrl,
      });

      const updatedStore = loadAccessStore();
      updatedStore.pendingRequests = updatedStore.pendingRequests.map((r) =>
        r.email === caller.email ? { ...r, lastEmailSentAt: new Date().toISOString() } : r,
      );
      saveAccessStore(updatedStore);

      res.json({
        ok: true,
        authorized: false,
        pending: true,
        emailSent: true,
        mailtoUrl,
      });
    } catch (err) {
      console.error('Errore invio email SMTP approvazione:', err);
      res.json({
        ok: true,
        authorized: false,
        pending: true,
        emailSent: false,
        reason: 'SMTP_SEND_FAILED',
        mailtoUrl,
      });
    }
  });

  app.get('/api/ai/decision', (req, res) => {
    const rawToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    const parsed = rawToken ? verifyDecisionToken(rawToken) : null;
    if (!parsed) {
      res
        .status(400)
        .type('html')
        .send(
          `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Link non valido</title></head><body style="font-family:system-ui,sans-serif;max-width:520px;margin:48px auto;padding:24px;color:#0f172a;"><h2>Link di approvazione non valido o scaduto</h2><p>Puoi gestire la richiesta direttamente nell&apos;app da <strong>Impostazioni &gt; Gestione Accessi AI</strong>.</p></body></html>`,
        );
      return;
    }

    const store = loadAccessStore();
    applyAccessDecision(store, parsed.email, parsed.action);
    const overview = buildAdminOverview(store);
    const actionLabel = parsed.action === 'approve' ? 'Accesso AI Approvato' : 'Richiesta Rifiutata';
    const accent = parsed.action === 'approve' ? '#059669' : '#dc2626';

    res
      .status(200)
      .type('html')
      .send(
        `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(actionLabel)} - ITS Study Assistant</title>
  </head>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#0f172a;padding:32px 16px;">
    <div style="max-width:540px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:24px;box-shadow:0 4px 20px rgba(15,23,42,0.06);">
      <div style="display:inline-block;padding:4px 10px;border-radius:6px;background:${accent};color:#ffffff;font-size:12px;font-weight:600;margin-bottom:12px;">
        ${escapeHtml(actionLabel)}
      </div>
      <h1 style="margin:0 0 8px;font-size:20px;">${escapeHtml(parsed.email)}</h1>
      <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.5;">
        ${
          parsed.action === 'approve'
            ? "L'utente può ora utilizzare Chat AI, Flashcards e Quiz su ITS Universal Study Assistant."
            : "La richiesta è stata rifiutata. L'utente non potrà utilizzare le chiavi Gemini del server."
        }
      </p>
      ${
        overview.suggestedAllowedEnv
          ? `<div style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:12px;font-size:12px;">
              <div style="font-weight:600;margin-bottom:6px;">Per rendere persistente la lista anche dopo un riavvio del container, aggiorna ALLOWED_USER_EMAILS nei Secrets:</div>
              <code style="word-break:break-all;font-family:monospace;">${escapeHtml(overview.suggestedAllowedEnv)}</code>
            </div>`
          : ''
      }
    </div>
  </body>
</html>`,
      );
  });

  app.get('/api/ai/admin/requests', async (req, res) => {
    const caller = await verifyFirebaseCaller(req, res);
    if (!caller) return;
    if (caller.email !== ADMIN_EMAIL) {
      res.status(403).json({ error: 'Operazione riservata all\'amministratore.' });
      return;
    }
    const store = loadAccessStore();
    res.json(buildAdminOverview(store));
  });

  app.post('/api/ai/admin/decide', async (req, res) => {
    const caller = await verifyFirebaseCaller(req, res);
    if (!caller) return;
    if (caller.email !== ADMIN_EMAIL) {
      res.status(403).json({ error: 'Operazione riservata all\'amministratore.' });
      return;
    }

    const email = normalizeEmail(req.body?.email);
    const decision = req.body?.decision;
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Indirizzo email non valido.' });
      return;
    }
    if (decision !== 'approve' && decision !== 'reject' && decision !== 'revoke') {
      res.status(400).json({ error: 'Decisione non valida.' });
      return;
    }
    if (email === ADMIN_EMAIL && decision !== 'approve') {
      res.status(400).json({ error: 'Non puoi revocare l\'accesso dell\'amministratore.' });
      return;
    }

    const store = loadAccessStore();
    applyAccessDecision(store, email, decision);
    res.json({ ok: true, overview: buildAdminOverview(store) });
  });

  app.post('/api/ai/chat', async (req, res) => {
    const caller = await requireAiAccess(req, res);
    if (!caller) return;
    try {
      const { model, systemInstruction, contents, responseStyle, responseLanguage } = req.body ?? {};
      if (!Array.isArray(contents) || contents.length === 0) {
        res.status(400).json({ error: 'Contenuto della conversazione mancante.' });
        return;
      }

      const ai = getGenAIClient();
      const selectedModel = resolveModel(model);
      const style = resolveResponseStyle(responseStyle);
      const language = resolveLanguage(responseLanguage);

      const basePrompt =
        typeof systemInstruction === 'string' && systemInstruction.trim()
          ? systemInstruction.trim()
          : 'Sei un tutor AI didattico per studenti ITS.';
      const fullInstruction = `${basePrompt}\n\n${buildChatStyleInstruction(style, language)}`;

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: selectedModel,
          contents,
          config: {
            systemInstruction: fullInstruction,
          },
        }),
      );

      const text = response.text?.trim() || 'Nessuna risposta ricevuta dal modello.';
      res.json({ text });
    } catch (error: unknown) {
      const formatted = formatGeminiError(error);
      console.error('Errore /api/ai/chat:', formatted.message);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/flashcards', async (req, res) => {
    const caller = await requireAiAccess(req, res);
    if (!caller) return;
    try {
      const { model, noteText, subjectName, count, difficulty, responseLanguage } = req.body ?? {};
      if (typeof noteText !== 'string' || !noteText.trim()) {
        res.status(400).json({ error: 'Testo della nota vuoto.' });
        return;
      }

      const parsedCount = Number(count);
      const cardCount = Number.isFinite(parsedCount)
        ? Math.max(1, Math.min(10, Math.round(parsedCount)))
        : 6;
      const diff = resolveDifficulty(difficulty);
      const lang = resolveLanguage(responseLanguage);
      const subjectLabel = typeof subjectName === 'string' && subjectName.trim() ? subjectName.trim() : 'Studio ITS';

      const ai = getGenAIClient();
      const selectedModel = resolveModel(model);

      const langPrompt =
        lang === 'en'
          ? `Generate exactly ${cardCount} educational flashcards in Technical English for the subject "${subjectLabel}" based strictly on these notes:`
          : `Genera esattamente ${cardCount} flashcard didattiche in italiano per la materia "${subjectLabel}" basate esclusivamente su questi appunti:`;

      const sysPrompt =
        lang === 'en'
          ? `You are an AI tutor creating active-recall flashcards in Technical English. Each card must have a clear question (q) and a concise, accurate answer (a).\n${buildDifficultyInstruction(diff, lang)}`
          : `Sei un tutor AI che crea flashcard di ripasso attivo in italiano. Ogni flashcard deve avere una domanda chiara (q) e una risposta concisa ma completa (a).\n${buildDifficultyInstruction(diff, lang)}`;

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: selectedModel,
          contents: `${langPrompt}\n\n${noteText.slice(0, 30000)}`,
          config: {
            systemInstruction: sysPrompt,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  q: {
                    type: Type.STRING,
                    description: 'Domanda chiara per il fronte della flashcard.',
                  },
                  a: {
                    type: Type.STRING,
                    description: 'Risposta concisa e precisa per il retro della flashcard.',
                  },
                },
                required: ['q', 'a'],
              },
            },
          },
        }),
      );

      const raw = stripJsonFence(response.text ?? '[]');
      const parsed: unknown = JSON.parse(raw || '[]');
      const list = Array.isArray(parsed) ? parsed : [];
      const cards = list
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const record = item as Record<string, unknown>;
          const q = String(record.q ?? '').trim();
          const a = String(record.a ?? '').trim();
          return q && a ? { q, a } : null;
        })
        .filter((item): item is { q: string; a: string } => item !== null)
        .slice(0, cardCount);

      if (cards.length === 0) {
        res.status(502).json({ error: 'Nessuna flashcard valida generata dal modello.' });
        return;
      }

      res.json({ cards });
    } catch (error: unknown) {
      const formatted = formatGeminiError(error);
      console.error('Errore /api/ai/flashcards:', formatted.message);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/quiz', async (req, res) => {
    const caller = await requireAiAccess(req, res);
    if (!caller) return;
    try {
      const { model, noteText, subjectName, count, difficulty, responseLanguage } = req.body ?? {};
      if (typeof noteText !== 'string' || !noteText.trim()) {
        res.status(400).json({ error: 'Testo della nota vuoto.' });
        return;
      }

      const parsedCount = Number(count);
      const questionCount = Number.isFinite(parsedCount)
        ? Math.max(1, Math.min(20, Math.round(parsedCount)))
        : 5;
      const diff = resolveDifficulty(difficulty);
      const lang = resolveLanguage(responseLanguage);
      const subjectLabel = typeof subjectName === 'string' && subjectName.trim() ? subjectName.trim() : 'Studio ITS';

      const ai = getGenAIClient();
      const selectedModel = resolveModel(model);

      const langPrompt =
        lang === 'en'
          ? `Create a multiple-choice quiz of exactly ${questionCount} questions (4 options without A/B/C/D letter prefixes) on "${subjectLabel}" based strictly on these notes:`
          : `Crea un quiz di esattamente ${questionCount} domande a risposta multipla (4 opzioni senza prefissi A, B, C, D) sulla materia "${subjectLabel}" basato su questi appunti:`;

      const sysPrompt =
        lang === 'en'
          ? `You are an ITS instructor creating multiple-choice verification quizzes in Technical English. Return exactly the requested number of questions, each with 4 distinct options, correctIndex from 0 to 3, and a concise 1-2 sentence explanation.\n${buildDifficultyInstruction(diff, lang)}`
          : `Sei un docente ITS che crea quiz di verifica a risposta multipla in italiano. Restituisci esattamente il numero di domande richiesto, ciascuna con 4 opzioni distinte, correctIndex da 0 a 3 e una spiegazione breve (1-2 frasi).\n${buildDifficultyInstruction(diff, lang)}`;

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: selectedModel,
          contents: `${langPrompt}\n\n${noteText.slice(0, 30000)}`,
          config: {
            systemInstruction: sysPrompt,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: {
                    type: Type.STRING,
                    description: 'Testo della domanda.',
                  },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Esattamente 4 opzioni di risposta senza prefissi A), B), C), D).',
                  },
                  correctIndex: {
                    type: Type.INTEGER,
                    description: 'Indice da 0 a 3 della risposta esatta.',
                  },
                  explanation: {
                    type: Type.STRING,
                    description: 'Spiegazione sintetica di 1-2 frasi.',
                  },
                },
                required: ['question', 'options', 'correctIndex', 'explanation'],
              },
            },
          },
        }),
      );

      const raw = stripJsonFence(response.text ?? '[]');
      const parsed: unknown = JSON.parse(raw || '[]');
      const list = Array.isArray(parsed) ? parsed : [];
      const questions = list
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const record = item as Record<string, unknown>;
          const question = String(record.question ?? '').trim();
          const rawOpts = Array.isArray(record.options) ? record.options : [];
          const options = rawOpts
            .map((opt) => String(opt ?? '').replace(/^[A-Da-d][).\-]\s*/, '').trim())
            .filter(Boolean)
            .slice(0, 4);
          const correctIndex = Number(record.correctIndex);
          const explanation = String(record.explanation ?? '').trim();
          if (
            !question ||
            options.length < 4 ||
            !Number.isInteger(correctIndex) ||
            correctIndex < 0 ||
            correctIndex > 3
          ) {
            return null;
          }
          return { question, options, correctIndex, explanation };
        })
        .filter(
          (item): item is { question: string; options: string[]; correctIndex: number; explanation: string } =>
            item !== null,
        )
        .slice(0, questionCount);

      if (questions.length === 0) {
        res.status(502).json({ error: 'Formato domande non valido ricevuto dal modello.' });
        return;
      }

      res.json({ questions });
    } catch (error: unknown) {
      const formatted = formatGeminiError(error);
      console.error('Errore /api/ai/quiz:', formatted.message);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/run-code', async (req, res) => {
    const caller = await requireAiAccess(req, res);
    if (!caller) return;
    try {
      const { model, code, language } = req.body ?? {};
      if (typeof code !== 'string' || !code.trim()) {
        res.status(400).json({ error: 'Codice vuoto da eseguire.' });
        return;
      }

      const lang = typeof language === 'string' && language.trim() ? language.trim() : 'plaintext';
      const ai = getGenAIClient();
      const selectedModel = resolveModel(model);

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: `Linguaggio: ${lang}\n\nCodice:\n\`\`\`${lang}\n${code.slice(0, 20000)}\n\`\`\``,
        config: {
          systemInstruction:
            'Sei un interprete/compilatore preciso per codice didattico. Analizza il codice fornito ed esegui mentalmente passo-passo il programma. Restituisci esclusivamente un JSON con: stdout (output esatto prodotto su standard output, stringa vuota se nessuno), stderr (eventuali errori di compilazione o runtime in italiano/tecnico se presenti, altrimenti stringa vuota), exitCode (0 se esecuzione riuscita, 1 se errore). Non inventare output non prodotto dal codice.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              stdout: {
                type: Type.STRING,
                description: 'Output esatto su stdout.',
              },
              stderr: {
                type: Type.STRING,
                description: 'Eventuali errori di compilazione o runtime.',
              },
              exitCode: {
                type: Type.INTEGER,
                description: 'Codice di uscita (0 successo, 1 errore).',
              },
            },
            required: ['stdout', 'stderr', 'exitCode'],
          },
        },
      });

      const raw = (response.text ?? '{}').trim();
      const parsed = JSON.parse(raw) as {
        stdout?: unknown;
        stderr?: unknown;
        exitCode?: unknown;
      };
      res.json({
        stdout: String(parsed.stdout ?? ''),
        stderr: String(parsed.stderr ?? ''),
        exitCode: Number.isInteger(Number(parsed.exitCode)) ? Number(parsed.exitCode) : 0,
      });
    } catch (error: unknown) {
      const formatted = formatGeminiError(error);
      console.error('Errore /api/ai/run-code:', formatted.message);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`ITS Study Assistant server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
