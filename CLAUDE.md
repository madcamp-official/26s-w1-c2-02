# CLAUDE.md — Campus Wakppuball Project Context

This file holds only stable, rarely-changing information.
**Always check `docs/current-sprint.md` for what's in scope right now.**

@docs/current-sprint.md

## Project Overview

- Name: Campus Wakppuball
- Concept: Users create and save a customizable "wakppuball" character. When matched with another user, they exchange wakppuballs.
- Contract docs: `docs/api.md` (API spec), `docs/DBschima.sql` (DB schema), wireframe (Figma)

## Tech Stack / Structure

- Framework: React + TypeScript + Vite
- Folder structure (feature-based):
  ```
  frontend/src/
    features/
      auth/LoginPage.tsx
      collection/CollectionPage.tsx
      matching/MatchingPage.tsx
      wakppuball/MyWakppuballPage.tsx
    shared/api/http.ts   # common fetch wrapper, handles Authorization header
    assets/models/        # temporary 2D images / model resources
    App.tsx, main.tsx, styles.css
  ```
- State management: no library yet, plain React state/context. Revisit if needed.

## API Common Rules (stable part)

- Base URL: `/api`
- Auth: `Authorization: Bearer <accessToken>`
- Common error shape: `{ "error": { "code": "...", "message": "..." } }`
- IDs are always returned as strings (DB uses bigint, API returns string)
- Full endpoint/field details live in `docs/api.md`. The subset actually used this sprint is summarized in `docs/current-sprint.md`

## DB Schema Summary (reference only, frontend doesn't touch DB directly)

- `users`: id, username, password_hash, created_at
- `wakppuball_models`: original model definitions (customization_json, fracture_json, default_break_count, etc.)
- `user_wakppuballs`: per-user ownership records (is_main, remaining_break_count, status: ACTIVE/CONSUMED)
- `match_history`: matching/exchange records

Frontend only needs to care about API field names (`ownedId`, `modelId`, `remainingBreakCount`, etc.). Mapping between DB snake_case columns and API camelCase fields is the backend's responsibility.

## Backend Contract Notes (stable until the backend changes)

Learned by reading backend PRs — `docs/api.md` has repeatedly lagged the implementation, so **treat backend code as the source of truth**. Full history in `docs/sprint-history/`.

- **Credential validation** (backend zod, not in the API doc): `username` 2–20 chars matching `^[a-zA-Z0-9_]+$`; `password` 8–72 chars. On violation the server returns only a generic `400 VALIDATION_ERROR` with no per-field detail — the **frontend owns per-field messages**. Shared rules live in `shared/validation/credentials.ts`, used by both the form and the MSW mock.
- **Matching is synchronous.** `POST /matching/queue` returns `MATCHED` (the partner ball is created and added to your collection immediately) or `FAILED` (`{ reason: 'NO_PARTNER_FOUND' }`). There is NO `WAITING` state, NO polling, and NO separate exchange step. `GET /matching/status` and `POST /matching/:matchId/exchange` are unimplemented (501). Matched balls carry no `acquiredFrom`; `matchId` is a string like `temp-42`.
- **The main wakppuball is composed on the frontend.** `GET /wakppuballs/me/main` is unimplemented (501), so `wakppuballApi.getMainWakppuball()` derives it from `GET /users/me` (`mainWakppuballId`) + `GET /collection`. `getMainWakppuballViaEndpoint` is kept for a one-line revert once the backend ships the endpoint. (Temporary but currently active — see `docs/backlog.md`.)
- **`POST /wakppuballs`**: all body fields optional; `setAsMain: true` re-points the main ball; response includes `modelUrl`/`thumbnailUrl`.
- Error codes in use include `MAIN_WAKPPUBALL_REQUIRED`, `BREAK_COUNT_REQUIRED`, `OWNED_WAKPPUBALL_NOT_FOUND` beyond the common ones in `docs/api.md`.

## Frontend Dev Setup (stable)

- **Mock API**: MSW handlers in `frontend/src/mocks/`, started only in dev from `main.tsx`; handlers mirror real backend behavior. Toggle scenarios in `src/mocks/scenarios.ts`. Set `VITE_ENABLE_MOCKS=false` to run against the real backend (`docs/integration-testing.md`). One-time worker setup must be run from inside `frontend/` (`cd frontend && npx msw init public --save`).
- **Auth token**: stored in `localStorage` via `tokenStorage` in `shared/api/http.ts`; `apiRequest` auto-attaches `Authorization: Bearer <token>` and throws `ApiError` carrying `{ code, message }` parsed from the common error shape.
- **Tests**: Vitest + Testing Library. `npm test -w frontend` (or `test:watch`). Component tests mock the feature API layer and assert the loading/error/empty/success states.

## State Handling Rules (applies to every API-connected screen, always)

Every screen must handle these 4 states:

1. Loading
2. Error (use the API error code's message when available, otherwise a generic error message)
3. Empty (e.g. no wakppuball yet, empty collection)
4. Success / normal display

## Coding Conventions (always apply)

- Use API response field names as-is for component props/variables (`remainingBreakCount` stays `remainingBreakCount`, no renaming)
- Declare colors/spacing as CSS variables in `styles.css` and reference them
- Extract shared UI (buttons/inputs/modals/cards) into reusable components instead of rebuilding per screen
- Write styles mobile-first (small screen sizes first)
- Never implement features outside the current scope — always check the include/exclude list in `docs/current-sprint.md`

## Human-in-the-loop Workflow (always apply)

- Work in Phase-sized (or sprint-item-sized) chunks. Review after each one before moving to the next
- Prefer small diffs ("add this function", "modify this part") over full file rewrites
- Never mix styling work with logic work in the same turn (styling is reserved for the dedicated Beautify phase)

## Maintaining This File

- Keep this root CLAUDE.md limited to facts that don't change across the whole project (tech stack / conventions / shared DB & API rules)
- Add a rule here only after repeating the same explanation/correction more than once
- Sprint scope, phase roadmap, and this sprint's include/exclude decisions do NOT belong here — manage those in `docs/current-sprint.md`
- If frontend-specific conventions grow large, consider splitting into `frontend/CLAUDE.md` (loads together with this root file)
