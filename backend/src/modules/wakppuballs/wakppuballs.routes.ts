import { Router } from 'express';
import { z } from 'zod';
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
const PATTERN_PRESET_IDS = ['dots', 'stripes'] as const;
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
  pattern: { type: 'preset', id: 'dots' },
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

wakppuballsRouter.post('/:ownedId/break', (_req, res) => {
  res.status(501).json({ message: 'TODO: 왁뿌볼 뿌시기 카운트 차감 구현' });
});

wakppuballsRouter.post('/me/main/session-end', (_req, res) => {
  res.status(501).json({ message: 'TODO: 대표 왁뿌볼 상호작용 종료 처리 구현' });
});
