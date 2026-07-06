# Mock API (MSW)

Development-only mock server. Started from `main.tsx` when `import.meta.env.DEV` is true; never runs in a production build.

## One-time setup (required after `npm install`)

MSW needs a service worker file in `public/`. Generate it once — **⚠️ run it from inside the `frontend` directory, NOT the repo root**:

```
cd frontend
npx msw init public --save
```

This is a **workspaces** repo (root `package.json` has `workspaces: ["frontend", "backend"]`). If you run `npx msw init public --save` from the repo root, it writes to `<root>/public/mockServiceWorker.js` and adds `msw.workerDirectory` to the **root** `package.json` — both wrong. The Vite dev server serves `frontend/public`, so with the file missing there the browser gets `index.html` back instead and you'll see:

> `[MSW] Failed to register the Service Worker: unsupported MIME type ('text/html')`

The correct result is `frontend/public/mockServiceWorker.js` and `msw.workerDirectory` inside `frontend/package.json`. That file is what actually intercepts `fetch` in the browser; it's generated (not feature code), safe to regenerate/commit as-is.

## Toggling scenarios

Edit the flags in `src/mocks/scenarios.ts` and reload the page (in-memory mock state resets on every reload):

- `hasMainWakppuball`: `true` = user already has a main wakppuball, `false` = simulates a brand-new user (`GET /wakppuballs/me/main` returns 404 `MAIN_WAKPPUBALL_NOT_FOUND`). NOTE: the real backend has NOT implemented this endpoint yet (501); the mock is intentionally ahead so Phase 2 is buildable.
- `matchOutcome`: `'MATCHED'` = `POST /matching/queue` immediately matches and grants a partner ball into the collection; `'FAILED'` = returns `{ status: 'FAILED', reason: 'NO_PARTNER_FOUND' }`. Matching is **synchronous** (mirrors the backend) — there is no WAITING/polling and no separate exchange step. A request body `{ simulateResult: 'MATCHED' | 'FAILED' }` overrides this per call.

`GET /matching/status` and `POST /matching/:matchId/exchange` return **501** in the mock because the real backend has not implemented them (the synchronous queue makes them unnecessary).

### Auth quick-testing tips

- Seeded login account: `dohyun` / `password123`.
- Simulate an **expired/invalid token** (to test the 401 → redirect-to-login guard): in DevTools console run `localStorage.setItem('accessToken', 'garbage')` then reload. `GET /users/me` returns 401 `UNAUTHORIZED`, the app clears the token and redirects to `/login`. Tokens are only accepted if they start with `mock-access-token-` (what signup/login mint).
- `username`/`password` mock validation mirrors the backend zod rules (see `src/shared/validation/credentials.ts`): username 2–20 chars `[a-zA-Z0-9_]`, password 8–72 chars. Violations return `400 VALIDATION_ERROR`.

## Where the data lives

`src/mocks/handlers.ts` holds an in-memory mock "DB" (users/wakppuball/collection/matching state) that mutates as you call the API, so flows like signup → create wakppuball → collection → match → exchange behave consistently within one page session. Reloading the page resets everything back to the scenario defaults above.
