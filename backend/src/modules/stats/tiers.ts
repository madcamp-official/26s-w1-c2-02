// Pure helper, no Prisma import — shared by GET /users/me and the leaderboard
// route so the cutoff table lives in exactly one place.

export type TierName = 'MASTER' | 'RUBY' | 'DIAMOND' | 'EMERALD' | 'GOLD' | 'SILVER' | 'BRONZE';

const TIER_CUTOFFS: Array<{ tier: TierName; maxPercentile: number }> = [
  { tier: 'MASTER', maxPercentile: 0.05 },
  { tier: 'RUBY', maxPercentile: 0.1 },
  { tier: 'DIAMOND', maxPercentile: 0.2 },
  { tier: 'EMERALD', maxPercentile: 0.4 },
  { tier: 'GOLD', maxPercentile: 0.6 },
  { tier: 'SILVER', maxPercentile: 0.8 }
];

// A raw value of 0 always lands in Bronze, regardless of how the rest of the
// population is distributed — otherwise an all-zero population (likely at
// this app's current scale) would compute as everyone being Master.
export function computeTier(value: number, allValues: number[]): TierName {
  if (value === 0 || allValues.length === 0) {
    return 'BRONZE';
  }

  const strictlyGreaterCount = allValues.filter((other) => other > value).length;
  const percentileFromTop = strictlyGreaterCount / allValues.length;

  for (const { tier, maxPercentile } of TIER_CUTOFFS) {
    if (percentileFromTop < maxPercentile) {
      return tier;
    }
  }
  return 'BRONZE';
}
