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

export async function parseAiJsonResponse<T extends { error?: string }>(
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
          throw new Error(
            isGitHubPagesHost()
              ? `Le funzioni AI richiedono il server backend (non disponibile su GitHub Pages statico: ${endpointPath}). Usa l'app su AI Studio oppure collega un backend Node tramite VITE_AI_API_URL.`
              : `Endpoint AI non trovato (${endpointPath}, HTTP ${res.status}).`,
          );
        }
        throw new Error(`Errore HTTP ${res.status}`);
      }
      throw new Error('Risposta non valida dal server AI.');
    }
  }
  if (!res.ok) {
    throw new Error(data.error || `Errore HTTP ${res.status}`);
  }
  return data;
}
