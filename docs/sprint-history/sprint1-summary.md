# Sprint 1 Summary — Frontend MVP (archived)

Confirmed 2026-07-04, wrapped 2026-07-06. This is the archived record of Sprint 1.
Stable rules from this sprint have been promoted to `CLAUDE.md`; next-sprint candidates live in `docs/backlog.md`.

## Goal (all 6 delivered against the MSW mock)

1. Sign up / Login
2. Show a temporary 2D wakppuball on the main screen
3. Save a wakppuball
4. View my collection
5. Match button → success/failure
6. On match success → reflect the partner's wakppuball in the collection

## What shipped

| Phase | Feature | Key files |
|---|---|---|
| 0 | http.ts wrapper (token storage, auth header, `{error:{code,message}}` parsing), MSW setup | `shared/api/http.ts`, `mocks/*` |
| 1 | Signup/Login form, client validation, auth context + route guard, logout | `features/auth/*`, `shared/auth/*` |
| 2 | Main screen, 4-state handling | `features/wakppuball/MyWakppuballPage.tsx` |
| 3 | Save wakppuball (hardcoded customization constant) | same + `wakppuballApi.ts` |
| 4 | Collection list | `features/collection/*` |
| 5/6 | Matching (option A: synchronous queue → MATCHED/FAILED + collection refetch) | `features/matching/*` |
| — | Vitest + Testing Library component tests | `*.test.tsx`, `vitest.config.ts` |
| — | Real-backend switch (`VITE_ENABLE_MOCKS=false`) + runbook | `main.tsx`, `docs/integration-testing.md` |

Not done: Phase 7 (Beautify / visual design pass) — deferred.

## Decisions (promoted to CLAUDE.md)

- MSW for all dev API calls; the real backend is not required to build Phases 1–6.
- `accessToken` stored in `localStorage` via `tokenStorage`; `apiRequest` auto-attaches the bearer header.
- Matching implemented as **option A** (synchronous): one `POST /matching/queue`, no polling, no exchange call.

## Backend deviations discovered (docs/api.md was not kept current)

- **Credential rules** (backend zod, undocumented): username 2–20 `[a-zA-Z0-9_]`, password 8–72; only a generic `400 VALIDATION_ERROR` is returned.
- **`GET /wakppuballs/me/main` → 501** (unimplemented). Frontend composes the main ball from `GET /users/me` (`mainWakppuballId`) + `GET /collection`. `getMainWakppuballViaEndpoint` kept for a one-line revert.
- **Matching is synchronous**: `POST /matching/queue` → `MATCHED` (partner ball created + added to caller's collection) or `FAILED` (`NO_PARTNER_FOUND`). No `WAITING`/queue. `GET /matching/status` and `POST /matching/:matchId/exchange` are 501. Matched balls have no `acquiredFrom`. `matchId` is a string like `temp-42`.
- **`POST /wakppuballs`**: all fields optional; response includes `modelUrl`/`thumbnailUrl`; `setAsMain` re-points main.
- New error codes: `MAIN_WAKPPUBALL_REQUIRED` (400), `BREAK_COUNT_REQUIRED` (400), `OWNED_WAKPPUBALL_NOT_FOUND` (404).

## Known gaps to revisit

- `GET /wakppuballs/me/main` composition is a **temporary substitute** — revert to `getMainWakppuballViaEndpoint` once the backend implements it.
- Integration test against the real backend was set up but not executed in-agent — run per `docs/integration-testing.md`.
- Verification note: automated typecheck/test runs were not possible in the authoring environment (no Node); code was validated statically. Run `npm test -w frontend` locally.
