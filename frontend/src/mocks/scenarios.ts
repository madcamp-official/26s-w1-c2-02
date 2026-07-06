// Flip these while building Phase 1-6 to exercise different states without a real backend.
// See ./README.md for the full list of scenarios and how each one is used.
export const mockScenarios = {
  // GET /wakppuballs/me/main
  // true  -> returns the sample main wakppuball (200)
  // false -> returns 404 MAIN_WAKPPUBALL_NOT_FOUND (simulates a fresh user)
  // NOTE: the REAL backend hasn't implemented this endpoint yet (501); the mock
  // is intentionally ahead so Phase 2 can be built. See current-sprint.md.
  hasMainWakppuball: false,

  // POST /matching/queue (backend is synchronous: MATCHED or FAILED, no WAITING)
  // 'MATCHED' -> always matched, partner ball granted into the collection
  // 'FAILED'  -> always fails with NO_PARTNER_FOUND
  // A request body { simulateResult } overrides this per-call (mirrors backend).
  matchOutcome: 'MATCHED' as 'MATCHED' | 'FAILED'
};
