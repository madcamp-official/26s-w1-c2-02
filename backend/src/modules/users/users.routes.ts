import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../../common/api-error.js';
import { asyncHandler } from '../../common/async-handler.js';
import type { AuthenticatedRequest } from '../../common/auth.js';
import { requireAuth } from '../../common/auth.middleware.js';
import { validateBody } from '../../common/validate.js';
import { prisma } from '../../db/prisma.js';
import { usernameSchema } from '../auth/auth.routes.js';

export const usersRouter = Router();

const renameUserSchema = z.object({
  username: usernameSchema
});

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

usersRouter.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      throw new ApiError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }

    const body = validateBody(renameUserSchema, req);
    const userId = BigInt(req.user.id);

    if (body.username !== req.user.username) {
      const existing = await prisma.user.findUnique({
        where: { username: body.username }
      });
      if (existing) {
        throw new ApiError(409, 'USERNAME_ALREADY_EXISTS', '이미 사용 중인 유저네임입니다.');
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { username: body.username }
    });

    res.status(200).json({
      user: {
        id: updated.id.toString(),
        username: updated.username
      }
    });
  })
);
