import type { TierName } from '../../features/leaderboard/leaderboardApi';

// Small icon badges shown next to a wakppuball's name, or next to a stat to
// show its percentile tier. Assets live in frontend/public/badge/ (see
// docs/3d-asset-contract.md's sibling convention for
// frontend/public/sound_effect/).

const TIER_BADGE_URLS: Record<TierName, string> = {
  MASTER: '/badge/tier/master.png',
  RUBY: '/badge/tier/ruby.png',
  DIAMOND: '/badge/tier/diamond.png',
  EMERALD: '/badge/tier/emerald.png',
  GOLD: '/badge/tier/gold.png',
  SILVER: '/badge/tier/silver.png',
  BRONZE: '/badge/tier/bronze.png'
};

const TIER_LABELS: Record<TierName, string> = {
  MASTER: '마스터',
  RUBY: '루비',
  DIAMOND: '다이아몬드',
  EMERALD: '에메랄드',
  GOLD: '골드',
  SILVER: '실버',
  BRONZE: '브론즈'
};

export function TierBadge({ tier }: { tier: TierName }) {
  return (
    <img
      className="tier-badge"
      src={TIER_BADGE_URLS[tier]}
      alt={`${TIER_LABELS[tier]} 티어`}
      title={`${TIER_LABELS[tier]} 티어`}
    />
  );
}

export function CampusMatchBadge({ show }: { show: boolean }) {
  if (!show) {
    return null;
  }
  return (
    <img
      className="campus-match-badge"
      src="/badge/campus/nubzuki.jpg"
      alt="캠퍼스 매칭"
      title="캠퍼스 안에서 매칭한 상대예요"
    />
  );
}
