import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from './api-error.js';
import type { AuthenticatedRequest } from './auth.js';

type JwtPayload = {
  userId: string;
  username: string;
};

export function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    throw new ApiError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    req.user = {
      id: payload.userId,
      username: payload.username
    };

    next();
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  }
}
