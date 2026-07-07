import { apiRequest } from '../../shared/api/http';
import type {
  WakppuballAcquiredType,
  WakppuballCustomization,
  WakppuballFracture,
  WakppuballStatus
} from '../wakppuball/wakppuballTypes';

// GET /collection item shape (matches backend subset; CONSUMED already excluded).
export type CollectionItem = {
  ownedId: string;
  modelId: string;
  name: string;
  modelUrl: string | null;
  thumbnailUrl: string | null;
  customization: WakppuballCustomization | null;
  fracture: WakppuballFracture | null;
  acquiredType: WakppuballAcquiredType;
  // Present only when the ball records who it came from.
  acquiredFrom?: { id: string; username: string };
  remainingBreakCount: number;
  status: WakppuballStatus;
  isMain: boolean;
  acquiredAt: string;
};

export function getCollection(): Promise<{ items: CollectionItem[] }> {
  return apiRequest<{ items: CollectionItem[] }>('/collection', { method: 'GET' });
}

// POST /collection/:ownedId/select-main response.
export type SelectMainResult = {
  ok: true;
  mainWakppuballId: string;
  previousMainConsumed: boolean;
  // Present only when previousMainConsumed is true.
  consumedWakppuballId?: string;
};

export function selectMainWakppuball(ownedId: string): Promise<SelectMainResult> {
  return apiRequest<SelectMainResult>(`/collection/${ownedId}/select-main`, { method: 'POST' });
}
