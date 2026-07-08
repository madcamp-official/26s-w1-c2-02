import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';
import { ApiError } from '../../common/api-error.js';
import { asyncHandler } from '../../common/async-handler.js';
import type { AuthenticatedRequest } from '../../common/auth.js';
import { requireAuth } from '../../common/auth.middleware.js';
import { skinsDir } from '../../common/uploads.js';
import { validateBody } from '../../common/validate.js';
import { prisma } from '../../db/prisma.js';
import type { Prisma } from '@prisma/client';

export const wakppuballsRouter = Router();

// Custom skin upload (Phase 8-B). Kept as its own multipart endpoint, separate
// from the JSON-only POST / below — the client uploads the photo first here,
// then passes the returned imageUrl into customization.pattern on create.
const SKIN_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const SKIN_ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
// Triplanar-projected onto the ball at a modest world-space scale (see
// WakppuballViewer.tsx), same reasoning as the 1024x1024 preset pattern masks
// — no benefit to storing/serving anything bigger.
const SKIN_MAX_DIMENSION = 1024;

const skinUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SKIN_MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!SKIN_ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new ApiError(400, 'INVALID_IMAGE_FILE', 'jpg/png/webp 이미지만 업로드할 수 있습니다.'));
      return;
    }
    cb(null, true);
  }
});

const HEX_COLOR_REGEX = /^#[0-9a-f]{6}$/i;

// 나중에 프리셋이 추가되면 이 배열에만 추가하면 된다.
const PATTERN_PRESET_IDS = ['none', 'dots', 'stripes'] as const;
const THICKNESS_PRESETS = ['thin', 'medium', 'thick'] as const;

// shape가 늘어나면 이 enum과 아래 SHAPE_MODEL_URLS 매핑에만 추가하면 된다.
const SHAPES = ['sphere'] as const;
const SHAPE_MODEL_URLS: Record<(typeof SHAPES)[number], string> = {
  sphere: 'https://example.com/models/sphere.glb'
};

// 프리셋(dots/stripes 등 내장 마스크)과 custom(유저 업로드 사진, /wakppuballs/upload-skin
// 이 반환한 imageUrl)을 구분하는 discriminated union. customizationJson은 Json 컬럼이라
// 이 유니온을 넓혀도 마이그레이션은 필요 없다.
const patternSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('preset'), id: z.enum(PATTERN_PRESET_IDS) }),
  z.object({ type: z.literal('custom'), imageUrl: z.string().min(1).max(2048) })
]);

const customizationSchema = z.object({
  outerColor: z.string().regex(HEX_COLOR_REGEX),
  innerColor: z.string().regex(HEX_COLOR_REGEX),
  pattern: patternSchema,
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
  '/upload-skin',
  requireAuth,
  // multer errors (e.g. LIMIT_FILE_SIZE) propagate to the shared errorHandler,
  // which normalizes MulterError → 400 (see common/api-error.ts).
  skinUpload.single('file'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      throw new ApiError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }
    if (!req.file) {
      throw new ApiError(400, 'VALIDATION_ERROR', '업로드할 이미지 파일이 없습니다.');
    }

    await mkdir(skinsDir, { recursive: true });

    const filename = `${randomUUID()}.webp`;
    try {
      await sharp(req.file.buffer)
        .rotate() // apply EXIF orientation before resizing, then strip it
        .resize({
          width: SKIN_MAX_DIMENSION,
          height: SKIN_MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({ quality: 85 })
        .toFile(join(skinsDir, filename));
    } catch {
      // fileFilter only checks the client-supplied mimetype string, so a
      // corrupt/truncated or renamed non-image body still reaches sharp here.
      // Surface that as a clean 400 instead of a generic 500.
      throw new ApiError(400, 'INVALID_IMAGE_FILE', '이미지 파일을 처리할 수 없습니다.');
    }

    res.status(201).json({ imageUrl: `/uploads/skins/${filename}` });
  })
);

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

      // Creating a ball no longer bumps totalAcquiredCount — that counter is
      // now a pure match-count (see 20260708100000_... migration).
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
      const [updatedBall] = await Promise.all([
        tx.userWakppuball.update({
          where: { id: targetId },
          data: { remainingBreakCount: { decrement: 1 } }
        }),
        // Lifetime counter, regardless of which ball — never decrements.
        tx.user.update({
          where: { id: ownerUserId },
          data: { totalBreakCount: { increment: 1 } }
        })
      ]);
      return updatedBall;
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
