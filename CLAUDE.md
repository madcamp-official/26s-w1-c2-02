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
    assets/models/index.ts  # shape -> GLB asset registry, see docs/3d-asset-contract.md
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

- **Credential validation** (backend zod, not in the API doc): `username` 2–20 chars matching `^[a-zA-Z0-9_]+$`; `password` 8–72 chars. On violation the server returns only a generic `400 VALIDATION_ERROR` with no per-field detail — the **frontend owns per-field messages**. Shared rules live in `shared/validation/credentials.ts`.
- **Matching uses a `WAITING` queue + polling (reverted from Sprint 1's synchronous design — see `docs/current-sprint.md`).** `POST /matching/queue` returns `MATCHED` immediately if a compatible waiting partner exists, otherwise `WAITING` (`{ queueId, enteredAt }`). `GET /matching/status` is now implemented (no longer 501) — poll it every ~3s; it returns `NONE` / `WAITING` / `MATCHED`. `POST /matching/:matchId/exchange` has been removed entirely — there is no separate confirm step, the partner ball is already in your collection the moment `MATCHED` appears. `DELETE /matching/queue` is unchanged. `POST /matching/queue` now requires `latitude`/`longitude`; missing coords or being outside the campus geofence rejects the request before any other matching check (`LOCATION_REQUIRED`/`OUTSIDE_CAMPUS_AREA` are checked first, ahead of `MAIN_WAKPPUBALL_REQUIRED`/`ALREADY_IN_QUEUE`). Raw coordinates are not stored, only a pass/fail + timestamp log. WebSockets were considered for this and rejected in favor of polling.
- **Matching always trades the caller's own created wakppuball, never whatever is currently set as main.** `isMain` is purely a "what's on the interaction stage" display choice, decoupled from trading identity. Matching also ignores `remainingBreakCount` entirely (works at 0), and a successful match resets the `remainingBreakCount` of the wakppuball each side sent back to its model's default. Matching the same partner again refills the existing received copy (unique per `ownerUserId`+`acquiredFromUserId`) instead of creating a duplicate — see `createOrRefillMatchedOwnedWakppuball` in `matching.routes.ts`.
- **`GET /users/me`** includes `totalAcquiredCount`: a monotonically increasing lifetime count, +1 on `POST /wakppuballs` success and +1 for both users when a match reaches `MATCHED`. Unlike `collectionCount`, it does not decrease when a ball becomes `CONSUMED`.
- **The main wakppuball is composed on the frontend.** `GET /wakppuballs/me/main` is unimplemented (501), so `wakppuballApi.getMainWakppuball()` derives it from `GET /users/me` (`mainWakppuballId`) + `GET /collection`. `getMainWakppuballViaEndpoint` is kept for a one-line revert once the backend ships the endpoint. (Temporary but currently active — see `docs/backlog.md`.)
- **`POST /wakppuballs`**: all body fields optional; `setAsMain: true` re-points the main ball; response includes `modelUrl`/`thumbnailUrl`. **`PATCH /wakppuballs/me/created`** (`{ name }`) renames the caller's own created wakppuball — never a matched one, since those share a `WakppuballModel` row with the original creator.
- **`POST /collection/:ownedId/select-main`** is implemented (no longer a 501 stub). Selecting the already-main ball is a no-op. Otherwise the previous main is simply un-mained — **it is never `CONSUMED` by stepping down as main, regardless of `remainingBreakCount`.** A wakppuball at 0 stays ACTIVE in the collection forever (interaction-locked client-side); there is currently no path that auto-consumes it.
- **`PATCH /users/me`** (`{ username }`) renames the caller's username, reusing the signup regex (`^[a-zA-Z0-9_]+$`, 2–20 chars) and returning `409 USERNAME_ALREADY_EXISTS` on collision.
- Error codes in use include `MAIN_WAKPPUBALL_REQUIRED`, `OWNED_WAKPPUBALL_NOT_FOUND` beyond the common ones in `docs/api.md`.

## Frontend Dev Setup (stable)

- **Real backend in dev**: the Vite dev server proxies `/api` to `http://localhost:3000` via `frontend/vite.config.ts`. Start the backend first, then run `npm run dev:frontend`. See `docs/integration-testing.md`.
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
- Declare colors/spacing as CSS variables in `styles.css` and reference them — corner radius (`--radius-sm` … `--radius-2xl`, `--radius-pill`) and glass-surface tokens (`--glass-fill`, `--glass-border`, `--glass-blur`, etc.) are the established design tokens; reuse them for new UI instead of hardcoding new values
- Extract shared UI (buttons/inputs/modals/cards) into reusable components instead of rebuilding per screen
- Render a wakppuball via `WakppuballView` (`frontend/src/features/wakppuball/WakppuballView.tsx`), not `WakppuballVisual` directly — it renders the real 3D model when one is registered for the shape in `assets/models/index.ts`, falling back to the CSS ball (`WakppuballVisual`) otherwise. See `docs/3d-asset-contract.md` for how to register a delivered model. `three`/`@react-three/*` are only imported from `Wakppuball3DCanvas.tsx`, loaded via `React.lazy()` — keep any new 3D code there too, don't import those packages from a file that's always in the main bundle (they add ~250kB gzipped).
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
