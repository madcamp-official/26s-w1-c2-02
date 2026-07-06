import { apiRequest } from '../../shared/api/http';

export type MatchQueueBody = {
  wakppuballOwnedId?: string;
  // Sprint-1 test switch honored by both the mock and the backend.
  simulateResult?: 'MATCHED' | 'FAILED';
};

// Synchronous match result (see current-sprint.md). No WAITING / polling / exchange.
export type MatchedResult = {
  status: 'MATCHED';
  matchId: string;
  partner: { id: string; username: string };
  partnerWakppuball: {
    ownedId: string;
    modelId: string;
    name: string;
    modelUrl: string | null;
    thumbnailUrl: string | null;
    acquiredType: 'MATCHED';
    remainingBreakCount: number;
    status: 'ACTIVE' | 'CONSUMED';
    acquiredAt: string;
  };
};

export type FailedResult = {
  status: 'FAILED';
  reason: string;
  message: string;
};

export type MatchResult = MatchedResult | FailedResult;

export function enterMatchQueue(body: MatchQueueBody = {}): Promise<MatchResult> {
  return apiRequest<MatchResult>('/matching/queue', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}
