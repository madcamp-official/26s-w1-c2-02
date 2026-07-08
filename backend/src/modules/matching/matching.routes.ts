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

// Matching always trades the caller's own created wakppuball — never
// whatever's currently set as main (that's a display/interaction choice,
// decoupled from identity in a trade). Each user has exactly one CREATED
// ball (the create UI only ever offers to make one), so no id/selection
// param is needed. remainingBreakCount is deliberately not checked here —
// matching works regardless of count, and refills it on success below.
async function findOwnCreatedWakppuball(
  tx: Tx,
  ownerUserId: bigint
): Promise<OwnedWithModel> {
  const selected = await tx.userWakppuball.findFirst({
    where: {
      ownerUserId,
      acquiredType: 'CREATED'
    },
    // The create UI only ever offers to make one, but nothing at the DB
    // level enforces that — pick deterministically (the original) in case
    // more than one ever exists.
    orderBy: {
      acquiredAt: 'asc'
    },
    include: {
      model: true
    }
  });

  if (!selected) {
    throw new ApiError(
      400,
      'MAIN_WAKPPUBALL_REQUIRED',
      '매칭하려면 왁뿌볼을 먼저 만들어야 합니다.'
    );
  }

  if (selected.status === 'CONSUMED') {
    throw new ApiError(
      409,
      'WAKPPUBALL_CONSUMED',
      '이미 소멸된 왁뿌볼입니다.'
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

    if (selectedWakppuball) {
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
// silently overridden by a later match. isCampusMatch always gets
// (re)written — it reflects this match's circumstances, not sticky from an
// earlier one. `isNewPartner` tells the caller whether this was a genuinely
// new distinct partner (for the distinct-matched-user counter).
async function createOrRefillMatchedOwnedWakppuball(
  tx: Tx,
  receiverUserId: bigint,
  sourceUserId: bigint,
  sourceWakppuball: OwnedWithModel,
  isCampusMatch: boolean
): Promise<{ owned: OwnedWithModel; isNewPartner: boolean }> {
  const existing = await tx.userWakppuball.findFirst({
    where: {
      ownerUserId: receiverUserId,
      acquiredFromUserId: sourceUserId
    }
  });

  if (existing) {
    const owned = await tx.userWakppuball.update({
      where: { id: existing.id },
      data: {
        wakppuballModelId: sourceWakppuball.wakppuballModelId,
        remainingBreakCount: sourceWakppuball.model.defaultBreakCount,
        status: 'ACTIVE',
        consumedAt: null,
        isCampusMatch
      },
      include: {
        model: true
      }
    });
    return { owned, isNewPartner: false };
  }

  const owned = await tx.userWakppuball.create({
    data: {
      ownerUserId: receiverUserId,
      wakppuballModelId: sourceWakppuball.wakppuballModelId,
      acquiredType: 'MATCHED',
      acquiredFromUserId: sourceUserId,
      isMain: false,
      remainingBreakCount: sourceWakppuball.model.defaultBreakCount,
      status: 'ACTIVE',
      isCampusMatch
    },
    include: {
      model: true
    }
  });
  return { owned, isNewPartner: true };
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
      isCampusMatch: receivedWakppuball.isCampusMatch,
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

    // Location is no longer required or blocking — matching always proceeds.
    // It's only used to decide whether this match counts as an on-campus
    // exchange (isCampusMatch below), a cosmetic badge on the resulting
    // wakppuball. No coordinates submitted -> just not a campus match; skip
    // logging entirely since there was no check to log.
    let locationVerified = false;
    if (body.latitude !== undefined && body.longitude !== undefined) {
      locationVerified = isInsideCampus(body.latitude, body.longitude);
      await recordLocationVerification(ownerUserId, locationVerified);
    }

    const result = await prisma.$transaction(async (tx) => {
      const selectedWakppuball = await findOwnCreatedWakppuball(tx, ownerUserId);

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
            status: 'WAITING',
            locationVerified
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
      // A match only counts as an on-campus exchange if *both* sides'
      // location checks passed — one side matching from off-campus (or with
      // no location at all) means no badge for either side.
      const isCampusMatch = locationVerified && waitingEntry.entry.locationVerified;

      const [waitingUserReceived, currentUserReceived] = await Promise.all([
        createOrRefillMatchedOwnedWakppuball(
          tx,
          waitingUserId,
          ownerUserId,
          selectedWakppuball,
          isCampusMatch
        ),
        createOrRefillMatchedOwnedWakppuball(
          tx,
          ownerUserId,
          waitingUserId,
          waitingUserSelectedWakppuball,
          isCampusMatch
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
            receivedWakppuballId: waitingUserReceived.owned.id
          }
        }),
        tx.matchingQueueEntry.create({
          data: {
            userId: ownerUserId,
            wakppuballOwnedId: selectedWakppuball.id,
            status: 'MATCHED',
            matchHistoryId: matchHistory.id,
            receivedWakppuballId: currentUserReceived.owned.id,
            locationVerified
          }
        }),
        // totalAcquiredCount is a pure match-count: +1 per side, every match,
        // no dedup. distinctMatchedUserCount only moves when the OTHER side
        // was a genuinely new partner for THIS side (isNewPartner from the
        // create-vs-refill branch above) — a re-match with someone already
        // matched before doesn't grow it again.
        tx.user.update({
          where: {
            id: waitingUserId
          },
          data: {
            totalAcquiredCount: {
              increment: 1
            },
            ...(waitingUserReceived.isNewPartner
              ? { distinctMatchedUserCount: { increment: 1 } }
              : {})
          }
        }),
        tx.user.update({
          where: {
            id: ownerUserId
          },
          data: {
            totalAcquiredCount: {
              increment: 1
            },
            ...(currentUserReceived.isNewPartner
              ? { distinctMatchedUserCount: { increment: 1 } }
              : {})
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
        currentUserReceived.owned
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
