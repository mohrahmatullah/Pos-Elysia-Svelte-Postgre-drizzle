/** Central API client (PRD 21). Single place for base URL, auth headers, error unwrapping. */
export interface ApiError {
  code: string;
  message: string;
}

export class ApiCallError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Same-origin by default (dev: Vite proxies /api → localhost:3001, so the
// browser makes a single non-preflighted request per API call). Set
// VITE_API_URL to target an absolute API origin (e.g. in production).
const BASE = import.meta.env.VITE_API_URL ?? '';
const API = `${BASE}/api/v1`;

let accessToken: string | null = null;
let refreshToken: string | null = null;

const STORAGE_KEY = 'pos.auth';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  storeId: string;
  permissions?: string[];
}

interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export function loadSession(): StoredAuth | null {
  if (accessToken) return { accessToken, refreshToken: refreshToken!, user: currentUser! };
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredAuth;
    accessToken = parsed.accessToken;
    refreshToken = parsed.refreshToken;
    currentUser = parsed.user;
    return parsed;
  } catch {
    return null;
  }
}

let currentUser: SessionUser | null = null;

export function getUser(): SessionUser | null {
  return currentUser;
}

export function saveAuth(auth: { accessToken: string; refreshToken: string; user: SessionUser }): void {
  accessToken = auth.accessToken;
  refreshToken = auth.refreshToken;
  currentUser = auth.user;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

export function clearAuth(): void {
  accessToken = null;
  refreshToken = null;
  currentUser = null;
  localStorage.removeItem(STORAGE_KEY);
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return false;
      const json = await res.json();
      accessToken = json.data.accessToken;
      refreshToken = json.data.refreshToken;
      if (currentUser) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken, refreshToken, user: currentUser }));
      }
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  opts: { idempotencyKey?: string; raw?: boolean } = {},
): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;

  let res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // One transparent retry after refreshing an expired access token.
  if (res.status === 401 && refreshToken && path !== '/auth/login') {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers.authorization = `Bearer ${accessToken}`;
      res = await fetch(`${API}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    }
  }

  if (opts.raw && res.ok) {
    return { data: (await res.blob()) as T };
  }

  const json = await res.json().catch(() => ({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Invalid response' } }));

  if (!res.ok || json.success === false) {
    const err = (json.error ?? {}) as ApiError;
    if (res.status === 401 && path !== '/auth/login') clearAuth();
    throw new ApiCallError(err.code ?? 'INTERNAL_ERROR', res.status, err.message ?? 'Request failed');
  }

  return { data: json.data as T, meta: json.meta };
}

export const get = <T>(path: string) => api<T>('GET', path);
export const post = <T>(path: string, body?: unknown, opts?: { idempotencyKey?: string }) =>
  api<T>('POST', path, body, opts);
export const put = <T>(path: string, body?: unknown) => api<T>('PUT', path, body);
export const patch = <T>(path: string, body?: unknown) => api<T>('PATCH', path, body);
export const del = <T>(path: string) => api<T>('DELETE', path);

/** IDR display formatting (PRD 30). */
export function formatIDR(value: number | string): string {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
}
