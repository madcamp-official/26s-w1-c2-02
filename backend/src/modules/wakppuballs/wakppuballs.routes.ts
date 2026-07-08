import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../../common/api-error.js';
import { asyncHandler } from '../../common/async-handler.js';
import type { AuthenticatedRequest } from '../../common/auth.js';
import { requireAuth } from '../../common/auth.middleware.js';
import { validateBody } from '../../common/validate.js';
import { prisma } from '../../db/prisma.js';
import type { Prisma } from '@prisma/client';

export const wakppuballsRouter = Router();

const HEX_COLOR_REGEX = /^#[0-9a-f]{6}$/i;

// 나중에 프리셋이 추가되면 이 배열에만 추가하면 된다.
const PATTERN_TYPES = ['preset'] as const;
const PATTERN_PRESET_IDS = ['none', 'dots', 'stripes'] as const;
const THICKNESS_PRESETS = ['thin', 'medium', 'thick'] as const;

// shape가 늘어나면 이 enum과 아래 SHAPE_MODEL_URLS 매핑에만 추가하면 된다.
const SHAPES = ['sphere'] as const;
const SHAPE_MODEL_URLS: Record<(typeof SHAPES)[number], string> = {
  sphere: 'https://example.com/models/sphere.glb'
};

const customizationSchema = z.object({
  outerColor: z.string().regex(HEX_COLOR_REGEX),
  innerColor: z.string().regex(HEX_COLOR_REGEX),
  pattern: z.object({
    type: z.enum(PATTERN_TYPES),
    id: z.enum(PATTERN_PRESET_IDS)
  }),
  shape: z.enum(SHAPES)
});

const fractureSchema = z.object({
  thicknessPreset: z.enum(THICKNESS_PRESETS)
});

const DEFAULT_CUSTOMIZATION: z.infer<typeof customizationSchema> = {
  outerColor: '#f3d35b',
  innerColor: '#ffffff',
  pattern: { type: 'preset', id: 'none' },
  shape: 'sphere'
};

const DEFAULT_FRACTURE: z.infer<typeof fractureSchema> = {
  thicknessPreset: 'medium'
};

const createWakppuballSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  thumbnailUrl: z.string().min(1).max(2048).optional().nullable(),
  customization: customizationSchema.optional(),
  fracture: fractureSchema.optional(),
  setAsMain: z.boolean().optional()
});
const DEFAULT_BREAK_COUNT = 3;

// rotate/zoom/press-and-hold never reach the server (docs/api.md) — only a
// confirmed wax-break interaction does, and WAX_BREAK is the only kind so far.
const breakBodySchema = z.object({
  interactionType: z.literal('WAX_BREAK')
});

const renameCreatedWakppuballSchema = z.object({
  name: z.string().min(1).max(50)
});

function parseOwnedIdParam(rawParam: string | string[] | undefined): bigint {
  // @types/express@5 types params as `string | string[]` even though this
  // project runs express@4 (single-segment params are always a string).
  const param = Array.isArray(rawParam) ? rawParam[0] : rawParam;
  if (!param || !/^\d+$/.test(param)) {
    throw new ApiError(404, 'OWNED_WAKPPUBALL_NOT_FOUND', '내 보유 왁뿌볼이 아닙니다.');
  }
  return BigInt(param);
}

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
    const customization = body.customization ?? DEFAULT_CUSTOMIZATION;
    const fracture = body.fracture ?? DEFAULT_FRACTURE;
    const modelUrl = SHAPE_MODEL_URLS[customization.shape];

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
          modelUrl,
          thumbnailUrl: body.thumbnailUrl ?? null,
          customizationJson: customization as Prisma.InputJsonObject,
          fractureJson: fracture as Prisma.InputJsonObject,
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

      await tx.user.update({
        where: {
          id: ownerUserId
        },
        data: {
          totalAcquiredCount: {
            increment: 1
          }
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
        customization: result.model.customizationJson,
        fracture: result.model.fractureJson,
        isMain: result.owned.isMain,
        remainingBreakCount: result.owned.remainingBreakCount,
        status: result.owned.status,
        createdAt: result.model.createdAt.toISOString()
      }
    });
  })
);

// Renames the caller's own created wakppuball (never a matched one — that
// would rename the same WakppuballModel row for its original creator too,
// since matched copies share the model, not just the name, with the
// original). No :ownedId needed: the create UI only ever offers to make one
// per user, so "my created ball" is unambiguous.
wakppuballsRouter.patch(
  '/me/created',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      throw new ApiError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }

    const body = validateBody(renameCreatedWakppuballSchema, req);
    const ownerUserId = BigInt(req.user.id);

    const owned = await prisma.userWakppuball.findFirst({
      where: { ownerUserId, acquiredType: 'CREATED' },
      orderBy: { acquiredAt: 'asc' }
    });

    if (!owned) {
      throw new ApiError(404, 'OWNED_WAKPPUBALL_NOT_FOUND', '생성한 왁뿌볼이 없습니다.');
    }

    const model = await prisma.wakppuballModel.update({
      where: { id: owned.wakppuballModelId },
      data: { name: body.name }
    });

    res.status(200).json({
      ok: true,
      ownedId: owned.id.toString(),
      name: model.name
    });
  })
);

wakppuballsRouter.post(
  '/:ownedId/break',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      throw new ApiError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }

    validateBody(breakBodySchema, req);
    const ownerUserId = BigInt(req.user.id);
    const targetId = parseOwnedIdParam(req.params.ownedId);

    const updated = await prisma.$transaction(async (tx) => {
      const target = await tx.userWakppuball.findFirst({
        where: { id: targetId, ownerUserId }
      });

      if (!target) {
        throw new ApiError(404, 'OWNED_WAKPPUBALL_NOT_FOUND', '내 보유 왁뿌볼이 아닙니다.');
      }
      if (target.status === 'CONSUMED') {
        throw new ApiError(409, 'WAKPPUBALL_CONSUMED', '이미 소멸된 왁뿌볼입니다.');
      }
      if (target.remainingBreakCount <= 0) {
        throw new ApiError(400, 'NO_BREAK_COUNT_LEFT', '남은 뿌시기 횟수가 없습니다.');
      }

      // Reaching 0 never consumes the wakppuball — it stays ACTIVE and in the
      // collection forever, just no longer touchable/crackable (enforced
      // client-side once remainingBreakCount is 0). The only way it goes back
      // up is a new match with the same partner refilling it
      // (createOrRefillMatchedOwnedWakppuball, matching.routes.ts).
      return tx.userWakppuball.update({
        where: { id: targetId },
        data: { remainingBreakCount: { decrement: 1 } }
      });
    });

    res.status(200).json({
      wakppuball: {
        ownedId: updated.id.toString(),
        remainingBreakCount: updated.remainingBreakCount,
        status: updated.status
      }
    });
  })
);
