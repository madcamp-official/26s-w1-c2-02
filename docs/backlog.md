# Backlog — next-sprint candidates

Items intentionally excluded from Sprint 1, plus follow-ups surfaced during it. Pull into a sprint by moving the item into `docs/current-sprint.md`.

## Deferred features (excluded from Sprint 1 by decision)

- **Wakppuball customization UI** (color picker, pattern/thickness/shape selection). The API type is ready, but the UI still sends a fixed `DEFAULT_CUSTOMIZATION`/`DEFAULT_FRACTURE` value from `MyWakppuballPage.tsx`.
- **Wax-break interaction**: `remainingBreakCount` consumption, crack animation, per-piece damage. Sprint 1 shows only a static image. Related backend endpoints exist but are unused/501: `POST /wakppuballs/:ownedId/break`, `POST /wakppuballs/me/main/session-end`.
- **Phase 7 — Beautify pass**: apply design tokens / wireframe visual reference across all screens. Deferred from Sprint 1 (logic-only gray-box was shipped).

## Technical follow-ups (from Sprint 1)

- **Revert main-ball composition** once the backend implements `GET /wakppuballs/me/main`: point `getMainWakppuball` at `getMainWakppuballViaEndpoint`. (`CLAUDE.md` → Backend Contract Notes.)
- **Select a different main ball**: `POST /collection/:ownedId/select-main` exists on the backend but is unused by the frontend.
- **Keep `docs/api.md` in sync** — it drifted from the implementation throughout Sprint 1; treat backend code as source of truth until it's updated.
- **Run the real-backend integration pass** (`docs/integration-testing.md`) and the frontend test suite (`npm test -w frontend`) in CI.
