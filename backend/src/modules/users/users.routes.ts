import { Router } from 'express';

export const usersRouter = Router();

usersRouter.get('/me', (_req, res) => {
  res.status(501).json({ message: 'TODO: 내 회원정보 조회 구현' });
});
