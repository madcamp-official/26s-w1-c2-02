# Backlog — next-sprint candidates

Deferred items and follow-ups. Pull into a sprint by moving the item into `docs/current-sprint.md`.

## Deferred features

- **3D layer separation (outer/inner)**: the ball is currently one geometric shell — `outer`/`inner` are just material slots on different faces of the same 40 pieces, not separate objects, so a crack only reveals a hairline sliver. Add a plain inner sphere primitive in `WakppuballViewer.tsx` (no new Blender export needed) and retune the crack/press displacement to open real gaps. Do this before the color-customization phase (see `docs/3d-interaction.md` roadmap) so color injection only needs to be wired once, across both the existing `inner` material and the new sphere's material.
- **Real campus geofence values**: replace placeholder `CAMPUS_CENTER` / `CAMPUS_RADIUS_METERS` in `backend/src/modules/matching/matching.routes.ts` when the real coordinates arrive.
- **Deployment hardening** + mobile UI detail pass.

## Technical follow-ups

- **Revert main-ball composition** once the backend implements `GET /wakppuballs/me/main`: point `getMainWakppuball` at `getMainWakppuballViaEndpoint`. (`CLAUDE.md` → Backend Contract Notes.)
- **`remainingBreakCount` doesn't decrement on logout**: `break`/`session-end` are implemented and work for in-app navigation and tab-close (`pagehide`), but on logout `signOut()` clears the token before `WakppuballViewer`'s unmount effect fires its `break` report, so that request goes out unauthenticated and silently 401s. Root cause and fix direction written up in `docs/3d-interaction.md` → "알려진 버그".
- **`POST /auth/logout` is a 501 stub** — frontend currently just clears the stored token.
- **`@types/express` is v5 but the project runs `express@4`** — this already caused a real type error (`req.params[key]` resolves to `string | string[]` instead of `string`) when Sprint 3 added the first path-param route (`collection.routes.ts`), worked around locally with an `Array.isArray` normalization. Pin `@types/express` to `^4.17.x` and re-run `npx tsc --noEmit` in `backend/` to confirm nothing else needed the workaround.
- **Keep `docs/api.md` in sync** — it has drifted from the implementation repeatedly; treat backend code as source of truth until it's updated.
- **Run the real-backend integration pass** (`docs/integration-testing.md`) and the frontend test suite (`npm test -w frontend`) in CI.
- **No ESLint config exists** (`frontend/package.json` has a `lint` script but there's no `eslint.config.js`) — `npm run lint -w frontend` currently fails outright rather than reporting issues.
