// Exported so callers that can't go through apiRequest (e.g. multipart/
// FormData uploads, which must NOT get the forced JSON Content-Type below)
// can still hit the same backend without duplicating the env lookup.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

// Server-relative paths like customization.pattern.imageUrl (a plain string
// the backend returns, e.g. "/uploads/skins/x.webp" — see docs/api.md) are
// meant to resolve against the API's origin, not whatever page happens to be
// rendering them. When API_BASE_URL is itself absolute (e.g. VITE_API_BASE_URL
// pointing straight at the backend) this returns that origin; when it's the
// relative '/api' default, this falls back to the current page's origin,
// which works via the vite dev proxy / same-origin prod deploy.
export function resolveUploadedAssetUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = new URL(API_BASE_URL, window.location.origin).origin;
  return `${origin}${path}`;
}

const ACCESS_TOKEN_STORAGE_KEY = 'accessToken';

export const tokenStorage = {
  get(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  },
  set(token: string): void {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  }
};

// Common error shape from docs/api.md: { error: { code, message } }
export class ApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

type RequestOptions = RequestInit & {
  token?: string;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, ...requestInit } = options;
  const headers = new Headers(requestInit.headers);
  headers.set('Content-Type', 'application/json');

  const authToken = token ?? tokenStorage.get();
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestInit,
    headers
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (body?.error?.code && body?.error?.message) {
      throw new ApiError(body.error.code, body.error.message);
    }
    throw new ApiError('UNKNOWN_ERROR', `API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}
