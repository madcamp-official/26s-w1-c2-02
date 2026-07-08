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
        model: {
          include: {
            creator: {
              select: { username: true }
            }
          }
        },
        acquiredFromUser: {
          select: {
            id: true,
            username: true
          }
        }
      },
      // 남은 뿌시기 횟수가 많은 순 — 동률이면 최근 획득 순으로 안정적인 2차 정렬.
      orderBy: [{ remainingBreakCount: 'desc' }, { acquiredAt: 'desc' }]
    });

    res.json({
      items: ownedWakppuballs.map((owned) => ({
        ownedId: owned.id.toString(),
        modelId: owned.model.id.toString(),
        name: owned.model.name,
        // The wakppuball's original designer — always the caller for
        // CREATED balls, and the match partner for MATCHED balls (matching
        // always trades the *created* ball, and matched copies share the
        // same WakppuballModel row rather than duplicating it).
        creatorUsername: owned.model.creator?.username ?? null,
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
        isCampusMatch: owned.isCampusMatch,
        remainingBreakCount: owned.remainingBreakCount,
        status: owned.status,
        isMain: owned.isMain,
        acquiredAt: owned.acquiredAt.toISOString()
      }))
    });
  })
);

collectionRouter.post(
  '/:ownedId/select-main',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      throw new ApiError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }

    // @types/express@5 types params as `string | string[]` even though this
    // project runs express@4 (single-segment params are always a string).
    const ownedIdParam = req.params.ownedId;
    const ownedId = Array.isArray(ownedIdParam) ? ownedIdParam[0] : ownedIdParam;

    if (!ownedId || !/^\d+$/.test(ownedId)) {
      throw new ApiError(404, 'OWNED_WAKPPUBALL_NOT_FOUND', '내 컬렉션에 없는 왁뿌볼입니다.');
    }

    const ownerUserId = BigInt(req.user.id);
    const targetId = BigInt(ownedId);

    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.userWakppuball.findFirst({
        where: {
          id: targetId,
          ownerUserId
        }
      });

      if (!target) {
        throw new ApiError(404, 'OWNED_WAKPPUBALL_NOT_FOUND', '내 컬렉션에 없는 왁뿌볼입니다.');
      }

      if (target.status === 'CONSUMED') {
        throw new ApiError(409, 'WAKPPUBALL_CONSUMED', '이미 소멸된 왁뿌볼입니다.');
      }

      if (target.isMain) {
        return { mainWakppuballId: target.id };
      }

      // Stepping down as main never consumes a wakppuball, regardless of
      // remainingBreakCount — 0 means interaction-locked, not gone. It stays
      // ACTIVE and in the collection; only unmained here.
      await tx.userWakppuball.updateMany({
        where: {
          ownerUserId,
          isMain: true,
          status: 'ACTIVE'
        },
        data: {
          isMain: false
        }
      });

      await tx.userWakppuball.update({
        where: { id: target.id },
        data: { isMain: true }
      });

      return { mainWakppuballId: target.id };
    });

    res.json({
      ok: true,
      mainWakppuballId: result.mainWakppuballId.toString()
    });
  })
);
