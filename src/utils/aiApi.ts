import { auth } from '../firebase';
import type {
  AiAccessRequestResult,
  AiAccessStatus,
  AiAdminAccessOverview,
} from '../types';

export class AiApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'AiApiError';
    this.status = status;
    this.code = code;
  }
}

export function getAiApiBaseUrl(): string {
  const raw = import.meta.env.VITE_AI_API_URL;
  return typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
}

export function getAiEndpoint(path: string): string {
  const base = getAiApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

export function isGitHubPagesHost(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.toLowerCase().endsWith('.github.io');
}

export function isStaticHostWithoutAiBackend(): boolean {
  return isGitHubPagesHost() && !getAiApiBaseUrl();
}

export async function getFirebaseAuthHeaders(
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new AiApiError(
      'Devi effettuare l\'accesso con Google per utilizzare le funzioni AI.',
      401,
      'AUTH_REQUIRED',
    );
  }
  const idToken = await currentUser.getIdToken();
  return {
    ...extra,
    Authorization: `Bearer ${idToken}`,
  };
}

export async function parseAiJsonResponse<T extends { error?: string; code?: string }>(
  res: Response,
  endpointPath: string,
): Promise<T> {
  const rawText = await res.text();
  let data = {} as T;
  if (rawText) {
    try {
      data = JSON.parse(rawText) as T;
    } catch {
      if (!res.ok) {
        if (res.status === 404 || res.status === 405) {
          throw new AiApiError(
            isGitHubPagesHost()
              ? `Le funzioni AI richiedono il server backend (non disponibile su GitHub Pages statico: ${endpointPath}). Usa l'app su AI Studio oppure collega un backend Node tramite VITE_AI_API_URL.`
              : `Endpoint AI non trovato (${endpointPath}, HTTP ${res.status}).`,
            res.status,
            'ENDPOINT_NOT_FOUND',
          );
        }
        throw new AiApiError(`Errore HTTP ${res.status}`, res.status);
      }
      throw new AiApiError('Risposta non valida dal server AI.', res.status || 500);
    }
  }
  if (!res.ok) {
    throw new AiApiError(
      data.error || `Errore HTTP ${res.status}`,
      res.status,
      typeof data.code === 'string' ? data.code : undefined,
    );
  }
  return data;
}

export async function fetchAiAccessStatus(): Promise<AiAccessStatus | null> {
  if (isStaticHostWithoutAiBackend() || !auth.currentUser) {
    return null;
  }
  try {
    const headers = await getFirebaseAuthHeaders();
    const res = await fetch(getAiEndpoint('/api/ai/access'), {
      method: 'GET',
      headers,
    });
    if (res.status === 404 || res.status === 405) {
      return null;
    }
    return await parseAiJsonResponse<AiAccessStatus & { error?: string; code?: string }>(
      res,
      '/api/ai/access',
    );
  } catch (err) {
    if (err instanceof AiApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export async function requestAiAccessApi(note = ''): Promise<AiAccessRequestResult> {
  const headers = await getFirebaseAuthHeaders({ 'Content-Type': 'application/json' });
  const res = await fetch(getAiEndpoint('/api/ai/request-access'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ note }),
  });
  return parseAiJsonResponse<AiAccessRequestResult & { error?: string; code?: string }>(
    res,
    '/api/ai/request-access',
  );
}

export async function fetchAdminAiAccessOverview(): Promise<AiAdminAccessOverview> {
  const headers = await getFirebaseAuthHeaders();
  const res = await fetch(getAiEndpoint('/api/ai/admin/requests'), {
    method: 'GET',
    headers,
  });
  return parseAiJsonResponse<AiAdminAccessOverview & { error?: string; code?: string }>(
    res,
    '/api/ai/admin/requests',
  );
}

export async function decideAiAccessApi(
  email: string,
  decision: 'approve' | 'reject' | 'revoke',
): Promise<AiAdminAccessOverview> {
  const headers = await getFirebaseAuthHeaders({ 'Content-Type': 'application/json' });
  const res = await fetch(getAiEndpoint('/api/ai/admin/decide'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, decision }),
  });
  const data = await parseAiJsonResponse<{
    ok: boolean;
    overview: AiAdminAccessOverview;
    error?: string;
    code?: string;
  }>(res, '/api/ai/admin/decide');
  return data.overview;
}

