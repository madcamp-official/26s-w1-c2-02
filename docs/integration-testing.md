# Integration Testing — Frontend against the real backend

The frontend now runs against the **real backend** in development. Use this guide to validate the full stack end-to-end.

> Status: everything below assumes a machine with Node + Docker.

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

## 3. Frontend

The Vite dev server proxies `/api` → `http://localhost:3000` (see `frontend/vite.config.ts`), and `http.ts` falls back to `/api` when `VITE_API_BASE_URL` is unset, so you don't need to set a base URL:

```
npm run dev:frontend
```

Confirm the proxy is working: the browser Network tab should show `/api/...` requests returning backend responses from `localhost:3000`.

## 4. End-to-end checklist (real backend)

1. **Signup**: new username (2–20 chars, `[a-zA-Z0-9_]`) + password (≥8). Should land on the main screen. Re-using a username → "이미 사용 중인 유저네임입니다."
2. **Main screen**: a fresh account has no main ball → empty state. NOTE the main ball is fetched via **`GET /users/me` + `GET /collection`** (composition), because `GET /wakppuballs/me/main` is still 501 on the backend. Verify in the Network tab that those two are called and `/wakppuballs/me/main` is **not**.
3. **Save**: create a wakppuball → main screen shows it; `/collection` includes it as `(대표)`.
4. **Collection**: reflects created + matched balls; CONSUMED excluded.
5. **Matching**: press match and allow location permission. If no compatible waiting partner exists, expect `WAITING`; another user entering the queue should produce `MATCHED`. `GET /matching/status` checks the current state. No exchange step.
6. **401 handling**: with an expired/garbage token in localStorage, reload → redirected to `/login`.

## Known real-backend gaps (see docs/sprint-history/sprint1-summary.md)

- `GET /wakppuballs/me/main` → 501 (frontend composes instead; revert when implemented).
