import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import type { AuthenticatedRequest } from '../../common/auth.js';
import { requireAuth } from '../../common/auth.middleware.js';
import { validateBody } from '../../common/validate.js';
import { prisma } from '../../db/prisma.js';
import type { Prisma } from '@prisma/client';

export const wakppuballsRouter = Router();

const createWakppuballSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  modelUrl: z.string().min(1).max(2048).optional().nullable(),
  thumbnailUrl: z.string().min(1).max(2048).optional().nullable(),
  customization: z.record(z.unknown()).optional(),
  fracture: z.record(z.unknown()).optional(),
  setAsMain: z.boolean().optional()
});
const DEFAULT_BREAK_COUNT = 3;

wakppuballsRouter.get('/me/main', (_req, res) => {
  res.status(501).json({ message: 'TODO: 대표 왁뿌볼 조회 구현' });
});

wakppuballsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      throw new Error('Authenticated user missing');
    }

    const body = validateBody(createWakppuballSchema, req);
    const ownerUserId = BigInt(req.user.id);
    const shouldSetAsMain = body.setAsMain ?? false;

    const result = await prisma.$transaction(async (tx) => {
      if (shouldSetAsMain) {
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
      }

      const model = await tx.wakppuballModel.create({
        data: {
          creatorUserId: ownerUserId,
          name: body.name ?? '나의 왁뿌볼',
          modelUrl: body.modelUrl ?? null,
          thumbnailUrl: body.thumbnailUrl ?? null,
          customizationJson: (body.customization ?? {}) as Prisma.InputJsonObject,
          fractureJson: (body.fracture ?? {}) as Prisma.InputJsonObject,
          defaultBreakCount: DEFAULT_BREAK_COUNT
        }
      });

      const owned = await tx.userWakppuball.create({
        data: {
          ownerUserId,
          wakppuballModelId: model.id,
          acquiredType: 'CREATED',
          isMain: shouldSetAsMain,
          remainingBreakCount: model.defaultBreakCount,
          status: 'ACTIVE'
        }
      });

      return { model, owned };
    });

    res.status(201).json({
      wakppuball: {
        ownedId: result.owned.id.toString(),
        modelId: result.model.id.toString(),
        name: result.model.name,
        modelUrl: result.model.modelUrl,
        thumbnailUrl: result.model.thumbnailUrl,
        isMain: result.owned.isMain,
        remainingBreakCount: result.owned.remainingBreakCount,
        status: result.owned.status,
        createdAt: result.model.createdAt.toISOString()
      }
    });
  })
);

wakppuballsRouter.post('/:ownedId/break', (_req, res) => {
  res.status(501).json({ message: 'TODO: 왁뿌볼 뿌시기 카운트 차감 구현' });
});

wakppuballsRouter.post('/me/main/session-end', (_req, res) => {
  res.status(501).json({ message: 'TODO: 대표 왁뿌볼 상호작용 종료 처리 구현' });
});
