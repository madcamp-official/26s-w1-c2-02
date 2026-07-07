import { Router } from 'express';
import { ApiError } from '../../common/api-error.js';
import { asyncHandler } from '../../common/async-handler.js';
import type { AuthenticatedRequest } from '../../common/auth.js';
import { requireAuth } from '../../common/auth.middleware.js';
import { prisma } from '../../db/prisma.js';

export const usersRouter = Router();

usersRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      throw new ApiError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }

    const userId = BigInt(req.user.id);

    const user = await prisma.user.findUnique({
      where: {
        id: userId
      },
      include: {
        ownedWakppuballs: {
          where: {
            status: 'ACTIVE'
          },
          select: {
            id: true,
            isMain: true
          }
        }
      }
    });

    if (!user) {
      throw new ApiError(404, 'NOT_FOUND', '유저를 찾을 수 없습니다.');
    }

    const mainWakppuball = user.ownedWakppuballs.find((item) => item.isMain);

    res.json({
      user: {
        id: user.id.toString(),
        username: user.username,
        mainWakppuballId: mainWakppuball?.id.toString() ?? null,
        collectionCount: user.ownedWakppuballs.length,
        totalAcquiredCount: user.totalAcquiredCount,
        createdAt: user.createdAt.toISOString()
      }
    });
  })
);
