import { apiRequest } from '../../shared/api/http';

export type TierName = 'MASTER' | 'RUBY' | 'DIAMOND' | 'EMERALD' | 'GOLD' | 'SILVER' | 'BRONZE';

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  username: string;
  value: number;
  tier: TierName;
};

export type LeaderboardResponse = {
  breakCount: LeaderboardEntry[];
  distinctMatchedUsers: LeaderboardEntry[];
};

export function getLeaderboard(): Promise<LeaderboardResponse> {
  return apiRequest<LeaderboardResponse>('/leaderboard', { method: 'GET' });
}
