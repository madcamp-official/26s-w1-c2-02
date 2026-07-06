# Backlog — next-sprint candidates

Items intentionally excluded from Sprint 1, plus follow-ups surfaced during it. Pull into a sprint by moving the item into `docs/current-sprint.md`.

## Deferred features (excluded from Sprint 1 by decision)

- **Wakppuball customization UI** (color picker, face/accessory selection). Sprint 1 sent a fixed `customization` value — kept as the top-level `DEFAULT_CUSTOMIZATION` constant in `MyWakppuballPage.tsx` so it's easy to swap for real state. Ships together with 3D + customization freedom.
- **Location-based campus verification / matching consent flow.** Not in the API docs; do not implement on the frontend without backend agreement first.
- **Wax-break interaction**: `remainingBreakCount` consumption, crack animation, per-piece damage. Sprint 1 shows only a static image. Related backend endpoints exist but are unused/501: `POST /wakppuballs/:ownedId/break`, `POST /wakppuballs/me/main/session-end`.
- **Phase 7 — Beautify pass**: apply design tokens / wireframe visual reference across all screens. Deferred from Sprint 1 (logic-only gray-box was shipped).

## Technical follow-ups (from Sprint 1)

- **Revert main-ball composition** once the backend implements `GET /wakppuballs/me/main`: point `getMainWakppuball` at `getMainWakppuballViaEndpoint` and restore the real mock response. (`CLAUDE.md` → Backend Contract Notes.)
- **Re-align matching if the backend adds async matching** (`WAITING`/`GET /matching/status`/`POST /:matchId/exchange`). Current frontend assumes the synchronous option-A flow.
- **Select a different main ball**: `POST /collection/:ownedId/select-main` exists on the backend but is unused by the frontend.
- **Keep `docs/api.md` in sync** — it drifted from the implementation throughout Sprint 1; treat backend code as source of truth until it's updated.
- **Run the real-backend integration pass** (`docs/integration-testing.md`) and the frontend test suite (`npm test -w frontend`) in CI.
