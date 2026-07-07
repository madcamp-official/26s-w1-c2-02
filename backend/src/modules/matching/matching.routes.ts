import type {
  MatchingQueueEntry,
  Prisma,
  User,
  UserWakppuball,
  WakppuballModel
} from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../../common/api-error.js';
import { asyncHandler } from '../../common/async-handler.js';
import type { AuthenticatedRequest } from '../../common/auth.js';
import { requireAuth } from '../../common/auth.middleware.js';
import { validateBody } from '../../common/validate.js';
import { prisma } from '../../db/prisma.js';

export const matchingRouter = Router();

type Tx = Prisma.TransactionClient;
type OwnedWithModel = UserWakppuball & { model: WakppuballModel };

const matchingQueueSchema = z.object({
  wakppuballOwnedId: z.string().regex(/^\d+$/).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional()
});

// TODO: 실제 캠퍼스 중심 좌표와 허용 반경이 확정되면 이 값을 교체한다.
const CAMPUS_CENTER = {
  latitude: 36.3683750600837,
  longitude: 127.356771410201
};
const CAMPUS_RADIUS_METERS = 2000;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function distanceInMeters(
  pointA: { latitude: number; longitude: number },
  pointB: { latitude: number; longitude: number }
) {
  const earthRadiusMeters = 6371000;
  const latDelta = toRadians(pointB.latitude - pointA.latitude);
  const lngDelta = toRadians(pointB.longitude - pointA.longitude);
  const latA = toRadians(pointA.latitude);
  const latB = toRadians(pointB.latitude);

  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(lngDelta / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

function isInsideCampus(latitude: number, longitude: number) {
  return (
    distanceInMeters(CAMPUS_CENTER, { latitude, longitude }) <=
    CAMPUS_RADIUS_METERS
  );
}

async function recordLocationVerification(
  userId: bigint,
  passed: boolean
) {
  await prisma.locationVerificationLog.create({
    data: {
      userId,
      passed
    }
  });
}

async function findSelectedWakppuball(
  tx: Tx,
  ownerUserId: bigint,
  wakppuballOwnedId?: string
): Promise<OwnedWithModel> {
  const selected = wakppuballOwnedId
    ? await tx.userWakppuball.findFirst({
        where: {
          id: BigInt(wakppuballOwnedId),
          ownerUserId
        },
        include: {
          model: true
        }
      })
    : await tx.userWakppuball.findFirst({
        where: {
          ownerUserId,
          isMain: true
        },
        include: {
          model: true
        },
        orderBy: {
          acquiredAt: 'desc'
        }
      });

  if (!selected) {
    throw new ApiError(
      wakppuballOwnedId ? 404 : 400,
      wakppuballOwnedId
        ? 'OWNED_WAKPPUBALL_NOT_FOUND'
        : 'MAIN_WAKPPUBALL_REQUIRED',
      wakppuballOwnedId
        ? '내 컬렉션에 없는 왁뿌볼입니다.'
        : '매칭하려면 대표 왁뿌볼이 필요합니다.'
    );
  }

  if (selected.status === 'CONSUMED') {
    throw new ApiError(
      409,
      'WAKPPUBALL_CONSUMED',
      '이미 소멸된 왁뿌볼입니다.'
    );
  }

  if (selected.remainingBreakCount <= 0) {
    throw new ApiError(
      400,
      'BREAK_COUNT_REQUIRED',
      '남은 뿌시기 횟수가 있는 왁뿌볼만 매칭할 수 있습니다.'
    );
  }

  return selected;
}

async function findValidWaitingEntry(
  tx: Tx,
  currentUserId: bigint
): Promise<{ entry: MatchingQueueEntry; selectedWakppuball: OwnedWithModel } | null> {
  const candidates = await tx.matchingQueueEntry.findMany({
    where: {
      status: 'WAITING',
      NOT: {
        userId: currentUserId
      }
    },
    orderBy: {
      enteredAt: 'asc'
    },
    take: 10
  });

  for (const entry of candidates) {
    const selectedWakppuball = await tx.userWakppuball.findFirst({
      where: {
        id: entry.wakppuballOwnedId,
        ownerUserId: entry.userId,
        status: 'ACTIVE'
      },
      include: {
        model: true
      }
    });

    if (selectedWakppuball && selectedWakppuball.remainingBreakCount > 0) {
      return { entry, selectedWakppuball };
    }

    await tx.matchingQueueEntry.update({
      where: {
        id: entry.id
      },
      data: {
        status: 'CANCELLED'
      }
    });
  }

  return null;
}

// One collection slot per partner (enforced by a unique index on
// ownerUserId+acquiredFromUserId — see schema.prisma). Matching the same
// person again refills that existing slot back to a full break count
// instead of creating a duplicate; matching someone new creates it.
// isMain is left untouched on refill so an existing main-ball choice isn't
// silently overridden by a later match.
async function createOrRefillMatchedOwnedWakppuball(
  tx: Tx,
  receiverUserId: bigint,
  sourceUserId: bigint,
  sourceWakppuball: OwnedWithModel
) {
  const existing = await tx.userWakppuball.findFirst({
    where: {
      ownerUserId: receiverUserId,
      acquiredFromUserId: sourceUserId
    }
  });

  if (existing) {
    return tx.userWakppuball.update({
      where: { id: existing.id },
      data: {
        wakppuballModelId: sourceWakppuball.wakppuballModelId,
        remainingBreakCount: sourceWakppuball.model.defaultBreakCount,
        status: 'ACTIVE',
        consumedAt: null
      },
      include: {
        model: true
      }
    });
  }

  return tx.userWakppuball.create({
    data: {
      ownerUserId: receiverUserId,
      wakppuballModelId: sourceWakppuball.wakppuballModelId,
      acquiredType: 'MATCHED',
      acquiredFromUserId: sourceUserId,
      isMain: false,
      remainingBreakCount: sourceWakppuball.model.defaultBreakCount,
      status: 'ACTIVE'
    },
    include: {
      model: true
    }
  });
}

function toMatchedResponse(
  matchHistoryId: bigint,
  partner: Pick<User, 'id' | 'username'>,
  receivedWakppuball: OwnedWithModel
) {
  return {
    status: 'MATCHED' as const,
    matchId: matchHistoryId.toString(),
    partner: {
      id: partner.id.toString(),
      username: partner.username
    },
    partnerWakppuball: {
      ownedId: receivedWakppuball.id.toString(),
      modelId: receivedWakppuball.model.id.toString(),
      name: receivedWakppuball.model.name,
      modelUrl: receivedWakppuball.model.modelUrl,
      thumbnailUrl: receivedWakppuball.model.thumbnailUrl,
      customization: receivedWakppuball.model.customizationJson,
      fracture: receivedWakppuball.model.fractureJson,
      acquiredType: receivedWakppuball.acquiredType,
      remainingBreakCount: receivedWakppuball.remainingBreakCount,
      status: receivedWakppuball.status,
      acquiredAt: receivedWakppuball.acquiredAt.toISOString()
    }
  };
}

async function getMatchedStatus(entry: MatchingQueueEntry, userId: bigint) {
  if (!entry.matchHistoryId || !entry.receivedWakppuballId) {
    throw new ApiError(404, 'NOT_FOUND', '매칭 결과를 찾을 수 없습니다.');
  }

  const matchHistory = await prisma.matchHistory.findUnique({
    where: {
      id: entry.matchHistoryId
    }
  });

  if (!matchHistory) {
    throw new ApiError(404, 'NOT_FOUND', '매칭 결과를 찾을 수 없습니다.');
  }

  const partnerUserId =
    matchHistory.userAId === userId ? matchHistory.userBId : matchHistory.userAId;

  const [partner, receivedWakppuball] = await Promise.all([
    prisma.user.findUnique({
      where: {
        id: partnerUserId
      },
      select: {
        id: true,
        username: true
      }
    }),
    prisma.userWakppuball.findFirst({
      where: {
        id: entry.receivedWakppuballId,
        ownerUserId: userId
      },
      include: {
        model: true
      }
    })
  ]);

  if (!partner || !receivedWakppuball) {
    throw new ApiError(404, 'NOT_FOUND', '매칭 결과를 찾을 수 없습니다.');
  }

  return toMatchedResponse(matchHistory.id, partner, receivedWakppuball);
}

matchingRouter.post(
  '/queue',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      throw new ApiError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }

    const body = validateBody(matchingQueueSchema, req);
    const ownerUserId = BigInt(req.user.id);

    if (body.latitude === undefined || body.longitude === undefined) {
      await recordLocationVerification(ownerUserId, false);
      throw new ApiError(
        400,
        'LOCATION_REQUIRED',
        '매칭하려면 위치 정보가 필요합니다.'
      );
    }

    const locationPassed = isInsideCampus(body.latitude, body.longitude);
    await recordLocationVerification(ownerUserId, locationPassed);

    if (!locationPassed) {
      throw new ApiError(
        400,
        'OUTSIDE_CAMPUS_AREA',
        '캠퍼스 안에서만 매칭할 수 있습니다.'
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const selectedWakppuball = await findSelectedWakppuball(
        tx,
        ownerUserId,
        body.wakppuballOwnedId
      );

      const existingWaitingEntry = await tx.matchingQueueEntry.findFirst({
        where: {
          userId: ownerUserId,
          status: 'WAITING'
        }
      });

      if (existingWaitingEntry) {
        throw new ApiError(
          409,
          'ALREADY_IN_QUEUE',
          '이미 매칭 대기 중입니다.'
        );
      }

      const waitingEntry = await findValidWaitingEntry(tx, ownerUserId);

      if (!waitingEntry) {
        const queueEntry = await tx.matchingQueueEntry.create({
          data: {
            userId: ownerUserId,
            wakppuballOwnedId: selectedWakppuball.id,
            status: 'WAITING'
          }
        });

        return {
          status: 'WAITING' as const,
          queueId: queueEntry.id.toString(),
          enteredAt: queueEntry.enteredAt.toISOString()
        };
      }

      const waitingUserId = waitingEntry.entry.userId;
      const waitingUserSelectedWakppuball = waitingEntry.selectedWakppuball;

      const [waitingUserReceived, currentUserReceived] = await Promise.all([
        createOrRefillMatchedOwnedWakppuball(
          tx,
          waitingUserId,
          ownerUserId,
          selectedWakppuball
        ),
        createOrRefillMatchedOwnedWakppuball(
          tx,
          ownerUserId,
          waitingUserId,
          waitingUserSelectedWakppuball
        )
      ]);

      const matchHistory = await tx.matchHistory.create({
        data: {
          userAId: waitingUserId,
          userBId: ownerUserId,
          userASentWakppuballId: waitingUserSelectedWakppuball.id,
          userBSentWakppuballId: selectedWakppuball.id
        }
      });

      await Promise.all([
        tx.matchingQueueEntry.update({
          where: {
            id: waitingEntry.entry.id
          },
          data: {
            status: 'MATCHED',
            matchHistoryId: matchHistory.id,
            receivedWakppuballId: waitingUserReceived.id
          }
        }),
        tx.matchingQueueEntry.create({
          data: {
            userId: ownerUserId,
            wakppuballOwnedId: selectedWakppuball.id,
            status: 'MATCHED',
            matchHistoryId: matchHistory.id,
            receivedWakppuballId: currentUserReceived.id
          }
        }),
        tx.user.update({
          where: {
            id: waitingUserId
          },
          data: {
            totalAcquiredCount: {
              increment: 1
            }
          }
        }),
        tx.user.update({
          where: {
            id: ownerUserId
          },
          data: {
            totalAcquiredCount: {
              increment: 1
            }
          }
        }),
        // A successful match "refreshes" the ball each side sent, back to a
        // full break count — trading it is what recharges it, not just time.
        tx.userWakppuball.update({
          where: {
            id: waitingUserSelectedWakppuball.id
          },
          data: {
            remainingBreakCount: waitingUserSelectedWakppuball.model.defaultBreakCount
          }
        }),
        tx.userWakppuball.update({
          where: {
            id: selectedWakppuball.id
          },
          data: {
            remainingBreakCount: selectedWakppuball.model.defaultBreakCount
          }
        })
      ]);

      const waitingUser = await tx.user.findUnique({
        where: {
          id: waitingUserId
        },
        select: {
          id: true,
          username: true
        }
      });

      if (!waitingUser) {
        throw new ApiError(404, 'NOT_FOUND', '상대 유저를 찾을 수 없습니다.');
      }

      return toMatchedResponse(
        matchHistory.id,
        waitingUser,
        currentUserReceived
      );
    });

    res.json(result);
  })
);

matchingRouter.delete(
  '/queue',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      throw new ApiError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }

    await prisma.matchingQueueEntry.updateMany({
      where: {
        userId: BigInt(req.user.id),
        status: 'WAITING'
      },
      data: {
        status: 'CANCELLED'
      }
    });

    res.json({ ok: true });
  })
);

matchingRouter.get(
  '/status',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      throw new ApiError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }

    const userId = BigInt(req.user.id);
    const entry = await prisma.matchingQueueEntry.findFirst({
      where: {
        userId,
        status: {
          in: ['WAITING', 'MATCHED']
        }
      },
      orderBy: {
        enteredAt: 'desc'
      }
    });

    if (!entry) {
      res.json({ status: 'NONE' });
      return;
    }

    if (entry.status === 'WAITING') {
      res.json({
        status: 'WAITING',
        queueId: entry.id.toString(),
        enteredAt: entry.enteredAt.toISOString()
      });
      return;
    }

    const matchedStatus = await getMatchedStatus(entry, userId);
    res.json(matchedStatus);
  })
);
