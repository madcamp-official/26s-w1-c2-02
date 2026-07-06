import { http, HttpResponse } from 'msw';
import { isValidCredential } from '../shared/validation/credentials';
import { mockScenarios } from './scenarios';

// Internal store shape (richer than any single response). Response mappers below
// pick the exact subset each endpoint returns, to match the real backend.
type StoredWakppuball = {
  ownedId: string;
  modelId: string;
  name: string;
  modelUrl: string | null;
  thumbnailUrl: string | null;
  customization: Record<string, unknown>;
  fracture: Record<string, unknown>;
  remainingBreakCount: number;
  defaultBreakCount: number;
  status: 'ACTIVE' | 'CONSUMED';
  willDisappearOnUnmount: boolean;
  acquiredType: 'CREATED' | 'MATCHED';
  acquiredFrom?: { id: string; username: string };
  isMain: boolean;
  acquiredAt: string;
};

function errorResponse(status: number, code: string, message: string) {
  return HttpResponse.json({ error: { code, message } }, { status });
}

// All protected endpoints require a token minted by our signup/login handlers.
// Returns true if authorized; the caller returns 401 otherwise.
function isAuthed(request: Request): boolean {
  return Boolean(request.headers.get('authorization')?.startsWith('Bearer mock-access-token-'));
}

// GET /collection & matching responses expose only this subset (matches backend).
function toCollectionItem(w: StoredWakppuball) {
  return {
    ownedId: w.ownedId,
    modelId: w.modelId,
    name: w.name,
    modelUrl: w.modelUrl,
    thumbnailUrl: w.thumbnailUrl,
    acquiredType: w.acquiredType,
    // Backend only includes acquiredFrom when acquiredFromUserId is set.
    // Matched balls from /matching/queue have it null → field omitted.
    ...(w.acquiredFrom ? { acquiredFrom: w.acquiredFrom } : {}),
    remainingBreakCount: w.remainingBreakCount,
    status: w.status,
    isMain: w.isMain,
    acquiredAt: w.acquiredAt
  };
}

// --- in-memory mock "DB", reset on page reload ---

const users = new Map<string, { id: string; username: string; password: string; createdAt: string }>([
  ['dohyun', { id: '1', username: 'dohyun', password: 'password123', createdAt: '2026-07-03T10:00:00.000Z' }]
]);
let nextUserId = 2;

const sampleWakppuball: StoredWakppuball = {
  ownedId: '10',
  modelId: '5',
  name: '내 첫 왁뿌볼',
  modelUrl: 'https://example.com/models/5.glb',
  thumbnailUrl: 'https://example.com/thumbnails/5.png',
  customization: { bodyColor: '#f3d35b', face: 'smile', accessory: 'none' },
  fracture: { preset: 'basic-crack-01', pieceCount: 12 },
  remainingBreakCount: 3,
  defaultBreakCount: 3,
  status: 'ACTIVE',
  willDisappearOnUnmount: false,
  acquiredType: 'CREATED',
  isMain: true,
  acquiredAt: '2026-07-03T10:10:00.000Z'
};

let mainWakppuball: StoredWakppuball | null = mockScenarios.hasMainWakppuball ? sampleWakppuball : null;
let collection: StoredWakppuball[] = mainWakppuball ? [mainWakppuball] : [];
let nextOwnedId = 20;
let nextModelId = 30;

const TEMP_PARTNERS = [
  { id: 'temp-partner-1', username: 'campus-bot-a' },
  { id: 'temp-partner-2', username: 'campus-bot-b' },
  { id: 'temp-partner-3', username: 'campus-bot-c' }
];

const TEMP_MATCH_BALLS = [
  { name: '파란 임시 왁뿌볼', color: '#4f8cff', thumbnailUrl: '/assets/temp-blue-wakppuball.png' },
  { name: '초록 임시 왁뿌볼', color: '#4ccf7a', thumbnailUrl: '/assets/temp-green-wakppuball.png' }
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export const handlers = [
  http.post('/api/auth/signup', async ({ request }) => {
    const body = (await request.json()) as { username?: string; password?: string };

    // Mirror the backend's zod rules; server returns only the generic message.
    if (!body.username || !body.password || !isValidCredential(body.username, body.password)) {
      return errorResponse(400, 'VALIDATION_ERROR', '요청값이 올바르지 않습니다.');
    }
    if (users.has(body.username)) {
      return errorResponse(409, 'USERNAME_ALREADY_EXISTS', '이미 사용 중인 유저네임입니다.');
    }

    const user = {
      id: String(nextUserId++),
      username: body.username,
      password: body.password,
      createdAt: new Date().toISOString()
    };
    users.set(user.username, user);

    return HttpResponse.json(
      {
        user: { id: user.id, username: user.username, createdAt: user.createdAt },
        accessToken: `mock-access-token-${user.id}`
      },
      { status: 201 }
    );
  }),

  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as { username?: string; password?: string };

    // Backend validates shape (400) before checking credentials (401).
    if (!body.username || !body.password || !isValidCredential(body.username, body.password)) {
      return errorResponse(400, 'VALIDATION_ERROR', '요청값이 올바르지 않습니다.');
    }

    const user = users.get(body.username);
    if (!user || user.password !== body.password) {
      return errorResponse(401, 'INVALID_CREDENTIALS', '유저네임 또는 비밀번호가 일치하지 않습니다.');
    }

    return HttpResponse.json({
      user: { id: user.id, username: user.username },
      accessToken: `mock-access-token-${user.id}`
    });
  }),

  http.post('/api/auth/logout', () => {
    return HttpResponse.json({ ok: true });
  }),

  http.get('/api/users/me', ({ request }) => {
    // Accept only tokens minted by our signup/login handlers. A missing or
    // garbage token → 401, so the "token expired → redirect to login" flow is
    // testable (set a junk `accessToken` in localStorage and reload).
    if (!isAuthed(request)) {
      return errorResponse(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }

    return HttpResponse.json({
      user: {
        id: '1',
        username: 'dohyun',
        mainWakppuballId: mainWakppuball?.ownedId ?? null,
        collectionCount: collection.filter((item) => item.status !== 'CONSUMED').length,
        createdAt: '2026-07-03T10:00:00.000Z'
      }
    });
  }),

  // Mirrors the real backend: NOT implemented (501). The frontend no longer calls
  // this — it composes the main ball from GET /users/me (mainWakppuballId) +
  // GET /collection instead (see wakppuballApi.getMainWakppuballViaComposition).
  // When the backend implements this endpoint, restore a real response here AND
  // switch the API layer back to getMainWakppuballViaEndpoint.
  http.get('/api/wakppuballs/me/main', () => {
    return HttpResponse.json({ message: 'TODO: 대표 왁뿌볼 조회 구현' }, { status: 501 });
  }),

  http.post('/api/wakppuballs', async ({ request }) => {
    if (!isAuthed(request)) {
      return errorResponse(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }

    // Backend: all fields optional. name<=50, urls<=2048. Empty {} is valid.
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      modelUrl?: string | null;
      thumbnailUrl?: string | null;
      customization?: Record<string, unknown>;
      fracture?: Record<string, unknown>;
      setAsMain?: boolean;
    };

    if (typeof body.name === 'string' && (body.name.length < 1 || body.name.length > 50)) {
      return errorResponse(400, 'VALIDATION_ERROR', '요청값이 올바르지 않습니다.');
    }

    const shouldSetAsMain = body.setAsMain ?? false;
    const created: StoredWakppuball = {
      ownedId: String(nextOwnedId++),
      modelId: String(nextModelId++),
      name: body.name ?? '나의 왁뿌볼',
      modelUrl: body.modelUrl ?? null,
      thumbnailUrl: body.thumbnailUrl ?? null,
      customization: body.customization ?? {},
      fracture: body.fracture ?? {},
      remainingBreakCount: 3,
      defaultBreakCount: 3,
      status: 'ACTIVE',
      willDisappearOnUnmount: false,
      acquiredType: 'CREATED',
      isMain: shouldSetAsMain,
      acquiredAt: new Date().toISOString()
    };

    if (shouldSetAsMain && mainWakppuball) {
      mainWakppuball.isMain = false;
    }
    if (shouldSetAsMain) {
      mainWakppuball = created;
    }
    collection = [...collection, created];

    return HttpResponse.json(
      {
        wakppuball: {
          ownedId: created.ownedId,
          modelId: created.modelId,
          name: created.name,
          modelUrl: created.modelUrl,
          thumbnailUrl: created.thumbnailUrl,
          isMain: created.isMain,
          remainingBreakCount: created.remainingBreakCount,
          status: created.status,
          createdAt: created.acquiredAt
        }
      },
      { status: 201 }
    );
  }),

  http.get('/api/collection', ({ request }) => {
    if (!isAuthed(request)) {
      return errorResponse(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }
    return HttpResponse.json({
      items: collection.filter((item) => item.status === 'ACTIVE').map(toCollectionItem)
    });
  }),

  // Synchronous matching: MATCHED (partner ball granted into collection) or FAILED.
  // No WAITING/queue persistence. Mirrors backend POST /matching/queue.
  http.post('/api/matching/queue', async ({ request }) => {
    if (!isAuthed(request)) {
      return errorResponse(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }

    const body = (await request.json().catch(() => ({}))) as {
      wakppuballOwnedId?: string;
      simulateResult?: 'MATCHED' | 'FAILED';
    };

    // Pick the ball to match with: explicit id, else the main ball.
    const selected = body.wakppuballOwnedId
      ? collection.find((w) => w.ownedId === body.wakppuballOwnedId && w.status === 'ACTIVE')
      : mainWakppuball;

    if (!selected) {
      return body.wakppuballOwnedId
        ? errorResponse(404, 'OWNED_WAKPPUBALL_NOT_FOUND', '내 컬렉션에 없는 왁뿌볼입니다.')
        : errorResponse(400, 'MAIN_WAKPPUBALL_REQUIRED', '매칭하려면 대표 왁뿌볼이 필요합니다.');
    }
    if (selected.remainingBreakCount <= 0) {
      return errorResponse(400, 'BREAK_COUNT_REQUIRED', '남은 뿌시기 횟수가 있는 왁뿌볼만 매칭할 수 있습니다.');
    }

    const outcome = body.simulateResult ?? mockScenarios.matchOutcome;
    if (outcome === 'FAILED') {
      return HttpResponse.json({
        status: 'FAILED',
        reason: 'NO_PARTNER_FOUND',
        message: '지금은 매칭 가능한 상대가 없습니다.'
      });
    }

    // MATCHED: create a new ball owned by the caller and add it to the collection.
    const partner = pickRandom(TEMP_PARTNERS);
    const template = pickRandom(TEMP_MATCH_BALLS);
    const received: StoredWakppuball = {
      ownedId: String(nextOwnedId++),
      modelId: String(nextModelId++),
      name: template.name,
      modelUrl: template.thumbnailUrl,
      thumbnailUrl: template.thumbnailUrl,
      customization: { bodyColor: template.color, face: 'smile' },
      fracture: { preset: 'basic-crack-01', pieceCount: 12 },
      remainingBreakCount: 3,
      defaultBreakCount: 3,
      status: 'ACTIVE',
      willDisappearOnUnmount: false,
      acquiredType: 'MATCHED',
      // Backend sets acquiredFromUserId: null, so no acquiredFrom on the ball.
      isMain: false,
      acquiredAt: new Date().toISOString()
    };
    collection = [...collection, received];

    return HttpResponse.json({
      status: 'MATCHED',
      matchId: `temp-${received.ownedId}`,
      partner,
      partnerWakppuball: {
        ownedId: received.ownedId,
        modelId: received.modelId,
        name: received.name,
        modelUrl: received.modelUrl,
        thumbnailUrl: received.thumbnailUrl,
        acquiredType: received.acquiredType,
        remainingBreakCount: received.remainingBreakCount,
        status: received.status,
        acquiredAt: received.acquiredAt
      }
    });
  }),

  // Not implemented on the backend (501). Kept here so the mock mirrors reality.
  http.get('/api/matching/status', () => {
    return HttpResponse.json({ message: 'TODO: 매칭 상태 조회 구현' }, { status: 501 });
  }),
  http.post('/api/matching/:matchId/exchange', () => {
    return HttpResponse.json({ message: 'TODO: 왁뿌볼 교환 확정 구현' }, { status: 501 });
  })
];
