# Backlog — next-sprint candidates

Deferred items and follow-ups. Pull into a sprint by moving the item into `docs/current-sprint.md`.

## Deferred features

- **Wax-break interaction**: `remainingBreakCount` consumption, crack animation, per-piece damage, `CONSUMED` disappearance. Related backend endpoints exist but are 501 stubs: `POST /wakppuballs/:ownedId/break`, `POST /wakppuballs/me/main/session-end`. Depends on the 3D foundation from Sprint 3.
- **Real 3D model swap-in**: replace the CSS fallback with the teammate's GLB files once delivered (structure prepared in Sprint 3; mesh/piece-count contract in `docs/3d-asset-contract.md`).
- **Real campus geofence values**: replace placeholder `CAMPUS_CENTER` / `CAMPUS_RADIUS_METERS` in `backend/src/modules/matching/matching.routes.ts` when the real coordinates arrive.
- **Deployment hardening** + mobile UI detail pass.

## Technical follow-ups

- **Revert main-ball composition** once the backend implements `GET /wakppuballs/me/main`: point `getMainWakppuball` at `getMainWakppuballViaEndpoint`. (`CLAUDE.md` → Backend Contract Notes.)
- **`POST /auth/logout` is a 501 stub** — frontend currently just clears the stored token.
- **`@types/express` is v5 but the project runs `express@4`** — this already caused a real type error (`req.params[key]` resolves to `string | string[]` instead of `string`) when Sprint 3 added the first path-param route (`collection.routes.ts`), worked around locally with an `Array.isArray` normalization. Pin `@types/express` to `^4.17.x` and re-run `npx tsc --noEmit` in `backend/` to confirm nothing else needed the workaround.
- **Keep `docs/api.md` in sync** — it has drifted from the implementation repeatedly; treat backend code as source of truth until it's updated.
- **Run the real-backend integration pass** (`docs/integration-testing.md`) and the frontend test suite (`npm test -w frontend`) in CI.
- **No ESLint config exists** (`frontend/package.json` has a `lint` script but there's no `eslint.config.js`) — `npm run lint -w frontend` currently fails outright rather than reporting issues.
