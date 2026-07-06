const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

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
