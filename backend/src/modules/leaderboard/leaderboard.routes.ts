import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler.js';
import { requireAuth } from '../../common/auth.middleware.js';
import { prisma } from '../../db/prisma.js';
import { computeTier } from '../stats/tiers.js';

export const leaderboardRouter = Router();

// Tiers here are always computed live from the full population fetched below,
// never cached — same rule as GET /users/me's tiers field.
leaderboardRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        totalBreakCount: true,
        distinctMatchedUserCount: true
      }
    });

    const breakCountValues = users.map((u) => u.totalBreakCount);
    const distinctMatchedValues = users.map((u) => u.distinctMatchedUserCount);

    const breakCount = users
      .slice()
      .sort((a, b) => b.totalBreakCount - a.totalBreakCount)
      .slice(0, 10)
      .map((u, index) => ({
        rank: index + 1,
        userId: u.id.toString(),
        username: u.username,
        value: u.totalBreakCount,
        tier: computeTier(u.totalBreakCount, breakCountValues)
      }));

    const distinctMatchedUsers = users
      .slice()
      .sort((a, b) => b.distinctMatchedUserCount - a.distinctMatchedUserCount)
      .slice(0, 10)
      .map((u, index) => ({
        rank: index + 1,
        userId: u.id.toString(),
        username: u.username,
        value: u.distinctMatchedUserCount,
        tier: computeTier(u.distinctMatchedUserCount, distinctMatchedValues)
      }));

    res.json({ breakCount, distinctMatchedUsers });
  })
);
