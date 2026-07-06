# Integration Testing — Frontend against the real backend

By default the frontend runs against the MSW mock in dev. This guide switches it to the **real backend** so you can validate the full stack end-to-end.

> Status: the switch (VITE_ENABLE_MOCKS flag) is implemented, but this runbook has **not been executed in CI/agent** — run it locally. Everything below assumes a machine with Node + Docker.

## 1. Start Postgres

```
npm run db:dev        # docker compose up -d (postgres on :5432)
```

## 2. Backend env + migrate + run

Create `backend/.env` (dotenv loads from the backend cwd):

```
PORT=3000
DATABASE_URL=postgresql://wakppuball:wakppuball@localhost:5432/campus_wakppuball
JWT_SECRET=replace-this-secret
```

Then:

```
npm run -w backend prisma:generate
npm run -w backend prisma:migrate    # applies migrations to the DB
npm run dev:backend                  # API on http://localhost:3000
```

Sanity check: `curl http://localhost:3000/api/health` → `{"status":"ok"}`.

## 3. Frontend with mocks OFF

The Vite dev server proxies `/api` → `http://localhost:3000` (see `frontend/vite.config.ts`), and `http.ts` falls back to `/api` when `VITE_API_BASE_URL` is unset — so you don't need to set a base URL. Just disable mocks:

```
VITE_ENABLE_MOCKS=false npm run dev:frontend
```

(Vite exposes `VITE_`-prefixed vars from the environment. Alternatively put `VITE_ENABLE_MOCKS=false` in `frontend/.env`.)

Confirm mocks are off: the browser console should **not** print `[MSW] Mocking enabled`, and the Network tab shows requests hitting `localhost:3000`.

## 4. End-to-end checklist (real backend)

1. **Signup**: new username (2–20 chars, `[a-zA-Z0-9_]`) + password (≥8). Should land on the main screen. Re-using a username → "이미 사용 중인 유저네임입니다."
2. **Main screen**: a fresh account has no main ball → empty state. NOTE the main ball is fetched via **`GET /users/me` + `GET /collection`** (composition), because `GET /wakppuballs/me/main` is still 501 on the backend. Verify in the Network tab that those two are called and `/wakppuballs/me/main` is **not**.
3. **Save**: create a wakppuball → main screen shows it; `/collection` includes it as `(대표)`.
4. **Collection**: reflects created + matched balls; CONSUMED excluded.
5. **Matching**: press match. Backend is synchronous — expect **MATCHED** (partner ball appears in the collection) or **FAILED** (~20% random). Force outcomes by sending `{ simulateResult: 'MATCHED' | 'FAILED' }` — or just retry. No polling/exchange step.
6. **401 handling**: with an expired/garbage token in localStorage, reload → redirected to `/login`.

## 5. Revert to mocks

Stop the frontend and restart without the flag (`npm run dev:frontend`), or set `VITE_ENABLE_MOCKS=true`.

## Known real-backend gaps (see docs/sprint-history/sprint1-summary.md)

- `GET /wakppuballs/me/main` → 501 (frontend composes instead; revert when implemented).
- `GET /matching/status`, `POST /matching/:matchId/exchange` → 501 (unused by option-A matching).
