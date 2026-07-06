import { Router } from 'express';
import { ApiError } from '../../common/api-error.js';
import { asyncHandler } from '../../common/async-handler.js';
import type { AuthenticatedRequest } from '../../common/auth.js';
import { requireAuth } from '../../common/auth.middleware.js';
import { prisma } from '../../db/prisma.js';

export const collectionRouter = Router();

collectionRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      throw new ApiError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }

    const ownerUserId = BigInt(req.user.id);

    const ownedWakppuballs = await prisma.userWakppuball.findMany({
      where: {
        ownerUserId,
        status: 'ACTIVE'
      },
      include: {
        model: true,
        acquiredFromUser: {
          select: {
            id: true,
            username: true
          }
        }
      },
      orderBy: {
        acquiredAt: 'desc'
      }
    });

    res.json({
      items: ownedWakppuballs.map((owned) => ({
        ownedId: owned.id.toString(),
        modelId: owned.model.id.toString(),
        name: owned.model.name,
        modelUrl: owned.model.modelUrl,
        thumbnailUrl: owned.model.thumbnailUrl,
        customization: owned.model.customizationJson,
        fracture: owned.model.fractureJson,
        acquiredType: owned.acquiredType,
        acquiredFrom: owned.acquiredFromUser
          ? {
              id: owned.acquiredFromUser.id.toString(),
              username: owned.acquiredFromUser.username
            }
          : undefined,
        remainingBreakCount: owned.remainingBreakCount,
        status: owned.status,
        isMain: owned.isMain,
        acquiredAt: owned.acquiredAt.toISOString()
      }))
    });
  })
);

collectionRouter.post('/:ownedId/select-main', (_req, res) => {
  res.status(501).json({ message: 'TODO: 대표 왁뿌볼 선택 구현' });
});
