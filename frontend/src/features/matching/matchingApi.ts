import { apiRequest } from '../../shared/api/http';
import type {
  WakppuballAcquiredType,
  WakppuballCustomization,
  WakppuballFracture,
  WakppuballStatus
} from '../wakppuball/wakppuballTypes';

export type MatchQueueBody = {
  latitude: number;
  longitude: number;
};

export type WaitingResult = {
  status: 'WAITING';
  queueId: string;
  enteredAt: string;
};

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
    customization: WakppuballCustomization | null;
    fracture: WakppuballFracture | null;
    acquiredType: WakppuballAcquiredType;
    remainingBreakCount: number;
    status: WakppuballStatus;
    acquiredAt: string;
  };
};

export type NoneResult = {
  status: 'NONE';
};

export type EnterMatchQueueResult = WaitingResult | MatchedResult;

export type MatchStatusResult = NoneResult | WaitingResult | MatchedResult;

export function enterMatchQueue(body: MatchQueueBody): Promise<EnterMatchQueueResult> {
  return apiRequest<EnterMatchQueueResult>('/matching/queue', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function getMatchStatus(): Promise<MatchStatusResult> {
  return apiRequest<MatchStatusResult>('/matching/status', { method: 'GET' });
}

export function cancelMatchQueue(): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>('/matching/queue', { method: 'DELETE' });
}
