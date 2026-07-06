import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../../common/api-error.js';
import { asyncHandler } from '../../common/async-handler.js';
import type { AuthenticatedRequest } from '../../common/auth.js';
import { requireAuth } from '../../common/auth.middleware.js';
import { validateBody } from '../../common/validate.js';
import { prisma } from '../../db/prisma.js';

export const matchingRouter = Router();

const matchingQueueSchema = z
  .object({
    wakppuballOwnedId: z.string().regex(/^\d+$/).optional(),
    /* sprint 1 임시 테스트용
    MATCHED로 보내면 무조건 성공
    FAILED로 보내면 무조건 실패
    안 보내면 랜덤 처리 */
    simulateResult: z.enum(['MATCHED', 'FAILED']).optional()
  });

const DEFAULT_BREAK_COUNT = 3;

const TEMP_PARTNERS = [
  { id: 'temp-partner-1', username: 'campus-bot-a' },
  { id: 'temp-partner-2', username: 'campus-bot-b' },
  { id: 'temp-partner-3', username: 'campus-bot-c' }
];

const TEMP_WAKPPUBALLS: Array<{
  name: string;
  modelUrl: string;
  thumbnailUrl: string;
  customization: Prisma.InputJsonObject;
  fracture: Prisma.InputJsonObject;
}> = [
  {
    name: '파란 임시 왁뿌볼',
    modelUrl: '/assets/temp-blue-wakppuball.png',
    thumbnailUrl: '/assets/temp-blue-wakppuball.png',
    customization: {
      outerColor: '#4f8cff',
      innerColor: '#ffffff',
      pattern: { type: 'preset', id: 'dots' },
      shape: 'sphere'
    },
    fracture: { thicknessPreset: 'medium' }
  },
  {
    name: '초록 임시 왁뿌볼',
    modelUrl: '/assets/temp-green-wakppuball.png',
    thumbnailUrl: '/assets/temp-green-wakppuball.png',
    customization: {
      outerColor: '#4ccf7a',
      innerColor: '#ffffff',
      pattern: { type: 'preset', id: 'stripes' },
      shape: 'sphere'
    },
    fracture: { thicknessPreset: 'thin' }
  }
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

matchingRouter.post(
  '/queue',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      throw new ApiError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }

    const body = validateBody(matchingQueueSchema, req) ?? {};
    const ownerUserId = BigInt(req.user.id);

    const selectedWakppuball = body.wakppuballOwnedId
      ? await prisma.userWakppuball.findFirst({
          where: {
            id: BigInt(body.wakppuballOwnedId),
            ownerUserId,
            status: 'ACTIVE'
          }
        })
      : await prisma.userWakppuball.findFirst({
          where: {
            ownerUserId,
            isMain: true,
            status: 'ACTIVE'
          },
          orderBy: {
            acquiredAt: 'desc'
          }
        });

    if (!selectedWakppuball) {
      throw new ApiError(
        body.wakppuballOwnedId ? 404 : 400,
        body.wakppuballOwnedId
          ? 'OWNED_WAKPPUBALL_NOT_FOUND'
          : 'MAIN_WAKPPUBALL_REQUIRED',
        body.wakppuballOwnedId
          ? '내 컬렉션에 없는 왁뿌볼입니다.'
          : '매칭하려면 대표 왁뿌볼이 필요합니다.'
      );
    }

    if (selectedWakppuball.remainingBreakCount <= 0) {
      throw new ApiError(
        400,
        'BREAK_COUNT_REQUIRED',
        '남은 뿌시기 횟수가 있는 왁뿌볼만 매칭할 수 있습니다.'
      );
    }

    const isMatched =
      body.simulateResult === 'MATCHED' ||
      (!body.simulateResult && Math.random() < 0.8);

    if (!isMatched) {
      res.json({
        status: 'FAILED',
        reason: 'NO_PARTNER_FOUND',
        message: '지금은 매칭 가능한 상대가 없습니다.'
      });
      return;
    }

    const partner = pickRandom(TEMP_PARTNERS);
    const tempWakppuball = pickRandom(TEMP_WAKPPUBALLS);

    const result = await prisma.$transaction(async (tx) => {
      const model = await tx.wakppuballModel.create({
        data: {
          creatorUserId: null,
          name: tempWakppuball.name,
          modelUrl: tempWakppuball.modelUrl,
          thumbnailUrl: tempWakppuball.thumbnailUrl,
          customizationJson: tempWakppuball.customization,
          fractureJson: tempWakppuball.fracture,
          defaultBreakCount: DEFAULT_BREAK_COUNT
        }
      });

      const owned = await tx.userWakppuball.create({
        data: {
          ownerUserId,
          wakppuballModelId: model.id,
          acquiredType: 'MATCHED',
          acquiredFromUserId: null,
          isMain: false,
          remainingBreakCount: model.defaultBreakCount,
          status: 'ACTIVE'
        }
      });

      return { model, owned };
    });

    res.json({
      status: 'MATCHED',
      matchId: `temp-${result.owned.id.toString()}`,
      partner,
      partnerWakppuball: {
        ownedId: result.owned.id.toString(),
        modelId: result.model.id.toString(),
        name: result.model.name,
        modelUrl: result.model.modelUrl,
        thumbnailUrl: result.model.thumbnailUrl,
        customization: result.model.customizationJson,
        fracture: result.model.fractureJson,
        acquiredType: result.owned.acquiredType,
        remainingBreakCount: result.owned.remainingBreakCount,
        status: result.owned.status,
        acquiredAt: result.owned.acquiredAt.toISOString()
      }
    });
  })
);

matchingRouter.delete('/queue', (_req, res) => {
  res.status(501).json({ message: 'TODO: 매칭 대기열 이탈 구현' });
});

matchingRouter.get('/status', (_req, res) => {
  res.status(501).json({ message: 'TODO: 매칭 상태 조회 구현' });
});

matchingRouter.post('/:matchId/exchange', (_req, res) => {
  res.status(501).json({ message: 'TODO: 왁뿌볼 교환 확정 구현' });
});
