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
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AiAccessRequestResult,
  AiAccessStatus,
  AiAdminAccessOverview,
  AiPendingRequest,
} from '../types';

export const ADMIN_EMAIL_ADDRESS = 'christianstelluti7@gmail.com';

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

export async function emailToAllowlistDocId(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getFirebaseAuthHeaders(
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new AiApiError(
      "Devi effettuare l'accesso con Google per utilizzare le funzioni AI.",
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

function timestampToIso(ts: unknown): string {
  if (ts && typeof ts === 'object' && 'toDate' in ts) {
    try {
      return (ts as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return new Date().toISOString();
    }
  }
  return new Date().toISOString();
}

async function fetchFirestoreMyAccessState(): Promise<{
  approved: boolean;
  pending: boolean;
  rejected: boolean;
}> {
  const currentUser = auth.currentUser;
  const email = (currentUser?.email || '').trim().toLowerCase();
  if (!currentUser || !email) {
    return { approved: false, pending: false, rejected: false };
  }
  if (email === ADMIN_EMAIL_ADDRESS) {
    return { approved: true, pending: false, rejected: false };
  }

  let approved = false;
  let pending = false;
  let rejected = false;

  try {
    const allowSnap = await getDocs(
      query(collection(db, 'aiAllowlist'), where('email', '==', email)),
    );
    approved = allowSnap.docs.some((d) => d.data()?.approved === true);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'aiAllowlist');
  }

  try {
    const reqRef = doc(db, 'aiAccessRequests', currentUser.uid);
    const reqSnap = await getDoc(reqRef);
    if (reqSnap.exists()) {
      const status = reqSnap.data()?.status;
      if (status === 'approved') approved = true;
      else if (status === 'pending') pending = true;
      else if (status === 'rejected') rejected = true;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `aiAccessRequests/${currentUser.uid}`);
  }

  return { approved, pending: !approved && pending, rejected: !approved && rejected };
}

export async function submitFirestoreAiAccessRequest(note = ''): Promise<void> {
  const currentUser = auth.currentUser;
  const email = (currentUser?.email || '').trim().toLowerCase();
  if (!currentUser || !email) {
    throw new AiApiError(
      "Devi effettuare l'accesso con Google per richiedere l'accesso AI.",
      401,
      'AUTH_REQUIRED',
    );
  }
  const reqRef = doc(db, 'aiAccessRequests', currentUser.uid);
  const displayName = (currentUser.displayName?.trim() || email || 'Studente ITS').slice(0, 120);
  const cleanNote = note.trim().slice(0, 500);

  try {
    const existing = await getDoc(reqRef);
    if (!existing.exists()) {
      await setDoc(reqRef, {
        uid: currentUser.uid,
        email,
        displayName,
        note: cleanNote,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (existing.data()?.status !== 'approved') {
      await updateDoc(reqRef, {
        displayName,
        note: cleanNote,
        status: 'pending',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `aiAccessRequests/${currentUser.uid}`);
  }
}

export function subscribeAdminPendingRequests(
  onUpdate: (requests: AiPendingRequest[]) => void,
): () => void {
  const currentUser = auth.currentUser;
  const email = (currentUser?.email || '').trim().toLowerCase();
  if (!currentUser || email !== ADMIN_EMAIL_ADDRESS) {
    return () => undefined;
  }

  const q = query(collection(db, 'aiAccessRequests'), where('status', '==', 'pending'));
  return onSnapshot(
    q,
    (snap) => {
      const list: AiPendingRequest[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            uid: String(data.uid || d.id),
            email: String(data.email || '').trim().toLowerCase(),
            displayName: String(data.displayName || ''),
            note: String(data.note || ''),
            requestedAt: timestampToIso(data.updatedAt || data.createdAt),
          };
        })
        .filter((item) => Boolean(item.email))
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
      onUpdate(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'aiAccessRequests');
    },
  );
}

export async function fetchAiAccessStatus(): Promise<AiAccessStatus | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;

  if (isStaticHostWithoutAiBackend()) {
    return null;
  }

  const firestoreState = await fetchFirestoreMyAccessState().catch(() => ({
    approved: false,
    pending: false,
    rejected: false,
  }));

  try {
    const headers = await getFirebaseAuthHeaders();
    const res = await fetch(getAiEndpoint('/api/ai/access'), {
      method: 'GET',
      headers,
    });
    if (res.status === 404 || res.status === 405) {
      return null;
    }
    const serverStatus = await parseAiJsonResponse<
      AiAccessStatus & { error?: string; code?: string }
    >(res, '/api/ai/access');

    const authorized = serverStatus.authorized || firestoreState.approved;
    const pending = !authorized && (serverStatus.pending || firestoreState.pending);
    const rejected = !authorized && !pending && (serverStatus.rejected || firestoreState.rejected);

    return {
      ...serverStatus,
      authorized,
      pending,
      rejected,
    };
  } catch (err) {
    if (err instanceof AiApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export async function requestAiAccessApi(note = ''): Promise<AiAccessRequestResult> {
  await submitFirestoreAiAccessRequest(note);

  if (isStaticHostWithoutAiBackend()) {
    return {
      ok: true,
      authorized: false,
      pending: true,
      emailSent: false,
      reason: 'STATIC_HOST',
    };
  }

  try {
    const headers = await getFirebaseAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch(getAiEndpoint('/api/ai/request-access'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ note }),
    });
    return await parseAiJsonResponse<AiAccessRequestResult & { error?: string; code?: string }>(
      res,
      '/api/ai/request-access',
    );
  } catch (err) {
    // Even if backend returns cooldown or isn't reachable, Firestore already saved the request
    if (err instanceof AiApiError && err.status === 429) {
      throw err;
    }
    return {
      ok: true,
      authorized: false,
      pending: true,
      emailSent: false,
      reason: 'FIRESTORE_ONLY',
    };
  }
}

export async function fetchAdminAiAccessOverview(): Promise<AiAdminAccessOverview> {
  const currentUser = auth.currentUser;
  const email = (currentUser?.email || '').trim().toLowerCase();
  if (!currentUser || email !== ADMIN_EMAIL_ADDRESS) {
    throw new AiApiError("Operazione riservata all'amministratore.", 403, 'FORBIDDEN');
  }

  let fsPending: AiPendingRequest[] = [];
  let fsApproved: string[] = [];
  let fsRejected: string[] = [];

  try {
    const reqSnap = await getDocs(collection(db, 'aiAccessRequests'));
    reqSnap.docs.forEach((d) => {
      const data = d.data();
      const reqEmail = String(data.email || '').trim().toLowerCase();
      if (!reqEmail) return;
      if (data.status === 'pending') {
        fsPending.push({
          uid: String(data.uid || d.id),
          email: reqEmail,
          displayName: String(data.displayName || ''),
          note: String(data.note || ''),
          requestedAt: timestampToIso(data.updatedAt || data.createdAt),
        });
      } else if (data.status === 'rejected') {
        fsRejected.push(reqEmail);
      }
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'aiAccessRequests');
  }

  try {
    const allowSnap = await getDocs(collection(db, 'aiAllowlist'));
    allowSnap.docs.forEach((d) => {
      const data = d.data();
      const allowEmail = String(data.email || '').trim().toLowerCase();
      if (allowEmail && data.approved === true) {
        fsApproved.push(allowEmail);
      }
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'aiAllowlist');
  }

  let serverOverview: AiAdminAccessOverview = {
    adminEmail: ADMIN_EMAIL_ADDRESS,
    smtpConfigured: false,
    rateLimitPerMin: 15,
    envAllowedEmails: [],
    approvedEmails: [],
    rejectedEmails: [],
    pendingRequests: [],
    suggestedAllowedEnv: '',
  };

  if (!isStaticHostWithoutAiBackend()) {
    try {
      const headers = await getFirebaseAuthHeaders();
      const res = await fetch(getAiEndpoint('/api/ai/admin/requests'), {
        method: 'GET',
        headers,
      });
      if (res.ok) {
        serverOverview = await parseAiJsonResponse<
          AiAdminAccessOverview & { error?: string; code?: string }
        >(res, '/api/ai/admin/requests');
      }
    } catch {
      // Fallback to Firestore data seamlessly
    }
  }

  const mergedApproved = Array.from(
    new Set([...serverOverview.approvedEmails, ...fsApproved]),
  ).filter((e) => e && e !== serverOverview.adminEmail);

  const approvedSet = new Set([
    serverOverview.adminEmail,
    ...serverOverview.envAllowedEmails,
    ...mergedApproved,
  ]);

  const pendingByEmail = new Map<string, AiPendingRequest>();
  [...serverOverview.pendingRequests, ...fsPending].forEach((reqItem) => {
    if (!approvedSet.has(reqItem.email)) {
      const existing = pendingByEmail.get(reqItem.email);
      if (!existing || reqItem.requestedAt > existing.requestedAt) {
        pendingByEmail.set(reqItem.email, reqItem);
      }
    }
  });

  const mergedPending = Array.from(pendingByEmail.values()).sort((a, b) =>
    b.requestedAt.localeCompare(a.requestedAt),
  );

  const mergedRejected = Array.from(
    new Set([...serverOverview.rejectedEmails, ...fsRejected]),
  ).filter((e) => !approvedSet.has(e) && !pendingByEmail.has(e));

  const allNonAdminApproved = Array.from(
    new Set([...serverOverview.envAllowedEmails, ...mergedApproved]),
  ).filter((e) => e && e !== serverOverview.adminEmail);

  return {
    ...serverOverview,
    approvedEmails: mergedApproved,
    rejectedEmails: mergedRejected,
    pendingRequests: mergedPending,
    suggestedAllowedEnv: allNonAdminApproved.join(','),
  };
}

export async function decideAiAccessApi(
  email: string,
  decision: 'approve' | 'reject' | 'revoke',
): Promise<AiAdminAccessOverview> {
  const currentUser = auth.currentUser;
  const adminEmail = (currentUser?.email || '').trim().toLowerCase();
  const targetEmail = email.trim().toLowerCase();
  if (!currentUser || adminEmail !== ADMIN_EMAIL_ADDRESS) {
    throw new AiApiError("Operazione riservata all'amministratore.", 403, 'FORBIDDEN');
  }

  const emailHash = await emailToAllowlistDocId(targetEmail);
  const allowRef = doc(db, 'aiAllowlist', emailHash);

  if (decision === 'approve') {
    try {
      const existingAllow = await getDoc(allowRef);
      if (!existingAllow.exists()) {
        await setDoc(allowRef, {
          id: emailHash,
          email: targetEmail,
          approved: true,
          approvedBy: adminEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(allowRef, {
          approved: true,
          approvedBy: adminEmail,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `aiAllowlist/${emailHash}`);
    }
  } else {
    try {
      await deleteDoc(allowRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `aiAllowlist/${emailHash}`);
    }
  }

  // Sync matching request docs in Firestore
  try {
    const reqSnap = await getDocs(
      query(collection(db, 'aiAccessRequests'), where('email', '==', targetEmail)),
    );
    const nextStatus = decision === 'approve' ? 'approved' : 'rejected';
    await Promise.all(
      reqSnap.docs.map((d) =>
        updateDoc(d.ref, {
          status: nextStatus,
          updatedAt: serverTimestamp(),
        }),
      ),
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'aiAccessRequests');
  }

  // Also notify local Node server store if available
  if (!isStaticHostWithoutAiBackend()) {
    try {
      const headers = await getFirebaseAuthHeaders({ 'Content-Type': 'application/json' });
      await fetch(getAiEndpoint('/api/ai/admin/decide'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: targetEmail, decision }),
      });
    } catch {
      // Non-fatal; Firestore is already updated
    }
  }

  return fetchAdminAiAccessOverview();
}

export async function sendAdminTestEmailApi(): Promise<{
  ok: boolean;
  to: string;
  baseUrl: string;
}> {
  const currentUser = auth.currentUser;
  const email = (currentUser?.email || '').trim().toLowerCase();
  if (!currentUser || email !== ADMIN_EMAIL_ADDRESS) {
    throw new AiApiError("Operazione riservata all'amministratore.", 403, 'FORBIDDEN');
  }
  if (isStaticHostWithoutAiBackend()) {
    throw new AiApiError(
      "Il test email SMTP richiede il server backend attivo (non disponibile su GitHub Pages statico).",
      400,
      'STATIC_HOST',
    );
  }
  const headers = await getFirebaseAuthHeaders({ 'Content-Type': 'application/json' });
  const res = await fetch(getAiEndpoint('/api/ai/admin/test-email'), {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  return parseAiJsonResponse<{ ok: boolean; to: string; baseUrl: string; error?: string; code?: string }>(
    res,
    '/api/ai/admin/test-email',
  );
}

export async function verifyAndSyncDecisionTokenApi(token: string): Promise<{
  email: string;
  action: 'approve' | 'reject';
  overview: AiAdminAccessOverview;
}> {
  const currentUser = auth.currentUser;
  const adminEmail = (currentUser?.email || '').trim().toLowerCase();
  if (!currentUser || adminEmail !== ADMIN_EMAIL_ADDRESS) {
    throw new AiApiError("Operazione riservata all'amministratore.", 403, 'FORBIDDEN');
  }
  if (isStaticHostWithoutAiBackend()) {
    throw new AiApiError(
      'Verifica token email non disponibile su host statico.',
      400,
      'STATIC_HOST',
    );
  }
  const headers = await getFirebaseAuthHeaders({ 'Content-Type': 'application/json' });
  const res = await fetch(getAiEndpoint('/api/ai/admin/verify-decision-token'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ token }),
  });
  const verified = await parseAiJsonResponse<{
    ok: boolean;
    email: string;
    action: 'approve' | 'reject';
    error?: string;
    code?: string;
  }>(res, '/api/ai/admin/verify-decision-token');

  const overview = await decideAiAccessApi(verified.email, verified.action);
  return {
    email: verified.email,
    action: verified.action,
    overview,
  };
}
