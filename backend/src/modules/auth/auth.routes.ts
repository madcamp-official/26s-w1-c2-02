import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../../common/api-error.js';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody } from '../../common/validate.js';
import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
export const authRouter = Router();

authRouter.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const body = validateBody(signupSchema, req);

    const existingUser = await prisma.user.findUnique({
      where: {
        username: body.username
      }
    });

    if (existingUser) {
      throw new ApiError(
        409,
        'USERNAME_ALREADY_EXISTS',
        '이미 사용 중인 유저네임입니다.'
      );
    }

    const passwordHash = await bcrypt.hash(body.password, 10);

    const user = await prisma.user.create({
      data: {
        username: body.username,
        passwordHash
      }
    });

    const accessToken = createAccessToken(user);

    res.status(201).json({
      user: {
        id: user.id.toString(),
        username: user.username,
        createdAt: user.createdAt.toISOString()
      },
      accessToken
    });
  })
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = validateBody(loginSchema, req);

    const user = await prisma.user.findUnique({
      where: {
        username: body.username
      }
    });

    if (!user) {
      throw new ApiError(
        401,
        'INVALID_CREDENTIALS',
        '유저네임 또는 비밀번호가 올바르지 않습니다.'
      );
    }

    const isPasswordValid = await bcrypt.compare(
      body.password,
      user.passwordHash
    );

    if (!isPasswordValid) {
      throw new ApiError(
        401,
        'INVALID_CREDENTIALS',
        '유저네임 또는 비밀번호가 올바르지 않습니다.'
      );
    }

    const accessToken = createAccessToken(user);

    res.json({
      user: {
        id: user.id.toString(),
        username: user.username
      },
      accessToken
    });
  })
);

authRouter.post('/logout', (_req, res) => {
  res.status(501).json({ message: 'TODO: 로그아웃 구현' });
});

// Exported so other modules (e.g. the username-rename route) validate against
// the exact same rule instead of duplicating/drifting from it.
// Allows complete Hangul syllables (가-힣) alongside ASCII alnum/underscore —
// no lone jamo (ㄱ-ㅎ, ㅏ-ㅣ), since those aren't valid standalone characters.
export const usernameSchema = z
  .string()
  .min(2)
  .max(20)
  .regex(/^[a-zA-Z0-9_가-힣]+$/);

const signupSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8).max(72)
});

const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8).max(72)
})

function createAccessToken(user: { id: bigint; username: string }) {
  return jwt.sign(
    {
      userId: user.id.toString(),
      username: user.username
    },
    env.JWT_SECRET,
    {
      expiresIn: '7d'
    }
  );
}

