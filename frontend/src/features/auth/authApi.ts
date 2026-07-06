import { apiRequest } from '../../shared/api/http';

// Response shapes follow docs/api.md exactly.

export type AuthUser = {
  id: string;
  username: string;
  createdAt?: string;
};

export type AuthResponse = {
  user: AuthUser;
  accessToken: string;
};

export type MeResponse = {
  user: {
    id: string;
    username: string;
    mainWakppuballId: string | null;
    collectionCount: number;
    createdAt: string;
  };
};

type Credentials = {
  username: string;
  password: string;
};

export function signup(credentials: Credentials): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(credentials)
  });
}

export function login(credentials: Credentials): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials)
  });
}

export function fetchMe(): Promise<MeResponse> {
  return apiRequest<MeResponse>('/users/me', { method: 'GET' });
}
