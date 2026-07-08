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
  // True when the match that most recently produced this ball had both
  // sides verified inside the campus geofence — drives the campus badge.
  isCampusMatch: boolean;
  remainingBreakCount: number;
  status: WakppuballStatus;
  isMain: boolean;
  acquiredAt: string;
};

export function getCollection(): Promise<{ items: CollectionItem[] }> {
  return apiRequest<{ items: CollectionItem[] }>('/collection', { method: 'GET' });
}

// POST /collection/:ownedId/select-main response. Stepping down as main never
// consumes a wakppuball (0 remainingBreakCount just locks interaction), so
// there's nothing here beyond which ball is main now.
export type SelectMainResult = {
  ok: true;
  mainWakppuballId: string;
};

export function selectMainWakppuball(ownedId: string): Promise<SelectMainResult> {
  return apiRequest<SelectMainResult>(`/collection/${ownedId}/select-main`, { method: 'POST' });
}
