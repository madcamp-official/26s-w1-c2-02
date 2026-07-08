import { apiRequest } from '../../shared/api/http';
import type { TierName } from '../leaderboard/leaderboardApi';

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
    // Cumulative distinct matched partners (deduped) — was "collectionCount"
    // (count of all active owned items, including the caller's own ball).
    // GET /collection is unaffected; this is only the profile summary stat.
    distinctMatchedUserCount: number;
    totalAcquiredCount: number;
    totalBreakCount: number;
    tiers: {
      breakCount: TierName;
      distinctMatchedUsers: TierName;
    };
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

export function renameUsername(username: string): Promise<{ user: { id: string; username: string } }> {
  return apiRequest<{ user: { id: string; username: string } }>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify({ username })
  });
}
