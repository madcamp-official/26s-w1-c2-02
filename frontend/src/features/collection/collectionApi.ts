import { apiRequest } from '../../shared/api/http';

// GET /collection item shape (matches backend subset; CONSUMED already excluded).
export type CollectionItem = {
  ownedId: string;
  modelId: string;
  name: string;
  modelUrl: string | null;
  thumbnailUrl: string | null;
  acquiredType: 'CREATED' | 'MATCHED';
  // Present only when the ball records who it came from. Matched balls from the
  // synchronous queue have no acquiredFrom (backend sets acquiredFromUserId null).
  acquiredFrom?: { id: string; username: string };
  remainingBreakCount: number;
  status: 'ACTIVE' | 'CONSUMED';
  isMain: boolean;
  acquiredAt: string;
};

export function getCollection(): Promise<{ items: CollectionItem[] }> {
  return apiRequest<{ items: CollectionItem[] }>('/collection', { method: 'GET' });
}
