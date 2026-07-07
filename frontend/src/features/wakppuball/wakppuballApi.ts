import { ApiError, apiRequest } from '../../shared/api/http';
import { fetchMe } from '../auth/authApi';
import { getCollection } from '../collection/collectionApi';
import type {
  WakppuballAcquiredType,
  WakppuballCustomization,
  WakppuballFracture,
  WakppuballStatus
} from './wakppuballTypes';

// Shape consumed by the main screen. The optional fields are only returned by the
// real GET /wakppuballs/me/main; the temporary composition (below) can't supply
// them, and the UI doesn't use them this sprint.
export type MainWakppuball = {
  ownedId: string;
  modelId: string;
  name: string;
  modelUrl: string | null;
  thumbnailUrl: string | null;
  remainingBreakCount: number;
  status: WakppuballStatus;
  acquiredType: WakppuballAcquiredType;
  isMain: boolean;
  acquiredAt: string;
  customization: WakppuballCustomization | null;
  fracture: WakppuballFracture | null;
  defaultBreakCount?: number;
  willDisappearOnUnmount?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main-ball fetch. Two implementations, one active alias at the bottom.
//
// The backend hasn't implemented GET /wakppuballs/me/main yet (returns 501), so
// the app currently composes the main ball from /users/me + /collection.
// When the backend implements the endpoint, revert by pointing `getMainWakppuball`
// at `getMainWakppuballViaEndpoint` — no component changes needed.
// See current-sprint.md "Backend Rules Discovered at Phase 2–6".
// ─────────────────────────────────────────────────────────────────────────────

// ORIGINAL: direct endpoint call (use this once the backend implements it).
export function getMainWakppuballViaEndpoint(): Promise<{ wakppuball: MainWakppuball }> {
  return apiRequest<{ wakppuball: MainWakppuball }>('/wakppuballs/me/main', { method: 'GET' });
}

// TEMPORARY substitute: /users/me → mainWakppuballId → find it in /collection.
// Throws the same MAIN_WAKPPUBALL_NOT_FOUND ApiError as the real endpoint so the
// calling component's empty-state handling is unchanged.
export async function getMainWakppuballViaComposition(): Promise<{ wakppuball: MainWakppuball }> {
  const { user } = await fetchMe();
  if (!user.mainWakppuballId) {
    throw new ApiError('MAIN_WAKPPUBALL_NOT_FOUND', '저장된 대표 왁뿌볼이 없습니다.');
  }

  const { items } = await getCollection();
  const found = items.find((item) => item.ownedId === user.mainWakppuballId);
  if (!found) {
    // mainWakppuballId set but not in the (ACTIVE) collection → treat as no main.
    throw new ApiError('MAIN_WAKPPUBALL_NOT_FOUND', '저장된 대표 왁뿌볼이 없습니다.');
  }

  return {
    wakppuball: {
      ownedId: found.ownedId,
      modelId: found.modelId,
      name: found.name,
      modelUrl: found.modelUrl,
      thumbnailUrl: found.thumbnailUrl,
      remainingBreakCount: found.remainingBreakCount,
      status: found.status,
      acquiredType: found.acquiredType,
      isMain: found.isMain,
      acquiredAt: found.acquiredAt,
      customization: found.customization,
      fracture: found.fracture
    }
  };
}

// Active implementation. Swap to getMainWakppuballViaEndpoint when backend is ready.
export function getMainWakppuball(): Promise<{ wakppuball: MainWakppuball }> {
  return getMainWakppuballViaComposition();
}

// Body for POST /wakppuballs. All fields optional on the backend.
export type CreateWakppuballBody = {
  name?: string;
  thumbnailUrl?: string | null;
  customization?: WakppuballCustomization;
  fracture?: WakppuballFracture;
  setAsMain?: boolean;
};

// POST /wakppuballs response is a narrower shape than the main-ball read.
export type CreatedWakppuball = {
  ownedId: string;
  modelId: string;
  name: string;
  modelUrl: string | null;
  thumbnailUrl: string | null;
  customization: WakppuballCustomization;
  fracture: WakppuballFracture;
  isMain: boolean;
  remainingBreakCount: number;
  status: WakppuballStatus;
  createdAt: string;
};

export function createWakppuball(body: CreateWakppuballBody): Promise<{ wakppuball: CreatedWakppuball }> {
  return apiRequest<{ wakppuball: CreatedWakppuball }>('/wakppuballs', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

// POST /wakppuballs/:ownedId/break response, per docs/api.md.
export type BrokenWakppuball = {
  ownedId: string;
  remainingBreakCount: number;
  status: WakppuballStatus;
  willDisappearOnUnmount: boolean;
};

// Wax-break interaction confirmed (rotate/zoom/press-and-hold don't call this,
// only a piece actually popping does). Callers should treat failures as
// best-effort — the viewer showing this ball is already unmounting/going away.
// `keepalive` lets the request outlive a `pagehide` (tab close/refresh).
export function breakWakppuball(ownedId: string, options?: { keepalive?: boolean }): Promise<{ wakppuball: BrokenWakppuball }> {
  return apiRequest<{ wakppuball: BrokenWakppuball }>(`/wakppuballs/${ownedId}/break`, {
    method: 'POST',
    body: JSON.stringify({ interactionType: 'WAX_BREAK' }),
    keepalive: options?.keepalive
  });
}

// POST /wakppuballs/me/main/session-end response, per docs/api.md. Fired when
// the main ball is stepping down from the interaction area for real: tab
// close/refresh (pagehide) or logout. Only consumes the ball server-side if
// its remainingBreakCount already hit 0 — it doesn't decrement anything itself.
export type SessionEndResult = { ok: true; consumed: false } | { ok: true; consumed: true; consumedWakppuballId: string };

export function sessionEndMainWakppuball(
  reason: string,
  options?: { keepalive?: boolean }
): Promise<SessionEndResult> {
  return apiRequest<SessionEndResult>('/wakppuballs/me/main/session-end', {
    method: 'POST',
    body: JSON.stringify({ reason }),
    keepalive: options?.keepalive
  });
}
